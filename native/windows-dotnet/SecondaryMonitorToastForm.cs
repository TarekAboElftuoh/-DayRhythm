using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;
using System.Windows.Forms;

namespace DayRhythm
{
    internal sealed class NativeAlertPayload
    {
        public string id { get; set; } = "";
        public string emoji { get; set; } = "🔔";
        public string title { get; set; } = "";
        public string sourceLabel { get; set; } = "تنبيه إيقاع اليوم";
        public string time12h { get; set; } = "";
        public string category { get; set; } = "general";
        public bool isHydration { get; set; }
        public bool isMedication { get; set; }
        public string medicationId { get; set; } = "";
        public string medicationDoseTime24 { get; set; } = "";
        public bool isContinuous { get; set; }
        public int durationSeconds { get; set; } = 300; // Default 5 minutes!
        public int cupSizeMl { get; set; } = 177;
    }

    /// <summary>
    /// High-visibility, non-focus-stealing 5-minute persistent notification card:
    /// - Dual-Monitor setup: anchors clearly on the Secondary Monitor so Screen 1 stays distraction-free.
    /// - Single-Monitor setup: docks sleekly at the right side-edge without stealing focus or blocking center work.
    /// - Supports interactive quick actions: Water Confirm, Medication Confirm, and 15-minute Snooze.
    /// </summary>
    internal sealed class SecondaryMonitorToastForm : Form
    {
        private readonly Timer _tickTimer;
        private readonly Action _onWaterConfirmed;
        private readonly Action<string, string> _onMedicationConfirmed;
        private readonly Action<NativeAlertPayload, int> _onSnoozed;
        private readonly Action _onDismissed;

        private readonly NativeAlertPayload _payload;
        private readonly string _emoji;
        private readonly string _title;
        private readonly string _sourceLabel;
        private readonly string _time12h;
        private readonly bool _isHydration;
        private readonly bool _isMedication;
        private readonly string _medicationId;
        private readonly string _medicationDoseTime24;
        private readonly bool _isContinuous;
        private readonly int _totalDurationSec;
        private readonly DateTime _startedUtc;
        private Label _countdownLabel;

        public SecondaryMonitorToastForm(
            NativeAlertPayload payload,
            bool preferSecondaryScreen,
            Action onWaterConfirmed,
            Action<string, string> onMedicationConfirmed,
            Action<NativeAlertPayload, int> onSnoozed,
            Action onDismissed)
        {
            _payload = payload ?? new NativeAlertPayload();
            _emoji = string.IsNullOrWhiteSpace(_payload.emoji) ? "🔔" : _payload.emoji.Trim();
            _title = string.IsNullOrWhiteSpace(_payload.title) ? "" : _payload.title.Trim();
            _sourceLabel = string.IsNullOrWhiteSpace(_payload.sourceLabel) ? "إيقاع اليوم" : _payload.sourceLabel.Trim();
            _time12h = _payload.time12h ?? "";
            _isHydration = _payload.isHydration;
            _isMedication = _payload.isMedication || !string.IsNullOrWhiteSpace(_payload.medicationId);
            _medicationId = _payload.medicationId ?? "";
            _medicationDoseTime24 = _payload.medicationDoseTime24 ?? "";
            _isContinuous = _payload.isContinuous;
            _totalDurationSec = _payload.durationSeconds >= 15 ? _payload.durationSeconds : 300;
            _startedUtc = DateTime.UtcNow;
            _onWaterConfirmed = onWaterConfirmed;
            _onMedicationConfirmed = onMedicationConfirmed;
            _onSnoozed = onSnoozed;
            _onDismissed = onDismissed;

            bool hasMultipleMonitors = Screen.AllScreens.Length > 1;
            bool useSecondary = preferSecondaryScreen && hasMultipleMonitors;

            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            TopMost = true;
            ShowInTaskbar = false;
            DoubleBuffered = true;
            // Wide enough to cleanly fit Done + Snooze 15m + Dismiss buttons
            Width = useSecondary ? 360 : 326;
            Height = string.IsNullOrWhiteSpace(_title) ? 94 : 114;
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
            int cursorX = 14;

            if (_isHydration)
            {
                Button drankBtn = new Button
                {
                    Text = "شربت فعلاً ✓",
                    Font = new Font("Segoe UI", 8.5f, FontStyle.Bold, GraphicsUnit.Point),
                    BackColor = Color.FromArgb(127, 255, 212),
                    ForeColor = Color.Black,
                    FlatStyle = FlatStyle.Flat,
                    Cursor = Cursors.Hand,
                    Width = 104,
                    Height = 30,
                    Location = new Point(cursorX, btnY),
                };
                drankBtn.FlatAppearance.BorderSize = 0;
                drankBtn.Click += (_, __) =>
                {
                    _onWaterConfirmed?.Invoke();
                    Close();
                };
                Controls.Add(drankBtn);
                cursorX += 110;
            }
            else if (_isMedication && !string.IsNullOrWhiteSpace(_medicationId))
            {
                Button medBtn = new Button
                {
                    Text = "أخذت الجرعة ✓",
                    Font = new Font("Segoe UI", 8.5f, FontStyle.Bold, GraphicsUnit.Point),
                    BackColor = Color.FromArgb(251, 113, 133),
                    ForeColor = Color.Black,
                    FlatStyle = FlatStyle.Flat,
                    Cursor = Cursors.Hand,
                    Width = 108,
                    Height = 30,
                    Location = new Point(cursorX, btnY),
                };
                medBtn.FlatAppearance.BorderSize = 0;
                medBtn.Click += (_, __) =>
                {
                    _onMedicationConfirmed?.Invoke(_medicationId, _medicationDoseTime24);
                    Close();
                };
                Controls.Add(medBtn);
                cursorX += 114;
            }
            else
            {
                Button ackBtn = new Button
                {
                    Text = _isContinuous ? "إيقاف التنبيه ✓" : "تم العلم ✓",
                    Font = new Font("Segoe UI", 8.5f, FontStyle.Bold, GraphicsUnit.Point),
                    BackColor = _isContinuous ? Color.FromArgb(251, 191, 36) : Color.FromArgb(127, 255, 212),
                    ForeColor = Color.Black,
                    FlatStyle = FlatStyle.Flat,
                    Cursor = Cursors.Hand,
                    Width = 104,
                    Height = 30,
                    Location = new Point(cursorX, btnY),
                };
                ackBtn.FlatAppearance.BorderSize = 0;
                ackBtn.Click += (_, __) =>
                {
                    _onDismissed?.Invoke();
                    Close();
                };
                Controls.Add(ackBtn);
                cursorX += 110;
            }

            if (!_isContinuous)
            {
                Button snoozeBtn = new Button
                {
                    Text = "⏰ تأجيل 15 د",
                    Font = new Font("Segoe UI", 8.5f, FontStyle.Bold, GraphicsUnit.Point),
                    BackColor = Color.FromArgb(46, 36, 14),
                    ForeColor = Color.FromArgb(252, 211, 77),
                    FlatStyle = FlatStyle.Flat,
                    Cursor = Cursors.Hand,
                    Width = 98,
                    Height = 30,
                    Location = new Point(cursorX, btnY),
                };
                snoozeBtn.FlatAppearance.BorderSize = 1;
                snoozeBtn.FlatAppearance.BorderColor = Color.FromArgb(146, 108, 30);
                snoozeBtn.Click += (_, __) =>
                {
                    _onSnoozed?.Invoke(_payload, 15);
                    Close();
                };
                Controls.Add(snoozeBtn);
                cursorX += 104;
            }

            if (_isHydration || (_isMedication && !string.IsNullOrWhiteSpace(_medicationId)))
            {
                Button dismissBtn = new Button
                {
                    Text = "إغلاق",
                    Font = new Font("Segoe UI", 8.5f, FontStyle.Regular, GraphicsUnit.Point),
                    BackColor = Color.FromArgb(24, 28, 36),
                    ForeColor = Color.FromArgb(212, 212, 216),
                    FlatStyle = FlatStyle.Flat,
                    Cursor = Cursors.Hand,
                    Width = 64,
                    Height = 30,
                    Location = new Point(cursorX, btnY),
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
