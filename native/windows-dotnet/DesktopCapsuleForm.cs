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
        public string countdownText { get; set; } = "--:--";
        public bool isNow { get; set; }
        public bool isUrgent { get; set; }
        public long targetEpochMs { get; set; }
        public int durationSeconds { get; set; }
    }

    /// <summary>
    /// Classic compact sleek free-floating Windows desktop timer capsule outside MainForm.
    /// Single clean dark glass pill showing Emoji + smooth live countdown timer only.
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
                // WS_EX_TOOLWINDOW (0x80) | WS_EX_TOPMOST (0x08) | WS_EX_NOACTIVATE (0x08000000)
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

        private (string displayClock, bool urgentNow) ComputeLiveClock()
        {
            if (_targetEpochMs <= 0)
            {
                return (_fallbackCountdown, _isUrgent);
            }

            long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            long remainingSec = Math.Max(0, (_targetEpochMs - nowMs + 500) / 1000);
            bool urgent = _isUrgent || (remainingSec > 0 && remainingSec <= 60);

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

            var (clockText, urgentNow) = ComputeLiveClock();

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

            // Classic compact layout: [Countdown]  [Emoji]
            Rectangle clockRect = new Rectangle(14, 0, 90, Height);
            using (Font clockFont = new Font("Consolas", clockText.Length > 5 ? 11f : 12.5f, FontStyle.Bold, GraphicsUnit.Point))
            using (SolidBrush clockBrush = new SolidBrush(accent))
            using (StringFormat leftFmt = new StringFormat
            {
                Alignment = StringAlignment.Near,
                LineAlignment = StringAlignment.Center,
                FormatFlags = StringFormatFlags.NoWrap,
            })
            {
                g.DrawString(clockText, clockFont, clockBrush, clockRect, leftFmt);
            }

            Rectangle emojiRect = new Rectangle(Width - 42, 0, 30, Height);
            using (Font emojiFont = new Font("Segoe UI Emoji", 13f, FontStyle.Regular, GraphicsUnit.Point))
            using (SolidBrush emojiBrush = new SolidBrush(Color.White))
            using (StringFormat centerFmt = new StringFormat
            {
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center,
            })
            {
                g.DrawString(_emoji, emojiFont, emojiBrush, emojiRect, centerFmt);
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
