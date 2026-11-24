using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace DayRhythm
{
    /// <summary>
    /// Spotify Connect Local Architecture: Ultra-low latency (<5ms) Peer-to-Peer LAN Synchronization.
    /// Operates without any dependency on external cloud databases, internet access, or Firestore rules.
    /// Listens on UDP and TCP port 48722 and communicates directly with Android on port 48723.
    /// </summary>
    internal sealed class LocalSyncServer : IDisposable
    {
        public const int PcPort = 48722;
        public const int MobilePort = 48723;

        private static LocalSyncServer _instance;
        public static LocalSyncServer Instance => _instance;

        private readonly Action _onRemoteDismiss;
        private readonly Action<NativeAlertPayload> _onRemoteTrigger;
        private readonly ConcurrentDictionary<string, DateTime> _knownMobileIps = new ConcurrentDictionary<string, DateTime>();
        private readonly CancellationTokenSource _cts = new CancellationTokenSource();

        private UdpClient _udpListener;
        private TcpListener _tcpListener;
        private volatile string _authToken = "";
        private bool _disposed;

        public void SetUid(string uid)
        {
            if (string.IsNullOrWhiteSpace(uid))
            {
                _authToken = "";
                return;
            }
            byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(uid.Trim() + ":dayrhythm_lan_v2"));
            _authToken = Convert.ToHexString(hash).ToLowerInvariant();
        }

        public static void Initialize(Action onRemoteDismiss, Action<NativeAlertPayload> onRemoteTrigger)
        {
            _instance?.Dispose();
            _instance = new LocalSyncServer(onRemoteDismiss, onRemoteTrigger);
            _instance.Start();
        }

        private LocalSyncServer(Action onRemoteDismiss, Action<NativeAlertPayload> onRemoteTrigger)
        {
            _onRemoteDismiss = onRemoteDismiss;
            _onRemoteTrigger = onRemoteTrigger;
        }

        public void Start()
        {
            try
            {
                StartUdpListener();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[LocalSyncServer] UDP start error: {ex.Message}");
            }

            try
            {
                StartTcpListener();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[LocalSyncServer] TCP start error: {ex.Message}");
            }
        }

        private void StartUdpListener()
        {
            _udpListener = new UdpClient();
            _udpListener.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            _udpListener.Client.Bind(new IPEndPoint(IPAddress.Any, PcPort));
            _udpListener.EnableBroadcast = true;

            Task.Run(async () =>
            {
                byte[] buffer;
                while (!_cts.Token.IsCancellationRequested)
                {
                    try
                    {
                        var result = await _udpListener.ReceiveAsync().ConfigureAwait(false);
                        buffer = result.Buffer;
                        string json = Encoding.UTF8.GetString(buffer);
                        string remoteIp = result.RemoteEndPoint.Address.ToString();
                        if (_knownMobileIps.Count > 32)
                        {
                            _knownMobileIps.Clear();
                        }
                        _knownMobileIps[remoteIp] = DateTime.UtcNow;

                        ProcessIncomingMessage(json, remoteIp);
                    }
                    catch when (_cts.Token.IsCancellationRequested)
                    {
                        break;
                    }
                    catch (Exception ex)
                    {
                        System.Diagnostics.Debug.WriteLine($"[LocalSyncServer] UDP receive error: {ex.Message}");
                        await Task.Delay(500, _cts.Token).ConfigureAwait(false);
                    }
                }
            }, _cts.Token);
        }

        private void StartTcpListener()
        {
            _tcpListener = new TcpListener(IPAddress.Any, PcPort);
            _tcpListener.Server.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            _tcpListener.Start();

            Task.Run(async () =>
            {
                while (!_cts.Token.IsCancellationRequested)
                {
                    try
                    {
                        TcpClient client = await _tcpListener.AcceptTcpClientAsync().ConfigureAwait(false);
                        _ = HandleTcpClientAsync(client);
                    }
                    catch when (_cts.Token.IsCancellationRequested)
                    {
                        break;
                    }
                    catch (Exception ex)
                    {
                        System.Diagnostics.Debug.WriteLine($"[LocalSyncServer] TCP accept error: {ex.Message}");
                        await Task.Delay(500, _cts.Token).ConfigureAwait(false);
                    }
                }
            }, _cts.Token);
        }

        private async Task HandleTcpClientAsync(TcpClient client)
        {
            using (client)
            {
                try
                {
                    client.ReceiveTimeout = 5000;
                    client.SendTimeout = 5000;
                    string remoteIp = ((IPEndPoint)client.Client.RemoteEndPoint).Address.ToString();
                    _knownMobileIps[remoteIp] = DateTime.UtcNow;

                    using NetworkStream stream = client.GetStream();

                    // Read raw bytes so HTTP Content-Length is counted in UTF-8 bytes, not chars (avoids deadlock on Arabic text).
                    byte[] tempBuf = new byte[4096];
                    using MemoryStream ms = new MemoryStream();
                    int headerEndIdx = -1;
                    int newlineIdx = -1;
                    bool isHttp = false;

                    while (ms.Length < 16384)
                    {
                        int n = await stream.ReadAsync(tempBuf, 0, tempBuf.Length).ConfigureAwait(false);
                        if (n <= 0) break;
                        ms.Write(tempBuf, 0, n);

                        byte[] soFar = ms.GetBuffer();
                        int len = (int)ms.Length;
                        if (len >= 5)
                        {
                            string prefix = Encoding.ASCII.GetString(soFar, 0, Math.Min(5, len));
                            isHttp = prefix.StartsWith("POST ", StringComparison.OrdinalIgnoreCase) ||
                                     prefix.StartsWith("GET ", StringComparison.OrdinalIgnoreCase);
                        }

                        if (isHttp)
                        {
                            for (int i = 0; i <= len - 4; i++)
                            {
                                if (soFar[i] == '\r' && soFar[i + 1] == '\n' && soFar[i + 2] == '\r' && soFar[i + 3] == '\n')
                                {
                                    headerEndIdx = i + 4;
                                    break;
                                }
                            }
                            if (headerEndIdx >= 0) break;
                        }
                        else
                        {
                            newlineIdx = Array.IndexOf(soFar, (byte)'\n', 0, len);
                            if (newlineIdx >= 0) break;
                        }
                    }

                    if (ms.Length == 0) return;

                    byte[] initialBytes = ms.GetBuffer();
                    int initialLen = (int)ms.Length;
                    string body = "";

                    if (isHttp)
                    {
                        int hdrLen = headerEndIdx >= 0 ? headerEndIdx : initialLen;
                        string headersText = Encoding.UTF8.GetString(initialBytes, 0, hdrLen);
                        int contentLength = 0;
                        foreach (string line in headersText.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries))
                        {
                            if (line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
                            {
                                int.TryParse(line.Substring(15).Trim(), out contentLength);
                                break;
                            }
                        }

                        if (contentLength > 0 && headerEndIdx >= 0)
                        {
                            int cappedLength = Math.Min(contentLength, 65536);
                            byte[] bodyBytes = new byte[cappedLength];
                            int alreadyInBuf = Math.Min(cappedLength, initialLen - headerEndIdx);
                            if (alreadyInBuf > 0)
                            {
                                Buffer.BlockCopy(initialBytes, headerEndIdx, bodyBytes, 0, alreadyInBuf);
                            }
                            int totalBodyRead = alreadyInBuf;
                            while (totalBodyRead < cappedLength)
                            {
                                int readCount = await stream.ReadAsync(bodyBytes, totalBodyRead, cappedLength - totalBodyRead).ConfigureAwait(false);
                                if (readCount <= 0) break;
                                totalBodyRead += readCount;
                            }
                            if (totalBodyRead > 0)
                            {
                                body = Encoding.UTF8.GetString(bodyBytes, 0, totalBodyRead);
                            }
                        }

                        ProcessIncomingMessage(body, remoteIp);

                        byte[] respBytes = Encoding.UTF8.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"ok\":true,\"device\":\"pc\"}");
                        await stream.WriteAsync(respBytes, 0, respBytes.Length).ConfigureAwait(false);
                    }
                    else
                    {
                        int lineLen = newlineIdx >= 0 ? newlineIdx : initialLen;
                        body = Encoding.UTF8.GetString(initialBytes, 0, lineLen).Trim();
                        if (string.IsNullOrWhiteSpace(body)) return;
                        ProcessIncomingMessage(body, remoteIp);
                        byte[] respBytes = Encoding.UTF8.GetBytes("{\"ok\":true}\n");
                        await stream.WriteAsync(respBytes, 0, respBytes.Length).ConfigureAwait(false);
                    }
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"[LocalSyncServer] TCP client handling error: {ex.Message}");
                }
            }
        }

        private void ProcessIncomingMessage(string json, string sourceIp)
        {
            if (string.IsNullOrWhiteSpace(json)) return;
            try
            {
                using JsonDocument doc = JsonDocument.Parse(json);
                JsonElement root = doc.RootElement;

                string action = "";
                if (root.TryGetProperty("action", out var actionProp))
                {
                    action = actionProp.GetString();
                }
                else if (root.TryGetProperty("type", out var typeProp))
                {
                    string type = typeProp.GetString();
                    if (type == "stop-alert" || type == "alarm_dismiss") action = "dismiss";
                    else if (type == "native-alert" || type == "alarm_trigger") action = "trigger";
                }

                string source = "";
                if (root.TryGetProperty("source", out var sourceProp)) source = sourceProp.GetString();
                else if (root.TryGetProperty("clientId", out var clientProp)) source = clientProp.GetString();

                // Never process our own broadcasts
                if (string.Equals(source, "device_pc", StringComparison.OrdinalIgnoreCase))
                {
                    return;
                }

                // Verify account-scoped LAN authToken when configured
                string expectedToken = _authToken;
                if (!string.IsNullOrEmpty(expectedToken))
                {
                    string incomingToken = root.TryGetProperty("authToken", out var authProp) ? (authProp.GetString() ?? "") : "";
                    byte[] expectedBytes = Encoding.UTF8.GetBytes(expectedToken);
                    byte[] incomingBytes = Encoding.UTF8.GetBytes(incomingToken);
                    if (incomingBytes.Length != expectedBytes.Length || !CryptographicOperations.FixedTimeEquals(expectedBytes, incomingBytes))
                    {
                        System.Diagnostics.Debug.WriteLine($"[LocalSyncServer] Rejected unauthenticated/mismatched LAN packet from {sourceIp}");
                        return;
                    }
                }

                if (string.Equals(action, "dismiss", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(action, "native_done", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(action, "native_dismiss", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(action, "snooze", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(action, "native_snooze", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(action, "water_confirmed", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(action, "medication_confirmed", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(action, "med_confirmed", StringComparison.OrdinalIgnoreCase))
                {
                    System.Diagnostics.Debug.WriteLine($"[LocalSyncServer] Received instant dismiss from mobile ({sourceIp})");
                    _onRemoteDismiss?.Invoke();
                }
                else if (string.Equals(action, "trigger", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(action, "ring", StringComparison.OrdinalIgnoreCase))
                {
                    NativeAlertPayload payload = new NativeAlertPayload();
                    if (root.TryGetProperty("title", out var titleProp)) payload.title = titleProp.GetString();
                    if (root.TryGetProperty("body", out var bodyProp)) payload.description = bodyProp.GetString();
                    if (root.TryGetProperty("category", out var catProp)) payload.category = catProp.GetString();
                    if (root.TryGetProperty("emoji", out var emojiProp)) payload.emoji = emojiProp.GetString();
                    payload.isContinuous = true;

                    _onRemoteTrigger?.Invoke(payload);
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[LocalSyncServer] Parse message error: {ex.Message}");
            }
        }

        public void BroadcastAlertDismiss(string actionName = "dismiss")
        {
            var packet = new
            {
                type = "dayrhythm_sync",
                action = actionName ?? "dismiss",
                source = "device_pc",
                authToken = _authToken,
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };
            string json = JsonSerializer.Serialize(packet);
            byte[] bytes = Encoding.UTF8.GetBytes(json);

            // 1. Send UDP Broadcast to MobilePort (48723) and PcPort (48722)
            BroadcastUdp(bytes, MobilePort);
            BroadcastUdp(bytes, PcPort);

            // 2. Direct TCP unicast to all known mobile IPs
            foreach (var kvp in _knownMobileIps)
            {
                string ip = kvp.Key;
                Task.Run(() => SendDirectTcp(ip, MobilePort, json));
            }
        }

        public void BroadcastAlertTrigger(NativeAlertPayload payload)
        {
            if (payload == null) return;
            var packet = new
            {
                type = "dayrhythm_sync",
                action = "trigger",
                source = "device_pc",
                authToken = _authToken,
                title = payload.title,
                body = payload.description,
                category = payload.category,
                emoji = payload.emoji,
                snoozeMinutes = payload.snoozeMinutes,
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };
            string json = JsonSerializer.Serialize(packet);
            byte[] bytes = Encoding.UTF8.GetBytes(json);

            BroadcastUdp(bytes, MobilePort);
            foreach (var kvp in _knownMobileIps)
            {
                string ip = kvp.Key;
                Task.Run(() => SendDirectTcp(ip, MobilePort, json));
            }
        }

        private void BroadcastUdp(byte[] bytes, int port)
        {
            Task.Run(() =>
            {
                try
                {
                    using UdpClient client = new UdpClient();
                    client.EnableBroadcast = true;
                    client.Send(bytes, bytes.Length, new IPEndPoint(IPAddress.Broadcast, port));

                    // Also broadcast to each active interface's directed subnet broadcast
                    foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
                    {
                        if (ni.OperationalStatus != OperationalStatus.Up || ni.NetworkInterfaceType == NetworkInterfaceType.Loopback)
                            continue;

                        foreach (var ua in ni.GetIPProperties().UnicastAddresses)
                        {
                            if (ua.Address.AddressFamily == AddressFamily.InterNetwork && ua.IPv4Mask != null)
                            {
                                byte[] ipBytes = ua.Address.GetAddressBytes();
                                byte[] maskBytes = ua.IPv4Mask.GetAddressBytes();
                                byte[] broadcastBytes = new byte[4];
                                for (int i = 0; i < 4; i++)
                                {
                                    broadcastBytes[i] = (byte)(ipBytes[i] | ~maskBytes[i]);
                                }
                                IPAddress subnetBroadcast = new IPAddress(broadcastBytes);
                                client.Send(bytes, bytes.Length, new IPEndPoint(subnetBroadcast, port));
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"[LocalSyncServer] Broadcast UDP error: {ex.Message}");
                }
            });
        }

        private static void SendDirectTcp(string ip, int port, string json)
        {
            try
            {
                using TcpClient client = new TcpClient();
                var connectTask = client.ConnectAsync(ip, port);
                if (connectTask.Wait(1200))
                {
                    using NetworkStream stream = client.GetStream();
                    byte[] data = Encoding.UTF8.GetBytes(json + "\n");
                    stream.Write(data, 0, data.Length);
                    stream.Flush();
                }
            }
            catch
            {
                // Unreachable or offline IP, ignored
            }
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            _cts.Cancel();
            try { _udpListener?.Close(); _udpListener?.Dispose(); } catch { }
            try { _tcpListener?.Stop(); } catch { }
            _cts.Dispose();
        }
    }
}
