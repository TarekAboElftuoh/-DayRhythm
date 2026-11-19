using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace DayRhythm
{
    internal sealed class LocalWebServer : IDisposable
    {
        private const int PreferredPort = 41735;

        private static readonly Dictionary<string, string> MimeTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [".html"] = "text/html; charset=utf-8",
            [".js"] = "application/javascript; charset=utf-8",
            [".mjs"] = "application/javascript; charset=utf-8",
            [".css"] = "text/css; charset=utf-8",
            [".json"] = "application/json; charset=utf-8",
            [".webmanifest"] = "application/manifest+json; charset=utf-8",
            [".png"] = "image/png",
            [".jpg"] = "image/jpeg",
            [".jpeg"] = "image/jpeg",
            [".svg"] = "image/svg+xml",
            [".ico"] = "image/x-icon",
            [".woff2"] = "font/woff2",
            [".woff"] = "font/woff",
            [".ttf"] = "font/ttf",
            [".mp3"] = "audio/mpeg",
            [".wav"] = "audio/wav",
        };

        private readonly string _wwwRoot;
        private readonly Action _onInstallUpdateRequested;
        private readonly CancellationTokenSource _cts = new CancellationTokenSource();
        private TcpListener _listener;

        public int Port { get; private set; }
        public string BaseUrl => $"http://localhost:{Port}";

        public LocalWebServer(string wwwRoot, Action onInstallUpdateRequested)
        {
            _wwwRoot = wwwRoot;
            _onInstallUpdateRequested = onInstallUpdateRequested;
        }

        public void Start()
        {
            try
            {
                _listener = new TcpListener(IPAddress.Loopback, PreferredPort);
                _listener.Start();
                Port = PreferredPort;
            }
            catch
            {
                _listener = new TcpListener(IPAddress.Loopback, 0);
                _listener.Start();
                Port = ((IPEndPoint)_listener.LocalEndpoint).Port;
            }

            _ = Task.Run(() => AcceptLoopAsync(_cts.Token));
        }

        private async Task AcceptLoopAsync(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    TcpClient client = await _listener.AcceptTcpClientAsync(token).ConfigureAwait(false);
                    _ = Task.Run(() => HandleClientAsync(client, token), token);
                }
                catch
                {
                    if (token.IsCancellationRequested) break;
                }
            }
        }

        private async Task HandleClientAsync(TcpClient client, CancellationToken token)
        {
            using (client)
            {
                try
                {
                    client.ReceiveTimeout = 5000;
                    client.SendTimeout = 10000;
                    using (NetworkStream stream = client.GetStream())
                    using (StreamReader reader = new StreamReader(stream, Encoding.ASCII, false, 4096, true))
                    {
                        string requestLine = await reader.ReadLineAsync(token).ConfigureAwait(false);
                        if (string.IsNullOrWhiteSpace(requestLine)) return;

                        string headerLine;
                        while (!string.IsNullOrEmpty(headerLine = await reader.ReadLineAsync(token).ConfigureAwait(false)))
                        {
                            // consume headers
                        }

                        string[] parts = requestLine.Split(' ');
                        string method = parts.Length >= 1 ? parts[0] : "GET";
                        string rawUrl = parts.Length >= 2 ? parts[1] : "/";
                        int qIdx = rawUrl.IndexOf('?');
                        if (qIdx >= 0) rawUrl = rawUrl.Substring(0, qIdx);
                        string pathname = Uri.UnescapeDataString(rawUrl);

                        if (string.Equals(pathname, "/api/health", StringComparison.OrdinalIgnoreCase))
                        {
                            byte[] json = Encoding.UTF8.GetBytes(
                                "{\"ok\":true,\"mode\":\"windows_dotnet_webview2\",\"version\":\"" + AppConfig.GetVersionString() + "\"}"
                            );
                            await WriteResponseAsync(stream, 200, "application/json; charset=utf-8", json, true, token).ConfigureAwait(false);
                            return;
                        }

                        if (string.Equals(pathname, "/__dayrhythm_native/install-update", StringComparison.OrdinalIgnoreCase)
                            && string.Equals(method, "POST", StringComparison.OrdinalIgnoreCase))
                        {
                            byte[] okBytes = Encoding.UTF8.GetBytes("{\"ok\":true}");
                            await WriteResponseAsync(stream, 200, "application/json; charset=utf-8", okBytes, true, token).ConfigureAwait(false);
                            _onInstallUpdateRequested?.Invoke();
                            return;
                        }

                        string rel = pathname.TrimStart('/').Replace("..", "").Replace('/', Path.DirectorySeparatorChar);
                        if (string.IsNullOrEmpty(rel)) rel = "index.html";

                        string filePath = Path.Combine(_wwwRoot, rel);
                        if (!File.Exists(filePath))
                        {
                            filePath = Path.Combine(_wwwRoot, "index.html");
                        }

                        if (!File.Exists(filePath))
                        {
                            byte[] fallback = Encoding.UTF8.GetBytes(
                                "<!doctype html><html dir=\"rtl\" lang=\"ar\"><body style=\"background:#000;color:#fff;font-family:Segoe UI,sans-serif;padding:40px;text-align:center\"><h2>جاري تجهيز ملفات إيقاع اليوم...</h2></body></html>"
                            );
                            await WriteResponseAsync(stream, 200, "text/html; charset=utf-8", fallback, true, token).ConfigureAwait(false);
                            return;
                        }

                        string ext = Path.GetExtension(filePath);
                        string mime = MimeTypes.TryGetValue(ext, out string foundMime)
                            ? foundMime
                            : "application/octet-stream";
                        bool isHtml = string.Equals(ext, ".html", StringComparison.OrdinalIgnoreCase);
                        byte[] body = await File.ReadAllBytesAsync(filePath, token).ConfigureAwait(false);
                        await WriteResponseAsync(stream, 200, mime, body, isHtml, token).ConfigureAwait(false);
                    }
                }
                catch
                {
                    // Ignore closed client sockets
                }
            }
        }

        private static async Task WriteResponseAsync(
            NetworkStream stream,
            int statusCode,
            string contentType,
            byte[] body,
            bool noCache,
            CancellationToken token)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("HTTP/1.1 ").Append(statusCode).Append(" OK\r\n");
            sb.Append("Content-Type: ").Append(contentType).Append("\r\n");
            sb.Append("Content-Length: ").Append(body.Length).Append("\r\n");
            sb.Append("Cross-Origin-Opener-Policy: same-origin-allow-popups\r\n");
            sb.Append("Connection: close\r\n");
            if (noCache)
            {
                sb.Append("Cache-Control: no-cache, no-store, must-revalidate\r\n");
            }
            sb.Append("\r\n");

            byte[] headerBytes = Encoding.ASCII.GetBytes(sb.ToString());
            await stream.WriteAsync(headerBytes, 0, headerBytes.Length, token).ConfigureAwait(false);
            await stream.WriteAsync(body, 0, body.Length, token).ConfigureAwait(false);
            await stream.FlushAsync(token).ConfigureAwait(false);
        }

        public void Dispose()
        {
            try
            {
                _cts.Cancel();
                _listener?.Stop();
                _cts.Dispose();
            }
            catch
            {
                // Ignore shutdown errors
            }
        }
    }
}
