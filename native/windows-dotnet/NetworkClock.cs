using System;
using System.Net;
using System.Net.Sockets;

namespace DayRhythm
{
    /// <summary>
    /// Minimal SNTP client: how far this PC's clock is from network time (true − local, in ms).
    /// The phone keeps network time on its own; the PC doesn't, so reminders use this correction.
    /// </summary>
    internal static class NetworkClock
    {
        private static readonly string[] Servers = { "time.google.com", "time.windows.com", "pool.ntp.org" };

        public static long? TryGetOffsetMs()
        {
            foreach (string host in Servers)
            {
                try
                {
                    long? off = Query(host);
                    if (off.HasValue) return off;
                }
                catch
                {
                    // try the next server
                }
            }
            return null;
        }

        private static long? Query(string host)
        {
            byte[] req = new byte[48];
            req[0] = 0x1B; // LI=0, VN=3, Mode=3 (client)
            IPAddress[] addrs = Dns.GetHostAddresses(host);
            if (addrs.Length == 0) return null;

            using var sock = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
            sock.ReceiveTimeout = 3000;
            sock.SendTimeout = 3000;
            IPAddress v4 = Array.Find(addrs, a => a.AddressFamily == AddressFamily.InterNetwork);
            if (v4 == null) return null;
            sock.Connect(new IPEndPoint(v4, 123));

            DateTime t1 = DateTime.UtcNow;
            sock.Send(req);
            byte[] resp = new byte[48];
            int n = sock.Receive(resp);
            DateTime t4 = DateTime.UtcNow;
            if (n < 48) return null;

            DateTime t2 = ReadTimestamp(resp, 32); // server receive
            DateTime t3 = ReadTimestamp(resp, 40); // server transmit
            // Standard NTP offset: ((t2 - t1) + (t3 - t4)) / 2
            double offset = ((t2 - t1).TotalMilliseconds + (t3 - t4).TotalMilliseconds) / 2.0;
            return (long)Math.Round(offset);
        }

        private static DateTime ReadTimestamp(byte[] b, int i)
        {
            ulong secs = ((ulong)b[i] << 24) | ((ulong)b[i + 1] << 16) | ((ulong)b[i + 2] << 8) | b[i + 3];
            ulong frac = ((ulong)b[i + 4] << 24) | ((ulong)b[i + 5] << 16) | ((ulong)b[i + 6] << 8) | b[i + 7];
            double ms = secs * 1000.0 + frac * 1000.0 / 0x100000000L;
            return new DateTime(1900, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddMilliseconds(ms);
        }
    }
}
