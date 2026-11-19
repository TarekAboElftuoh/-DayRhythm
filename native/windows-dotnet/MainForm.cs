using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace DayRhythm
{
    internal sealed class MainForm : Form
    {
        private readonly bool _startHidden;
        private readonly UserSettings _settings;
        private readonly LocalWebServer _localServer;
        private readonly BackgroundServices _bgServices;

        private WebView2 _webView;
        private CoreWebView2Environment _webViewEnv;
        private NotifyIcon _trayIcon;
        private ToolStripMenuItem _wsStatusItem;
        private ToolStripMenuItem _updateMenuItem;
        private ToolStripMenuItem _autoLaunchMenuItem;

        private bool _isQuitting;
        private bool _isDownloadingUpdate;
        private string _wsStatusText = "متصل 24/7 (Firestore لحظي)";
        private ReleaseUpdateInfo _pendingUpdate;

        public MainForm(bool startHidden)
        {
            _startHidden = startHidden;
            _settings = AppConfig.LoadSettings();
            AppConfig.ApplyAutoLaunch(_settings.AutoLaunch);

            Text = "إيقاع اليوم | DayRhythm";
            BackColor = Color.Black;
            ForeColor = Color.White;
            Width = 1280;
            Height = 860;
            MinimumSize = new Size(420, 700);
            StartPosition = FormStartPosition.CenterScreen;

            Icon appIcon = LoadAppIcon();
            if (appIcon != null)
            {
                Icon = appIcon;
            }

            string wwwDir = ResolveWwwDirectory();
            _localServer = new LocalWebServer(wwwDir, () => RunOnUi(() => _ = InstallPendingUpdateAsync()));
            _localServer.Start();

            _bgServices = new BackgroundServices(
                onWsStatusChanged: status => RunOnUi(() => UpdateWsStatus(status)),
                onWsMessageReceived: payload => RunOnUi(() => ForwardWsPayloadToWebView(payload)),
                onUpdateAvailable: info => RunOnUi(() => HandleUpdateAvailable(info))
            );

            InitializeTray(appIcon);
            InitializeWebViewControl();

            Load += async (_, __) => await OnFormLoadedAsync();
            FormClosing += OnMainFormClosing;
        }

        private static Icon LoadAppIcon()
        {
            try
            {
                string icoPath = Path.Combine(AppContext.BaseDirectory, "app.ico");
                if (File.Exists(icoPath))
                {
                    return new Icon(icoPath);
                }
            }
            catch
            {
                // Fallback to default icon
            }
            return SystemIcons.Application;
        }

        private static string ResolveWwwDirectory()
        {
            string baseWww = Path.Combine(AppContext.BaseDirectory, "www");
            if (File.Exists(Path.Combine(baseWww, "index.html")))
            {
                return baseWww;
            }
            string devDist = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "dist"));
            if (File.Exists(Path.Combine(devDist, "index.html")))
            {
                return devDist;
            }
            return baseWww;
        }

        private void InitializeWebViewControl()
        {
            _webView = new WebView2
            {
                Dock = DockStyle.Fill,
                DefaultBackgroundColor = Color.Black,
            };
            Controls.Add(_webView);
        }

        private void InitializeTray(Icon appIcon)
        {
            ContextMenuStrip menu = new ContextMenuStrip
            {
                RightToLeft = RightToLeft.Yes,
            };

            ToolStripMenuItem titleItem = new ToolStripMenuItem($"إيقاع اليوم | DayRhythm (v{AppConfig.GetVersionString()})")
            {
                Enabled = false,
            };
            _wsStatusItem = new ToolStripMenuItem($"المزامنة: {_wsStatusText}")
            {
                Enabled = false,
            };

            ToolStripMenuItem openItem = new ToolStripMenuItem("فتح النافذة", null, (_, __) => ShowAndFocusWindow());
            ToolStripMenuItem reloadItem = new ToolStripMenuItem("تحديث الواجهة", null, (_, __) => _webView?.Reload());

            _updateMenuItem = new ToolStripMenuItem("فحص التحديثات من GitHub الآن", null, async (_, __) =>
            {
                if (_pendingUpdate != null)
                {
                    await InstallPendingUpdateAsync();
                }
                else
                {
                    ReleaseUpdateInfo found = await _bgServices.CheckForUpdateAsync();
                    if (found == null)
                    {
                        ShowTrayBalloon("إيقاع اليوم محدّث ✓", $"أنت تستخدم أحدث إصدار (v{AppConfig.GetVersionString()}).");
                    }
                }
            });

            _autoLaunchMenuItem = new ToolStripMenuItem("التشغيل تلقائياً مع ويندوز (24/7 في الخلفية)")
            {
                CheckOnClick = true,
                Checked = _settings.AutoLaunch,
            };
            _autoLaunchMenuItem.CheckedChanged += (_, __) =>
            {
                _settings.AutoLaunch = _autoLaunchMenuItem.Checked;
                AppConfig.SaveSettings(_settings);
                AppConfig.ApplyAutoLaunch(_settings.AutoLaunch);
            };

            ToolStripMenuItem exitItem = new ToolStripMenuItem("خروج نهائي", null, (_, __) =>
            {
                _isQuitting = true;
                Close();
            });

            menu.Items.Add(titleItem);
            menu.Items.Add(_wsStatusItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(openItem);
            menu.Items.Add(reloadItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(_updateMenuItem);
            menu.Items.Add(_autoLaunchMenuItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(exitItem);

            _trayIcon = new NotifyIcon
            {
                Icon = appIcon ?? SystemIcons.Application,
                Text = "إيقاع اليوم | DayRhythm",
                ContextMenuStrip = menu,
                Visible = true,
            };

            _trayIcon.Click += (_, e) =>
            {
                if (e is MouseEventArgs me && me.Button == MouseButtons.Left)
                {
                    ShowAndFocusWindow();
                }
            };
            _trayIcon.BalloonTipClicked += async (_, __) =>
            {
                if (_pendingUpdate != null)
                {
                    await InstallPendingUpdateAsync();
                }
                else
                {
                    ShowAndFocusWindow();
                }
            };
        }

        private async Task OnFormLoadedAsync()
        {
            if (_startHidden)
            {
                WindowState = FormWindowState.Minimized;
                ShowInTaskbar = false;
                Hide();
            }

            try
            {
                string userDataDir = Path.Combine(AppConfig.GetDataDir(), "WebView2Data");
                _webViewEnv = await CoreWebView2Environment.CreateAsync(null, userDataDir);
                await _webView.EnsureCoreWebView2Async(_webViewEnv);

                _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;

                _webView.CoreWebView2.PermissionRequested += (_, args) =>
                {
                    if (args.Uri != null && (args.Uri.StartsWith("http://localhost", StringComparison.OrdinalIgnoreCase) ||
                                             args.Uri.StartsWith("http://127.0.0.1", StringComparison.OrdinalIgnoreCase)))
                    {
                        args.State = CoreWebView2PermissionState.Allow;
                    }
                };

                _webView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;
                _webView.CoreWebView2.NavigationCompleted += (_, __) =>
                {
                    if (_pendingUpdate != null)
                    {
                        InjectUpdateBanner(_pendingUpdate.Tag);
                    }
                };

                _webView.CoreWebView2.Navigate(_localServer.BaseUrl);
                _bgServices.Start(_settings.RemoteWsUrl);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "يلزم تثبيت Microsoft Edge WebView2 Runtime لتشغيل إيقاع اليوم.\n\n" + ex.Message,
                    "إيقاع اليوم | DayRhythm",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
            }
        }

        private async void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            string uri = e.Uri ?? "";
            if (!IsAuthOrAppUrl(uri))
            {
                e.Handled = true;
                try
                {
                    Process.Start(new ProcessStartInfo { FileName = uri, UseShellExecute = true });
                }
                catch
                {
                    // ignore
                }
                return;
            }

            CoreWebView2Deferral deferral = e.GetDeferral();
            try
            {
                Form popupForm = new Form
                {
                    Text = "تسجيل الدخول — إيقاع اليوم",
                    Width = 520,
                    Height = 680,
                    BackColor = Color.FromArgb(9, 9, 11),
                    StartPosition = FormStartPosition.CenterParent,
                    Icon = Icon,
                };
                WebView2 popupWeb = new WebView2
                {
                    Dock = DockStyle.Fill,
                    DefaultBackgroundColor = Color.FromArgb(9, 9, 11),
                };
                popupForm.Controls.Add(popupWeb);
                popupForm.Show(this);

                await popupWeb.EnsureCoreWebView2Async(_webViewEnv);
                popupWeb.CoreWebView2.WindowCloseRequested += (_, __) => RunOnUi(() =>
                {
                    if (!popupForm.IsDisposed) popupForm.Close();
                });

                e.NewWindow = popupWeb.CoreWebView2;
                e.Handled = true;
            }
            catch
            {
                e.Handled = false;
            }
            finally
            {
                deferral.Complete();
            }
        }

        private static bool IsAuthOrAppUrl(string rawUrl)
        {
            if (string.IsNullOrWhiteSpace(rawUrl)) return true;
            if (!Uri.TryCreate(rawUrl, UriKind.Absolute, out Uri uri)) return false;
            string host = uri.Host.ToLowerInvariant();
            return host == "localhost"
                || host == "127.0.0.1"
                || host == "accounts.google.com"
                || host.EndsWith(".google.com")
                || host.EndsWith(".googleapis.com")
                || host.EndsWith(".firebaseapp.com")
                || host.EndsWith(".web.app")
                || host.EndsWith(".gstatic.com");
        }

        private void ShowAndFocusWindow()
        {
            ShowInTaskbar = true;
            Show();
            if (WindowState == FormWindowState.Minimized)
            {
                WindowState = FormWindowState.Normal;
            }
            Activate();
        }

        private void UpdateWsStatus(string status)
        {
            _wsStatusText = status;
            if (_wsStatusItem != null)
            {
                _wsStatusItem.Text = $"المزامنة: {status}";
            }
            if (_trayIcon != null)
            {
                string tip = $"إيقاع اليوم | {status}";
                _trayIcon.Text = tip.Length > 63 ? tip.Substring(0, 63) : tip;
            }
        }

        private void ForwardWsPayloadToWebView(string payload)
        {
            if (_webView?.CoreWebView2 == null) return;
            string jsonLiteral = JsonSerializer.Serialize(payload);
            string script = $"window.dispatchEvent(new CustomEvent('dayrhythm:ws-sync', {{ detail: {jsonLiteral} }}));";
            _ = _webView.CoreWebView2.ExecuteScriptAsync(script);
        }

        private void HandleUpdateAvailable(ReleaseUpdateInfo info)
        {
            _pendingUpdate = info;
            if (_updateMenuItem != null)
            {
                _updateMenuItem.Text = $"🚀 تثبيت التحديث الجديد ({info.Tag})";
            }
            InjectUpdateBanner(info.Tag);
            ShowTrayBalloon(
                $"يتوفر إصدار جديد من إيقاع اليوم ({info.Tag})",
                "اضغط هنا لتنزيل وتثبيت التحديث مباشرة من GitHub Releases."
            );
        }

        private void InjectUpdateBanner(string tag)
        {
            if (_webView?.CoreWebView2 == null) return;
            string safeTag = (tag ?? "").Replace("'", "").Replace("\"", "").Replace("<", "").Replace(">", "");
            string js = $@"
                (() => {{
                    const prev = document.getElementById('dayrhythm-native-update-bar');
                    if (prev) prev.remove();
                    const bar = document.createElement('div');
                    bar.id = 'dayrhythm-native-update-bar';
                    bar.dir = 'rtl';
                    bar.style.cssText = 'position:fixed;bottom:18px;left:18px;z-index:2147483647;background:#06281e;color:#ecfdf5;border:1px solid #10b981;border-radius:16px;padding:12px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 16px 40px rgba(0,0,0,0.65);font-family:Segoe UI,system-ui,sans-serif;font-size:13px;';
                    bar.innerHTML = '<span>🚀 يتوفر تحديث جديد لإيقاع اليوم (<b>{safeTag}</b>)</span>'
                        + '<button id=""dr-upd-install"" style=""background:#10b981;color:#022c22;border:none;border-radius:10px;padding:7px 14px;font-weight:700;cursor:pointer;"">تثبيت الآن</button>'
                        + '<button id=""dr-upd-dismiss"" style=""background:transparent;color:#a7f3d0;border:none;cursor:pointer;font-size:16px;padding:0 4px;"">×</button>';
                    document.body.appendChild(bar);
                    document.getElementById('dr-upd-install')?.addEventListener('click', () => {{
                        fetch('/__dayrhythm_native/install-update', {{ method: 'POST' }}).catch(() => {{}});
                    }});
                    document.getElementById('dr-upd-dismiss')?.addEventListener('click', () => bar.remove());
                }})();
            ";
            _ = _webView.CoreWebView2.ExecuteScriptAsync(js);
        }

        private async Task InstallPendingUpdateAsync()
        {
            if (_isDownloadingUpdate || _pendingUpdate == null) return;
            _isDownloadingUpdate = true;
            ShowTrayBalloon("جاري تنزيل التحديث...", $"جاري تحميل الإصدار {_pendingUpdate.Tag} من GitHub Releases.");
            bool started = await _bgServices.DownloadAndLaunchUpdateAsync(_pendingUpdate);
            _isDownloadingUpdate = false;
            if (started)
            {
                _isQuitting = true;
                Close();
            }
        }

        private void ShowTrayBalloon(string title, string body)
        {
            if (_trayIcon == null) return;
            _trayIcon.BalloonTipTitle = title;
            _trayIcon.BalloonTipText = body;
            _trayIcon.BalloonTipIcon = ToolTipIcon.Info;
            _trayIcon.ShowBalloonTip(5000);
        }

        private void OnMainFormClosing(object sender, FormClosingEventArgs e)
        {
            if (!_isQuitting && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
                ShowInTaskbar = false;
                return;
            }

            if (_trayIcon != null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
                _trayIcon = null;
            }
            _bgServices.Dispose();
            _localServer.Dispose();
        }

        private void RunOnUi(Action action)
        {
            if (IsDisposed) return;
            if (InvokeRequired)
            {
                try
                {
                    BeginInvoke(action);
                }
                catch
                {
                    // ignore on shutdown
                }
            }
            else
            {
                action();
            }
        }
    }
}
