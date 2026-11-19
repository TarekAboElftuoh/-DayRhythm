using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace DayRhythm
{
    internal sealed class ReleaseUpdateInfo
    {
        public string Tag { get; set; } = "";
        public string Version { get; set; } = "";
        public string DownloadUrl { get; set; } = "";
        public string HtmlUrl { get; set; } = "";
    }

    internal sealed class BackgroundServices : IDisposable
    {
        private readonly HttpClient _http;
        private readonly CancellationTokenSource _cts = new CancellationTokenSource();
        private readonly Action<string> _onWsStatusChanged;
        private readonly Action<string> _onWsMessageReceived;
        private readonly Action<ReleaseUpdateInfo> _onUpdateAvailable;

        public ReleaseUpdateInfo LatestUpdate { get; private set; }

        public BackgroundServices(
            Action<string> onWsStatusChanged,
            Action<string> onWsMessageReceived,
            Action<ReleaseUpdateInfo> onUpdateAvailable)
        {
            _onWsStatusChanged = onWsStatusChanged;
            _onWsMessageReceived = onWsMessageReceived;
            _onUpdateAvailable = onUpdateAvailable;

            _http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
            _http.DefaultRequestHeaders.UserAgent.ParseAdd("DayRhythm-Windows/" + AppConfig.GetVersionString());
            _http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        }

        public void Start(string remoteWsUrl)
        {
            _ = Task.Run(() => RunPeriodicUpdateLoopAsync(_cts.Token));
            if (!string.IsNullOrWhiteSpace(remoteWsUrl) &&
                (remoteWsUrl.StartsWith("ws://", StringComparison.OrdinalIgnoreCase) ||
                 remoteWsUrl.StartsWith("wss://", StringComparison.OrdinalIgnoreCase)))
            {
                _ = Task.Run(() => RunPersistentWebSocketLoopAsync(remoteWsUrl, _cts.Token));
            }
            else
            {
                _onWsStatusChanged?.Invoke("متصل 24/7 (Firestore لحظي)");
            }
        }

        private async Task RunPersistentWebSocketLoopAsync(string wsUrl, CancellationToken token)
        {
            int backoffMs = 3000;
            byte[] buffer = new byte[8192];

            while (!token.IsCancellationRequested)
            {
                using (ClientWebSocket ws = new ClientWebSocket())
                {
                    ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(25);
                    try
                    {
                        _onWsStatusChanged?.Invoke("جاري الاتصال بـ WebSocket...");
                        await ws.ConnectAsync(new Uri(wsUrl), token).ConfigureAwait(false);
                        backoffMs = 3000;
                        _onWsStatusChanged?.Invoke("متصل بـ WebSocket 24/7 ✓");

                        while (ws.State == WebSocketState.Open && !token.IsCancellationRequested)
                        {
                            WebSocketReceiveResult result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), token).ConfigureAwait(false);
                            if (result.MessageType == WebSocketMessageType.Close)
                            {
                                break;
                            }
                            if (result.MessageType == WebSocketMessageType.Text && result.Count > 0)
                            {
                                string msg = Encoding.UTF8.GetString(buffer, 0, result.Count);
                                _onWsMessageReceived?.Invoke(msg);
                            }
                        }
                    }
                    catch
                    {
                        _onWsStatusChanged?.Invoke("إعادة ربط WebSocket في الخلفية...");
                    }
                }

                try
                {
                    await Task.Delay(backoffMs, token).ConfigureAwait(false);
                }
                catch
                {
                    break;
                }
                backoffMs = Math.Min(backoffMs * 2, 45000);
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

                        if (root.TryGetProperty("assets", out JsonElement assets) && assets.ValueKind == JsonValueKind.Array)
                        {
                            string fallbackExe = "";
                            foreach (JsonElement asset in assets.EnumerateArray())
                            {
                                string name = asset.TryGetProperty("name", out JsonElement nEl) ? (nEl.GetString() ?? "") : "";
                                string dl = asset.TryGetProperty("browser_download_url", out JsonElement dEl) ? (dEl.GetString() ?? "") : "";
                                if (name.EndsWith("Setup.exe", StringComparison.OrdinalIgnoreCase))
                                {
                                    downloadUrl = dl;
                                    break;
                                }
                                if (string.IsNullOrEmpty(fallbackExe) && name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                                {
                                    fallbackExe = dl;
                                }
                            }
                            if (string.IsNullOrEmpty(downloadUrl)) downloadUrl = fallbackExe;
                        }

                        if (string.IsNullOrEmpty(tag)) return null;
                        string remoteVer = tag.TrimStart('v', 'V');
                        if (!IsVersionNewer(remoteVer, AppConfig.GetVersionString()))
                        {
                            return null;
                        }

                        ReleaseUpdateInfo info = new ReleaseUpdateInfo
                        {
                            Tag = tag,
                            Version = remoteVer,
                            DownloadUrl = string.IsNullOrEmpty(downloadUrl) ? htmlUrl : downloadUrl,
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
            try
            {
                _cts.Cancel();
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
