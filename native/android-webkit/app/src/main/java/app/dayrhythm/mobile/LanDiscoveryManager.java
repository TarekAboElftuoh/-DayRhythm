package app.dayrhythm.mobile;

import android.content.Context;
import org.json.JSONObject;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.util.Enumeration;
import java.util.UUID;

/**
 * Protocol 3: UDP Broadcast (Zero-Config Discovery)
 * Port: 48722 UDP
 * Discovers PC IP address, WebSocket URL (ws://<IP>:48721/ws), and REST URL on the local Wi-Fi.
 */
public final class LanDiscoveryManager {
    public static final int UDP_DISCOVERY_PORT = 48722;

    public interface DiscoveryCallback {
        void onServerFound(String pcName, String wsUrl, String restUrl);
    }

    private LanDiscoveryManager() {}

    public static void discoverPcAsync(Context context, DiscoveryCallback callback) {
        new Thread(() -> {
            DatagramSocket socket = null;
            try {
                socket = new DatagramSocket();
                socket.setBroadcast(true);
                socket.setSoTimeout(1600);

                JSONObject req = new JSONObject();
                req.put("type", "dr_discover_request");
                req.put("client", "dayrhythm_android");
                req.put("deviceId", "OnePlus_12R");
                req.put("timestamp", System.currentTimeMillis());
                req.put("nonce", UUID.randomUUID().toString().replace("-", ""));

                byte[] data = req.toString().getBytes(StandardCharsets.UTF_8);

                // Send discovery probe (repeated twice with 100ms interval for lossy Wi-Fi)
                for (int probe = 0; probe < 2; probe++) {
                    if (probe > 0) {
                        try { Thread.sleep(100); } catch (InterruptedException ignored) {}
                    }
                    // 1. Broadcast to global LAN broadcast (255.255.255.255)
                    DatagramPacket globalPacket = new DatagramPacket(
                            data,
                            data.length,
                            InetAddress.getByName("255.255.255.255"),
                            UDP_DISCOVERY_PORT
                    );
                    socket.send(globalPacket);

                    // 2. Broadcast to each network interface's subnet broadcast (e.g. 192.168.1.255)
                    try {
                        Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
                        while (interfaces.hasMoreElements()) {
                            NetworkInterface ni = interfaces.nextElement();
                            if (ni.isLoopback() || !ni.isUp()) continue;
                            for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                                InetAddress bcast = ia.getBroadcast();
                                if (bcast != null) {
                                    socket.send(new DatagramPacket(data, data.length, bcast, UDP_DISCOVERY_PORT));
                                }
                            }
                        }
                    } catch (Exception ignored) {
                    }
                }

                // 3. Listen for PC responses
                byte[] recvBuf = new byte[2048];
                DatagramPacket resp = new DatagramPacket(recvBuf, recvBuf.length);
                socket.receive(resp);

                String respStr = new String(resp.getData(), 0, resp.getLength(), StandardCharsets.UTF_8);
                JSONObject respJson = new JSONObject(respStr);
                String type = respJson.optString("type", "");

                if ("dr_discover_response".equals(type) || "dayrhythm_discovery_ack".equals(type)) {
                    String pcName = respJson.optString("pcName", "PC");
                    String wsUrl = respJson.optString("wsUrl", "");
                    String restUrl = respJson.optString("restUrl", "");

                    if (wsUrl.isEmpty()) {
                        String senderIp = resp.getAddress().getHostAddress();
                        wsUrl = "ws://" + senderIp + ":48721/ws";
                        restUrl = "http://" + senderIp + ":48721/api/v1";
                    }

                    if (callback != null && !wsUrl.isEmpty()) {
                        callback.onServerFound(pcName, wsUrl, restUrl);
                    }
                }
            } catch (Exception ignored) {
            } finally {
                if (socket != null) {
                    try { socket.close(); } catch (Exception ignored) {}
                }
            }
        }, "DayRhythm-LanDiscovery").start();
    }
}
