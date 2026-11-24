package app.dayrhythm.mobile;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Enumeration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Spotify Connect Architecture: Ultra-low latency (<5ms) Peer-to-Peer LAN Synchronization.
 * Operates directly over local Wi-Fi without any dependency on external cloud databases,
 * internet connectivity, or Firestore security rules.
 *
 * Listens on UDP port 48723 and TCP port 48723.
 * Communicates directly with PC on port 48722.
 */
public final class LocalSyncServer {
    private static final String TAG = "DayRhythmLocalSync";

    public static final int PC_PORT = 48722;
    public static final int MOBILE_PORT = 48723;

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final ExecutorService POOL = Executors.newCachedThreadPool();
    private static final ConcurrentHashMap<String, Long> KNOWN_PC_IPS = new ConcurrentHashMap<>();
    private static final AtomicBoolean RUNNING = new AtomicBoolean(false);

    private static DatagramSocket udpSocket;
    private static ServerSocket tcpSocket;
    private static WifiManager.MulticastLock multicastLock;
    private static Context appContext;

    private LocalSyncServer() {}

    /**
     * Start the local synchronization server idempotently in the background.
     */
    public static synchronized void start(Context context) {
        if (context == null) return;
        appContext = context.getApplicationContext();
        if (RUNNING.compareAndSet(false, true)) {
            acquireMulticastLock(appContext);
            POOL.execute(LocalSyncServer::runUdpListener);
            POOL.execute(LocalSyncServer::runTcpListener);
            Log.i(TAG, "LocalSyncServer started on UDP/TCP port " + MOBILE_PORT);
        }
    }

    private static void acquireMulticastLock(Context context) {
        try {
            WifiManager wifi = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
            if (wifi != null) {
                multicastLock = wifi.createMulticastLock("DayRhythmMulticastLock");
                multicastLock.setReferenceCounted(true);
                multicastLock.acquire();
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not acquire multicast lock: " + e.getMessage());
        }
    }

    private static void runUdpListener() {
        try {
            udpSocket = new DatagramSocket(null);
            udpSocket.setReuseAddress(true);
            udpSocket.setBroadcast(true);
            udpSocket.bind(new InetSocketAddress(MOBILE_PORT));

            byte[] buffer = new byte[8192];
            while (RUNNING.get() && !udpSocket.isClosed()) {
                try {
                    DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                    udpSocket.receive(packet);

                    String remoteIp = packet.getAddress().getHostAddress();
                    if (remoteIp != null) {
                        KNOWN_PC_IPS.put(remoteIp, System.currentTimeMillis());
                    }

                    String json = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8);
                    processIncomingMessage(json, remoteIp);
                } catch (Exception ex) {
                    if (!RUNNING.get()) break;
                    Log.w(TAG, "UDP receive error: " + ex.getMessage());
                    try { Thread.sleep(300); } catch (InterruptedException ignored) {}
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to start UDP listener on port " + MOBILE_PORT, e);
        }
    }

    private static void runTcpListener() {
        try {
            tcpSocket = new ServerSocket();
            tcpSocket.setReuseAddress(true);
            tcpSocket.bind(new InetSocketAddress(MOBILE_PORT));

            while (RUNNING.get() && !tcpSocket.isClosed()) {
                try {
                    Socket client = tcpSocket.accept();
                    POOL.execute(() -> handleTcpClient(client));
                } catch (Exception ex) {
                    if (!RUNNING.get()) break;
                    Log.w(TAG, "TCP accept error: " + ex.getMessage());
                    try { Thread.sleep(300); } catch (InterruptedException ignored) {}
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to start TCP listener on port " + MOBILE_PORT, e);
        }
    }

    private static void handleTcpClient(Socket client) {
        try (client) {
            client.setSoTimeout(3000);
            String remoteIp = client.getInetAddress() != null ? client.getInetAddress().getHostAddress() : null;
            if (remoteIp != null) {
                KNOWN_PC_IPS.put(remoteIp, System.currentTimeMillis());
            }

            BufferedReader reader = new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8));
            PrintWriter writer = new PrintWriter(new OutputStreamWriter(client.getOutputStream(), StandardCharsets.UTF_8), true);

            String firstLine = reader.readLine();
            if (firstLine == null || firstLine.trim().isEmpty()) return;

            String body = "";
            if (firstLine.startsWith("POST ") || firstLine.startsWith("GET ")) {
                int contentLength = 0;
                String line;
                while ((line = reader.readLine()) != null && !line.isEmpty()) {
                    if (line.toLowerCase().startsWith("content-length:")) {
                        try {
                            contentLength = Integer.parseInt(line.substring(15).trim());
                        } catch (Exception ignored) {}
                    }
                }
                if (contentLength > 0) {
                    char[] cbuf = new char[contentLength];
                    int read = reader.read(cbuf, 0, contentLength);
                    if (read > 0) body = new String(cbuf, 0, read);
                }
                processIncomingMessage(body, remoteIp);
                writer.print("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"ok\":true,\"device\":\"mobile\"}");
                writer.flush();
            } else {
                body = firstLine;
                processIncomingMessage(body, remoteIp);
                writer.println("{\"ok\":true}");
            }
        } catch (Exception ex) {
            Log.w(TAG, "TCP client error: " + ex.getMessage());
        }
    }

    private static void processIncomingMessage(String json, String remoteIp) {
        if (json == null || json.trim().isEmpty()) return;
        try {
            JSONObject obj = new JSONObject(json);
            String source = obj.optString("source", obj.optString("clientId", ""));
            if ("device_mobile".equalsIgnoreCase(source)) {
                return; // Ignore echo
            }

            String action = obj.optString("action", "");
            String type = obj.optString("type", "");

            if ("dismiss".equalsIgnoreCase(action) ||
                "native_done".equalsIgnoreCase(action) ||
                "native_dismiss".equalsIgnoreCase(action) ||
                "water_confirmed".equalsIgnoreCase(action) ||
                "medication_confirmed".equalsIgnoreCase(action) ||
                "stop-alert".equalsIgnoreCase(type) ||
                "alarm_dismiss".equalsIgnoreCase(type)) {

                Log.i(TAG, "Instant dismissal received from PC (" + remoteIp + ")");
                MAIN.post(() -> {
                    try {
                        if (appContext != null) {
                            ReminderAlarmReceiver.cancelAllActiveAlarms(appContext);
                        }
                        if (MainActivity.activeInstance != null) {
                            MainActivity.activeInstance.evaluateJavascriptInWebView(
                                    "window.dispatchEvent(new CustomEvent('dayrhythm:alert-dismissed'));"
                            );
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Error handling remote dismiss: " + e.getMessage());
                    }
                });
            } else if ("trigger".equalsIgnoreCase(action) ||
                       "ring".equalsIgnoreCase(action) ||
                       "native-alert".equalsIgnoreCase(type) ||
                       "alarm_trigger".equalsIgnoreCase(type)) {

                String title = obj.optString("title", "تنبيه إيقاع اليوم");
                String body = obj.optString("body", "");
                String kind = obj.optString("category", obj.optString("kind", "general"));
                int snooze = obj.optInt("snoozeMinutes", 5);

                Log.i(TAG, "Instant trigger received from PC: " + title);
                MAIN.post(() -> {
                    try {
                        if (appContext != null) {
                            ReminderAlarmReceiver.triggerImmediateNativeAlarm(
                                    appContext, title, body, kind, true, snooze
                            );
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Error handling remote trigger: " + e.getMessage());
                    }
                });
            }
        } catch (Exception ex) {
            Log.w(TAG, "Failed to parse incoming sync message: " + ex.getMessage());
        }
    }

    /**
     * Broadcasts alert dismissal across the local network to PC (<5ms latency).
     */
    public static void broadcastDismiss(Context context, String action) {
        final Context ctx = context != null ? context.getApplicationContext() : appContext;
        if (ctx == null) return;
        start(ctx);

        POOL.execute(() -> {
            try {
                JSONObject packet = new JSONObject();
                packet.put("type", "dayrhythm_sync");
                packet.put("action", action != null && !action.isEmpty() ? action : "dismiss");
                packet.put("source", "device_mobile");
                packet.put("timestamp", System.currentTimeMillis());

                byte[] bytes = packet.toString().getBytes(StandardCharsets.UTF_8);

                // 1. Send UDP Broadcast to PC_PORT (48722) and MOBILE_PORT (48723)
                sendUdpBroadcast(bytes, PC_PORT);
                sendUdpBroadcast(bytes, MOBILE_PORT);

                // 2. Direct TCP unicast to all known PC IPs
                for (String ip : KNOWN_PC_IPS.keySet()) {
                    sendDirectTcp(ip, PC_PORT, packet.toString());
                }
                Log.d(TAG, "Broadcast alert dismiss sent: " + action);
            } catch (Exception e) {
                Log.w(TAG, "Error broadcasting dismiss: " + e.getMessage());
            }
        });
    }

    /**
     * Broadcasts alarm trigger across the local network to PC (<5ms latency).
     */
    public static void broadcastTrigger(Context context, String title, String body, String kind, int snoozeMinutes) {
        final Context ctx = context != null ? context.getApplicationContext() : appContext;
        if (ctx == null) return;
        start(ctx);

        POOL.execute(() -> {
            try {
                JSONObject packet = new JSONObject();
                packet.put("type", "dayrhythm_sync");
                packet.put("action", "trigger");
                packet.put("source", "device_mobile");
                packet.put("title", title != null ? title : "تنبيه إيقاع اليوم");
                packet.put("body", body != null ? body : "");
                packet.put("category", kind != null ? kind : "general");
                packet.put("snoozeMinutes", snoozeMinutes);
                packet.put("timestamp", System.currentTimeMillis());

                byte[] bytes = packet.toString().getBytes(StandardCharsets.UTF_8);

                sendUdpBroadcast(bytes, PC_PORT);
                for (String ip : KNOWN_PC_IPS.keySet()) {
                    sendDirectTcp(ip, PC_PORT, packet.toString());
                }
                Log.d(TAG, "Broadcast alert trigger sent: " + title);
            } catch (Exception e) {
                Log.w(TAG, "Error broadcasting trigger: " + e.getMessage());
            }
        });
    }

    private static void sendUdpBroadcast(byte[] bytes, int port) {
        try {
            DatagramSocket socket = new DatagramSocket();
            socket.setBroadcast(true);

            // Global LAN broadcast
            try {
                DatagramPacket packet = new DatagramPacket(bytes, bytes.length, InetAddress.getByName("255.255.255.255"), port);
                socket.send(packet);
            } catch (Exception ignored) {}

            // Directed subnet broadcasts for each active interface
            try {
                Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
                if (interfaces != null) {
                    for (NetworkInterface ni : Collections.list(interfaces)) {
                        if (ni.isLoopback() || !ni.isUp()) continue;
                        for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                            InetAddress bcast = ia.getBroadcast();
                            if (bcast != null) {
                                try {
                                    DatagramPacket packet = new DatagramPacket(bytes, bytes.length, bcast, port);
                                    socket.send(packet);
                                } catch (Exception ignored) {}
                            }
                        }
                    }
                }
            } catch (Exception ignored) {}

            socket.close();
        } catch (Exception e) {
            Log.w(TAG, "UDP broadcast error: " + e.getMessage());
        }
    }

    private static void sendDirectTcp(String ip, int port, String json) {
        try {
            Socket socket = new Socket();
            socket.connect(new InetSocketAddress(ip, port), 1200);
            try (PrintWriter writer = new PrintWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8), true)) {
                writer.println(json);
            }
            socket.close();
        } catch (Exception ignored) {
            // Unreachable or offline host
        }
    }
}
