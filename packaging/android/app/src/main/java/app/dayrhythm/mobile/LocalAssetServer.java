package app.dayrhythm.mobile;

import android.content.Context;
import android.content.res.AssetManager;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LocalAssetServer {
    private static final int PREFERRED_PORT = 41735;
    private static LocalAssetServer instance;

    private final AssetManager assets;
    private ServerSocket serverSocket;
    private ExecutorService pool;
    private volatile boolean running = false;
    private int boundPort = PREFERRED_PORT;

    private LocalAssetServer(Context context) {
        this.assets = context.getApplicationContext().getAssets();
    }

    public static synchronized LocalAssetServer ensureStarted(Context context) {
        if (instance == null) {
            instance = new LocalAssetServer(context);
        }
        if (!instance.running) {
            instance.start();
        }
        return instance;
    }

    public int getPort() {
        return boundPort;
    }

    public String getBaseUrl() {
        return "http://localhost:" + boundPort;
    }

    private synchronized void start() {
        if (running) return;
        try {
            InetAddress loopback = InetAddress.getByName("127.0.0.1");
            try {
                serverSocket = new ServerSocket(PREFERRED_PORT, 32, loopback);
                boundPort = PREFERRED_PORT;
            } catch (IOException busy) {
                serverSocket = new ServerSocket(0, 32, loopback);
                boundPort = serverSocket.getLocalPort();
            }

            running = true;
            pool = Executors.newCachedThreadPool();
            pool.execute(() -> {
                while (running && serverSocket != null && !serverSocket.isClosed()) {
                    try {
                        Socket client = serverSocket.accept();
                        pool.execute(() -> handleClient(client));
                    } catch (IOException ignored) {
                        if (!running) break;
                    }
                }
            });
        } catch (IOException ignored) {
            running = false;
        }
    }

    private void handleClient(Socket socket) {
        try (Socket s = socket) {
            s.setSoTimeout(5000);
            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
            String requestLine = reader.readLine();
            if (requestLine == null || requestLine.isEmpty()) return;

            // Consume headers
            String headerLine;
            while ((headerLine = reader.readLine()) != null && !headerLine.isEmpty()) {
                // skip
            }

            String[] parts = requestLine.split(" ");
            String rawPath = parts.length >= 2 ? parts[1] : "/";
            int qIdx = rawPath.indexOf('?');
            if (qIdx >= 0) rawPath = rawPath.substring(0, qIdx);
            rawPath = URLDecoder.decode(rawPath, "UTF-8");

            OutputStream out = s.getOutputStream();

            if ("/api/health".equals(rawPath)) {
                byte[] json = ("{\"ok\":true,\"mode\":\"android_standalone\",\"version\":\""
                        + BuildConfig.VERSION_NAME + "\"}").getBytes(StandardCharsets.UTF_8);
                writeResponse(out, 200, "application/json; charset=utf-8", json, false);
                return;
            }

            String cleanRel = rawPath.replaceFirst("^/+", "").replace("..", "");
            if (cleanRel.isEmpty()) cleanRel = "index.html";

            byte[] content = readAssetBytes("www/" + cleanRel);
            String resolvedName = cleanRel;
            if (content == null) {
                content = readAssetBytes("www/index.html");
                resolvedName = "index.html";
            }

            if (content == null) {
                byte[] fallback = "<!doctype html><html dir=\"rtl\" lang=\"ar\"><body style=\"background:#000;color:#fff;font-family:sans-serif;padding:32px;text-align:center\"><h2>جاري تحميل إيقاع اليوم...</h2></body></html>"
                        .getBytes(StandardCharsets.UTF_8);
                writeResponse(out, 200, "text/html; charset=utf-8", fallback, true);
                return;
            }

            boolean isHtml = resolvedName.endsWith(".html");
            writeResponse(out, 200, guessMime(resolvedName), content, isHtml);
        } catch (Exception ignored) {
            // ignore closed socket
        }
    }

    private byte[] readAssetBytes(String assetPath) {
        try (InputStream is = assets.open(assetPath);
             ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) != -1) {
                bos.write(buf, 0, n);
            }
            return bos.toByteArray();
        } catch (IOException e) {
            return null;
        }
    }

    private void writeResponse(OutputStream out, int code, String mime, byte[] body, boolean noCache) throws IOException {
        StringBuilder headers = new StringBuilder();
        headers.append("HTTP/1.1 ").append(code).append(" OK\r\n");
        headers.append("Content-Type: ").append(mime).append("\r\n");
        headers.append("Content-Length: ").append(body.length).append("\r\n");
        headers.append("Cross-Origin-Opener-Policy: same-origin-allow-popups\r\n");
        headers.append("Connection: close\r\n");
        if (noCache) {
            headers.append("Cache-Control: no-cache\r\n");
        }
        headers.append("\r\n");
        out.write(headers.toString().getBytes(StandardCharsets.UTF_8));
        out.write(body);
        out.flush();
    }

    private String guessMime(String name) {
        String lower = name.toLowerCase();
        if (lower.endsWith(".html")) return "text/html; charset=utf-8";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".json")) return "application/json; charset=utf-8";
        if (lower.endsWith(".webmanifest")) return "application/manifest+json; charset=utf-8";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".wav")) return "audio/wav";
        return "application/octet-stream";
    }
}
