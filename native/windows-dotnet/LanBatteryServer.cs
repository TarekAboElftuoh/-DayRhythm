using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace DayRhythm
{
    internal sealed class LanBatteryTelemetry
    {
        public int level { get; set; } = -1;
        public int levelPct { get; set; } = -1;
        public bool is_charging { get; set; }
        public bool charging { get; set; }
        public int eta_minutes_90 { get; set; } = -1;
        public int chargeTimeRemainingMin { get; set; } = -1;
        public int limit { get; set; } = 90;
        public int chargeLimitPct { get; set; } = 90;
        public string device { get; set; } = "OnePlus 12R";
        public string deviceLabel { get; set; } = "OnePlus 12R";
        public string action { get; set; } = "";
        public string type { get; set; } = "";

        public int EffectiveLevel => level >= 0 ? level : levelPct;
        public bool EffectiveCharging => is_charging || charging;
        public int EffectiveEta => eta_minutes_90 >= 0 ? eta_minutes_90 : chargeTimeRemainingMin;
        public int EffectiveLimit => limit >= 60 ? limit : (chargeLimitPct >= 60 ? chargeLimitPct : 90);
        public string EffectiveDevice => !string.IsNullOrEmpty(device) ? device : (!string.IsNullOrEmpty(deviceLabel) ? deviceLabel : "OnePlus 12R");
    }

    internal sealed class LanBatteryServer : IDisposable
    {
        public const int Port = 48721;
        private readonly Action<LanBatteryTelemetry> _onTelemetryReceived;
        private UdpClient _udpListener;
        private HttpListener _httpListener;
        private CancellationTokenSource _cts;

        public LanBatteryServer(Action<LanBatteryTelemetry> onTelemetryReceived)
        {
            _onTelemetryReceived = onTelemetryReceived ?? throw new ArgumentNullException(nameof(onTelemetryReceived));
        }

        public void Start()
        {
            Stop();
            _cts = new CancellationTokenSource();
            StartUdpListener(_cts.Token);
            StartHttpListener(_cts.Token);
        }

        private void StartUdpListener(CancellationToken ct)
        {
            Task.Run(async () =>
            {
                try
                {
                    _udpListener = new UdpClient();
                    _udpListener.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                    _udpListener.Client.Bind(new IPEndPoint(IPAddress.Any, Port));

                    while (!ct.IsCancellationRequested)
                    {
                        UdpReceiveResult result = await _udpListener.ReceiveAsync(ct).ConfigureAwait(false);
                        string json = Encoding.UTF8.GetString(result.Buffer);
                        ProcessJsonPayload(json);

                        // Send quick acknowledgment back to the mobile sender
                        try
                        {
                            byte[] ack = Encoding.UTF8.GetBytes("{\"ok\":true,\"source\":\"pc_udp\"}");
                            await _udpListener.SendAsync(ack, ack.Length, result.RemoteEndPoint).ConfigureAwait(false);
                        }
                        catch { }
                    }
                }
                catch
                {
                    // Listener stopped or socket closed
                }
            }, ct);
        }

        private void StartHttpListener(CancellationToken ct)
        {
            Task.Run(async () =>
            {
                try
                {
                    _httpListener = new HttpListener();
                    _httpListener.Prefixes.Add($"http://*:{Port}/api/v1/battery/update/");
                    _httpListener.Start();
                }
                catch
                {
                    try
                    {
                        _httpListener = new HttpListener();
                        _httpListener.Prefixes.Add($"http://localhost:{Port}/api/v1/battery/update/");
                        _httpListener.Start();
                    }
                    catch
                    {
                        return; // UDP is the primary channel
                    }
                }

                while (!ct.IsCancellationRequested && _httpListener != null && _httpListener.IsListening)
                {
                    try
                    {
                        HttpListenerContext ctx = await _httpListener.GetContextAsync().ConfigureAwait(false);
                        _ = Task.Run(() => HandleHttpRequest(ctx));
                    }
                    catch
                    {
                        break;
                    }
                }
            }, ct);
        }

        private void HandleHttpRequest(HttpListenerContext ctx)
        {
            try
            {
                if (ctx.Request.HttpMethod == "POST")
                {
                    using (var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
                    {
                        string json = reader.ReadToEnd();
                        ProcessJsonPayload(json);
                    }
                    byte[] ok = Encoding.UTF8.GetBytes("{\"ok\":true}");
                    ctx.Response.ContentType = "application/json";
                    ctx.Response.StatusCode = 200;
                    ctx.Response.OutputStream.Write(ok, 0, ok.Length);
                }
                else
                {
                    ctx.Response.StatusCode = 405;
                }
                ctx.Response.Close();
            }
            catch
            {
                try { ctx.Response.Abort(); } catch { }
            }
        }

        private void ProcessJsonPayload(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return;
            try
            {
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                LanBatteryTelemetry telemetry = JsonSerializer.Deserialize<LanBatteryTelemetry>(json, options);
                if (telemetry != null && (telemetry.EffectiveLevel >= 0 || !string.IsNullOrEmpty(telemetry.action)))
                {
                    _onTelemetryReceived(telemetry);
                }
            }
            catch
            {
            }
        }

        public void Stop()
        {
            try { _cts?.Cancel(); } catch { }
            try { _udpListener?.Close(); _udpListener?.Dispose(); } catch { }
            try { _httpListener?.Stop(); _httpListener?.Close(); } catch { }
            _udpListener = null;
            _httpListener = null;
            _cts = null;
        }

        public void Dispose()
        {
            Stop();
        }
    }
}
