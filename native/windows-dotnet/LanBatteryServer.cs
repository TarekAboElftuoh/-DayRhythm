using System;
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
        public const int Port = LanSyncServer.TcpPort;
        private readonly LanSyncServer _innerServer;

        public LanBatteryServer(Action<LanBatteryTelemetry> onTelemetryReceived, Action<string> onMessageReceived = null)
        {
            _innerServer = new LanSyncServer(
                onMessageReceived: msg => onMessageReceived?.Invoke(msg),
                onBatteryReceived: onTelemetryReceived
            );
        }

        public void Start() => _innerServer.Start();
        public void Stop() => _innerServer.Stop();
        public Task BroadcastAsync(string json) => _innerServer.BroadcastAsync(json);
        public void Dispose() => _innerServer.Dispose();
    }
}
