using System;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace DayRhythm
{
    internal static class Program
    {
        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        internal static extern int RegisterWindowMessage(string lpString);

        [DllImport("user32.dll")]
        internal static extern bool PostMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);

        internal const string ShowWindowMessageName = "DayRhythm_ActivateMainWindow";
        private static readonly IntPtr HWND_BROADCAST = new IntPtr(0xffff);

        [STAThread]
        private static void Main(string[] args)
        {
            AppDomain.CurrentDomain.UnhandledException += (s, e) =>
            {
                try
                {
                    string logPath = Path.Combine(AppConfig.GetDataDir(), "crash.log");
                    File.AppendAllText(logPath, $"[{DateTime.UtcNow:O}] UnhandledException: {e.ExceptionObject}\n");
                }
                catch { }
            };
            Application.ThreadException += (s, e) =>
            {
                try
                {
                    string logPath = Path.Combine(AppConfig.GetDataDir(), "crash.log");
                    File.AppendAllText(logPath, $"[{DateTime.UtcNow:O}] ThreadException: {e.Exception}\n");
                }
                catch { }
            };
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);

            using (Mutex singleInstance = new Mutex(true, @"Global\DayRhythm_Windows_SingleInstance", out bool createdNew))
            {
                if (!createdNew)
                {
                    try
                    {
                        File.AppendAllText(Path.Combine(AppConfig.GetDataDir(), "main_entry.log"), $"[{DateTime.UtcNow:O}] Mutex already exists, broadcasting activate message and exiting.\n");
                        int msg = RegisterWindowMessage(ShowWindowMessageName);
                        if (msg != 0)
                        {
                            PostMessage(HWND_BROADCAST, msg, IntPtr.Zero, IntPtr.Zero);
                        }
                    }
                    catch { }
                    return;
                }
                try { File.AppendAllText(Path.Combine(AppConfig.GetDataDir(), "main_entry.log"), $"[{DateTime.UtcNow:O}] Starting application...\n"); } catch {}

                Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                bool startHidden = args != null && args.Any(a => string.Equals(a, "--background", StringComparison.OrdinalIgnoreCase));
                Application.Run(new MainForm(startHidden));
                try { File.AppendAllText(Path.Combine(AppConfig.GetDataDir(), "main_entry.log"), $"[{DateTime.UtcNow:O}] Application.Run exited!\n"); } catch {}
            }
        }
    }
}
