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
        public string secondaryEmoji { get; set; } = "☑️";
        public string secondaryTitle { get; set; } = "";
        public string secondaryCountdownText { get; set; } = "";
        public long secondaryTargetEpochMs { get; set; }
        public bool secondaryIsNow { get; set; }
        public bool secondaryIsUrgent { get; set; }
        public int phoneBatteryPct { get; set; } = -1;
        public bool phoneCharging { get; set; }
        public int phoneChargeLimitPct { get; set; } = 90;
    }

    /// <summary>
    /// Compact sleek free-floating Windows desktop timer capsule outside MainForm.
    /// Supports simultaneous Dual Timers (Google Calendar + Google Tasks) plus live Phone Charging %.
    /// </summary>
    internal sealed class DesktopCapsuleForm : Form
    {
        private readonly UserSettings _settings;
        private readonly Action _onOpenMainWindow;
        private readonly Action<bool> _onVisibilityChanged;

        private readonly Timer _tickTimer;
        private readonly ContextMenuStrip _contextMenu;

        private string _emoji = "📅";
        private string _title = "المهمة القادمة";
        private string _fallbackCountdown = "--:--";
        private bool _isNow;
        private bool _isUrgent;
        private long _targetEpochMs;

        private bool _hasSecondaryTimer;
        private string _secondaryEmoji = "☑️";
        private string _secondaryFallbackCountdown = "";
        private long _secondaryTargetEpochMs;
        private bool _secondaryIsNow;
        private bool _secondaryIsUrgent;

        private int _phoneBatteryPct = -1;
        private bool _phoneCharging;
        private int _phoneChargeLimitPct = 90;

        private bool _isDragging;
        private Point _dragStartCursor;
        private Point _dragStartForm;
        private bool _isHovered;

        public DesktopCapsuleForm(
            UserSettings settings,
            Action onOpenMainWindow,
            Action<bool> onVisibilityChanged)
        {
            _settings = settings;
            _onOpenMainWindow = onOpenMainWindow;
            _onVisibilityChanged = onVisibilityChanged;

            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            TopMost = true;
            ShowInTaskbar = false;
            DoubleBuffered = true;
            Width = 152;
            Height = 42;
            BackColor = Color.FromArgb(8, 10, 14);
            Cursor = Cursors.SizeAll;
            Opacity = 0.94;

            ApplyRoundedRegion();
            RestoreSavedPosition();

            _contextMenu = new ContextMenuStrip
            {
                RightToLeft = RightToLeft.Yes,
            };

            ToolStripMenuItem openMainItem = new ToolStripMenuItem("فتح لوحة التحكم", null, (_, __) => _onOpenMainWindow?.Invoke());
            ToolStripMenuItem moveSecondaryItem = new ToolStripMenuItem("نقل للشاشة الثانية", null, (_, __) => SnapToMonitor(preferSecondary: true));
            ToolStripMenuItem movePrimaryItem = new ToolStripMenuItem("نقل للشاشة الرئيسية", null, (_, __) => SnapToMonitor(preferSecondary: false));
            ToolStripMenuItem hideItem = new ToolStripMenuItem("إخفاء الكبسولة", null, (_, __) => HideCapsuleByUser());

            _contextMenu.Items.Add(openMainItem);
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

        public void UpdateState(CapsuleStatePayload payload)
        {
            if (payload == null) return;
            _emoji = string.IsNullOrWhiteSpace(payload.emoji) ? "📅" : payload.emoji.Trim();
            _title = string.IsNullOrWhiteSpace(payload.title) ? "إيقاع اليوم" : payload.title.Trim();
            _fallbackCountdown = string.IsNullOrWhiteSpace(payload.countdownText) ? "--:--" : payload.countdownText.Trim();
            _isNow = payload.isNow;
            _isUrgent = payload.isUrgent;
            _targetEpochMs = payload.targetEpochMs;

            _hasSecondaryTimer = payload.hasSecondaryTimer && !string.IsNullOrWhiteSpace(payload.secondaryCountdownText);
            _secondaryEmoji = string.IsNullOrWhiteSpace(payload.secondaryEmoji) ? "☑️" : payload.secondaryEmoji.Trim();
            _secondaryFallbackCountdown = payload.secondaryCountdownText?.Trim() ?? "";
            _secondaryTargetEpochMs = payload.secondaryTargetEpochMs;
            _secondaryIsNow = payload.secondaryIsNow;
            _secondaryIsUrgent = payload.secondaryIsUrgent;

            _phoneBatteryPct = payload.phoneBatteryPct;
            _phoneCharging = payload.phoneCharging;
            _phoneChargeLimitPct = payload.phoneChargeLimitPct > 0 ? payload.phoneChargeLimitPct : 90;

            bool showBatt = _phoneCharging && _phoneBatteryPct >= 0;
            int desiredWidth = _hasSecondaryTimer
                ? (showBatt ? 326 : 268)
                : (showBatt ? 210 : 152);
            if (Width != desiredWidth)
            {
                Width = desiredWidth;
                ApplyRoundedRegion();
            }

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
                int cursorX = 12;

                // Primary Timer (Calendar / Next item): [Emoji] [Countdown]
                using (Font emojiFont = new Font("Segoe UI Emoji", 12f, FontStyle.Regular, GraphicsUnit.Point))
                using (SolidBrush emojiBrush = new SolidBrush(Color.White))
                {
                    g.DrawString(_emoji, emojiFont, emojiBrush, new Rectangle(cursorX, 0, 26, Height), centerFmt);
                }
                cursorX += 26;

                using (Font clockFont = new Font("Consolas", clockText.Length > 5 ? 10.5f : 12f, FontStyle.Bold, GraphicsUnit.Point))
                using (SolidBrush clockBrush = new SolidBrush(accent))
                {
                    int clockW = clockText.Length > 5 ? 82 : 66;
                    g.DrawString(clockText, clockFont, clockBrush, new Rectangle(cursorX, 0, clockW, Height), leftFmt);
                    cursorX += clockW + 6;
                }

                // Secondary Timer (Google Tasks): | [☑️] [Task Countdown]
                if (_hasSecondaryTimer)
                {
                    using (Pen sepPen = new Pen(Color.FromArgb(55, 255, 255, 255), 1f))
                    {
                        g.DrawLine(sepPen, cursorX, 10, cursorX, Height - 10);
                    }
                    cursorX += 8;

                    var (secClock, secUrgent) = ComputeClock(_secondaryTargetEpochMs, _secondaryFallbackCountdown, _secondaryIsUrgent);
                    Color secAccent = secUrgent
                        ? Color.FromArgb(255, 107, 107)
                        : _secondaryIsNow
                            ? Color.FromArgb(74, 222, 128)
                            : Color.FromArgb(252, 211, 77);

                    using (Font secEmojiFont = new Font("Segoe UI Emoji", 11.5f, FontStyle.Regular, GraphicsUnit.Point))
                    using (SolidBrush secEmojiBrush = new SolidBrush(Color.White))
                    {
                        g.DrawString(_secondaryEmoji, secEmojiFont, secEmojiBrush, new Rectangle(cursorX, 0, 24, Height), centerFmt);
                    }
                    cursorX += 24;

                    using (Font secClockFont = new Font("Consolas", secClock.Length > 5 ? 10.5f : 12f, FontStyle.Bold, GraphicsUnit.Point))
                    using (SolidBrush secClockBrush = new SolidBrush(secAccent))
                    {
                        int secW = secClock.Length > 5 ? 82 : 66;
                        g.DrawString(secClock, secClockFont, secClockBrush, new Rectangle(cursorX, 0, secW, Height), leftFmt);
                        cursorX += secW + 4;
                    }
                }

                // Phone Charging % badge (when charging)
                if (_phoneCharging && _phoneBatteryPct >= 0)
                {
                    bool reachedLimit = _phoneBatteryPct >= _phoneChargeLimitPct;
                    Color battColor = reachedLimit
                        ? Color.FromArgb(74, 222, 128)
                        : Color.FromArgb(252, 211, 77);
                    Rectangle battRect = new Rectangle(Width - 62, 0, 54, Height);
                    using (Font battFont = new Font("Consolas", 9.5f, FontStyle.Bold, GraphicsUnit.Point))
                    using (SolidBrush battBrush = new SolidBrush(battColor))
                    {
                        g.DrawString($"⚡{_phoneBatteryPct}%", battFont, battBrush, battRect, centerFmt);
                    }
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
