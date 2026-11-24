using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
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
        private bool _disposed;

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
                    string remoteIp = ((IPEndPoint)client.Client.RemoteEndPoint).Address.ToString();
                    _knownMobileIps[remoteIp] = DateTime.UtcNow;

                    using NetworkStream stream = client.GetStream();
                    using StreamReader reader = new StreamReader(stream, Encoding.UTF8);
                    using StreamWriter writer = new StreamWriter(stream, new UTF8Encoding(false)) { AutoFlush = true };

                    string firstLine = await reader.ReadLineAsync().ConfigureAwait(false);
                    if (string.IsNullOrWhiteSpace(firstLine)) return;

                    string body = "";
                    if (firstLine.StartsWith("POST ", StringComparison.OrdinalIgnoreCase) ||
                        firstLine.StartsWith("GET ", StringComparison.OrdinalIgnoreCase))
                    {
                        // HTTP request handler
                        int contentLength = 0;
                        string headerLine;
                        while (!string.IsNullOrEmpty(headerLine = await reader.ReadLineAsync().ConfigureAwait(false)))
                        {
                            if (headerLine.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
                            {
                                int.TryParse(headerLine.Substring(15).Trim(), out contentLength);
                            }
                        }

                        if (contentLength > 0)
                        {
                            int cappedLength = Math.Min(contentLength, 65536);
                            char[] bodyBuffer = new char[cappedLength];
                            int readCount = await reader.ReadAsync(bodyBuffer, 0, cappedLength).ConfigureAwait(false);
                            if (readCount > 0)
                            {
                                body = new string(bodyBuffer, 0, readCount);
                            }
                        }

                        ProcessIncomingMessage(body, remoteIp);

                        string httpResponse = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"ok\":true,\"device\":\"pc\"}";
                        await writer.WriteAsync(httpResponse).ConfigureAwait(false);
                    }
                    else
                    {
                        // Raw JSON line
                        body = firstLine;
                        ProcessIncomingMessage(body, remoteIp);
                        await writer.WriteLineAsync("{\"ok\":true}").ConfigureAwait(false);
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

                if (string.Equals(action, "dismiss", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(action, "native_done", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(action, "native_dismiss", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(action, "water_confirmed", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(action, "medication_confirmed", StringComparison.OrdinalIgnoreCase))
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
