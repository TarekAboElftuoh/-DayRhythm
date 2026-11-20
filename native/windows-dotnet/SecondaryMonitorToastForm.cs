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
        public string time12h { get; set; } = "";
        public string category { get; set; } = "general";
        public bool isHydration { get; set; }
        public bool isContinuous { get; set; }
        public int cupSizeMl { get; set; } = 177;
    }

    /// <summary>
    /// Non-focus-stealing privacy notification toast routed specifically to the user's Secondary Monitor
    /// so primary work monitor stays completely distraction-free.
    /// Includes direct "شربت فعلاً ✓" confirmation for water reminders.
    /// </summary>
    internal sealed class SecondaryMonitorToastForm : Form
    {
        private readonly Timer _autoCloseTimer;
        private readonly Action _onWaterConfirmed;
        private readonly Action _onDismissed;

        private readonly string _emoji;
        private readonly string _time12h;
        private readonly bool _isHydration;
        private readonly bool _isContinuous;

        public SecondaryMonitorToastForm(
            NativeAlertPayload payload,
            bool preferSecondaryScreen,
            Action onWaterConfirmed,
            Action onDismissed)
        {
            _emoji = string.IsNullOrWhiteSpace(payload?.emoji) ? "🔔" : payload.emoji.Trim();
            _time12h = payload?.time12h ?? "";
            _isHydration = payload?.isHydration ?? false;
            _isContinuous = payload?.isContinuous ?? false;
            _onWaterConfirmed = onWaterConfirmed;
            _onDismissed = onDismissed;

            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            TopMost = true;
            ShowInTaskbar = false;
            DoubleBuffered = true;
            Width = _isHydration ? 290 : 230;
            Height = 76;
            BackColor = Color.FromArgb(10, 13, 18);
            Opacity = 0.96;

            PositionOnTargetMonitor(preferSecondaryScreen);
            ApplyRoundedRegion();
            BuildControls();

            _autoCloseTimer = new Timer { Interval = _isHydration ? 30_000 : 16_000 };
            _autoCloseTimer.Tick += (_, __) =>
            {
                _autoCloseTimer.Stop();
                if (!IsDisposed) Close();
            };
            if (!_isContinuous)
            {
                _autoCloseTimer.Start();
            }
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

        private void PositionOnTargetMonitor(bool preferSecondary)
        {
            Screen target = Screen.PrimaryScreen ?? Screen.AllScreens.First();
            if (preferSecondary)
            {
                Screen secondary = Screen.AllScreens.FirstOrDefault(s => !s.Primary);
                if (secondary != null)
                {
                    target = secondary;
                }
            }
            Rectangle wa = target.WorkingArea;
            Location = new Point(wa.Right - Width - 20, wa.Bottom - Height - 20);
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
            // Privacy-safe Emoji + Time on the right side (RTL)
            Label emojiLabel = new Label
            {
                Text = _emoji,
                Font = new Font("Segoe UI Emoji", 20f, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor = Color.White,
                BackColor = Color.Transparent,
                AutoSize = false,
                Width = 48,
                Height = 44,
                TextAlign = ContentAlignment.MiddleCenter,
                Location = new Point(Width - 56, 16),
            };
            Controls.Add(emojiLabel);

            if (!string.IsNullOrWhiteSpace(_time12h))
            {
                Label timeLabel = new Label
                {
                    Text = _time12h,
                    Font = new Font("Segoe UI", 8.5f, FontStyle.Regular, GraphicsUnit.Point),
                    ForeColor = Color.FromArgb(161, 161, 170),
                    BackColor = Color.Transparent,
                    AutoSize = false,
                    Width = 96,
                    Height = 18,
                    TextAlign = ContentAlignment.MiddleRight,
                    Location = new Point(Width - 156, 12),
                };
                Controls.Add(timeLabel);
            }

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
                    Width = 112,
                    Height = 32,
                    Location = new Point(14, 22),
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
                    Width = 60,
                    Height = 32,
                    Location = new Point(132, 22),
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
                    Text = _isContinuous ? "إيقاف ✓" : "تم ✓",
                    Font = new Font("Segoe UI", 9f, FontStyle.Bold, GraphicsUnit.Point),
                    BackColor = _isContinuous ? Color.FromArgb(251, 191, 36) : Color.FromArgb(127, 255, 212),
                    ForeColor = Color.Black,
                    FlatStyle = FlatStyle.Flat,
                    Cursor = Cursors.Hand,
                    Width = 88,
                    Height = 32,
                    Location = new Point(16, 22),
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
            Color borderColor = _isContinuous
                ? Color.FromArgb(160, 251, 191, 36)
                : Color.FromArgb(110, 127, 255, 212);

            using (GraphicsPath path = CreateRoundedRectPath(new Rectangle(0, 0, Width - 1, Height - 1), 16))
            using (Pen pen = new Pen(borderColor, 1.3f))
            {
                g.DrawPath(pen, path);
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _autoCloseTimer?.Stop();
                _autoCloseTimer?.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
