using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
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
        public int durationSeconds { get; set; } = 300;
        public int snoozeMinutes { get; set; } = 5;
        public int cupSizeMl { get; set; } = 177;
    }

    /// <summary>
    /// Per-Pixel Alpha Obsidian-Glass Windows Notification Card matching PersistentAlertOverlay.tsx 1-to-1:
    /// - Smooth antialiased rounded glass card + feathered shadow (zero ugly WinForms controls/regions)
    /// - Configurable Aquamarine Snooze (5/10/15m, default 5) — zero yellow/amber
    /// - Clean single "تم" button — zero double checkmarks
    /// </summary>
    internal sealed class SecondaryMonitorToastForm : Form
    {
        private const int ShadowPad = 14;

        private sealed class HitButton
        {
            public string Key;
            public string Label;
            public RectangleF Rect;
            public Color FillNormal;
            public Color FillHover;
            public Color BorderColor;
            public Color TextColor;
            public Action OnClick;
        }

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
        private readonly int _snoozeMin;
        private readonly DateTime _startedUtc;

        private readonly List<HitButton> _buttons = new List<HitButton>();
        private string _hoveredKey;

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
            _snoozeMin = (_payload.snoozeMinutes == 5 || _payload.snoozeMinutes == 10 || _payload.snoozeMinutes == 15)
                ? _payload.snoozeMinutes
                : 5;
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

            int cardW = 374;
            int cardH = string.IsNullOrWhiteSpace(_title) ? 116 : 134;
            Size = new Size(cardW + ShadowPad * 2, cardH + ShadowPad * 2);

            BuildHitButtons(cardW, cardH);
            PositionOnTargetMonitor(useSecondary);

            MouseMove += OnToastMouseMove;
            MouseLeave += (_, __) => { if (_hoveredKey != null) { _hoveredKey = null; Cursor = Cursors.Default; RenderLayeredFrame(); } };
            MouseDown += OnToastMouseDown;
            HandleCreated += (_, __) => RenderLayeredFrame();
            Shown += (_, __) => RenderLayeredFrame();

            _tickTimer = new Timer { Interval = 1000 };
            _tickTimer.Tick += (_, __) => OnCountdownTick();
            _tickTimer.Start();
        }

        protected override bool ShowWithoutActivation => true;

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= LayeredWindowHelper.WS_EX_LAYERED
                            | LayeredWindowHelper.WS_EX_NOACTIVATE
                            | LayeredWindowHelper.WS_EX_TOOLWINDOW
                            | LayeredWindowHelper.WS_EX_TOPMOST;
                return cp;
            }
        }

        private void PositionOnTargetMonitor(bool useSecondary)
        {
            Screen target = Screen.PrimaryScreen ?? Screen.AllScreens.First();
            if (useSecondary)
            {
                Screen secondary = Screen.AllScreens.FirstOrDefault(s => !s.Primary);
                if (secondary != null) target = secondary;
            }
            Rectangle wa = target.WorkingArea;
            if (useSecondary)
            {
                Location = new Point(wa.Right - Width - 14, wa.Top + 14);
            }
            else
            {
                Location = new Point(wa.Right - Width - 10, wa.Bottom - Height - 10);
            }
        }

        private void BuildHitButtons(int cardW, int cardH)
        {
            _buttons.Clear();
            float cardX = ShadowPad;
            float cardY = ShadowPad;

            // Subtle top-left close button (✕)
            _buttons.Add(new HitButton
            {
                Key = "close",
                Label = "✕",
                Rect = new RectangleF(cardX + 12f, cardY + 12f, 26f, 26f),
                FillNormal = Color.FromArgb(18, 255, 255, 255),
                FillHover = Color.FromArgb(40, 255, 255, 255),
                BorderColor = Color.FromArgb(24, 255, 255, 255),
                TextColor = Color.FromArgb(180, 188, 200),
                OnClick = () => { _onDismissed?.Invoke(); Close(); },
            });

            float btnY = cardY + cardH - 46f;
            float btnH = 34f;
            float innerLeft = cardX + 14f;
            float innerW = cardW - 28f;
            float gap = 8f;

            // RTL visual order: Primary Action on right, Aquamarine Snooze on left
            bool hasQuickConfirm = _isHydration || (_isMedication && !string.IsNullOrWhiteSpace(_medicationId));
            string primaryText = _isHydration
                ? "شربت كوب ماء"
                : (_isMedication && !string.IsNullOrWhiteSpace(_medicationId))
                    ? "أخذت الجرعة"
                    : (_isContinuous ? "إيقاف التنبيه" : "تم");

            Color primaryFill = _isMedication && !string.IsNullOrWhiteSpace(_medicationId)
                ? Color.FromArgb(251, 113, 133)
                : Color.FromArgb(127, 255, 212);
            Color primaryHover = _isMedication && !string.IsNullOrWhiteSpace(_medicationId)
                ? Color.FromArgb(253, 140, 157)
                : Color.FromArgb(156, 255, 224);

            Action primaryAction = () =>
            {
                if (_isHydration) _onWaterConfirmed?.Invoke();
                else if (_isMedication && !string.IsNullOrWhiteSpace(_medicationId)) _onMedicationConfirmed?.Invoke(_medicationId, _medicationDoseTime24);
                else _onDismissed?.Invoke();
                Close();
            };

            if (_isContinuous)
            {
                _buttons.Add(new HitButton
                {
                    Key = "primary",
                    Label = primaryText,
                    Rect = new RectangleF(innerLeft, btnY, innerW, btnH),
                    FillNormal = primaryFill,
                    FillHover = primaryHover,
                    BorderColor = primaryFill,
                    TextColor = Color.Black,
                    OnClick = primaryAction,
                });
            }
            else if (hasQuickConfirm)
            {
                float primaryW = 132f;
                float snoozeW = 112f;
                float doneW = innerW - primaryW - snoozeW - gap * 2f;

                _buttons.Add(new HitButton
                {
                    Key = "done",
                    Label = "تم",
                    Rect = new RectangleF(innerLeft, btnY, doneW, btnH),
                    FillNormal = Color.FromArgb(22, 28, 38),
                    FillHover = Color.FromArgb(34, 42, 56),
                    BorderColor = Color.FromArgb(46, 255, 255, 255),
                    TextColor = Color.FromArgb(228, 228, 231),
                    OnClick = () => { _onDismissed?.Invoke(); Close(); },
                });
                _buttons.Add(new HitButton
                {
                    Key = "snooze",
                    Label = $"تأجيل {_snoozeMin} د",
                    Rect = new RectangleF(innerLeft + doneW + gap, btnY, snoozeW, btnH),
                    FillNormal = Color.FromArgb(28, 127, 255, 212),
                    FillHover = Color.FromArgb(52, 127, 255, 212),
                    BorderColor = Color.FromArgb(120, 127, 255, 212),
                    TextColor = Color.FromArgb(127, 255, 212),
                    OnClick = () => { _onSnoozed?.Invoke(_payload, _snoozeMin); Close(); },
                });
                _buttons.Add(new HitButton
                {
                    Key = "primary",
                    Label = primaryText,
                    Rect = new RectangleF(innerLeft + doneW + snoozeW + gap * 2f, btnY, primaryW, btnH),
                    FillNormal = primaryFill,
                    FillHover = primaryHover,
                    BorderColor = primaryFill,
                    TextColor = Color.Black,
                    OnClick = primaryAction,
                });
            }
            else
            {
                float snoozeW = 128f;
                float primaryW = innerW - snoozeW - gap;

                _buttons.Add(new HitButton
                {
                    Key = "snooze",
                    Label = $"تأجيل {_snoozeMin} د",
                    Rect = new RectangleF(innerLeft, btnY, snoozeW, btnH),
                    FillNormal = Color.FromArgb(28, 127, 255, 212),
                    FillHover = Color.FromArgb(52, 127, 255, 212),
                    BorderColor = Color.FromArgb(120, 127, 255, 212),
                    TextColor = Color.FromArgb(127, 255, 212),
                    OnClick = () => { _onSnoozed?.Invoke(_payload, _snoozeMin); Close(); },
                });
                _buttons.Add(new HitButton
                {
                    Key = "primary",
                    Label = primaryText,
                    Rect = new RectangleF(innerLeft + snoozeW + gap, btnY, primaryW, btnH),
                    FillNormal = primaryFill,
                    FillHover = primaryHover,
                    BorderColor = primaryFill,
                    TextColor = Color.Black,
                    OnClick = primaryAction,
                });
            }
        }

        private void OnToastMouseMove(object sender, MouseEventArgs e)
        {
            string hitKey = null;
            foreach (HitButton btn in _buttons)
            {
                if (btn.Rect.Contains(e.Location))
                {
                    hitKey = btn.Key;
                    break;
                }
            }
            if (hitKey != _hoveredKey)
            {
                _hoveredKey = hitKey;
                Cursor = hitKey != null ? Cursors.Hand : Cursors.Default;
                RenderLayeredFrame();
            }
        }

        private void OnToastMouseDown(object sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left) return;
            foreach (HitButton btn in _buttons)
            {
                if (btn.Rect.Contains(e.Location))
                {
                    btn.OnClick?.Invoke();
                    return;
                }
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
            RenderLayeredFrame();
        }

        private void RenderLayeredFrame()
        {
            if (IsDisposed || !IsHandleCreated || Width <= 0 || Height <= 0) return;

            int elapsed = (int)(DateTime.UtcNow - _startedUtc).TotalSeconds;
            int remaining = Math.Max(0, _totalDurationSec - elapsed);
            double ratio = _isContinuous
                ? 1.0
                : Math.Max(0.0, Math.Min(1.0, 1.0 - (DateTime.UtcNow - _startedUtc).TotalSeconds / _totalDurationSec));
            string countdownText = _isContinuous ? "مستمر" : $"{remaining / 60:00}:{remaining % 60:00}";

            Color accent = _isMedication && !string.IsNullOrWhiteSpace(_medicationId)
                ? Color.FromArgb(251, 113, 133)
                : Color.FromArgb(127, 255, 212);

            using (Bitmap bmp = new Bitmap(Width, Height, PixelFormat.Format32bppPArgb))
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.Transparent);
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;

                RectangleF cardRect = new RectangleF(ShadowPad, ShadowPad, Width - ShadowPad * 2, Height - ShadowPad * 2);
                float radius = 18f;

                // Feathered ambient drop shadow
                for (int i = 5; i >= 1; i--)
                {
                    RectangleF sRect = new RectangleF(
                        cardRect.X - i * 1.4f,
                        cardRect.Y + i * 1.6f,
                        cardRect.Width + i * 2.8f,
                        cardRect.Height + i * 2.8f
                    );
                    int alpha = 10 + (6 - i) * 9;
                    using (GraphicsPath sp = LayeredWindowHelper.CreateRoundedPath(sRect, radius + i))
                    using (SolidBrush sb = new SolidBrush(Color.FromArgb(alpha, 0, 0, 0)))
                        g.FillPath(sb, sp);
                }

                // Obsidian glass card body matching PersistentAlertOverlay.tsx (#0B1018 -> #06090F)
                using (GraphicsPath cardPath = LayeredWindowHelper.CreateRoundedPath(cardRect, radius))
                using (LinearGradientBrush bgBrush = new LinearGradientBrush(
                    cardRect,
                    Color.FromArgb(248, 14, 20, 30),
                    Color.FromArgb(250, 7, 10, 16),
                    LinearGradientMode.Vertical))
                {
                    g.FillPath(bgBrush, cardPath);

                    // Clipped top progress bar
                    GraphicsState state = g.Save();
                    g.SetClip(cardPath);
                    using (SolidBrush trackBrush = new SolidBrush(Color.FromArgb(24, 255, 255, 255)))
                        g.FillRectangle(trackBrush, cardRect.X, cardRect.Y, cardRect.Width, 3.5f);
                    using (SolidBrush fillBrush = new SolidBrush(accent))
                        g.FillRectangle(fillBrush, cardRect.X, cardRect.Y, (float)(cardRect.Width * ratio), 3.5f);
                    g.Restore(state);

                    using (Pen borderPen = new Pen(Color.FromArgb(115, accent.R, accent.G, accent.B), 1.3f))
                        g.DrawPath(borderPen, cardPath);
                }

                // Right-side obsidian emoji badge (RTL)
                RectangleF badgeRect = new RectangleF(cardRect.Right - 60f, cardRect.Y + 18f, 46f, 46f);
                using (GraphicsPath badgePath = LayeredWindowHelper.CreateRoundedPath(badgeRect, 13f))
                using (SolidBrush badgeFill = new SolidBrush(Color.FromArgb(24, accent.R, accent.G, accent.B)))
                using (Pen badgeBorder = new Pen(Color.FromArgb(80, accent.R, accent.G, accent.B), 1f))
                {
                    g.FillPath(badgeFill, badgePath);
                    g.DrawPath(badgeBorder, badgePath);
                }

                using (StringFormat centerFmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center, FormatFlags = StringFormatFlags.NoWrap })
                using (StringFormat rtlRightFmt = new StringFormat(StringFormatFlags.DirectionRightToLeft) { Alignment = StringAlignment.Near, LineAlignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisCharacter, FormatFlags = StringFormatFlags.DirectionRightToLeft | StringFormatFlags.NoWrap })
                using (StringFormat leftFmt = new StringFormat { Alignment = StringAlignment.Near, LineAlignment = StringAlignment.Center, FormatFlags = StringFormatFlags.NoWrap })
                {
                    // Emoji
                    using (Font ef = new Font("Segoe UI Emoji", 18.5f, FontStyle.Regular, GraphicsUnit.Point))
                    using (SolidBrush eb = new SolidBrush(Color.White))
                        g.DrawString(_emoji, ef, eb, badgeRect, centerFmt);

                    // Countdown badge next to close button (top-left)
                    using (Font cf = new Font("Cascadia Mono", 8.5f, FontStyle.Bold, GraphicsUnit.Point))
                    using (SolidBrush cb = new SolidBrush(Color.FromArgb(161, 161, 170)))
                        g.DrawString(countdownText, cf, cb, new RectangleF(cardRect.X + 44f, cardRect.Y + 15f, 62f, 20f), leftFmt);

                    // Source + time metadata (top-right)
                    string metaLine = string.IsNullOrWhiteSpace(_time12h) ? _sourceLabel : $"{_sourceLabel} · {_time12h}";
                    using (Font mf = new Font("Segoe UI", 8.5f, FontStyle.Bold, GraphicsUnit.Point))
                    using (SolidBrush mb = new SolidBrush(accent))
                        g.DrawString(metaLine, mf, mb, new RectangleF(cardRect.X + 106f, cardRect.Y + 15f, cardRect.Width - 174f, 20f), rtlRightFmt);

                    // Main title
                    if (!string.IsNullOrWhiteSpace(_title))
                    {
                        using (Font tf = new Font("Segoe UI", 10.5f, FontStyle.Bold, GraphicsUnit.Point))
                        using (SolidBrush tb = new SolidBrush(Color.White))
                            g.DrawString(_title, tf, tb, new RectangleF(cardRect.X + 16f, cardRect.Y + 39f, cardRect.Width - 84f, 28f), rtlRightFmt);
                    }

                    // Custom smooth rounded buttons
                    foreach (HitButton btn in _buttons)
                    {
                        bool hover = btn.Key == _hoveredKey;
                        float btnR = btn.Key == "close" ? 8f : 11f;
                        using (GraphicsPath bp = LayeredWindowHelper.CreateRoundedPath(btn.Rect, btnR))
                        using (SolidBrush bf = new SolidBrush(hover ? btn.FillHover : btn.FillNormal))
                        using (Pen bPen = new Pen(btn.BorderColor, 1f))
                        {
                            g.FillPath(bf, bp);
                            g.DrawPath(bPen, bp);
                        }

                        float pt = btn.Key == "close" ? 8.5f : 9.0f;
                        FontStyle style = btn.Key == "close" ? FontStyle.Regular : FontStyle.Bold;
                        using (Font font = new Font("Segoe UI", pt, style, GraphicsUnit.Point))
                        using (SolidBrush tb = new SolidBrush(btn.TextColor))
                            g.DrawString(btn.Label, font, tb, btn.Rect, centerFmt);
                    }
                }

                LayeredWindowHelper.ApplyPremultipliedBitmap(this, bmp, 255);
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
