using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace DayRhythm
{
    internal sealed class LanSyncServer : IDisposable
    {
        public const int TcpPort = 48721;
        public const int UdpDiscoveryPort = 48722;

        private readonly Action<string> _onMessageReceived;
        private readonly Action<LanBatteryTelemetry> _onBatteryReceived;

        private TcpListener _tcpListener;
        private UdpClient _udpDiscoveryListener;
        private CancellationTokenSource _cts;

        private readonly ConcurrentDictionary<Guid, WebSocket> _connectedSockets = new();

        public LanSyncServer(
            Action<string> onMessageReceived,
            Action<LanBatteryTelemetry> onBatteryReceived)
        {
            _onMessageReceived = onMessageReceived ?? throw new ArgumentNullException(nameof(onMessageReceived));
            _onBatteryReceived = onBatteryReceived ?? throw new ArgumentNullException(nameof(onBatteryReceived));
        }

        public void Start()
        {
            Stop();
            _cts = new CancellationTokenSource();
            StartTcpServer(_cts.Token);
            StartUdpDiscoveryListener(_cts.Token);
        }

        private void StartTcpServer(CancellationToken ct)
        {
            Task.Run(async () =>
            {
                try
                {
                    _tcpListener = new TcpListener(IPAddress.Any, TcpPort);
                    _tcpListener.Server.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                    _tcpListener.Start();

                    while (!ct.IsCancellationRequested)
                    {
                        TcpClient client = await _tcpListener.AcceptTcpClientAsync(ct).ConfigureAwait(false);
                        _ = Task.Run(() => HandleClientAsync(client, ct), ct);
                    }
                }
                catch (Exception)
                {
                }
            }, ct);
        }

        private async Task HandleClientAsync(TcpClient client, CancellationToken ct)
        {
            using (client)
            {
                try
                {
                    NetworkStream stream = client.GetStream();
                    using var reader = new StreamReader(stream, Encoding.UTF8, leaveOpen: true);

                    // 1. Read request line (e.g. "GET /ws HTTP/1.1" or "POST /api/v1/settings/update HTTP/1.1")
                    string reqLine = await reader.ReadLineAsync(ct).ConfigureAwait(false);
                    if (string.IsNullOrWhiteSpace(reqLine)) return;

                    string[] parts = reqLine.Split(' ');
                    if (parts.Length < 2) return;
                    string method = parts[0].ToUpperInvariant();
                    string rawPath = parts[1];
                    string path = rawPath.Split('?')[0];

                    // 2. Read HTTP headers
                    var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    string headerLine;
                    while (!string.IsNullOrEmpty(headerLine = await reader.ReadLineAsync(ct).ConfigureAwait(false)))
                    {
                        int colon = headerLine.IndexOf(':');
                        if (colon > 0)
                        {
                            string key = headerLine.Substring(0, colon).Trim();
                            string val = headerLine.Substring(colon + 1).Trim();
                            headers[key] = val;
                        }
                    }

                    // 3. Handle OPTIONS preflight
                    if (method == "OPTIONS")
                    {
                        byte[] resp = Encoding.UTF8.GetBytes(
                            "HTTP/1.1 204 No Content\r\n" +
                            "Access-Control-Allow-Origin: *\r\n" +
                            "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
                            "Access-Control-Allow-Headers: Content-Type, X-DayRhythm-Signature, X-DayRhythm-Timestamp, X-DayRhythm-Nonce\r\n" +
                            "Access-Control-Max-Age: 86400\r\n\r\n"
                        );
                        await stream.WriteAsync(resp, 0, resp.Length, ct).ConfigureAwait(false);
                        return;
                    }

                    // 4. WebSocket Upgrade Protocol (/ws)
                    if (path.StartsWith("/ws", StringComparison.OrdinalIgnoreCase)
                        && headers.TryGetValue("Upgrade", out string upgrade)
                        && upgrade.Equals("websocket", StringComparison.OrdinalIgnoreCase)
                        && headers.TryGetValue("Sec-WebSocket-Key", out string secKey))
                    {
                        string acceptKey = Convert.ToBase64String(
                            SHA1.HashData(Encoding.UTF8.GetBytes(secKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
                        );

                        byte[] hs = Encoding.UTF8.GetBytes(
                            "HTTP/1.1 101 Switching Protocols\r\n" +
                            "Upgrade: websocket\r\n" +
                            "Connection: Upgrade\r\n" +
                            "Sec-WebSocket-Accept: " + acceptKey + "\r\n\r\n"
                        );
                        await stream.WriteAsync(hs, 0, hs.Length, ct).ConfigureAwait(false);

                        // Hand over the underlying duplex stream to managed WebSocket
                        WebSocket ws = WebSocket.CreateFromStream(
                            stream,
                            isServer: true,
                            subProtocol: null,
                            keepAliveInterval: TimeSpan.FromSeconds(20)
                        );

                        Guid socketId = Guid.NewGuid();
                        _connectedSockets[socketId] = ws;
                        await RunWebSocketLoopAsync(socketId, ws, ct).ConfigureAwait(false);
                        return;
                    }

                    // 5. Read body for REST requests if Content-Length is present
                    string body = "";
                    if (headers.TryGetValue("Content-Length", out string lenStr) && int.TryParse(lenStr, out int contentLen) && contentLen > 0)
                    {
                        var sb = new StringBuilder();
                        char[] buf = new char[Math.Min(1024, contentLen)];
                        int bytesRead = 0;
                        while (bytesRead < contentLen)
                        {
                            int charsToRead = Math.Min(buf.Length, contentLen - bytesRead);
                            int r = await reader.ReadAsync(buf, 0, charsToRead).ConfigureAwait(false);
                            if (r <= 0) break;
                            sb.Append(buf, 0, r);
                            bytesRead = Encoding.UTF8.GetByteCount(sb.ToString());
                        }
                        body = sb.ToString();
                    }

                    // 6. Signed REST Settings API (/api/v1/settings/...)
                    if (path.StartsWith("/api/v1/settings", StringComparison.OrdinalIgnoreCase))
                    {
                        headers.TryGetValue("X-DayRhythm-Signature", out string sig);
                        headers.TryGetValue("X-DayRhythm-Timestamp", out string ts);
                        headers.TryGetValue("X-DayRhythm-Nonce", out string nonce);

                        if (!LanSecurityManager.ValidateSignature(method, path, body, sig, ts, nonce))
                        {
                            byte[] err = Encoding.UTF8.GetBytes("{\"error\":\"Invalid HMAC signature or timestamp expired\"}");
                            byte[] resp = Encoding.UTF8.GetBytes(
                                $"HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {err.Length}\r\n\r\n"
                            );
                            await stream.WriteAsync(resp, 0, resp.Length, ct).ConfigureAwait(false);
                            await stream.WriteAsync(err, 0, err.Length, ct).ConfigureAwait(false);
                            return;
                        }

                        if (method == "POST")
                        {
                            _onMessageReceived?.Invoke(body);
                        }

                        byte[] ok = Encoding.UTF8.GetBytes("{\"ok\":true,\"status\":\"applied\"}");
                        byte[] okResp = Encoding.UTF8.GetBytes(
                            $"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {ok.Length}\r\n\r\n"
                        );
                        await stream.WriteAsync(okResp, 0, okResp.Length, ct).ConfigureAwait(false);
                        await stream.WriteAsync(ok, 0, ok.Length, ct).ConfigureAwait(false);
                        return;
                    }

                    // 7. Battery API (/api/v1/battery/...)
                    if (path.StartsWith("/api/v1/battery", StringComparison.OrdinalIgnoreCase))
                    {
                        if (method == "POST")
                        {
                            ProcessBatteryPayload(body);
                        }
                        byte[] ok = Encoding.UTF8.GetBytes("{\"ok\":true}");
                        byte[] okResp = Encoding.UTF8.GetBytes(
                            $"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {ok.Length}\r\n\r\n"
                        );
                        await stream.WriteAsync(okResp, 0, okResp.Length, ct).ConfigureAwait(false);
                        await stream.WriteAsync(ok, 0, ok.Length, ct).ConfigureAwait(false);
                        return;
                    }

                    // 8. 404 Not Found fallback
                    byte[] notFound = Encoding.UTF8.GetBytes("{\"error\":\"not_found\"}");
                    byte[] nfResp = Encoding.UTF8.GetBytes(
                        $"HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: {notFound.Length}\r\n\r\n"
                    );
                    await stream.WriteAsync(nfResp, 0, nfResp.Length, ct).ConfigureAwait(false);
                    await stream.WriteAsync(notFound, 0, notFound.Length, ct).ConfigureAwait(false);
                }
                catch
                {
                    // Connection closed or timed out
                }
            }
        }

        private async Task RunWebSocketLoopAsync(Guid socketId, WebSocket ws, CancellationToken ct)
        {
            byte[] buffer = new byte[8192];
            try
            {
                while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
                {
                    using var ms = new MemoryStream();
                    WebSocketReceiveResult result;
                    do
                    {
                        result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct).ConfigureAwait(false);
                        if (result.MessageType == WebSocketMessageType.Close) break;
                        ms.Write(buffer, 0, result.Count);
                    }
                    while (!result.EndOfMessage && !ct.IsCancellationRequested);

                    if (result.MessageType == WebSocketMessageType.Close) break;

                    if (result.MessageType == WebSocketMessageType.Text && ms.Length > 0)
                    {
                        string msg = Encoding.UTF8.GetString(ms.ToArray());
                        if (msg.Contains("\"type\":\"ping\""))
                        {
                            byte[] pong = Encoding.UTF8.GetBytes("{\"type\":\"pong\"}");
                            await ws.SendAsync(new ArraySegment<byte>(pong), WebSocketMessageType.Text, true, ct).ConfigureAwait(false);
                        }
                        else
                        {
                            _onMessageReceived?.Invoke(msg);
                            ProcessBatteryPayload(msg);
                        }
                    }
                }
            }
            catch { }
            finally
            {
                _connectedSockets.TryRemove(socketId, out _);
                try { ws.Dispose(); } catch { }
            }
        }

        public async Task BroadcastAsync(string jsonPayload)
        {
            if (string.IsNullOrEmpty(jsonPayload)) return;
            byte[] bytes = Encoding.UTF8.GetBytes(jsonPayload);
            var segment = new ArraySegment<byte>(bytes);

            foreach (var kvp in _connectedSockets)
            {
                WebSocket ws = kvp.Value;
                if (ws != null && ws.State == WebSocketState.Open)
                {
                    try
                    {
                        await ws.SendAsync(segment, WebSocketMessageType.Text, true, CancellationToken.None).ConfigureAwait(false);
                    }
                    catch { }
                }
            }
        }

        private void StartUdpDiscoveryListener(CancellationToken ct)
        {
            Task.Run(async () =>
            {
                try
                {
                    _udpDiscoveryListener = new UdpClient();
                    _udpDiscoveryListener.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                    try
                    {
                        const int SIO_UDP_CONNRESET = -1744830452;
                        _udpDiscoveryListener.Client.IOControl((IOControlCode)SIO_UDP_CONNRESET, new byte[] { 0, 0, 0, 0 }, null);
                    }
                    catch { }
                    _udpDiscoveryListener.Client.Bind(new IPEndPoint(IPAddress.Any, UdpDiscoveryPort));

                    while (!ct.IsCancellationRequested)
                    {
                        UdpReceiveResult result = await _udpDiscoveryListener.ReceiveAsync(ct).ConfigureAwait(false);
                        string text = Encoding.UTF8.GetString(result.Buffer);

                        if (text.Contains("dr_discover_request") || text.Contains("dayrhythm_discovery"))
                        {
                            string myIp = GetLocalIpAddressForRemote(result.RemoteEndPoint.Address);
                            var respObj = new
                            {
                                type = "dr_discover_response",
                                server = "dayrhythm_pc",
                                pcName = Environment.MachineName,
                                wsUrl = $"ws://{myIp}:{TcpPort}/ws",
                                restUrl = $"http://{myIp}:{TcpPort}/api/v1",
                                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                                requiresAuth = true
                            };
                            byte[] respBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(respObj));
                            await _udpDiscoveryListener.SendAsync(respBytes, respBytes.Length, result.RemoteEndPoint).ConfigureAwait(false);
                        }
                    }
                }
                catch (Exception)
                {
                }
            }, ct);
        }

        private string GetLocalIpAddressForRemote(IPAddress remoteIp)
        {
            try
            {
                using var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, 0);
                socket.Connect(remoteIp, TcpPort);
                if (socket.LocalEndPoint is IPEndPoint ep) return ep.Address.ToString();
            }
            catch { }

            try
            {
                foreach (var netInterface in System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (netInterface.OperationalStatus == System.Net.NetworkInformation.OperationalStatus.Up &&
                        netInterface.NetworkInterfaceType != System.Net.NetworkInformation.NetworkInterfaceType.Loopback)
                    {
                        foreach (var ip in netInterface.GetIPProperties().UnicastAddresses)
                        {
                            if (ip.Address.AddressFamily == AddressFamily.InterNetwork)
                            {
                                return ip.Address.ToString();
                            }
                        }
                    }
                }
            }
            catch { }

            return "127.0.0.1";
        }

        private void ProcessBatteryPayload(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return;
            try
            {
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var telemetry = JsonSerializer.Deserialize<LanBatteryTelemetry>(json, options);
                if (telemetry != null
                    && telemetry.EffectiveLevel >= 0 && telemetry.EffectiveLevel <= 100
                    && telemetry.EffectiveLimit >= 60 && telemetry.EffectiveLimit <= 100)
                {
                    _onBatteryReceived(telemetry);
                }
            }
            catch { }
        }

        public void Stop()
        {
            try { _cts?.Cancel(); } catch { }
            try { _tcpListener?.Stop(); } catch { }
            try { _udpDiscoveryListener?.Close(); _udpDiscoveryListener?.Dispose(); } catch { }

            foreach (var ws in _connectedSockets.Values)
            {
                try { ws?.Abort(); ws?.Dispose(); } catch { }
            }
            _connectedSockets.Clear();
            _tcpListener = null;
            _udpDiscoveryListener = null;
            _cts = null;
        }

        public void Dispose() => Stop();
    }
}
