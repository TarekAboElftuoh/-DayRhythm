using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;
using System.Windows.Forms;

namespace DayRhythm
{
    internal sealed class NativeAlertPayload
    {
        public string emoji { get; set; } = "🔔";
        public string title { get; set; } = "";
        public string sourceLabel { get; set; } = "تنبيه إيقاع اليوم";
        public string time12h { get; set; } = "";
        public string category { get; set; } = "general";
        public bool isHydration { get; set; }
        public bool isContinuous { get; set; }
        public int durationSeconds { get; set; } = 300; // Default 5 minutes!
        public int cupSizeMl { get; set; } = 177;
    }

    /// <summary>
    /// High-visibility, non-focus-stealing 5-minute persistent notification card:
    /// - Dual-Monitor setup: anchors clearly on the Secondary Monitor so Screen 1 stays distraction-free.
    /// - Single-Monitor setup: docks sleekly at the right side-edge without stealing focus or blocking center work.
    /// </summary>
    internal sealed class SecondaryMonitorToastForm : Form
    {
        private readonly Timer _tickTimer;
        private readonly Action _onWaterConfirmed;
        private readonly Action _onDismissed;

        private readonly string _emoji;
        private readonly string _title;
        private readonly string _sourceLabel;
        private readonly string _time12h;
        private readonly bool _isHydration;
        private readonly bool _isContinuous;
        private readonly int _totalDurationSec;
        private readonly DateTime _startedUtc;
        private Label _countdownLabel;

        public SecondaryMonitorToastForm(
            NativeAlertPayload payload,
            bool preferSecondaryScreen,
            Action onWaterConfirmed,
            Action onDismissed)
        {
            _emoji = string.IsNullOrWhiteSpace(payload?.emoji) ? "🔔" : payload.emoji.Trim();
            _title = string.IsNullOrWhiteSpace(payload?.title) ? "" : payload.title.Trim();
            _sourceLabel = string.IsNullOrWhiteSpace(payload?.sourceLabel) ? "إيقاع اليوم" : payload.sourceLabel.Trim();
            _time12h = payload?.time12h ?? "";
            _isHydration = payload?.isHydration ?? false;
            _isContinuous = payload?.isContinuous ?? false;
            _totalDurationSec = payload != null && payload.durationSeconds >= 15 ? payload.durationSeconds : 300;
            _startedUtc = DateTime.UtcNow;
            _onWaterConfirmed = onWaterConfirmed;
            _onDismissed = onDismissed;

            bool hasMultipleMonitors = Screen.AllScreens.Length > 1;
            bool useSecondary = preferSecondaryScreen && hasMultipleMonitors;

            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            TopMost = true;
            ShowInTaskbar = false;
            DoubleBuffered = true;
            // Slightly more compact when docked on single monitor side-edge; fuller on secondary monitor
            Width = useSecondary ? 330 : 284;
            Height = string.IsNullOrWhiteSpace(_title) ? 88 : 108;
            BackColor = Color.FromArgb(9, 13, 19);
            Opacity = 0.96;

            PositionOnTargetMonitor(useSecondary);
            ApplyRoundedRegion();
            BuildControls();

            _tickTimer = new Timer { Interval = 1000 };
            _tickTimer.Tick += (_, __) => OnCountdownTick();
            _tickTimer.Start();
        }

        // Critical: NEVER steal focus from the user's primary monitor!
        protected override bool ShowWithoutActivation => true;

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                // WS_EX_NOACTIVATE (0x08000000) | WS_EX_TOOLWINDOW (0x80) | WS_EX_TOPMOST (0x08)
                cp.ExStyle |= 0x08000000 | 0x00000080 | 0x00000008;
                return cp;
            }
        }

        private void PositionOnTargetMonitor(bool useSecondary)
        {
            Screen target = Screen.PrimaryScreen ?? Screen.AllScreens.First();
            if (useSecondary)
            {
                Screen secondary = Screen.AllScreens.FirstOrDefault(s => !s.Primary);
                if (secondary != null)
                {
                    target = secondary;
                }
            }
            Rectangle wa = target.WorkingArea;
            if (useSecondary)
            {
                // Prominent top-right on Secondary Monitor
                Location = new Point(wa.Right - Width - 22, wa.Top + 26);
            }
            else
            {
                // Non-intrusive bottom-right side dock on Primary Monitor
                Location = new Point(wa.Right - Width - 16, wa.Bottom - Height - 18);
            }
        }

        private void OnCountdownTick()
        {
            if (IsDisposed) return;
            int elapsed = (int)(DateTime.UtcNow - _startedUtc).TotalSeconds;
            int remaining = Math.Max(0, _totalDurationSec - elapsed);

            if (!_isContinuous && remaining <= 0)
            {
                _tickTimer.Stop();
                Close();
                return;
            }

            if (_countdownLabel != null && !_isContinuous)
            {
                int m = remaining / 60;
                int s = remaining % 60;
                _countdownLabel.Text = $"{m:00}:{s:00}";
            }
            Invalidate();
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

        private void BuildControls()
        {
            // Emoji on right side (RTL)
            Label emojiLabel = new Label
            {
                Text = _emoji,
                Font = new Font("Segoe UI Emoji", 20f, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor = Color.White,
                BackColor = Color.Transparent,
                AutoSize = false,
                Width = 46,
                Height = 46,
                TextAlign = ContentAlignment.MiddleCenter,
                Location = new Point(Width - 54, 14),
            };
            Controls.Add(emojiLabel);

            // Header: Source label + Time
            string metaLine = string.IsNullOrWhiteSpace(_time12h) ? _sourceLabel : $"{_sourceLabel} · {_time12h}";
            Label metaLabel = new Label
            {
                Text = metaLine,
                Font = new Font("Segoe UI", 8.5f, FontStyle.Bold, GraphicsUnit.Point),
                ForeColor = Color.FromArgb(127, 255, 212),
                BackColor = Color.Transparent,
                AutoSize = false,
                Width = Width - 122,
                Height = 18,
                TextAlign = ContentAlignment.MiddleRight,
                Location = new Point(62, 12),
            };
            Controls.Add(metaLabel);

            // Live 5-minute countdown on top-left
            _countdownLabel = new Label
            {
                Text = _isContinuous ? "∞" : $"{_totalDurationSec / 60:00}:{_totalDurationSec % 60:00}",
                Font = new Font("Consolas", 8.5f, FontStyle.Bold, GraphicsUnit.Point),
                ForeColor = _isContinuous ? Color.FromArgb(251, 191, 36) : Color.FromArgb(161, 161, 170),
                BackColor = Color.Transparent,
                AutoSize = false,
                Width = 48,
                Height = 18,
                TextAlign = ContentAlignment.MiddleLeft,
                Location = new Point(12, 12),
            };
            Controls.Add(_countdownLabel);

            if (!string.IsNullOrWhiteSpace(_title))
            {
                Label titleLabel = new Label
                {
                    Text = _title,
                    Font = new Font("Segoe UI", 9.5f, FontStyle.Bold, GraphicsUnit.Point),
                    ForeColor = Color.White,
                    BackColor = Color.Transparent,
                    AutoSize = false,
                    Width = Width - 74,
                    Height = 24,
                    TextAlign = ContentAlignment.MiddleRight,
                    Location = new Point(14, 33),
                };
                Controls.Add(titleLabel);
            }

            int btnY = Height - 42;
            if (_isHydration)
            {
                Button drankBtn = new Button
                {
                    Text = "شربت فعلاً ✓",
                    Font = new Font("Segoe UI", 9f, FontStyle.Bold, GraphicsUnit.Point),
                    BackColor = Color.FromArgb(127, 255, 212),
                    ForeColor = Color.Black,
                    FlatStyle = FlatStyle.Flat,
                    Cursor = Cursors.Hand,
                    Width = 114,
                    Height = 30,
                    Location = new Point(14, btnY),
                };
                drankBtn.FlatAppearance.BorderSize = 0;
                drankBtn.Click += (_, __) =>
                {
                    _onWaterConfirmed?.Invoke();
                    Close();
                };
                Controls.Add(drankBtn);

                Button dismissBtn = new Button
                {
                    Text = "لاحقاً",
                    Font = new Font("Segoe UI", 8.5f, FontStyle.Regular, GraphicsUnit.Point),
                    BackColor = Color.FromArgb(24, 28, 36),
                    ForeColor = Color.FromArgb(212, 212, 216),
                    FlatStyle = FlatStyle.Flat,
                    Cursor = Cursors.Hand,
                    Width = 64,
                    Height = 30,
                    Location = new Point(134, btnY),
                };
                dismissBtn.FlatAppearance.BorderSize = 1;
                dismissBtn.FlatAppearance.BorderColor = Color.FromArgb(52, 56, 66);
                dismissBtn.Click += (_, __) =>
                {
                    _onDismissed?.Invoke();
                    Close();
                };
                Controls.Add(dismissBtn);
            }
            else
            {
                Button ackBtn = new Button
                {
                    Text = _isContinuous ? "إيقاف التنبيه ✓" : "تم العلم ✓",
                    Font = new Font("Segoe UI", 9f, FontStyle.Bold, GraphicsUnit.Point),
                    BackColor = _isContinuous ? Color.FromArgb(251, 191, 36) : Color.FromArgb(127, 255, 212),
                    ForeColor = Color.Black,
                    FlatStyle = FlatStyle.Flat,
                    Cursor = Cursors.Hand,
                    Width = 112,
                    Height = 30,
                    Location = new Point(14, btnY),
                };
                ackBtn.FlatAppearance.BorderSize = 0;
                ackBtn.Click += (_, __) =>
                {
                    _onDismissed?.Invoke();
                    Close();
                };
                Controls.Add(ackBtn);
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            Color accentColor = _isContinuous
                ? Color.FromArgb(251, 191, 36)
                : Color.FromArgb(127, 255, 212);

            // Top progress bar showing remaining 5-minute visibility
            double ratio = _isContinuous
                ? 1.0
                : Math.Max(0.0, Math.Min(1.0, 1.0 - (DateTime.UtcNow - _startedUtc).TotalSeconds / _totalDurationSec));
            int barW = (int)(Width * ratio);
            using (SolidBrush trackBrush = new SolidBrush(Color.FromArgb(30, 255, 255, 255)))
            using (SolidBrush fillBrush = new SolidBrush(accentColor))
            {
                g.FillRectangle(trackBrush, 0, 0, Width, 4);
                g.FillRectangle(fillBrush, 0, 0, barW, 4);
            }

            using (GraphicsPath path = CreateRoundedRectPath(new Rectangle(0, 0, Width - 1, Height - 1), 16))
            using (Pen pen = new Pen(Color.FromArgb(165, accentColor.R, accentColor.G, accentColor.B), 1.5f))
            {
                g.DrawPath(pen, path);
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _tickTimer?.Stop();
                _tickTimer?.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
