using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace DayRhythm
{
    internal sealed class CapsuleStatePayload
    {
        public string emoji { get; set; } = "📅";
        public string title { get; set; } = "إيقاع اليوم";
        public string statusLabel { get; set; } = "المهمة القادمة";
        public string sourceKind { get; set; } = "calendar";
        public string countdownText { get; set; } = "--:--";
        public bool isNow { get; set; }
        public bool isUrgent { get; set; }
        public long targetEpochMs { get; set; }
        public int durationSeconds { get; set; }
        public bool hasSecondaryTimer { get; set; }
        public string secondaryEmoji { get; set; } = "💧";
        public string secondaryTitle { get; set; } = "";
        public string secondaryCountdownText { get; set; } = "";
        public long secondaryTargetEpochMs { get; set; }
        public bool secondaryIsNow { get; set; }
        public bool secondaryIsUrgent { get; set; }
        public int phoneBatteryPct { get; set; } = -1;
        public bool phoneCharging { get; set; }
        public int phoneChargeLimitPct { get; set; } = 90;
        public int phoneChargeEtaMin { get; set; } = -1;
        public string orientation { get; set; } = "";
        public string size { get; set; } = "";
    }

    internal static class LayeredWindowHelper
    {
        public const int WS_EX_LAYERED = 0x00080000;
        public const int WS_EX_TOOLWINDOW = 0x00000080;
        public const int WS_EX_TOPMOST = 0x00000008;
        public const int WS_EX_NOACTIVATE = 0x08000000;
        private const byte AC_SRC_OVER = 0x00;
        private const byte AC_SRC_ALPHA = 0x01;
        private const int ULW_ALPHA = 0x00000002;

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT { public int x; public int y; }

        [StructLayout(LayoutKind.Sequential)]
        private struct SIZE { public int cx; public int cy; }

        [StructLayout(LayoutKind.Sequential, Pack = 1)]
        private struct BLENDFUNCTION
        {
            public byte BlendOp;
            public byte BlendFlags;
            public byte SourceConstantAlpha;
            public byte AlphaFormat;
        }

        [DllImport("user32.dll", ExactSpelling = true, SetLastError = true)]
        private static extern bool UpdateLayeredWindow(
            IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize,
            IntPtr hdcSrc, ref POINT pprSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);

        [DllImport("user32.dll", ExactSpelling = true, SetLastError = true)]
        private static extern IntPtr GetDC(IntPtr hWnd);

        [DllImport("user32.dll", ExactSpelling = true)]
        private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

        [DllImport("gdi32.dll", ExactSpelling = true, SetLastError = true)]
        private static extern IntPtr CreateCompatibleDC(IntPtr hDC);

        [DllImport("gdi32.dll", ExactSpelling = true, SetLastError = true)]
        private static extern bool DeleteDC(IntPtr hdc);

        [DllImport("gdi32.dll", ExactSpelling = true)]
        private static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);

        [DllImport("gdi32.dll", ExactSpelling = true, SetLastError = true)]
        private static extern bool DeleteObject(IntPtr hObject);

        public static void ApplyPremultipliedBitmap(Form form, Bitmap bmp, byte opacity = 255)
        {
            if (form == null || form.IsDisposed || !form.IsHandleCreated || bmp == null) return;
            IntPtr screenDc = GetDC(IntPtr.Zero);
            IntPtr memDc = CreateCompatibleDC(screenDc);
            IntPtr hBitmap = IntPtr.Zero;
            IntPtr oldBitmap = IntPtr.Zero;

            try
            {
                hBitmap = bmp.GetHbitmap(Color.FromArgb(0));
                oldBitmap = SelectObject(memDc, hBitmap);

                SIZE size = new SIZE { cx = bmp.Width, cy = bmp.Height };
                POINT pointSource = new POINT { x = 0, y = 0 };
                POINT topPos = new POINT { x = form.Left, y = form.Top };
                BLENDFUNCTION blend = new BLENDFUNCTION
                {
                    BlendOp = AC_SRC_OVER,
                    BlendFlags = 0,
                    SourceConstantAlpha = opacity,
                    AlphaFormat = AC_SRC_ALPHA,
                };

                UpdateLayeredWindow(form.Handle, screenDc, ref topPos, ref size, memDc, ref pointSource, 0, ref blend, ULW_ALPHA);
            }
            finally
            {
                if (hBitmap != IntPtr.Zero)
                {
                    SelectObject(memDc, oldBitmap);
                    DeleteObject(hBitmap);
                }
                DeleteDC(memDc);
                ReleaseDC(IntPtr.Zero, screenDc);
            }
        }

        public static GraphicsPath CreateRoundedPath(RectangleF bounds, float radius)
        {
            float r = Math.Min(radius, Math.Min(bounds.Width, bounds.Height) / 2f);
            float d = Math.Max(1f, r * 2f);
            GraphicsPath path = new GraphicsPath();
            path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
            path.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
            path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
            path.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }
    }

    internal sealed class DayRhythmMenuColorTable : ProfessionalColorTable
    {
        private static readonly Color BgSurface = Color.FromArgb(10, 14, 21);
        private static readonly Color BorderHairline = Color.FromArgb(36, 44, 56);
        private static readonly Color HoverSurface = Color.FromArgb(20, 32, 42);
        private static readonly Color AccentMint = Color.FromArgb(127, 255, 212);

        public override Color MenuBorder => BorderHairline;
        public override Color ToolStripDropDownBackground => BgSurface;
        public override Color ImageMarginGradientBegin => BgSurface;
        public override Color ImageMarginGradientMiddle => BgSurface;
        public override Color ImageMarginGradientEnd => BgSurface;
        public override Color MenuItemBorder => Color.FromArgb(75, 127, 255, 212);
        public override Color MenuItemSelected => HoverSurface;
        public override Color MenuItemSelectedGradientBegin => HoverSurface;
        public override Color MenuItemSelectedGradientEnd => HoverSurface;
        public override Color SeparatorDark => BorderHairline;
        public override Color SeparatorLight => Color.Transparent;
        public override Color CheckBackground => Color.FromArgb(26, 127, 255, 212);
        public override Color CheckSelectedBackground => Color.FromArgb(46, 127, 255, 212);
        public override Color CheckPressedBackground => AccentMint;
    }

    internal sealed class DayRhythmMenuRenderer : ToolStripProfessionalRenderer
    {
        public DayRhythmMenuRenderer() : base(new DayRhythmMenuColorTable())
        {
            RoundedEdges = true;
        }

        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            Rectangle rect = new Rectangle(0, 0, e.AffectedBounds.Width - 1, e.AffectedBounds.Height - 1);
            using (Pen pen = new Pen(Color.FromArgb(46, 56, 70), 1f))
            {
                g.DrawRectangle(pen, rect);
            }
        }

        protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            RectangleF rc = new RectangleF(4, 1, e.Item.Width - 8, e.Item.Height - 2);
            if (e.Item.Selected && e.Item.Enabled)
            {
                using (GraphicsPath p = LayeredWindowHelper.CreateRoundedPath(rc, 7f))
                using (SolidBrush fill = new SolidBrush(Color.FromArgb(20, 34, 44)))
                using (Pen border = new Pen(Color.FromArgb(80, 127, 255, 212), 1f))
                {
                    g.FillPath(fill, p);
                    g.DrawPath(border, p);
                }
            }
        }

        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
        {
            if (!e.Item.Enabled) e.TextColor = Color.FromArgb(113, 113, 122);
            else if (e.Item is ToolStripMenuItem mi && mi.Checked) e.TextColor = Color.FromArgb(127, 255, 212);
            else if (e.Item.Selected) e.TextColor = Color.White;
            else e.TextColor = Color.FromArgb(228, 228, 231);
            base.OnRenderItemText(e);
        }

        protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
        {
            int y = e.Item.Height / 2;
            using (Pen pen = new Pen(Color.FromArgb(30, 255, 255, 255), 1f))
            {
                e.Graphics.DrawLine(pen, 10, y, e.Item.Width - 10, y);
            }
        }

        protected override void OnRenderItemCheck(ToolStripItemImageRenderEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            Rectangle r = e.ImageRectangle;
            using (SolidBrush dotBrush = new SolidBrush(Color.FromArgb(127, 255, 212)))
            {
                int size = 6;
                g.FillEllipse(dotBrush, r.X + (r.Width - size) / 2, r.Y + (r.Height - size) / 2, size, size);
            }
        }
    }

    /// <summary>
    /// True Per-Pixel Alpha Obsidian-Glass Desktop Capsule matching DayRhythm web UI 1-to-1.
    /// Zero jagged WinForms region clipping; soft ambient drop shadow + smooth antialiased pill border.
    /// </summary>
    internal sealed class DesktopCapsuleForm : Form
    {
        private const int ShadowPad = 10;

        private readonly UserSettings _settings;
        private readonly Action _onOpenMainWindow;
        private readonly Action<bool> _onVisibilityChanged;
        private readonly Action _onQuickWater;
        private readonly Action _onQuickMedication;

        private readonly Timer _tickTimer;
        private readonly ContextMenuStrip _contextMenu;
        private readonly ToolTip _tooltip;

        private readonly ToolStripMenuItem _orientHorizItem;
        private readonly ToolStripMenuItem _orientVertItem;
        private readonly ToolStripMenuItem _sizeSmItem;
        private readonly ToolStripMenuItem _sizeMdItem;
        private readonly ToolStripMenuItem _sizeLgItem;

        private string _emoji = "📅";
        private string _title = "";
        private string _fallbackCountdown = "--:--";
        private bool _isNow;
        private bool _isUrgent;
        private long _targetEpochMs;

        private bool _hasSecondaryTimer;
        private string _secondaryEmoji = "💧";
        private string _secondaryTitle = "";
        private string _secondaryFallbackCountdown = "";
        private long _secondaryTargetEpochMs;
        private bool _secondaryIsNow;
        private bool _secondaryIsUrgent;

        private int _phoneBatteryPct = -1;
        private bool _phoneCharging;
        private int _phoneChargeLimitPct = 90;
        private int _phoneChargeEtaMin = -1;

        private bool _isVertical;
        private string _sizeMode = "md";

        private bool _isDragging;
        private Point _dragStartCursor;
        private Point _dragStartForm;
        private bool _isHovered;

        public DesktopCapsuleForm(
            UserSettings settings,
            Action onOpenMainWindow,
            Action<bool> onVisibilityChanged,
            Action onQuickWater = null,
            Action onQuickMedication = null)
        {
            _settings = settings;
            _onOpenMainWindow = onOpenMainWindow;
            _onVisibilityChanged = onVisibilityChanged;
            _onQuickWater = onQuickWater;
            _onQuickMedication = onQuickMedication;

            _isVertical = string.Equals(_settings.CapsuleOrientation, "vertical", StringComparison.OrdinalIgnoreCase);
            _sizeMode = NormalizeSize(_settings.CapsuleSize);

            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            TopMost = true;
            ShowInTaskbar = false;
            Cursor = Cursors.SizeAll;

            _tooltip = new ToolTip
            {
                AutoPopDelay = 6000,
                InitialDelay = 450,
                ReshowDelay = 200,
                ShowAlways = true,
            };

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

            RecalculateBounds();
            RestoreSavedPosition();

            MouseDown += OnCapsuleMouseDown;
            MouseMove += OnCapsuleMouseMove;
            MouseUp += OnCapsuleMouseUp;
            MouseDoubleClick += (_, e) =>
            {
                if (e.Button == MouseButtons.Left) _onOpenMainWindow?.Invoke();
            };
            MouseEnter += (_, __) => { _isHovered = true; RenderLayeredFrame(); };
            MouseLeave += (_, __) => { _isHovered = false; RenderLayeredFrame(); };
            HandleCreated += (_, __) => RenderLayeredFrame();
            Shown += (_, __) => RenderLayeredFrame();

            _tickTimer = new Timer { Interval = 1000 };
            _tickTimer.Tick += (_, __) =>
            {
                if (Visible) RenderLayeredFrame();
            };
            _tickTimer.Start();
        }

        protected override bool ShowWithoutActivation => true;

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= LayeredWindowHelper.WS_EX_LAYERED
                            | LayeredWindowHelper.WS_EX_TOOLWINDOW
                            | LayeredWindowHelper.WS_EX_TOPMOST
                            | LayeredWindowHelper.WS_EX_NOACTIVATE;
                return cp;
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

        private void SetOrientation(bool vertical)
        {
            _isVertical = vertical;
            _settings.CapsuleOrientation = vertical ? "vertical" : "horizontal";
            AppConfig.SaveSettings(_settings);
            SyncMenuCheckmarks();
            RecalculateBounds();
            RenderLayeredFrame();
        }

        private void SetSizeMode(string mode)
        {
            _sizeMode = NormalizeSize(mode);
            _settings.CapsuleSize = _sizeMode;
            AppConfig.SaveSettings(_settings);
            SyncMenuCheckmarks();
            RecalculateBounds();
            RenderLayeredFrame();
        }

        private string FormatBatteryChipText()
        {
            if (!_phoneCharging || _phoneBatteryPct < 0) return "";
            return _phoneChargeEtaMin > 0
                ? $"⚡{_phoneBatteryPct}% · {_phoneChargeEtaMin}د"
                : $"⚡{_phoneBatteryPct}%";
        }

        private void RefreshTooltip()
        {
            string line1 = string.IsNullOrWhiteSpace(_title) ? $"{_emoji} إيقاع اليوم" : $"{_emoji} {_title}";
            string line2 = _hasSecondaryTimer && !string.IsNullOrWhiteSpace(_secondaryTitle)
                ? $"\n{_secondaryEmoji} {_secondaryTitle}"
                : "";
            string line3 = _phoneCharging && _phoneBatteryPct >= 0
                ? (_phoneChargeEtaMin > 0
                    ? $"\n⚡ بطارية الهاتف: {_phoneBatteryPct}% (متبقي ~{_phoneChargeEtaMin} د)"
                    : $"\n⚡ بطارية الهاتف: {_phoneBatteryPct}% (قيد الشحن)")
                : "";
            _tooltip.SetToolTip(this, line1 + line2 + line3);
        }

        private void RecalculateBounds()
        {
            float scale = _sizeMode == "lg" ? 1.18f : _sizeMode == "sm" ? 0.86f : 1.0f;
            bool showBatt = _phoneCharging && _phoneBatteryPct >= 0;
            bool hasEta = showBatt && _phoneChargeEtaMin > 0;

            int pillW;
            int pillH;
            if (_isVertical)
            {
                pillW = (int)Math.Round((hasEta ? 136 : 122) * scale);
                int rows = 1 + (_hasSecondaryTimer ? 1 : 0) + (showBatt ? 1 : 0);
                int rowH = (int)Math.Round(34 * scale);
                pillH = rows * rowH + (int)Math.Round(12 * scale);
            }
            else
            {
                int battExtra = showBatt ? (hasEta ? 98 : 66) : 0;
                int baseW = (_hasSecondaryTimer ? 236 : 124) + battExtra;
                pillW = (int)Math.Round(baseW * scale);
                pillH = (int)Math.Round(42 * scale);
            }

            int totalW = pillW + ShadowPad * 2;
            int totalH = pillH + ShadowPad * 2;
            if (Width != totalW || Height != totalH)
            {
                Size = new Size(totalW, totalH);
            }
        }

        public void UpdateState(CapsuleStatePayload payload)
        {
            if (payload == null) return;
            _emoji = string.IsNullOrWhiteSpace(payload.emoji) ? "📅" : payload.emoji.Trim();
            _title = payload.title?.Trim() ?? "";
            _fallbackCountdown = string.IsNullOrWhiteSpace(payload.countdownText) ? "--:--" : payload.countdownText.Trim();
            _isNow = payload.isNow;
            _isUrgent = payload.isUrgent;
            _targetEpochMs = payload.targetEpochMs;

            _hasSecondaryTimer = payload.hasSecondaryTimer && !string.IsNullOrWhiteSpace(payload.secondaryCountdownText);
            _secondaryEmoji = string.IsNullOrWhiteSpace(payload.secondaryEmoji) ? "💧" : payload.secondaryEmoji.Trim();
            _secondaryTitle = payload.secondaryTitle?.Trim() ?? "";
            _secondaryFallbackCountdown = payload.secondaryCountdownText?.Trim() ?? "";
            _secondaryTargetEpochMs = payload.secondaryTargetEpochMs;
            _secondaryIsNow = payload.secondaryIsNow;
            _secondaryIsUrgent = payload.secondaryIsUrgent;

            _phoneBatteryPct = payload.phoneBatteryPct;
            _phoneCharging = payload.phoneCharging;
            _phoneChargeLimitPct = payload.phoneChargeLimitPct > 0 ? payload.phoneChargeLimitPct : 90;
            _phoneChargeEtaMin = payload.phoneChargeEtaMin;

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
            RefreshTooltip();
            RecalculateBounds();
            if (Visible) RenderLayeredFrame();
        }

        public void ShowFloating()
        {
            if (!Visible) Show();
            TopMost = true;
            RenderLayeredFrame();
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
            if (Visible) RenderLayeredFrame();
        }

        private void OnCapsuleMouseDown(object sender, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Right)
            {
                SyncMenuCheckmarks();
                _contextMenu.Show(Cursor.Position);
                return;
            }
            if (e.Button == MouseButtons.Left)
            {
                _isDragging = true;
                _dragStartCursor = Cursor.Position;
                _dragStartForm = Location;
            }
        }

        private void OnCapsuleMouseMove(object sender, MouseEventArgs e)
        {
            if (!_isDragging) return;
            Point current = Cursor.Position;
            Location = new Point(
                _dragStartForm.X + (current.X - _dragStartCursor.X),
                _dragStartForm.Y + (current.Y - _dragStartCursor.Y)
            );
        }

        private void OnCapsuleMouseUp(object sender, MouseEventArgs e)
        {
            if (!_isDragging) return;
            _isDragging = false;
            _settings.CapsuleX = Location.X;
            _settings.CapsuleY = Location.Y;
            AppConfig.SaveSettings(_settings);
        }

        private static (string displayClock, bool urgentNow) ComputeClock(long targetEpochMs, string fallback, bool baseUrgent)
        {
            if (targetEpochMs <= 0) return (fallback, baseUrgent);

            long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            long remainingSec = Math.Max(0, (targetEpochMs - nowMs + 500) / 1000);
            bool urgent = baseUrgent || (remainingSec > 0 && remainingSec <= 60);

            if (remainingSec >= 3600)
            {
                long hrs = remainingSec / 3600;
                long mins = (remainingSec % 3600) / 60;
                long secs = remainingSec % 60;
                return ($"{hrs:00}:{mins:00}:{secs:00}", urgent);
            }
            return ($"{remainingSec / 60:00}:{remainingSec % 60:00}", urgent);
        }

        private void RenderLayeredFrame()
        {
            if (IsDisposed || !IsHandleCreated || Width <= 0 || Height <= 0) return;

            using (Bitmap bmp = new Bitmap(Width, Height, PixelFormat.Format32bppPArgb))
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.Transparent);
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;

                float scale = _sizeMode == "lg" ? 1.18f : _sizeMode == "sm" ? 0.86f : 1.0f;
                var (clockText, urgentNow) = ComputeClock(_targetEpochMs, _fallbackCountdown, _isUrgent);

                Color accent = urgentNow
                    ? Color.FromArgb(255, 107, 107)
                    : _isNow
                        ? Color.FromArgb(74, 222, 128)
                        : Color.FromArgb(127, 255, 212);

                RectangleF pillRect = new RectangleF(ShadowPad, ShadowPad, Width - ShadowPad * 2, Height - ShadowPad * 2);
                float radius = _isVertical ? 18f : Math.Max(16f, pillRect.Height / 2f);

                // Soft feathered obsidian drop shadow (3 concentric alpha passes)
                for (int i = 4; i >= 1; i--)
                {
                    RectangleF shadowRect = new RectangleF(
                        pillRect.X - i * 1.1f,
                        pillRect.Y + i * 1.3f,
                        pillRect.Width + i * 2.2f,
                        pillRect.Height + i * 2.2f
                    );
                    int alpha = 12 + (5 - i) * 10;
                    using (GraphicsPath sp = LayeredWindowHelper.CreateRoundedPath(shadowRect, radius + i))
                    using (SolidBrush sb = new SolidBrush(Color.FromArgb(alpha, 0, 0, 0)))
                    {
                        g.FillPath(sb, sp);
                    }
                }

                // Main obsidian-glass surface matching DayRhythm web UI (#0D131D -> #06090F)
                using (GraphicsPath bgPath = LayeredWindowHelper.CreateRoundedPath(pillRect, radius))
                using (LinearGradientBrush bgBrush = new LinearGradientBrush(
                    pillRect,
                    Color.FromArgb(245, 15, 21, 31),
                    Color.FromArgb(248, 7, 10, 15),
                    LinearGradientMode.Vertical))
                {
                    g.FillPath(bgBrush, bgPath);

                    // Top subtle glass rim reflection
                    RectangleF innerRect = new RectangleF(pillRect.X + 1f, pillRect.Y + 1f, pillRect.Width - 2f, pillRect.Height - 2f);
                    using (GraphicsPath innerPath = LayeredWindowHelper.CreateRoundedPath(innerRect, Math.Max(4f, radius - 1f)))
                    using (LinearGradientBrush sheen = new LinearGradientBrush(
                        innerRect,
                        Color.FromArgb(32, 255, 255, 255),
                        Color.FromArgb(0, 255, 255, 255),
                        LinearGradientMode.Vertical))
                    using (Pen sheenPen = new Pen(sheen, 1f))
                    {
                        g.DrawPath(sheenPen, innerPath);
                    }

                    // Crisp outer hairline border
                    Color borderColor = urgentNow
                        ? Color.FromArgb(215, 255, 107, 107)
                        : _isHovered
                            ? Color.FromArgb(185, accent.R, accent.G, accent.B)
                            : Color.FromArgb(72, 127, 255, 212);
                    using (Pen borderPen = new Pen(borderColor, 1.25f))
                    {
                        g.DrawPath(borderPen, bgPath);
                    }
                }

                float emojiPt = 11.2f * scale;
                float clockPt = (clockText.Length > 5 ? 9.6f : 11.0f) * scale;
                string monoFontName = "Cascadia Mono";

                using (StringFormat leftFmt = new StringFormat { Alignment = StringAlignment.Near, LineAlignment = StringAlignment.Center, FormatFlags = StringFormatFlags.NoWrap })
                using (StringFormat centerFmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center, FormatFlags = StringFormatFlags.NoWrap })
                {
                    if (_isVertical)
                    {
                        float padY = 6f * scale;
                        float rowH = 34f * scale;
                        float emojiW = 26f * scale;
                        float startX = pillRect.X + 10f * scale;
                        float y = pillRect.Y + padY;

                        using (Font ef = new Font("Segoe UI Emoji", emojiPt, FontStyle.Regular, GraphicsUnit.Point))
                        using (SolidBrush eb = new SolidBrush(Color.White))
                            g.DrawString(_emoji, ef, eb, new RectangleF(startX, y, emojiW, rowH), centerFmt);

                        using (Font cf = new Font(monoFontName, clockPt, FontStyle.Bold, GraphicsUnit.Point))
                        using (SolidBrush cb = new SolidBrush(accent))
                            g.DrawString(clockText, cf, cb, new RectangleF(startX + emojiW + 3f, y, pillRect.Right - (startX + emojiW + 8f), rowH), leftFmt);

                        y += rowH;

                        if (_hasSecondaryTimer)
                        {
                            using (Pen sepPen = new Pen(Color.FromArgb(30, 255, 255, 255), 1f))
                                g.DrawLine(sepPen, pillRect.X + 14f, y, pillRect.Right - 14f, y);

                            var (secClock, secUrgent) = ComputeClock(_secondaryTargetEpochMs, _secondaryFallbackCountdown, _secondaryIsUrgent);
                            Color secAccent = secUrgent
                                ? Color.FromArgb(255, 107, 107)
                                : _secondaryIsNow
                                    ? Color.FromArgb(74, 222, 128)
                                    : Color.FromArgb(127, 255, 212);
                            float secClockPt = (secClock.Length > 5 ? 9.6f : 11.0f) * scale;

                            using (Font sef = new Font("Segoe UI Emoji", emojiPt, FontStyle.Regular, GraphicsUnit.Point))
                            using (SolidBrush seb = new SolidBrush(Color.White))
                                g.DrawString(_secondaryEmoji, sef, seb, new RectangleF(startX, y, emojiW, rowH), centerFmt);

                            using (Font scf = new Font(monoFontName, secClockPt, FontStyle.Bold, GraphicsUnit.Point))
                            using (SolidBrush scb = new SolidBrush(secAccent))
                                g.DrawString(secClock, scf, scb, new RectangleF(startX + emojiW + 3f, y, pillRect.Right - (startX + emojiW + 8f), rowH), leftFmt);

                            y += rowH;
                        }

                        string battText = FormatBatteryChipText();
                        if (!string.IsNullOrEmpty(battText))
                        {
                            using (Pen sepPen = new Pen(Color.FromArgb(30, 255, 255, 255), 1f))
                                g.DrawLine(sepPen, pillRect.X + 14f, y, pillRect.Right - 14f, y);

                            bool reachedLimit = _phoneBatteryPct >= _phoneChargeLimitPct;
                            Color battColor = reachedLimit ? Color.FromArgb(74, 222, 128) : Color.FromArgb(127, 255, 212);
                            using (Font bf = new Font("Segoe UI", 8.6f * scale, FontStyle.Bold, GraphicsUnit.Point))
                            using (SolidBrush bb = new SolidBrush(battColor))
                                g.DrawString(battText, bf, bb, new RectangleF(pillRect.X + 6f, y, pillRect.Width - 12f, rowH), centerFmt);
                        }
                    }
                    else
                    {
                        float cursorX = pillRect.X + 13f * scale;
                        float emojiBoxW = 24f * scale;
                        float clockBoxW = (clockText.Length > 5 ? 74f : 60f) * scale;

                        using (Font emojiFont = new Font("Segoe UI Emoji", emojiPt, FontStyle.Regular, GraphicsUnit.Point))
                        using (SolidBrush emojiBrush = new SolidBrush(Color.White))
                            g.DrawString(_emoji, emojiFont, emojiBrush, new RectangleF(cursorX, pillRect.Y, emojiBoxW, pillRect.Height), centerFmt);
                        cursorX += emojiBoxW + 3f;

                        using (Font clockFont = new Font(monoFontName, clockPt, FontStyle.Bold, GraphicsUnit.Point))
                        using (SolidBrush clockBrush = new SolidBrush(accent))
                            g.DrawString(clockText, clockFont, clockBrush, new RectangleF(cursorX, pillRect.Y, clockBoxW, pillRect.Height), leftFmt);
                        cursorX += clockBoxW + 4f * scale;

                        if (_hasSecondaryTimer)
                        {
                            using (Pen sepPen = new Pen(Color.FromArgb(34, 255, 255, 255), 1f))
                                g.DrawLine(sepPen, cursorX, pillRect.Y + 10f, cursorX, pillRect.Bottom - 10f);
                            cursorX += 8f * scale;

                            var (secClock, secUrgent) = ComputeClock(_secondaryTargetEpochMs, _secondaryFallbackCountdown, _secondaryIsUrgent);
                            Color secAccent = secUrgent
                                ? Color.FromArgb(255, 107, 107)
                                : _secondaryIsNow
                                    ? Color.FromArgb(74, 222, 128)
                                    : Color.FromArgb(127, 255, 212);
                            float secClockPt = (secClock.Length > 5 ? 9.6f : 11.0f) * scale;
                            float secClockW = (secClock.Length > 5 ? 74f : 60f) * scale;

                            using (Font secEmojiFont = new Font("Segoe UI Emoji", emojiPt, FontStyle.Regular, GraphicsUnit.Point))
                            using (SolidBrush secEmojiBrush = new SolidBrush(Color.White))
                                g.DrawString(_secondaryEmoji, secEmojiFont, secEmojiBrush, new RectangleF(cursorX, pillRect.Y, emojiBoxW, pillRect.Height), centerFmt);
                            cursorX += emojiBoxW + 3f;

                            using (Font secClockFont = new Font(monoFontName, secClockPt, FontStyle.Bold, GraphicsUnit.Point))
                            using (SolidBrush secClockBrush = new SolidBrush(secAccent))
                                g.DrawString(secClock, secClockFont, secClockBrush, new RectangleF(cursorX, pillRect.Y, secClockW, pillRect.Height), leftFmt);
                            cursorX += secClockW + 4f * scale;
                        }

                        string hBattText = FormatBatteryChipText();
                        if (!string.IsNullOrEmpty(hBattText))
                        {
                            using (Pen sepPen = new Pen(Color.FromArgb(34, 255, 255, 255), 1f))
                                g.DrawLine(sepPen, cursorX, pillRect.Y + 10f, cursorX, pillRect.Bottom - 10f);

                            bool reachedLimit = _phoneBatteryPct >= _phoneChargeLimitPct;
                            Color battColor = reachedLimit ? Color.FromArgb(74, 222, 128) : Color.FromArgb(127, 255, 212);
                            RectangleF battRect = new RectangleF(cursorX + 4f, pillRect.Y, pillRect.Right - cursorX - 10f, pillRect.Height);
                            using (Font battFont = new Font("Segoe UI", 8.6f * scale, FontStyle.Bold, GraphicsUnit.Point))
                            using (SolidBrush battBrush = new SolidBrush(battColor))
                                g.DrawString(hBattText, battFont, battBrush, battRect, centerFmt);
                        }
                    }
                }

                LayeredWindowHelper.ApplyPremultipliedBitmap(this, bmp, _isHovered ? (byte)255 : (byte)248);
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _tickTimer?.Stop();
                _tickTimer?.Dispose();
                _contextMenu?.Dispose();
                _tooltip?.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
