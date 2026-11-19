using System;
using System.Drawing;
using System.Drawing.Drawing2D;
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
    /// True free-floating always-on-top Windows desktop timer capsule outside the main app window.
    /// Shows strictly Next/Current Task + smooth live countdown timer (zero hydration clutter).
    /// </summary>
    internal sealed class DesktopCapsuleForm : Form
    {
        private readonly UserSettings _settings;
        private readonly Action _onOpenMainWindow;
        private readonly Action<bool> _onVisibilityChanged;

        private readonly Timer _tickTimer;
        private readonly ContextMenuStrip _contextMenu;
        private readonly ToolStripMenuItem _privacyMenuItem;

        private string _emoji = "📅";
        private string _title = "المهمة القادمة";
        private string _statusLabel = "المهمة القادمة";
        private string _fallbackCountdown = "--:--";
        private bool _isNow;
        private bool _isUrgent;
        private long _targetEpochMs;
        private int _durationSeconds;

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
            Width = 282;
            Height = 62;
            BackColor = Color.FromArgb(8, 11, 16);
            Cursor = Cursors.SizeAll;
            Opacity = 0.96;

            ApplyRoundedRegion();
            RestoreSavedPosition();

            _contextMenu = new ContextMenuStrip
            {
                RightToLeft = RightToLeft.Yes,
            };

            ToolStripMenuItem openMainItem = new ToolStripMenuItem("فتح إيقاع اليوم", null, (_, __) => _onOpenMainWindow?.Invoke());

            _privacyMenuItem = new ToolStripMenuItem("وضع الخصوصية (إيموجي فقط)")
            {
                CheckOnClick = true,
                Checked = _settings.CapsulePrivacyMode,
            };
            _privacyMenuItem.CheckedChanged += (_, __) =>
            {
                _settings.CapsulePrivacyMode = _privacyMenuItem.Checked;
                AppConfig.SaveSettings(_settings);
                Invalidate();
            };

            ToolStripMenuItem resetPosItem = new ToolStripMenuItem("إعادة للزاوية السفلية", null, (_, __) => ResetPositionToCorner());
            ToolStripMenuItem hideItem = new ToolStripMenuItem("إخفاء الكبسولة", null, (_, __) => HideCapsuleByUser());

            _contextMenu.Items.Add(openMainItem);
            _contextMenu.Items.Add(_privacyMenuItem);
            _contextMenu.Items.Add(resetPosItem);
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
            MouseLeave += (_, __) => { _isHovered = false; Opacity = 0.96; Invalidate(); };

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

        // Prevent stealing focus from the user's active desktop window (browser/IDE/games)
        protected override bool ShowWithoutActivation => true;

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                // WS_EX_TOOLWINDOW (0x80) hides from Alt+Tab; WS_EX_TOPMOST (0x08) keeps floating above windows
                cp.ExStyle |= 0x00000080 | 0x00000008;
                return cp;
            }
        }

        public void UpdateState(CapsuleStatePayload payload)
        {
            if (payload == null) return;
            _emoji = string.IsNullOrWhiteSpace(payload.emoji) ? "📅" : payload.emoji.Trim();
            _title = string.IsNullOrWhiteSpace(payload.title) ? "إيقاع اليوم" : payload.title.Trim();
            _statusLabel = string.IsNullOrWhiteSpace(payload.statusLabel)
                ? (payload.isNow ? "جارٍ الآن" : "المهمة القادمة")
                : payload.statusLabel.Trim();
            _fallbackCountdown = string.IsNullOrWhiteSpace(payload.countdownText) ? "--:--" : payload.countdownText.Trim();
            _isNow = payload.isNow;
            _isUrgent = payload.isUrgent;
            _targetEpochMs = payload.targetEpochMs;
            _durationSeconds = Math.Max(0, payload.durationSeconds);

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

        private void RestoreSavedPosition()
        {
            Rectangle wa = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
            if (_settings.CapsuleX.HasValue && _settings.CapsuleY.HasValue)
            {
                Point saved = new Point(_settings.CapsuleX.Value, _settings.CapsuleY.Value);
                bool insideAnyScreen = false;
                foreach (Screen scr in Screen.AllScreens)
                {
                    if (scr.WorkingArea.IntersectsWith(new Rectangle(saved, Size)))
                    {
                        insideAnyScreen = true;
                        break;
                    }
                }
                if (insideAnyScreen)
                {
                    Location = saved;
                    return;
                }
            }
            Location = new Point(wa.Left + 22, wa.Bottom - Height - 22);
        }

        private void ResetPositionToCorner()
        {
            Rectangle wa = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
            Location = new Point(wa.Left + 22, wa.Bottom - Height - 22);
            _settings.CapsuleX = Location.X;
            _settings.CapsuleY = Location.Y;
            AppConfig.SaveSettings(_settings);
        }

        private void ApplyRoundedRegion()
        {
            using (GraphicsPath path = CreateRoundedRectPath(new Rectangle(0, 0, Width, Height), 20))
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

        private (string displayClock, float progressRatio, bool urgentNow) ComputeLiveClock()
        {
            if (_targetEpochMs <= 0)
            {
                return (_fallbackCountdown, 0f, _isUrgent);
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

            float ratio = 0f;
            if (_isNow && _durationSeconds > 0)
            {
                float elapsed = Math.Max(0f, _durationSeconds - remainingSec);
                ratio = Math.Min(1f, Math.Max(0f, elapsed / _durationSeconds));
            }
            return (clock, ratio, urgent);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            var (clockText, progressRatio, urgentNow) = ComputeLiveClock();

            Color accent = urgentNow
                ? Color.FromArgb(255, 107, 107)
                : _isNow
                    ? Color.FromArgb(74, 222, 128)
                    : Color.FromArgb(127, 255, 212);

            Rectangle outer = new Rectangle(0, 0, Width - 1, Height - 1);
            using (GraphicsPath bgPath = CreateRoundedRectPath(outer, 20))
            using (LinearGradientBrush bgBrush = new LinearGradientBrush(
                outer,
                Color.FromArgb(14, 18, 26),
                Color.FromArgb(7, 9, 13),
                LinearGradientMode.Vertical))
            {
                g.FillPath(bgBrush, bgPath);

                Color borderColor = Color.FromArgb(_isHovered ? 150 : 85, accent.R, accent.G, accent.B);
                using (Pen borderPen = new Pen(borderColor, 1.35f))
                {
                    g.DrawPath(borderPen, bgPath);
                }
            }

            // Subtle live progress accent along the bottom edge when a task is currently active
            if (progressRatio > 0.01f)
            {
                int trackMargin = 18;
                int trackWidth = Width - trackMargin * 2;
                int fillWidth = Math.Max(8, (int)(trackWidth * progressRatio));
                using (SolidBrush trackBg = new SolidBrush(Color.FromArgb(30, 255, 255, 255)))
                using (SolidBrush trackFg = new SolidBrush(Color.FromArgb(190, accent.R, accent.G, accent.B)))
                {
                    g.FillRectangle(trackBg, trackMargin, Height - 5, trackWidth, 2);
                    g.FillRectangle(trackFg, trackMargin + (trackWidth - fillWidth), Height - 5, fillWidth, 2);
                }
            }

            // Left block: Crisp live tabular countdown clock
            Rectangle clockRect = new Rectangle(12, 10, 102, Height - 20);
            using (Font clockFont = new Font("Consolas", clockText.Length > 5 ? 13.5f : 16f, FontStyle.Bold, GraphicsUnit.Point))
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

            // Subtle vertical divider
            using (Pen sepPen = new Pen(Color.FromArgb(36, 255, 255, 255), 1f))
            {
                g.DrawLine(sepPen, 118, 15, 118, Height - 15);
            }

            // Right block (RTL): Task Emoji + clean Title + quiet status label
            string displayTitle = _settings.CapsulePrivacyMode ? _emoji : _title;
            Rectangle emojiRect = new Rectangle(Width - 44, 12, 32, Height - 24);
            using (Font emojiFont = new Font("Segoe UI Emoji", 15f, FontStyle.Regular, GraphicsUnit.Point))
            using (SolidBrush emojiBrush = new SolidBrush(Color.White))
            using (StringFormat centerFmt = new StringFormat
            {
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center,
            })
            {
                g.DrawString(_emoji, emojiFont, emojiBrush, emojiRect, centerFmt);
            }

            Rectangle textTopRect = new Rectangle(124, 11, Width - 170, 21);
            Rectangle textSubRect = new Rectangle(124, 33, Width - 170, 18);
            using (Font titleFont = new Font("Segoe UI", 9.5f, FontStyle.Bold, GraphicsUnit.Point))
            using (Font subFont = new Font("Segoe UI", 8f, FontStyle.Regular, GraphicsUnit.Point))
            using (SolidBrush titleBrush = new SolidBrush(Color.FromArgb(244, 244, 245)))
            using (SolidBrush subBrush = new SolidBrush(Color.FromArgb(161, 161, 170)))
            using (StringFormat rtlFmt = new StringFormat
            {
                Alignment = StringAlignment.Far,
                LineAlignment = StringAlignment.Center,
                Trimming = StringTrimming.EllipsisCharacter,
                FormatFlags = StringFormatFlags.NoWrap | StringFormatFlags.DirectionRightToLeft,
            })
            {
                g.DrawString(displayTitle, titleFont, titleBrush, textTopRect, rtlFmt);
                g.DrawString(_statusLabel, subFont, subBrush, textSubRect, rtlFmt);
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
