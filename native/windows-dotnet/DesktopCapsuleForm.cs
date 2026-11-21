using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;
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
        public string orientation { get; set; } = "";
        public string size { get; set; } = "";
    }

    /// <summary>
    /// Minimalist Emoji + Countdown ONLY free-floating Windows desktop timer capsule.
    /// Supports Horizontal & Vertical orientation, Small/Medium/Large sizes, Dual Timers, and live Phone Charging %.
    /// </summary>
    internal sealed class DesktopCapsuleForm : Form
    {
        private readonly UserSettings _settings;
        private readonly Action _onOpenMainWindow;
        private readonly Action<bool> _onVisibilityChanged;
        private readonly Action _onQuickWater;
        private readonly Action _onQuickMedication;

        private readonly Timer _tickTimer;
        private readonly ContextMenuStrip _contextMenu;

        private string _emoji = "📅";
        private string _fallbackCountdown = "--:--";
        private bool _isNow;
        private bool _isUrgent;
        private long _targetEpochMs;

        private bool _hasSecondaryTimer;
        private string _secondaryEmoji = "💧";
        private string _secondaryFallbackCountdown = "";
        private long _secondaryTargetEpochMs;
        private bool _secondaryIsNow;
        private bool _secondaryIsUrgent;

        private int _phoneBatteryPct = -1;
        private bool _phoneCharging;
        private int _phoneChargeLimitPct = 90;

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
            DoubleBuffered = true;
            BackColor = Color.FromArgb(8, 10, 14);
            Cursor = Cursors.SizeAll;
            Opacity = 0.94;

            RecalculateBounds();
            RestoreSavedPosition();

            _contextMenu = new ContextMenuStrip
            {
                RightToLeft = RightToLeft.Yes,
            };

            ToolStripMenuItem quickWaterItem = new ToolStripMenuItem("💧 تسجيل كوب ماء الآن (+1)", null, (_, __) => _onQuickWater?.Invoke());
            ToolStripMenuItem quickMedItem = new ToolStripMenuItem("💊 تسجيل الجرعة القادمة الآن ✓", null, (_, __) => _onQuickMedication?.Invoke());
            ToolStripMenuItem openMainItem = new ToolStripMenuItem("فتح لوحة التحكم", null, (_, __) => _onOpenMainWindow?.Invoke());
            ToolStripMenuItem orientHorizItem = new ToolStripMenuItem("اتجاه: عرضي (أفقي)", null, (_, __) => SetOrientation(vertical: false));
            ToolStripMenuItem orientVertItem = new ToolStripMenuItem("اتجاه: طولي (رأسي)", null, (_, __) => SetOrientation(vertical: true));
            ToolStripMenuItem sizeSmItem = new ToolStripMenuItem("حجم: صغير", null, (_, __) => SetSizeMode("sm"));
            ToolStripMenuItem sizeMdItem = new ToolStripMenuItem("حجم: متوسط", null, (_, __) => SetSizeMode("md"));
            ToolStripMenuItem sizeLgItem = new ToolStripMenuItem("حجم: كبير", null, (_, __) => SetSizeMode("lg"));
            ToolStripMenuItem moveSecondaryItem = new ToolStripMenuItem("نقل للشاشة الثانية", null, (_, __) => SnapToMonitor(preferSecondary: true));
            ToolStripMenuItem movePrimaryItem = new ToolStripMenuItem("نقل للشاشة الرئيسية", null, (_, __) => SnapToMonitor(preferSecondary: false));
            ToolStripMenuItem hideItem = new ToolStripMenuItem("إخفاء الكبسولة", null, (_, __) => HideCapsuleByUser());

            _contextMenu.Items.Add(quickWaterItem);
            _contextMenu.Items.Add(quickMedItem);
            _contextMenu.Items.Add(new ToolStripSeparator());
            _contextMenu.Items.Add(openMainItem);
            _contextMenu.Items.Add(new ToolStripSeparator());
            _contextMenu.Items.Add(orientHorizItem);
            _contextMenu.Items.Add(orientVertItem);
            _contextMenu.Items.Add(new ToolStripSeparator());
            _contextMenu.Items.Add(sizeSmItem);
            _contextMenu.Items.Add(sizeMdItem);
            _contextMenu.Items.Add(sizeLgItem);
            _contextMenu.Items.Add(new ToolStripSeparator());
            _contextMenu.Items.Add(moveSecondaryItem);
            _contextMenu.Items.Add(movePrimaryItem);
            _contextMenu.Items.Add(new ToolStripSeparator());
            _contextMenu.Items.Add(hideItem);

            MouseDown += OnCapsuleMouseDown;
            MouseMove += OnCapsuleMouseMove;
            MouseUp += OnCapsuleMouseUp;
            MouseDoubleClick += (_, e) =>
            {
                if (e.Button == MouseButtons.Left)
                {
                    _onOpenMainWindow?.Invoke();
                }
            };
            MouseEnter += (_, __) => { _isHovered = true; Opacity = 1.0; Invalidate(); };
            MouseLeave += (_, __) => { _isHovered = false; Opacity = 0.94; Invalidate(); };

            _tickTimer = new Timer { Interval = 1000 };
            _tickTimer.Tick += (_, __) =>
            {
                if (Visible)
                {
                    Invalidate();
                }
            };
            _tickTimer.Start();
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
            RecalculateBounds();
            Invalidate();
        }

        private void SetSizeMode(string mode)
        {
            _sizeMode = NormalizeSize(mode);
            _settings.CapsuleSize = _sizeMode;
            AppConfig.SaveSettings(_settings);
            RecalculateBounds();
            Invalidate();
        }

        // Never steal focus from the user's active desktop window
        protected override bool ShowWithoutActivation => true;

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= 0x00000080 | 0x00000008;
                return cp;
            }
        }

        private void RecalculateBounds()
        {
            float scale = _sizeMode == "lg" ? 1.22f : _sizeMode == "sm" ? 0.84f : 1.0f;
            bool showBatt = _phoneCharging && _phoneBatteryPct >= 0;

            int desiredW;
            int desiredH;
            if (_isVertical)
            {
                desiredW = (int)Math.Round(122 * scale);
                int rows = 1 + (_hasSecondaryTimer ? 1 : 0) + (showBatt ? 1 : 0);
                int rowH = (int)Math.Round(34 * scale);
                desiredH = rows * rowH + (int)Math.Round(12 * scale);
            }
            else
            {
                int baseW = _hasSecondaryTimer
                    ? (showBatt ? 298 : 238)
                    : (showBatt ? 190 : 128);
                desiredW = (int)Math.Round(baseW * scale);
                desiredH = (int)Math.Round(42 * scale);
            }

            if (Width != desiredW || Height != desiredH)
            {
                Width = desiredW;
                Height = desiredH;
                ApplyRoundedRegion();
            }
        }

        public void UpdateState(CapsuleStatePayload payload)
        {
            if (payload == null) return;
            _emoji = string.IsNullOrWhiteSpace(payload.emoji) ? "📅" : payload.emoji.Trim();
            _fallbackCountdown = string.IsNullOrWhiteSpace(payload.countdownText) ? "--:--" : payload.countdownText.Trim();
            _isNow = payload.isNow;
            _isUrgent = payload.isUrgent;
            _targetEpochMs = payload.targetEpochMs;

            _hasSecondaryTimer = payload.hasSecondaryTimer && !string.IsNullOrWhiteSpace(payload.secondaryCountdownText);
            _secondaryEmoji = string.IsNullOrWhiteSpace(payload.secondaryEmoji) ? "💧" : payload.secondaryEmoji.Trim();
            _secondaryFallbackCountdown = payload.secondaryCountdownText?.Trim() ?? "";
            _secondaryTargetEpochMs = payload.secondaryTargetEpochMs;
            _secondaryIsNow = payload.secondaryIsNow;
            _secondaryIsUrgent = payload.secondaryIsUrgent;

            _phoneBatteryPct = payload.phoneBatteryPct;
            _phoneCharging = payload.phoneCharging;
            _phoneChargeLimitPct = payload.phoneChargeLimitPct > 0 ? payload.phoneChargeLimitPct : 90;

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

            RecalculateBounds();

            if (Visible)
            {
                Invalidate();
            }
        }

        public void ShowFloating()
        {
            if (!Visible)
            {
                Show();
            }
            TopMost = true;
            Invalidate();
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
            Location = new Point(wa.Left + 20, wa.Bottom - Height - 20);
            _settings.CapsuleX = Location.X;
            _settings.CapsuleY = Location.Y;
            AppConfig.SaveSettings(_settings);
        }

        private void ApplyRoundedRegion()
        {
            using (GraphicsPath path = CreateRoundedRectPath(new Rectangle(0, 0, Width, Height), 16))
            {
                Region = new Region(path);
            }
        }

        private static GraphicsPath CreateRoundedRectPath(Rectangle bounds, int radius)
        {
            int d = radius * 2;
            GraphicsPath path = new GraphicsPath();
            path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
            path.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
            path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
            path.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        private void OnCapsuleMouseDown(object sender, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Right)
            {
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
            if (targetEpochMs <= 0)
            {
                return (fallback, baseUrgent);
            }

            long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            long remainingSec = Math.Max(0, (targetEpochMs - nowMs + 500) / 1000);
            bool urgent = baseUrgent || (remainingSec > 0 && remainingSec <= 60);

            string clock;
            if (remainingSec >= 3600)
            {
                long hrs = remainingSec / 3600;
                long mins = (remainingSec % 3600) / 60;
                long secs = remainingSec % 60;
                clock = $"{hrs:00}:{mins:00}:{secs:00}";
            }
            else
            {
                long mins = remainingSec / 60;
                long secs = remainingSec % 60;
                clock = $"{mins:00}:{secs:00}";
            }
            return (clock, urgent);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            float scale = _sizeMode == "lg" ? 1.22f : _sizeMode == "sm" ? 0.84f : 1.0f;
            var (clockText, urgentNow) = ComputeClock(_targetEpochMs, _fallbackCountdown, _isUrgent);

            Color accent = urgentNow
                ? Color.FromArgb(255, 107, 107)
                : _isNow
                    ? Color.FromArgb(74, 222, 128)
                    : Color.FromArgb(127, 255, 212);

            Rectangle outer = new Rectangle(0, 0, Width - 1, Height - 1);
            using (GraphicsPath bgPath = CreateRoundedRectPath(outer, 16))
            using (SolidBrush bgBrush = new SolidBrush(Color.FromArgb(10, 12, 16)))
            {
                g.FillPath(bgBrush, bgPath);
                Color borderColor = _isHovered
                    ? Color.FromArgb(125, accent.R, accent.G, accent.B)
                    : Color.FromArgb(52, 255, 255, 255);
                using (Pen borderPen = new Pen(borderColor, 1f))
                {
                    g.DrawPath(borderPen, bgPath);
                }
            }

            float emojiPt = 11.5f * scale;
            float clockPt = (clockText.Length > 5 ? 10.2f : 11.8f) * scale;

            using (StringFormat leftFmt = new StringFormat
            {
                Alignment = StringAlignment.Near,
                LineAlignment = StringAlignment.Center,
                FormatFlags = StringFormatFlags.NoWrap,
            })
            using (StringFormat centerFmt = new StringFormat
            {
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center,
                FormatFlags = StringFormatFlags.NoWrap,
            })
            {
                if (_isVertical)
                {
                    int padY = (int)Math.Round(6 * scale);
                    int rowH = (int)Math.Round(34 * scale);
                    int emojiW = (int)Math.Round(28 * scale);
                    int startX = (int)Math.Round(10 * scale);
                    int y = padY;

                    // Row 1: Primary [Emoji] [Countdown]
                    using (Font ef = new Font("Segoe UI Emoji", emojiPt, FontStyle.Regular, GraphicsUnit.Point))
                    using (SolidBrush eb = new SolidBrush(Color.White))
                        g.DrawString(_emoji, ef, eb, new Rectangle(startX, y, emojiW, rowH), centerFmt);

                    using (Font cf = new Font("Consolas", clockPt, FontStyle.Bold, GraphicsUnit.Point))
                    using (SolidBrush cb = new SolidBrush(accent))
                        g.DrawString(clockText, cf, cb, new Rectangle(startX + emojiW + 2, y, Width - startX - emojiW - 8, rowH), leftFmt);

                    y += rowH;

                    // Row 2: Secondary [Emoji] [Countdown]
                    if (_hasSecondaryTimer)
                    {
                        using (Pen sepPen = new Pen(Color.FromArgb(45, 255, 255, 255), 1f))
                            g.DrawLine(sepPen, 12, y, Width - 12, y);

                        var (secClock, secUrgent) = ComputeClock(_secondaryTargetEpochMs, _secondaryFallbackCountdown, _secondaryIsUrgent);
                        Color secAccent = secUrgent
                            ? Color.FromArgb(255, 107, 107)
                            : _secondaryIsNow
                                ? Color.FromArgb(74, 222, 128)
                                : _secondaryEmoji == "💧"
                                    ? Color.FromArgb(56, 189, 248)
                                    : Color.FromArgb(252, 211, 77);
                        float secClockPt = (secClock.Length > 5 ? 10.2f : 11.8f) * scale;

                        using (Font sef = new Font("Segoe UI Emoji", emojiPt, FontStyle.Regular, GraphicsUnit.Point))
                        using (SolidBrush seb = new SolidBrush(Color.White))
                            g.DrawString(_secondaryEmoji, sef, seb, new Rectangle(startX, y, emojiW, rowH), centerFmt);

                        using (Font scf = new Font("Consolas", secClockPt, FontStyle.Bold, GraphicsUnit.Point))
                        using (SolidBrush scb = new SolidBrush(secAccent))
                            g.DrawString(secClock, scf, scb, new Rectangle(startX + emojiW + 2, y, Width - startX - emojiW - 8, rowH), leftFmt);

                        y += rowH;
                    }

                    // Row 3: Phone Battery %
                    if (_phoneCharging && _phoneBatteryPct >= 0)
                    {
                        using (Pen sepPen = new Pen(Color.FromArgb(45, 255, 255, 255), 1f))
                            g.DrawLine(sepPen, 12, y, Width - 12, y);

                        bool reachedLimit = _phoneBatteryPct >= _phoneChargeLimitPct;
                        Color battColor = reachedLimit ? Color.FromArgb(74, 222, 128) : Color.FromArgb(252, 211, 77);
                        using (Font bf = new Font("Consolas", 9.5f * scale, FontStyle.Bold, GraphicsUnit.Point))
                        using (SolidBrush bb = new SolidBrush(battColor))
                            g.DrawString($"⚡{_phoneBatteryPct}%", bf, bb, new Rectangle(0, y, Width, rowH), centerFmt);
                    }
                    return;
                }

                // Horizontal layout: [Emoji] [Countdown] | [Emoji] [Countdown] | [⚡%]
                int cursorX = (int)Math.Round(10 * scale);
                int emojiBoxW = (int)Math.Round(26 * scale);
                int clockBoxW = (int)Math.Round((clockText.Length > 5 ? 78 : 66) * scale);

                using (Font emojiFont = new Font("Segoe UI Emoji", emojiPt, FontStyle.Regular, GraphicsUnit.Point))
                using (SolidBrush emojiBrush = new SolidBrush(Color.White))
                    g.DrawString(_emoji, emojiFont, emojiBrush, new Rectangle(cursorX, 0, emojiBoxW, Height), centerFmt);
                cursorX += emojiBoxW + 2;

                using (Font clockFont = new Font("Consolas", clockPt, FontStyle.Bold, GraphicsUnit.Point))
                using (SolidBrush clockBrush = new SolidBrush(accent))
                    g.DrawString(clockText, clockFont, clockBrush, new Rectangle(cursorX, 0, clockBoxW, Height), leftFmt);
                cursorX += clockBoxW + (int)Math.Round(6 * scale);

                if (_hasSecondaryTimer)
                {
                    using (Pen sepPen = new Pen(Color.FromArgb(55, 255, 255, 255), 1f))
                        g.DrawLine(sepPen, cursorX, 10, cursorX, Height - 10);
                    cursorX += (int)Math.Round(8 * scale);

                    var (secClock, secUrgent) = ComputeClock(_secondaryTargetEpochMs, _secondaryFallbackCountdown, _secondaryIsUrgent);
                    Color secAccent = secUrgent
                        ? Color.FromArgb(255, 107, 107)
                        : _secondaryIsNow
                            ? Color.FromArgb(74, 222, 128)
                            : _secondaryEmoji == "💧"
                                ? Color.FromArgb(56, 189, 248)
                                : Color.FromArgb(252, 211, 77);
                    float secClockPt = (secClock.Length > 5 ? 10.2f : 11.8f) * scale;
                    int secClockW = (int)Math.Round((secClock.Length > 5 ? 78 : 66) * scale);

                    using (Font secEmojiFont = new Font("Segoe UI Emoji", emojiPt, FontStyle.Regular, GraphicsUnit.Point))
                    using (SolidBrush secEmojiBrush = new SolidBrush(Color.White))
                        g.DrawString(_secondaryEmoji, secEmojiFont, secEmojiBrush, new Rectangle(cursorX, 0, emojiBoxW, Height), centerFmt);
                    cursorX += emojiBoxW + 2;

                    using (Font secClockFont = new Font("Consolas", secClockPt, FontStyle.Bold, GraphicsUnit.Point))
                    using (SolidBrush secClockBrush = new SolidBrush(secAccent))
                        g.DrawString(secClock, secClockFont, secClockBrush, new Rectangle(cursorX, 0, secClockW, Height), leftFmt);
                }

                if (_phoneCharging && _phoneBatteryPct >= 0)
                {
                    bool reachedLimit = _phoneBatteryPct >= _phoneChargeLimitPct;
                    Color battColor = reachedLimit ? Color.FromArgb(74, 222, 128) : Color.FromArgb(252, 211, 77);
                    int battW = (int)Math.Round(56 * scale);
                    Rectangle battRect = new Rectangle(Width - battW - 6, 0, battW, Height);
                    using (Font battFont = new Font("Consolas", 9.5f * scale, FontStyle.Bold, GraphicsUnit.Point))
                    using (SolidBrush battBrush = new SolidBrush(battColor))
                        g.DrawString($"⚡{_phoneBatteryPct}%", battFont, battBrush, battRect, centerFmt);
                }
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _tickTimer?.Stop();
                _tickTimer?.Dispose();
                _contextMenu?.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
