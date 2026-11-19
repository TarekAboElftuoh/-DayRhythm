using System;
using System.Linq;
using System.Threading;
using System.Windows.Forms;

namespace DayRhythm
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            using (Mutex singleInstance = new Mutex(true, @"Global\DayRhythm_Windows_SingleInstance", out bool createdNew))
            {
                if (!createdNew)
                {
                    return;
                }

                Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                bool startHidden = args != null && args.Any(a => string.Equals(a, "--background", StringComparison.OrdinalIgnoreCase));
                Application.Run(new MainForm(startHidden));
            }
        }
    }
}
