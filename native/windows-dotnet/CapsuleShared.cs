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
}
