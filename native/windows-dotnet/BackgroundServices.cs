using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.IO.Compression;
using Microsoft.Win32;

namespace DayRhythm
{
    internal sealed class ReleaseUpdateInfo
    {
        public string Tag { get; set; } = "";
        public string Version { get; set; } = "";
        public string DownloadUrl { get; set; } = "";
        public string WebOtaZipUrl { get; set; } = "";
        public string HtmlUrl { get; set; } = "";
    }

    internal sealed class BackgroundServices : IDisposable
    {
        private const int BaseBackoffMs = 1000;
        private const int MaxBackoffMs = 30000;
        private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(10);
        private static readonly TimeSpan PingInterval = TimeSpan.FromSeconds(25);
        private static readonly TimeSpan ReceiveLivenessTimeout = TimeSpan.FromSeconds(55);

        private readonly HttpClient _http;
        private readonly CancellationTokenSource _cts = new CancellationTokenSource();
        private readonly Action<string> _onWsStatusChanged;
        private readonly Action<string> _onWsMessageReceived;
        private readonly Action<ReleaseUpdateInfo> _onUpdateAvailable;
        private readonly Action _onNetworkRecovered;
        private readonly object _recoveryLock = new object();
        private readonly Random _jitterRng = new Random();

        private CancellationTokenSource _wsWakeupCts = new CancellationTokenSource();
        private ClientWebSocket _activeWs;
        private bool _eventsHooked;
        private bool _disposed;

        public ReleaseUpdateInfo LatestUpdate { get; private set; }

        public BackgroundServices(
            Action<string> onWsStatusChanged,
            Action<string> onWsMessageReceived,
            Action<ReleaseUpdateInfo> onUpdateAvailable,
            Action onNetworkRecovered = null)
        {
            _onWsStatusChanged = onWsStatusChanged;
            _onWsMessageReceived = onWsMessageReceived;
            _onUpdateAvailable = onUpdateAvailable;
            _onNetworkRecovered = onNetworkRecovered;

            _http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
            _http.DefaultRequestHeaders.UserAgent.ParseAdd("DayRhythm-Windows/" + AppConfig.GetVersionString());
            _http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        }

        public void Start(string remoteWsUrl)
        {
            HookSystemRecoveryEvents();
            _ = Task.Run(() => RunPeriodicUpdateLoopAsync(_cts.Token));

            if (!string.IsNullOrWhiteSpace(remoteWsUrl) &&
                (remoteWsUrl.StartsWith("ws://", StringComparison.OrdinalIgnoreCase) ||
                 remoteWsUrl.StartsWith("wss://", StringComparison.OrdinalIgnoreCase)))
            {
                _ = Task.Run(() => RunPersistentWebSocketLoopAsync(remoteWsUrl, _cts.Token));
            }
            else
            {
                _onWsStatusChanged?.Invoke("متصل 24/7 (Firestore استعادة تلقائية)");
            }
        }

        private void HookSystemRecoveryEvents()
        {
            if (_eventsHooked) return;
            _eventsHooked = true;
            try
            {
                NetworkChange.NetworkAvailabilityChanged += OnNetworkAvailabilityChanged;
                SystemEvents.PowerModeChanged += OnPowerModeChanged;
            }
            catch
            {
                // Non-fatal if OS rejects event subscription
            }
        }

        private void OnNetworkAvailabilityChanged(object sender, NetworkAvailabilityEventArgs e)
        {
            if (_disposed) return;
            if (!e.IsAvailable)
            {
                AbortActiveWebSocket();
                _onWsStatusChanged?.Invoke("بانتظار عودة الإنترنت (استعادة تلقائية)...");
                return;
            }
            TriggerImmediateAutoRecovery();
        }

        private void OnPowerModeChanged(object sender, PowerModeChangedEventArgs e)
        {
            if (_disposed) return;
            if (e.Mode == PowerModes.Suspend)
            {
                AbortActiveWebSocket();
            }
            else if (e.Mode == PowerModes.Resume)
            {
                TriggerImmediateAutoRecovery();
            }
        }

        public void TriggerImmediateAutoRecovery()
        {
            if (_disposed) return;
            AbortActiveWebSocket();
            SignalWsWakeup();
            _onNetworkRecovered?.Invoke();
        }

        private void AbortActiveWebSocket()
        {
            lock (_recoveryLock)
            {
                if (_activeWs != null)
                {
                    try
                    {
                        _activeWs.Abort();
                    }
                    catch
                    {
                        // ignore
                    }
                }
            }
        }

        private void SignalWsWakeup()
        {
            lock (_recoveryLock)
            {
                try
                {
                    _wsWakeupCts.Cancel();
                    _wsWakeupCts.Dispose();
                }
                catch
                {
                    // ignore
                }
                _wsWakeupCts = new CancellationTokenSource();
            }
        }

        private CancellationToken GetCurrentWakeupToken()
        {
            lock (_recoveryLock)
            {
                return _wsWakeupCts.Token;
            }
        }

        private int ComputeExponentialBackoffWithJitter(int attempt)
        {
            int shift = Math.Min(Math.Max(0, attempt), 6);
            int exp = Math.Min(MaxBackoffMs, BaseBackoffMs * (1 << shift));
            int maxJitter = Math.Min(1500, (int)(exp * 0.3));
            int jitter;
            lock (_recoveryLock)
            {
                jitter = maxJitter > 0 ? _jitterRng.Next(0, maxJitter) : 0;
            }
            return Math.Min(MaxBackoffMs, exp + jitter);
        }

        private async Task RunPersistentWebSocketLoopAsync(string wsUrl, CancellationToken token)
        {
            int attempt = 0;
            byte[] buffer = new byte[16384];
            byte[] pingPayload = Encoding.UTF8.GetBytes("{\"type\":\"ping\"}");

            while (!token.IsCancellationRequested)
            {
                ClientWebSocket ws = new ClientWebSocket();
                ws.Options.KeepAliveInterval = PingInterval;

                lock (_recoveryLock)
                {
                    _activeWs = ws;
                }

                try
                {
                    _onWsStatusChanged?.Invoke(attempt == 0
                        ? "جاري الاتصال بـ WebSocket..."
                        : $"استعادة WebSocket تلقائياً (محاولة #{attempt + 1})...");

                    using (CancellationTokenSource connectCts = CancellationTokenSource.CreateLinkedTokenSource(token, GetCurrentWakeupToken()))
                    {
                        connectCts.CancelAfter(ConnectTimeout);
                        await ws.ConnectAsync(new Uri(wsUrl), connectCts.Token).ConfigureAwait(false);
                    }

                    bool recoveredFromDrop = attempt > 0;
                    attempt = 0;
                    _onWsStatusChanged?.Invoke("متصل بـ WebSocket 24/7 ✓");
                    if (recoveredFromDrop)
                    {
                        _onNetworkRecovered?.Invoke();
                    }

                    using (CancellationTokenSource sessionCts = CancellationTokenSource.CreateLinkedTokenSource(token, GetCurrentWakeupToken()))
                    {
                        Task pingLoop = RunHeartbeatPingLoopAsync(ws, pingPayload, sessionCts.Token);

                        try
                        {
                            while (ws.State == WebSocketState.Open && !sessionCts.Token.IsCancellationRequested)
                            {
                                using (CancellationTokenSource recvTimeoutCts = CancellationTokenSource.CreateLinkedTokenSource(sessionCts.Token))
                                {
                                    recvTimeoutCts.CancelAfter(ReceiveLivenessTimeout);
                                    WebSocketReceiveResult result = await ws.ReceiveAsync(
                                        new ArraySegment<byte>(buffer),
                                        recvTimeoutCts.Token
                                    ).ConfigureAwait(false);

                                    if (result.MessageType == WebSocketMessageType.Close)
                                    {
                                        break;
                                    }

                                    if (result.MessageType == WebSocketMessageType.Text && result.Count > 0)
                                    {
                                        string msg = Encoding.UTF8.GetString(buffer, 0, result.Count);
                                        if (!msg.Contains("\"pong\""))
                                        {
                                            _onWsMessageReceived?.Invoke(msg);
                                        }
                                    }
                                }
                            }
                        }
                        finally
                        {
                            sessionCts.Cancel();
                            try
                            {
                                await pingLoop.ConfigureAwait(false);
                            }
                            catch
                            {
                                // ignore ping loop cancellation
                            }
                        }
                    }
                }
                catch
                {
                    _onWsStatusChanged?.Invoke("جاري استعادة WebSocket في الخلفية...");
                }
                finally
                {
                    lock (_recoveryLock)
                    {
                        if (ReferenceEquals(_activeWs, ws))
                        {
                            _activeWs = null;
                        }
                    }
                    try
                    {
                        if (ws.State == WebSocketState.Open || ws.State == WebSocketState.CloseReceived)
                        {
                            using (CancellationTokenSource closeCts = new CancellationTokenSource(1500))
                            {
                                await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "auto_recovery_reset", closeCts.Token).ConfigureAwait(false);
                            }
                        }
                        else
                        {
                            ws.Abort();
                        }
                    }
                    catch
                    {
                        try
                        {
                            ws.Abort();
                        }
                        catch
                        {
                            // ignore
                        }
                    }
                    ws.Dispose();
                }

                if (token.IsCancellationRequested) break;

                int delayMs = ComputeExponentialBackoffWithJitter(attempt);
                attempt = Math.Min(attempt + 1, 6);

                try
                {
                    using (CancellationTokenSource waitCts = CancellationTokenSource.CreateLinkedTokenSource(token, GetCurrentWakeupToken()))
                    {
                        await Task.Delay(delayMs, waitCts.Token).ConfigureAwait(false);
                    }
                }
                catch
                {
                    if (token.IsCancellationRequested) break;
                    // Wakeup signal received (network restored / PC resumed): retry immediately with reset backoff
                    attempt = 0;
                }
            }
        }

        private static async Task RunHeartbeatPingLoopAsync(ClientWebSocket ws, byte[] pingPayload, CancellationToken token)
        {
            while (!token.IsCancellationRequested && ws.State == WebSocketState.Open)
            {
                await Task.Delay(PingInterval, token).ConfigureAwait(false);
                if (token.IsCancellationRequested || ws.State != WebSocketState.Open) break;
                try
                {
                    await ws.SendAsync(
                        new ArraySegment<byte>(pingPayload),
                        WebSocketMessageType.Text,
                        true,
                        token
                    ).ConfigureAwait(false);
                }
                catch
                {
                    try
                    {
                        ws.Abort();
                    }
                    catch
                    {
                        // ignore
                    }
                    break;
                }
            }
        }

        private async Task RunPeriodicUpdateLoopAsync(CancellationToken token)
        {
            await CheckForUpdateAsync(token).ConfigureAwait(false);
            while (!token.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(TimeSpan.FromMinutes(30), token).ConfigureAwait(false);
                }
                catch
                {
                    break;
                }
                await CheckForUpdateAsync(token).ConfigureAwait(false);
            }
        }

        public async Task<ReleaseUpdateInfo> CheckForUpdateAsync(CancellationToken token = default)
        {
            string repo = AppConfig.GetGithubRepo();
            if (string.IsNullOrEmpty(repo) || !repo.Contains('/')) return null;

            try
            {
                string url = $"https://api.github.com/repos/{repo}/releases/latest";
                using (HttpResponseMessage resp = await _http.GetAsync(url, token).ConfigureAwait(false))
                {
                    if (!resp.IsSuccessStatusCode) return null;
                    string json = await resp.Content.ReadAsStringAsync(token).ConfigureAwait(false);
                    using (JsonDocument doc = JsonDocument.Parse(json))
                    {
                        JsonElement root = doc.RootElement;
                        string tag = root.TryGetProperty("tag_name", out JsonElement tEl) ? (tEl.GetString() ?? "").Trim() : "";
                        string htmlUrl = root.TryGetProperty("html_url", out JsonElement hEl) ? (hEl.GetString() ?? "").Trim() : "";
                        string downloadUrl = "";
                        string webOtaZipUrl = "";

                        if (root.TryGetProperty("assets", out JsonElement assets) && assets.ValueKind == JsonValueKind.Array)
                        {
                            string fallbackExe = "";
                            foreach (JsonElement asset in assets.EnumerateArray())
                            {
                                string name = asset.TryGetProperty("name", out JsonElement nEl) ? (nEl.GetString() ?? "") : "";
                                string dl = asset.TryGetProperty("browser_download_url", out JsonElement dEl) ? (dEl.GetString() ?? "") : "";
                                if (name.Equals("dayrhythm-web-ota.zip", StringComparison.OrdinalIgnoreCase))
                                {
                                    webOtaZipUrl = dl;
                                    continue;
                                }
                                if (name.EndsWith("Setup.exe", StringComparison.OrdinalIgnoreCase))
                                {
                                    downloadUrl = dl;
                                }
                                else if (string.IsNullOrEmpty(fallbackExe) && name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                                {
                                    fallbackExe = dl;
                                }
                            }
                            if (string.IsNullOrEmpty(downloadUrl)) downloadUrl = fallbackExe;
                        }

                        if (string.IsNullOrEmpty(tag)) return null;
                        string remoteVer = tag.TrimStart('v', 'V');
                        if (!IsVersionNewer(remoteVer, GetEffectiveLocalVersion()))
                        {
                            return null;
                        }

                        ReleaseUpdateInfo info = new ReleaseUpdateInfo
                        {
                            Tag = tag,
                            Version = remoteVer,
                            DownloadUrl = string.IsNullOrEmpty(downloadUrl) ? htmlUrl : downloadUrl,
                            WebOtaZipUrl = webOtaZipUrl,
                            HtmlUrl = htmlUrl,
                        };
                        LatestUpdate = info;
                        _onUpdateAvailable?.Invoke(info);
                        return info;
                    }
                }
            }
            catch
            {
                return null;
            }
        }

        public static string GetOtaWwwDir()
        {
            return Path.Combine(AppConfig.GetDataDir(), "ota_www");
        }

        public static string GetOtaVersionFile()
        {
            return Path.Combine(AppConfig.GetDataDir(), "ota_version.txt");
        }

        public static string GetEffectiveLocalVersion()
        {
            string baseVer = AppConfig.GetVersionString();
            try
            {
                string verFile = GetOtaVersionFile();
                string otaIndex = Path.Combine(GetOtaWwwDir(), "index.html");
                if (File.Exists(verFile) && File.Exists(otaIndex))
                {
                    string otaVer = File.ReadAllText(verFile).Trim().TrimStart('v', 'V');
                    if (!string.IsNullOrEmpty(otaVer) && IsVersionNewer(otaVer, baseVer))
                    {
                        return otaVer;
                    }
                }
            }
            catch
            {
                // fallback to base version
            }
            return baseVer;
        }

        public async Task<bool> ApplyWebOtaUpdateAsync(ReleaseUpdateInfo info)
        {
            if (info == null || string.IsNullOrWhiteSpace(info.WebOtaZipUrl)) return false;

            string dataDir = AppConfig.GetDataDir();
            string tmpZip = Path.Combine(dataDir, "ota_bundle.zip");
            string stagingDir = Path.Combine(dataDir, "ota_www_staging");
            string liveDir = GetOtaWwwDir();

            try
            {
                Directory.CreateDirectory(dataDir);
                if (File.Exists(tmpZip)) File.Delete(tmpZip);
                if (Directory.Exists(stagingDir)) Directory.Delete(stagingDir, true);

                using (HttpClient dlClient = new HttpClient { Timeout = TimeSpan.FromMinutes(2) })
                {
                    dlClient.DefaultRequestHeaders.UserAgent.ParseAdd("DayRhythm-Windows/" + GetEffectiveLocalVersion());
                    using (HttpResponseMessage resp = await dlClient.GetAsync(info.WebOtaZipUrl, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false))
                    {
                        resp.EnsureSuccessStatusCode();
                        using (Stream src = await resp.Content.ReadAsStreamAsync().ConfigureAwait(false))
                        using (FileStream dst = new FileStream(tmpZip, FileMode.Create, FileAccess.Write, FileShare.None))
                        {
                            await src.CopyToAsync(dst).ConfigureAwait(false);
                        }
                    }
                }

                ZipFile.ExtractToDirectory(tmpZip, stagingDir, true);
                if (!File.Exists(Path.Combine(stagingDir, "index.html")))
                {
                    return false;
                }

                string backupDir = Path.Combine(dataDir, "ota_www_prev");
                if (Directory.Exists(backupDir)) Directory.Delete(backupDir, true);
                if (Directory.Exists(liveDir)) Directory.Move(liveDir, backupDir);
                Directory.Move(stagingDir, liveDir);
                if (Directory.Exists(backupDir))
                {
                    try { Directory.Delete(backupDir, true); } catch { }
                }

                File.WriteAllText(GetOtaVersionFile(), info.Version ?? info.Tag.TrimStart('v', 'V'));
                try { File.Delete(tmpZip); } catch { }
                return true;
            }
            catch
            {
                return false;
            }
        }

        public async Task<bool> DownloadAndLaunchUpdateAsync(ReleaseUpdateInfo info)
        {
            if (info == null || string.IsNullOrWhiteSpace(info.DownloadUrl)) return false;

            if (!info.DownloadUrl.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            {
                Process.Start(new ProcessStartInfo { FileName = info.DownloadUrl, UseShellExecute = true });
                return true;
            }

            try
            {
                string safeTag = info.Tag.Replace("/", "_").Replace("\\", "_");
                string targetFile = Path.Combine(Path.GetTempPath(), $"DayRhythm-Setup-{safeTag}.exe");
                using (HttpClient dlClient = new HttpClient { Timeout = TimeSpan.FromMinutes(5) })
                {
                    dlClient.DefaultRequestHeaders.UserAgent.ParseAdd("DayRhythm-Windows/" + AppConfig.GetVersionString());
                    using (HttpResponseMessage resp = await dlClient.GetAsync(info.DownloadUrl, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false))
                    {
                        resp.EnsureSuccessStatusCode();
                        using (Stream src = await resp.Content.ReadAsStreamAsync().ConfigureAwait(false))
                        using (FileStream dst = new FileStream(targetFile, FileMode.Create, FileAccess.Write, FileShare.None))
                        {
                            await src.CopyToAsync(dst).ConfigureAwait(false);
                        }
                    }
                }

                Process.Start(new ProcessStartInfo
                {
                    FileName = targetFile,
                    UseShellExecute = true,
                });
                return true;
            }
            catch
            {
                try
                {
                    Process.Start(new ProcessStartInfo { FileName = info.DownloadUrl, UseShellExecute = true });
                    return true;
                }
                catch
                {
                    return false;
                }
            }
        }

        public static bool IsVersionNewer(string remoteVer, string localVer)
        {
            string[] r = (remoteVer ?? "").TrimStart('v', 'V').Split('.');
            string[] l = (localVer ?? "").TrimStart('v', 'V').Split('.');
            int len = Math.Max(r.Length, l.Length);
            for (int i = 0; i < len; i++)
            {
                int rv = ParseDigits(i < r.Length ? r[i] : "0");
                int lv = ParseDigits(i < l.Length ? l[i] : "0");
                if (rv > lv) return true;
                if (rv < lv) return false;
            }
            return false;
        }

        private static int ParseDigits(string raw)
        {
            StringBuilder sb = new StringBuilder();
            foreach (char c in raw)
            {
                if (char.IsDigit(c)) sb.Append(c);
            }
            return int.TryParse(sb.ToString(), out int val) ? val : 0;
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;

            if (_eventsHooked)
            {
                try
                {
                    NetworkChange.NetworkAvailabilityChanged -= OnNetworkAvailabilityChanged;
                    SystemEvents.PowerModeChanged -= OnPowerModeChanged;
                }
                catch
                {
                    // ignore
                }
                _eventsHooked = false;
            }

            AbortActiveWebSocket();

            try
            {
                _cts.Cancel();
                lock (_recoveryLock)
                {
                    _wsWakeupCts.Cancel();
                    _wsWakeupCts.Dispose();
                }
                _http.Dispose();
                _cts.Dispose();
            }
            catch
            {
                // ignore
            }
        }
    }
}
