using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace DayRhythm
{
    /// <summary>
    /// Floating desktop capsule. Its content is the app's own capsule page (capsule.html) rendered by
    /// WebView2 with the same Tailwind theme, fonts and colours as DayRhythm — replacing the old
    /// hand-drawn GDI+ pill that never matched the app. The form keeps the native parts: right-click
    /// menu, drag, saved position, monitor snapping. The page reports its exact size and corner radius.
    /// </summary>
    internal sealed class DesktopCapsuleForm : Form
    {
        private const string CapsuleHost = "gen-lang-client-0625331922.web.app";
        private const string CapsuleUrl = "https://gen-lang-client-0625331922.web.app/capsule.html";
        private const int WM_NCLBUTTONDOWN = 0xA1;
        private const int HTCAPTION = 0x2;

        [DllImport("user32.dll")]
        private static extern bool ReleaseCapture();

        [DllImport("user32.dll")]
        private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

        private readonly UserSettings _settings;
        private readonly Action _onOpenMainWindow;
        private readonly Action<bool> _onVisibilityChanged;
        private readonly Action _onQuickWater;
        private readonly Action _onQuickMedication;
        private readonly Action<string, string> _onPrefsChangedByUser;

        private readonly ContextMenuStrip _contextMenu;
        private readonly ToolStripMenuItem _orientHorizItem;
        private readonly ToolStripMenuItem _orientVertItem;
        private readonly ToolStripMenuItem _sizeSmItem;
        private readonly ToolStripMenuItem _sizeMdItem;
        private readonly ToolStripMenuItem _sizeLgItem;
        private readonly Timer _savePositionTimer;

        private WebView2 _web;
        private bool _webReady;
        private CapsuleStatePayload _lastPayload = new CapsuleStatePayload();
        private bool _isVertical;
        private string _sizeMode = "md";

        public DesktopCapsuleForm(
            UserSettings settings,
            Action onOpenMainWindow,
            Action<bool> onVisibilityChanged,
            Action onQuickWater = null,
            Action onQuickMedication = null,
            Action<string, string> onPrefsChangedByUser = null)
        {
            _settings = settings;
            _onOpenMainWindow = onOpenMainWindow;
            _onVisibilityChanged = onVisibilityChanged;
            _onQuickWater = onQuickWater;
            _onQuickMedication = onQuickMedication;
            _onPrefsChangedByUser = onPrefsChangedByUser;

            _isVertical = string.Equals(_settings.CapsuleOrientation, "vertical", StringComparison.OrdinalIgnoreCase);
            _sizeMode = NormalizeSize(_settings.CapsuleSize);

            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            TopMost = true;
            ShowInTaskbar = false;
            // Same surface colour as the app's cards, so nothing flashes while the page loads.
            BackColor = Color.FromArgb(11, 14, 20);
            Size = new Size(150, 44);

            Font menuFont = new Font("Segoe UI", 9.2f, FontStyle.Regular, GraphicsUnit.Point);
            _contextMenu = new ContextMenuStrip
            {
                RightToLeft = RightToLeft.Yes,
                Renderer = new DayRhythmMenuRenderer(),
                BackColor = Color.FromArgb(10, 14, 21),
                ForeColor = Color.FromArgb(228, 228, 231),
                Font = menuFont,
                ShowImageMargin = true,
                Padding = new Padding(2, 4, 2, 4),
            };

            ToolStripMenuItem quickWaterItem = CreateMenuItem("💧  تسجيل كوب ماء (+1)", (_, __) => _onQuickWater?.Invoke());
            ToolStripMenuItem quickMedItem = CreateMenuItem("💊  تسجيل الجرعة القادمة", (_, __) => _onQuickMedication?.Invoke());
            ToolStripMenuItem openMainItem = CreateMenuItem("فتح لوحة إيقاع اليوم", (_, __) => _onOpenMainWindow?.Invoke());
            _orientHorizItem = CreateMenuItem("عرضي (أفقي)", (_, __) => SetOrientation(vertical: false));
            _orientVertItem = CreateMenuItem("طولي (رأسي)", (_, __) => SetOrientation(vertical: true));
            _sizeSmItem = CreateMenuItem("حجم صغير", (_, __) => SetSizeMode("sm"));
            _sizeMdItem = CreateMenuItem("حجم متوسط", (_, __) => SetSizeMode("md"));
            _sizeLgItem = CreateMenuItem("حجم كبير", (_, __) => SetSizeMode("lg"));
            ToolStripMenuItem moveSecondaryItem = CreateMenuItem("نقل للشاشة الثانية", (_, __) => SnapToMonitor(preferSecondary: true));
            ToolStripMenuItem movePrimaryItem = CreateMenuItem("نقل للشاشة الرئيسية", (_, __) => SnapToMonitor(preferSecondary: false));
            ToolStripMenuItem hideItem = CreateMenuItem("إخفاء الكبسولة", (_, __) => HideCapsuleByUser());

            _contextMenu.Items.Add(quickWaterItem);
            _contextMenu.Items.Add(quickMedItem);
            _contextMenu.Items.Add(new ToolStripSeparator());
            _contextMenu.Items.Add(openMainItem);
            _contextMenu.Items.Add(new ToolStripSeparator());
            _contextMenu.Items.Add(_orientHorizItem);
            _contextMenu.Items.Add(_orientVertItem);
            _contextMenu.Items.Add(new ToolStripSeparator());
            _contextMenu.Items.Add(_sizeSmItem);
            _contextMenu.Items.Add(_sizeMdItem);
            _contextMenu.Items.Add(_sizeLgItem);
            _contextMenu.Items.Add(new ToolStripSeparator());
            if (Screen.AllScreens.Length > 1)
            {
                _contextMenu.Items.Add(moveSecondaryItem);
                _contextMenu.Items.Add(movePrimaryItem);
                _contextMenu.Items.Add(new ToolStripSeparator());
            }
            _contextMenu.Items.Add(hideItem);
            SyncMenuCheckmarks();

            // Persist the position shortly after a drag ends (a native caption drag sends no MouseUp).
            _savePositionTimer = new Timer { Interval = 400 };
            _savePositionTimer.Tick += (_, __) =>
            {
                _savePositionTimer.Stop();
                _settings.CapsuleX = Location.X;
                _settings.CapsuleY = Location.Y;
                AppConfig.SaveSettings(_settings);
            };
            LocationChanged += (_, __) =>
            {
                if (!Visible) return;
                _savePositionTimer.Stop();
                _savePositionTimer.Start();
            };

            RestoreSavedPosition();
        }

        protected override bool ShowWithoutActivation => true;

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= LayeredWindowHelper.WS_EX_TOOLWINDOW
                            | LayeredWindowHelper.WS_EX_TOPMOST
                            | LayeredWindowHelper.WS_EX_NOACTIVATE;
                return cp;
            }
        }

        /// <summary>
        /// Loads capsule.html from the same web bundle (and WebView2 profile) as the main window.
        /// Called by MainForm once its WebView2 environment exists, and again after an OTA update.
        /// </summary>
        public async Task AttachWebContentAsync(CoreWebView2Environment env, string wwwDir)
        {
            if (IsDisposed) return;
            if (_web == null)
            {
                _web = new WebView2
                {
                    Dock = DockStyle.Fill,
                    DefaultBackgroundColor = BackColor,
                };
                Controls.Add(_web);
                await _web.EnsureCoreWebView2Async(env);
                CoreWebView2Settings s = _web.CoreWebView2.Settings;
                s.AreDefaultContextMenusEnabled = false;
                s.AreDevToolsEnabled = false;
                s.IsStatusBarEnabled = false;
                s.IsZoomControlEnabled = false;
                s.AreBrowserAcceleratorKeysEnabled = false;
                _web.CoreWebView2.WebMessageReceived += OnWebMessage;
                _web.CoreWebView2.NavigationCompleted += (_, __) =>
                {
                    _webReady = true;
                    PushStateToWeb();
                };
            }
            _webReady = false;
            _web.CoreWebView2.SetVirtualHostNameToFolderMapping(
                CapsuleHost,
                wwwDir,
                CoreWebView2HostResourceAccessKind.Allow
            );
            _web.CoreWebView2.Navigate(CapsuleUrl + "?v=" + DateTime.UtcNow.Ticks);
        }

        private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            try
            {
                string raw = args.TryGetWebMessageAsString();
                if (string.IsNullOrWhiteSpace(raw)) return;
                using JsonDocument doc = JsonDocument.Parse(raw);
                HandleWebMessage(doc.RootElement);
            }
            catch
            {
                // ignore malformed messages
            }
        }

        private void HandleWebMessage(JsonElement msg)
        {
            string type = msg.TryGetProperty("type", out JsonElement t) ? t.GetString() : "";
            switch (type)
            {
                case "capsule-size":
                {
                    double w = msg.GetProperty("w").GetDouble();
                    double h = msg.GetProperty("h").GetDouble();
                    double r = msg.TryGetProperty("radius", out JsonElement rr) ? rr.GetDouble() : h / 2;
                    ApplyContentSize(w, h, r);
                    break;
                }
                case "capsule-drag":
                    ReleaseCapture();
                    SendMessage(Handle, WM_NCLBUTTONDOWN, (IntPtr)HTCAPTION, IntPtr.Zero);
                    break;
                case "capsule-menu":
                    SyncMenuCheckmarks();
                    _contextMenu.Show(Cursor.Position);
                    break;
                case "capsule-open":
                    _onOpenMainWindow?.Invoke();
                    break;
            }
        }

        /// <summary>Fits the window to the page's content (CSS px → device px) and rounds the corners.</summary>
        private void ApplyContentSize(double cssW, double cssH, double cssRadius)
        {
            float dpi = DeviceDpi / 96f;
            int w = Math.Max(40, (int)Math.Ceiling(cssW * dpi));
            int h = Math.Max(24, (int)Math.Ceiling(cssH * dpi));
            Rectangle wa = Screen.FromPoint(Location).WorkingArea;
            // Keep the bottom-left corner in place when the capsule grows or shrinks.
            int newX = Location.X;
            int newY = Math.Max(wa.Top, Location.Y + Height - h);
            Bounds = new Rectangle(newX, newY, w, h);
            float radius = (float)Math.Min(cssRadius * dpi, Math.Min(w, h) / 2.0);
            using (GraphicsPath path = LayeredWindowHelper.CreateRoundedPath(new RectangleF(0, 0, w, h), radius))
            {
                Region = new Region(path);
            }
        }

        private void PushStateToWeb()
        {
            if (!_webReady || _web?.CoreWebView2 == null) return;
            _lastPayload.orientation = _isVertical ? "vertical" : "horizontal";
            _lastPayload.size = _sizeMode;
            try
            {
                string json = JsonSerializer.Serialize(new { type = "capsule-state", state = _lastPayload });
                _web.CoreWebView2.PostWebMessageAsJson(json);
            }
            catch
            {
                // WebView2 not ready yet
            }
        }

        private static ToolStripMenuItem CreateMenuItem(string text, EventHandler onClick)
        {
            return new ToolStripMenuItem(text, null, onClick)
            {
                Padding = new Padding(4, 4, 4, 4),
            };
        }

        private void SyncMenuCheckmarks()
        {
            _orientHorizItem.Checked = !_isVertical;
            _orientVertItem.Checked = _isVertical;
            _sizeSmItem.Checked = _sizeMode == "sm";
            _sizeMdItem.Checked = _sizeMode == "md";
            _sizeLgItem.Checked = _sizeMode == "lg";
        }

        private static string NormalizeSize(string s)
        {
            if (string.Equals(s, "sm", StringComparison.OrdinalIgnoreCase)) return "sm";
            if (string.Equals(s, "lg", StringComparison.OrdinalIgnoreCase)) return "lg";
            return "md";
        }

        // A right-click change used to stay inside this window only: the main app kept pushing its
        // own (old) orientation/size back a few seconds later, so the change never "took". The app
        // is now told, so it adopts the choice and syncs it to the phone as well.
        private void SetOrientation(bool vertical)
        {
            _isVertical = vertical;
            _settings.CapsuleOrientation = vertical ? "vertical" : "horizontal";
            AppConfig.SaveSettings(_settings);
            SyncMenuCheckmarks();
            PushStateToWeb();
            _onPrefsChangedByUser?.Invoke(_settings.CapsuleOrientation, _sizeMode);
        }

        private void SetSizeMode(string mode)
        {
            _sizeMode = NormalizeSize(mode);
            _settings.CapsuleSize = _sizeMode;
            AppConfig.SaveSettings(_settings);
            SyncMenuCheckmarks();
            PushStateToWeb();
            _onPrefsChangedByUser?.Invoke(_isVertical ? "vertical" : "horizontal", _sizeMode);
        }

        public CapsuleStatePayload GetLastPayload() => _lastPayload;

        public void UpdateState(CapsuleStatePayload payload)
        {
            if (payload == null) return;
            _lastPayload = payload;
            if (!string.IsNullOrWhiteSpace(payload.orientation))
            {
                bool nextVert = string.Equals(payload.orientation, "vertical", StringComparison.OrdinalIgnoreCase);
                if (nextVert != _isVertical)
                {
                    _isVertical = nextVert;
                    _settings.CapsuleOrientation = nextVert ? "vertical" : "horizontal";
                    AppConfig.SaveSettings(_settings);
                }
            }
            if (!string.IsNullOrWhiteSpace(payload.size))
            {
                string nextSize = NormalizeSize(payload.size);
                if (nextSize != _sizeMode)
                {
                    _sizeMode = nextSize;
                    _settings.CapsuleSize = nextSize;
                    AppConfig.SaveSettings(_settings);
                }
            }
            SyncMenuCheckmarks();
            PushStateToWeb();
        }

        public void ShowFloating()
        {
            if (!Visible) Show();
            TopMost = true;
        }

        private void HideCapsuleByUser()
        {
            Hide();
            _settings.ShowDesktopCapsule = false;
            AppConfig.SaveSettings(_settings);
            _onVisibilityChanged?.Invoke(false);
        }

        private Screen ResolveTargetScreen(bool preferSecondary)
        {
            if (preferSecondary)
            {
                Screen secondary = Screen.AllScreens.FirstOrDefault(s => !s.Primary);
                if (secondary != null) return secondary;
            }
            return Screen.PrimaryScreen ?? Screen.AllScreens.First();
        }

        private void RestoreSavedPosition()
        {
            if (_settings.CapsuleX.HasValue && _settings.CapsuleY.HasValue)
            {
                Point saved = new Point(_settings.CapsuleX.Value, _settings.CapsuleY.Value);
                foreach (Screen scr in Screen.AllScreens)
                {
                    if (scr.WorkingArea.IntersectsWith(new Rectangle(saved, Size)))
                    {
                        Location = saved;
                        return;
                    }
                }
            }
            SnapToMonitor(_settings.AlertsOnSecondaryScreen);
        }

        public void SnapToMonitor(bool preferSecondary)
        {
            Rectangle wa = ResolveTargetScreen(preferSecondary).WorkingArea;
            Location = new Point(wa.Left + 16, wa.Bottom - Height - 12);
            _settings.CapsuleX = Location.X;
            _settings.CapsuleY = Location.Y;
            AppConfig.SaveSettings(_settings);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _savePositionTimer?.Stop();
                _savePositionTimer?.Dispose();
                _contextMenu?.Dispose();
                _web?.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
