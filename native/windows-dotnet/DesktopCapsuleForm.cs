using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
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
        public int phoneChargeEtaMin { get; set; } = -1;
        public string orientation { get; set; } = "";
        public string size { get; set; } = "";
    }

    internal sealed class DayRhythmMenuColorTable : ProfessionalColorTable
    {
        private static readonly Color BgSurface = Color.FromArgb(11, 14, 20);
        private static readonly Color BorderHairline = Color.FromArgb(39, 44, 54);
        private static readonly Color HoverSurface = Color.FromArgb(24, 34, 44);
        private static readonly Color AccentMint = Color.FromArgb(127, 255, 212);

        public override Color MenuBorder => BorderHairline;
        public override Color ToolStripDropDownBackground => BgSurface;
        public override Color ImageMarginGradientBegin => BgSurface;
        public override Color ImageMarginGradientMiddle => BgSurface;
        public override Color ImageMarginGradientEnd => BgSurface;
        public override Color MenuItemBorder => Color.FromArgb(65, 127, 255, 212);
        public override Color MenuItemSelected => HoverSurface;
        public override Color MenuItemSelectedGradientBegin => HoverSurface;
        public override Color MenuItemSelectedGradientEnd => HoverSurface;
        public override Color SeparatorDark => BorderHairline;
        public override Color SeparatorLight => Color.Transparent;
        public override Color CheckBackground => Color.FromArgb(26, 127, 255, 212);
        public override Color CheckSelectedBackground => Color.FromArgb(46, 127, 255, 212);
        public override Color CheckPressedBackground => AccentMint;
    }

    /// <summary>
    /// Custom Obsidian-Dark context menu renderer matching the DayRhythm app design tokens (#0B0E14, #272C36, #7FFFD4).
    /// Eliminates legacy WinForms light-gray chrome completely.
    /// </summary>
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
            using (Pen pen = new Pen(Color.FromArgb(46, 52, 64), 1f))
            {
                g.DrawRectangle(pen, rect);
            }
        }

        protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            Rectangle rc = new Rectangle(4, 1, e.Item.Width - 8, e.Item.Height - 2);
            if (e.Item.Selected && e.Item.Enabled)
            {
                using (GraphicsPath p = CreateSmallRoundPath(rc, 6))
                using (SolidBrush fill = new SolidBrush(Color.FromArgb(22, 34, 42)))
                using (Pen border = new Pen(Color.FromArgb(75, 127, 255, 212), 1f))
                {
                    g.FillPath(fill, p);
                    g.DrawPath(border, p);
                }
            }
        }

        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
        {
            if (!e.Item.Enabled)
            {
                e.TextColor = Color.FromArgb(113, 113, 122);
            }
            else if (e.Item is ToolStripMenuItem mi && mi.Checked)
            {
                e.TextColor = Color.FromArgb(127, 255, 212);
            }
            else if (e.Item.Selected)
            {
                e.TextColor = Color.White;
            }
            else
            {
                e.TextColor = Color.FromArgb(228, 228, 231);
            }
            base.OnRenderItemText(e);
        }

        protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
        {
            int y = e.Item.Height / 2;
            using (Pen pen = new Pen(Color.FromArgb(32, 255, 255, 255), 1f))
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

        private static GraphicsPath CreateSmallRoundPath(Rectangle b, int r)
        {
            int d = r * 2;
            GraphicsPath path = new GraphicsPath();
            path.AddArc(b.X, b.Y, d, d, 180, 90);
            path.AddArc(b.Right - d, b.Y, d, d, 270, 90);
            path.AddArc(b.Right - d, b.Bottom - d, d, d, 0, 90);
            path.AddArc(b.X, b.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }
    }

    /// <summary>
    /// Sleek Obsidian-Glass Emoji + Countdown floating Windows desktop capsule matching the DayRhythm app UI.
    /// Supports Horizontal & Vertical layouts, Small/Medium/Large sizes, Dual Timers, live Phone Charging % + ETA,
    /// and a bespoke dark context menu.
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
            DoubleBuffered = true;
            BackColor = Color.FromArgb(7, 9, 13);
            Cursor = Cursors.SizeAll;
            Opacity = 0.96;

            _tooltip = new ToolTip
            {
                AutoPopDelay = 6000,
                InitialDelay = 450,
                ReshowDelay = 200,
                ShowAlways = true,
            };

            RecalculateBounds();
            RestoreSavedPosition();

            Font menuFont = new Font("Segoe UI", 9.2f, FontStyle.Regular, GraphicsUnit.Point);
            _contextMenu = new ContextMenuStrip
            {
                RightToLeft = RightToLeft.Yes,
                Renderer = new DayRhythmMenuRenderer(),
                BackColor = Color.FromArgb(11, 14, 20),
                ForeColor = Color.FromArgb(228, 228, 231),
                Font = menuFont,
                ShowImageMargin = true,
                Padding = new Padding(2, 4, 2, 4),
            };

            ToolStripMenuItem quickWaterItem = CreateMenuItem("💧  تسجيل كوب ماء الآن (+1)", (_, __) => _onQuickWater?.Invoke());
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
            Invalidate();
        }

        private void SetSizeMode(string mode)
        {
            _sizeMode = NormalizeSize(mode);
            _settings.CapsuleSize = _sizeMode;
            AppConfig.SaveSettings(_settings);
            SyncMenuCheckmarks();
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

        private string FormatBatteryChipText()
        {
            if (!_phoneCharging || _phoneBatteryPct < 0) return "";
            if (_phoneChargeEtaMin > 0)
            {
                return $"⚡{_phoneBatteryPct}% · {_phoneChargeEtaMin}د";
            }
            return $"⚡{_phoneBatteryPct}%";
        }

        private void RefreshTooltip()
        {
            string line1 = string.IsNullOrWhiteSpace(_title) ? $"{_emoji} إيقاع اليوم" : $"{_emoji} {_title}";
            string line2 = _hasSecondaryTimer && !string.IsNullOrWhiteSpace(_secondaryTitle)
                ? $"\n{_secondaryEmoji} {_secondaryTitle}"
                : "";
            string line3 = _phoneCharging && _phoneBatteryPct >= 0
                ? (_phoneChargeEtaMin > 0
                    ? $"\n⚡ بطارية الهاتف: {_phoneBatteryPct}% (متبقي ~{_phoneChargeEtaMin} دقيقة)"
                    : $"\n⚡ بطارية الهاتف: {_phoneBatteryPct}% (قيد الشحن)")
                : "";
            _tooltip.SetToolTip(this, line1 + line2 + line3);
        }

        private void RecalculateBounds()
        {
            float scale = _sizeMode == "lg" ? 1.18f : _sizeMode == "sm" ? 0.86f : 1.0f;
            bool showBatt = _phoneCharging && _phoneBatteryPct >= 0;
            bool hasEta = showBatt && _phoneChargeEtaMin > 0;

            int desiredW;
            int desiredH;
            if (_isVertical)
            {
                desiredW = (int)Math.Round((hasEta ? 132 : 120) * scale);
                int rows = 1 + (_hasSecondaryTimer ? 1 : 0) + (showBatt ? 1 : 0);
                int rowH = (int)Math.Round(34 * scale);
                desiredH = rows * rowH + (int)Math.Round(12 * scale);
            }
            else
            {
                int battExtra = showBatt ? (hasEta ? 96 : 62) : 0;
                int baseW = (_hasSecondaryTimer ? 228 : 118) + battExtra;
                desiredW = (int)Math.Round(baseW * scale);
                desiredH = (int)Math.Round(40 * scale);
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

        private int CornerRadius => _isVertical ? 16 : Math.Max(14, Height / 2);

        private void ApplyRoundedRegion()
        {
            using (GraphicsPath path = CreateRoundedRectPath(new Rectangle(0, 0, Width, Height), CornerRadius))
            {
                Region = new Region(path);
            }
        }

        private static GraphicsPath CreateRoundedRectPath(Rectangle bounds, int radius)
        {
            int r = Math.Min(radius, Math.Min(bounds.Width, bounds.Height) / 2);
            int d = Math.Max(2, r * 2);
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
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

            float scale = _sizeMode == "lg" ? 1.18f : _sizeMode == "sm" ? 0.86f : 1.0f;
            var (clockText, urgentNow) = ComputeClock(_targetEpochMs, _fallbackCountdown, _isUrgent);

            Color accent = urgentNow
                ? Color.FromArgb(255, 107, 107)
                : _isNow
                    ? Color.FromArgb(74, 222, 128)
                    : Color.FromArgb(127, 255, 212);

            Rectangle outer = new Rectangle(0, 0, Width - 1, Height - 1);
            int radius = CornerRadius;

            using (GraphicsPath bgPath = CreateRoundedRectPath(outer, radius))
            using (LinearGradientBrush bgBrush = new LinearGradientBrush(
                outer,
                Color.FromArgb(16, 21, 30),
                Color.FromArgb(7, 8, 11),
                LinearGradientMode.Vertical))
            {
                g.FillPath(bgBrush, bgPath);

                // Subtle top obsidian-glass hairline sheen matching app cards
                using (Pen sheenPen = new Pen(Color.FromArgb(26, 255, 255, 255), 1f))
                {
                    g.DrawLine(sheenPen, radius, 1, Width - radius, 1);
                }

                // Crisp outer border (accent glow on hover/urgent, clean hairline at rest)
                Color borderColor = urgentNow
                    ? Color.FromArgb(185, 255, 107, 107)
                    : _isHovered
                        ? Color.FromArgb(145, accent.R, accent.G, accent.B)
                        : Color.FromArgb(46, 255, 255, 255);
                using (Pen borderPen = new Pen(borderColor, 1.2f))
                {
                    g.DrawPath(borderPen, bgPath);
                }
            }

            float emojiPt = 11.2f * scale;
            float clockPt = (clockText.Length > 5 ? 9.8f : 11.2f) * scale;
            string monoFontName = "Cascadia Mono";

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
                    int emojiW = (int)Math.Round(26 * scale);
                    int startX = (int)Math.Round(10 * scale);
                    int y = padY;

                    using (Font ef = new Font("Segoe UI Emoji", emojiPt, FontStyle.Regular, GraphicsUnit.Point))
                    using (SolidBrush eb = new SolidBrush(Color.White))
                        g.DrawString(_emoji, ef, eb, new Rectangle(startX, y, emojiW, rowH), centerFmt);

                    using (Font cf = new Font(monoFontName, clockPt, FontStyle.Bold, GraphicsUnit.Point))
                    using (SolidBrush cb = new SolidBrush(accent))
                        g.DrawString(clockText, cf, cb, new Rectangle(startX + emojiW + 2, y, Width - startX - emojiW - 8, rowH), leftFmt);

                    y += rowH;

                    if (_hasSecondaryTimer)
                    {
                        using (Pen sepPen = new Pen(Color.FromArgb(28, 255, 255, 255), 1f))
                            g.DrawLine(sepPen, 12, y, Width - 12, y);

                        var (secClock, secUrgent) = ComputeClock(_secondaryTargetEpochMs, _secondaryFallbackCountdown, _secondaryIsUrgent);
                        Color secAccent = secUrgent
                            ? Color.FromArgb(255, 107, 107)
                            : _secondaryIsNow
                                ? Color.FromArgb(74, 222, 128)
                                : _secondaryEmoji == "💧"
                                    ? Color.FromArgb(56, 189, 248)
                                    : Color.FromArgb(252, 211, 77);
                        float secClockPt = (secClock.Length > 5 ? 9.8f : 11.2f) * scale;

                        using (Font sef = new Font("Segoe UI Emoji", emojiPt, FontStyle.Regular, GraphicsUnit.Point))
                        using (SolidBrush seb = new SolidBrush(Color.White))
                            g.DrawString(_secondaryEmoji, sef, seb, new Rectangle(startX, y, emojiW, rowH), centerFmt);

                        using (Font scf = new Font(monoFontName, secClockPt, FontStyle.Bold, GraphicsUnit.Point))
                        using (SolidBrush scb = new SolidBrush(secAccent))
                            g.DrawString(secClock, scf, scb, new Rectangle(startX + emojiW + 2, y, Width - startX - emojiW - 8, rowH), leftFmt);

                        y += rowH;
                    }

                    string battText = FormatBatteryChipText();
                    if (!string.IsNullOrEmpty(battText))
                    {
                        using (Pen sepPen = new Pen(Color.FromArgb(28, 255, 255, 255), 1f))
                            g.DrawLine(sepPen, 12, y, Width - 12, y);

                        bool reachedLimit = _phoneBatteryPct >= _phoneChargeLimitPct;
                        Color battColor = reachedLimit ? Color.FromArgb(74, 222, 128) : Color.FromArgb(252, 211, 77);
                        using (Font bf = new Font("Segoe UI", 8.8f * scale, FontStyle.Bold, GraphicsUnit.Point))
                        using (SolidBrush bb = new SolidBrush(battColor))
                            g.DrawString(battText, bf, bb, new Rectangle(4, y, Width - 8, rowH), centerFmt);
                    }
                    return;
                }

                // Horizontal layout: [Emoji] [Countdown] | [Emoji] [Countdown] | [⚡% · ETA]
                int cursorX = (int)Math.Round(12 * scale);
                int emojiBoxW = (int)Math.Round(24 * scale);
                int clockBoxW = (int)Math.Round((clockText.Length > 5 ? 74 : 60) * scale);

                using (Font emojiFont = new Font("Segoe UI Emoji", emojiPt, FontStyle.Regular, GraphicsUnit.Point))
                using (SolidBrush emojiBrush = new SolidBrush(Color.White))
                    g.DrawString(_emoji, emojiFont, emojiBrush, new Rectangle(cursorX, 0, emojiBoxW, Height), centerFmt);
                cursorX += emojiBoxW + 2;

                using (Font clockFont = new Font(monoFontName, clockPt, FontStyle.Bold, GraphicsUnit.Point))
                using (SolidBrush clockBrush = new SolidBrush(accent))
                    g.DrawString(clockText, clockFont, clockBrush, new Rectangle(cursorX, 0, clockBoxW, Height), leftFmt);
                cursorX += clockBoxW + (int)Math.Round(4 * scale);

                if (_hasSecondaryTimer)
                {
                    using (Pen sepPen = new Pen(Color.FromArgb(34, 255, 255, 255), 1f))
                        g.DrawLine(sepPen, cursorX, 10, cursorX, Height - 10);
                    cursorX += (int)Math.Round(7 * scale);

                    var (secClock, secUrgent) = ComputeClock(_secondaryTargetEpochMs, _secondaryFallbackCountdown, _secondaryIsUrgent);
                    Color secAccent = secUrgent
                        ? Color.FromArgb(255, 107, 107)
                        : _secondaryIsNow
                            ? Color.FromArgb(74, 222, 128)
                            : _secondaryEmoji == "💧"
                                ? Color.FromArgb(56, 189, 248)
                                : Color.FromArgb(252, 211, 77);
                    float secClockPt = (secClock.Length > 5 ? 9.8f : 11.2f) * scale;
                    int secClockW = (int)Math.Round((secClock.Length > 5 ? 74 : 60) * scale);

                    using (Font secEmojiFont = new Font("Segoe UI Emoji", emojiPt, FontStyle.Regular, GraphicsUnit.Point))
                    using (SolidBrush secEmojiBrush = new SolidBrush(Color.White))
                        g.DrawString(_secondaryEmoji, secEmojiFont, secEmojiBrush, new Rectangle(cursorX, 0, emojiBoxW, Height), centerFmt);
                    cursorX += emojiBoxW + 2;

                    using (Font secClockFont = new Font(monoFontName, secClockPt, FontStyle.Bold, GraphicsUnit.Point))
                    using (SolidBrush secClockBrush = new SolidBrush(secAccent))
                        g.DrawString(secClock, secClockFont, secClockBrush, new Rectangle(cursorX, 0, secClockW, Height), leftFmt);
                    cursorX += secClockW + (int)Math.Round(4 * scale);
                }

                string hBattText = FormatBatteryChipText();
                if (!string.IsNullOrEmpty(hBattText))
                {
                    using (Pen sepPen = new Pen(Color.FromArgb(34, 255, 255, 255), 1f))
                        g.DrawLine(sepPen, cursorX, 10, cursorX, Height - 10);

                    bool reachedLimit = _phoneBatteryPct >= _phoneChargeLimitPct;
                    Color battColor = reachedLimit ? Color.FromArgb(74, 222, 128) : Color.FromArgb(252, 211, 77);
                    Rectangle battRect = new Rectangle(cursorX + 4, 0, Width - cursorX - 10, Height);
                    using (Font battFont = new Font("Segoe UI", 8.8f * scale, FontStyle.Bold, GraphicsUnit.Point))
                    using (SolidBrush battBrush = new SolidBrush(battColor))
                        g.DrawString(hBattText, battFont, battBrush, battRect, centerFmt);
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
                _tooltip?.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
