using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace DayRhythm
{
    internal sealed class MainForm : Form
    {
        // Permanent Firebase-authorized domain for gen-lang-client-0625331922
        private const string VirtualAppHost = "gen-lang-client-0625331922.web.app";
        private const string VirtualAppOrigin = "https://gen-lang-client-0625331922.web.app";
        private const string VirtualAppUrl = "https://gen-lang-client-0625331922.web.app/index.html";

        // Win32 DWM attributes to unify the Windows title bar color (#070A0F) with the app header
        private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
        private const int DWMWA_BORDER_COLOR = 34;
        private const int DWMWA_CAPTION_COLOR = 35;
        private const int DWMWA_TEXT_COLOR = 36;

        [DllImport("dwmapi.dll", PreserveSig = true)]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

        private readonly bool _startHidden;
        private readonly UserSettings _settings;
        private readonly BackgroundServices _bgServices;

        private WebView2 _webView;
        private CoreWebView2Environment _webViewEnv;
        private NotifyIcon _trayIcon;
        private DesktopCapsuleForm _capsuleForm;
        private SecondaryMonitorToastForm _activeToastForm;
        private SecondaryScreenAlertForm _activeScreenAlert;
        private LanBatteryServer _lanBatteryServer;
        private ToolStripMenuItem _wsStatusItem;
        private ToolStripMenuItem _capsuleMenuItem;
        private ToolStripMenuItem _secondaryScreenMenuItem;
        private ToolStripMenuItem _updateMenuItem;
        private ToolStripMenuItem _autoLaunchMenuItem;

        private bool _isQuitting;
        private bool _isDownloadingUpdate;
        private string _wsStatusText = "متصل 24/7 (Firestore لحظي)";
        private ReleaseUpdateInfo _pendingUpdate;
        private DateTime _lastLanBatteryUtc = DateTime.MinValue;
        private LanBatteryTelemetry _lastLanBattery;
        private bool _lanChargeAlertShownThisCycle;

        public MainForm(bool startHidden)
        {
            _startHidden = startHidden;
            _settings = AppConfig.LoadSettings();
            AppConfig.ApplyAutoLaunch(_settings.AutoLaunch);

            Text = "إيقاع اليوم | DayRhythm";
            BackColor = Color.FromArgb(7, 10, 15);
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

            _bgServices = new BackgroundServices(
                onWsStatusChanged: status => RunOnUi(() => UpdateWsStatus(status)),
                onWsMessageReceived: payload => RunOnUi(() => ForwardWsPayloadToWebView(payload)),
                onUpdateAvailable: info => RunOnUi(() => HandleUpdateAvailable(info)),
                onNetworkRecovered: () => RunOnUi(DispatchNetworkRecoveredToWebView)
            );

            InitializeTray(appIcon);
            InitializeDesktopCapsule();
            InitializeWebViewControl();

            _lanBatteryServer = new LanBatteryServer(OnLanBatteryTelemetry, OnLanMessageReceived);
            _lanBatteryServer.Start();

            HandleCreated += (_, __) => ApplyDarkObsidianTitleBar(Handle);
            Load += async (_, __) => await OnFormLoadedAsync();
            FormClosing += OnMainFormClosing;
        }

        internal static void ApplyDarkObsidianTitleBar(IntPtr hwnd)
        {
            if (hwnd == IntPtr.Zero) return;
            try
            {
                int darkMode = 1;
                DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, ref darkMode, sizeof(int));

                // COLORREF format is 0x00BBGGRR -> #070A0F => R=0x07, G=0x0A, B=0x0F => 0x000F0A07
                int captionColor = 0x000F0A07;
                DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, ref captionColor, sizeof(int));

                // Subtle title text #F4F4F5 => 0x00F5F4F4
                int textColor = 0x00F5F4F4;
                DwmSetWindowAttribute(hwnd, DWMWA_TEXT_COLOR, ref textColor, sizeof(int));

                // Subtle obsidian border #141B24 => 0x00241B14
                int borderColor = 0x00241B14;
                DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, ref borderColor, sizeof(int));
            }
            catch
            {
                // Safe no-op on older Windows versions
            }
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
            catch { }
            return SystemIcons.Application;
        }

        private static string ResolveWwwDirectory()
        {
            BackgroundServices.CleanupOldOtaReleases();
            if (BackgroundServices.HasNewerOtaVersion())
            {
                string otaWww = BackgroundServices.GetOtaWwwDir();
                if (File.Exists(Path.Combine(otaWww, "index.html")))
                {
                    return otaWww;
                }
            }
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
                DefaultBackgroundColor = Color.FromArgb(7, 10, 15),
            };
            Controls.Add(_webView);
        }

        private void InitializeTray(Icon appIcon)
        {
            ContextMenuStrip menu = new ContextMenuStrip
            {
                RightToLeft = RightToLeft.Yes,
                Renderer = new DayRhythmMenuRenderer(),
                BackColor = Color.FromArgb(11, 14, 20),
                ForeColor = Color.FromArgb(228, 228, 231),
                Font = new Font("Segoe UI", 9.2f, FontStyle.Regular, GraphicsUnit.Point),
                Padding = new Padding(2, 4, 2, 4),
            };

            ToolStripMenuItem titleItem = new ToolStripMenuItem($"إيقاع اليوم | DayRhythm (v{BackgroundServices.GetEffectiveLocalVersion()})")
            {
                Enabled = false,
            };
            _wsStatusItem = new ToolStripMenuItem($"المزامنة: {_wsStatusText}")
            {
                Enabled = false,
            };

            ToolStripMenuItem openItem = new ToolStripMenuItem("فتح النافذة", null, (_, __) => ShowAndFocusWindow());
            ToolStripMenuItem reloadItem = new ToolStripMenuItem("تحديث الواجهة", null, (_, __) => _webView?.Reload());

            _capsuleMenuItem = new ToolStripMenuItem("كبسولة سطح المكتب العائمة")
            {
                CheckOnClick = true,
                Checked = _settings.ShowDesktopCapsule,
            };
            _capsuleMenuItem.CheckedChanged += (_, __) =>
            {
                bool show = _capsuleMenuItem.Checked;
                _settings.ShowDesktopCapsule = show;
                AppConfig.SaveSettings(_settings);
                if (show) _capsuleForm?.ShowFloating();
                else _capsuleForm?.Hide();
            };

            _updateMenuItem = new ToolStripMenuItem("فحص التحديثات الآن", null, async (_, __) =>
            {
                await RunInteractiveUpdateCheckAsync();
            });

            _autoLaunchMenuItem = new ToolStripMenuItem("التشغيل تلقائياً مع ويندوز")
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

            _secondaryScreenMenuItem = new ToolStripMenuItem("إظهار الإشعارات على الشاشة الثانية تلقائياً")
            {
                CheckOnClick = true,
                Checked = _settings.AlertsOnSecondaryScreen,
            };
            _secondaryScreenMenuItem.CheckedChanged += (_, __) =>
            {
                _settings.AlertsOnSecondaryScreen = _secondaryScreenMenuItem.Checked;
                AppConfig.SaveSettings(_settings);
                _capsuleForm?.SnapToMonitor(_settings.AlertsOnSecondaryScreen);
            };

            menu.Items.Add(titleItem);
            menu.Items.Add(_wsStatusItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(openItem);
            menu.Items.Add(_capsuleMenuItem);
            menu.Items.Add(_secondaryScreenMenuItem);
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
                if (_pendingUpdate != null) await InstallPendingUpdateAsync();
                else ShowAndFocusWindow();
            };
        }

        private void DispatchUpdateStatusToWebView(string status, string version = "", string message = "")
        {
            if (_webView?.CoreWebView2 == null) return;
            string detailJson = JsonSerializer.Serialize(new { status, version, message });
            _ = _webView.CoreWebView2.ExecuteScriptAsync(
                $"window.dispatchEvent(new CustomEvent('dayrhythm:update-status', {{ detail: {detailJson} }}));"
            );
        }

        private async Task RunInteractiveUpdateCheckAsync()
        {
            if (_isDownloadingUpdate) return;
            DispatchUpdateStatusToWebView("checking", BackgroundServices.GetEffectiveLocalVersion());

            try
            {
                if (_pendingUpdate != null)
                {
                    await InstallPendingUpdateAsync();
                    return;
                }

                ReleaseUpdateInfo found = await _bgServices.CheckForUpdateAsync(notifyCallback: false);
                if (found == null)
                {
                    string curVer = BackgroundServices.GetEffectiveLocalVersion();
                    DispatchUpdateStatusToWebView("up_to_date", curVer);
                    ShowTrayBalloon("إيقاع اليوم محدّث ✓", $"أنت تستخدم أحدث إصدار (v{curVer}).");
                }
                else
                {
                    _pendingUpdate = found;
                    await InstallPendingUpdateAsync();
                }
            }
            catch
            {
                DispatchUpdateStatusToWebView("error", "", "تعذر فحص التحديثات — تحقق من اتصال الإنترنت.");
            }
        }

        private async Task OnFormLoadedAsync()
        {
            try { File.AppendAllText(Path.Combine(AppConfig.GetDataDir(), "main_entry.log"), $"[{DateTime.UtcNow:O}] OnFormLoadedAsync started\n"); } catch {}
            ApplyDarkObsidianTitleBar(Handle);

            if (_startHidden)
            {
                WindowState = FormWindowState.Minimized;
                ShowInTaskbar = false;
                Hide();
            }

            try
            {
                string userDataDir = Path.Combine(AppConfig.GetDataDir(), "WebView2Data");
                // The app lives in the tray most of the time: stop Chromium from throttling timers in a
                // hidden/minimized window, otherwise alerts could fire up to a minute late.
                var envOptions = new CoreWebView2EnvironmentOptions(
                    "--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows"
                );
                _webViewEnv = await CoreWebView2Environment.CreateAsync(null, userDataDir, envOptions);
                await _webView.EnsureCoreWebView2Async(_webViewEnv);

                _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;

                string wwwDir = ResolveWwwDirectory();
                _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    VirtualAppHost,
                    wwwDir,
                    CoreWebView2HostResourceAccessKind.Allow
                );

                // The desktop capsule renders the app's own capsule page (same theme as the app).
                if (_capsuleForm != null)
                {
                    try { await _capsuleForm.AttachWebContentAsync(_webViewEnv, wwwDir); }
                    catch { /* capsule is optional */ }
                }

                _webView.CoreWebView2.WebMessageReceived += (_, args) =>
                {
                    try
                    {
                        string msg = args.TryGetWebMessageAsString();
                        if (string.IsNullOrWhiteSpace(msg)) return;
                        if (string.Equals(msg, "install-update", StringComparison.OrdinalIgnoreCase))
                        {
                            RunOnUi(() => _ = InstallPendingUpdateAsync());
                            return;
                        }
                        if (string.Equals(msg, "check-updates", StringComparison.OrdinalIgnoreCase))
                        {
                            RunOnUi(() => _ = RunInteractiveUpdateCheckAsync());
                            return;
                        }
                        if (msg.StartsWith("{", StringComparison.Ordinal))
                        {
                            using (JsonDocument doc = JsonDocument.Parse(msg))
                            {
                                if (doc.RootElement.TryGetProperty("type", out JsonElement typeEl))
                                {
                                    string msgType = typeEl.GetString() ?? "";
                                    if (string.Equals(msgType, "capsule-state", StringComparison.OrdinalIgnoreCase))
                                    {
                                        CapsuleStatePayload payload = JsonSerializer.Deserialize<CapsuleStatePayload>(msg);
                                        if (payload != null)
                                        {
                                            // Guard: If LAN reported the phone charging within the last 30s, keep charging telemetry active
                                            if (_lastLanBattery != null && _lastLanBattery.EffectiveCharging && (DateTime.UtcNow - _lastLanBatteryUtc).TotalSeconds < 30)
                                            {
                                                payload.phoneCharging = true;
                                                payload.phoneBatteryPct = _lastLanBattery.EffectiveLevel;
                                                payload.phoneChargeLimitPct = _lastLanBattery.EffectiveLimit;
                                                payload.phoneChargeEtaMin = _lastLanBattery.EffectiveEta;
                                            }
                                            RunOnUi(() => _capsuleForm?.UpdateState(payload));
                                        }
                                    }
                                    else if (string.Equals(msgType, "show-native-capsule", StringComparison.OrdinalIgnoreCase))
                                    {
                                        RunOnUi(() =>
                                        {
                                            _settings.ShowDesktopCapsule = true;
                                            AppConfig.SaveSettings(_settings);
                                            if (_capsuleMenuItem != null) _capsuleMenuItem.Checked = true;
                                            _capsuleForm?.ShowFloating();
                                        });
                                    }
                                    else if (string.Equals(msgType, "native-alert", StringComparison.OrdinalIgnoreCase))
                                    {
                                        NativeAlertPayload alertPayload = JsonSerializer.Deserialize<NativeAlertPayload>(msg);
                                        if (alertPayload != null)
                                        {
                                            RunOnUi(() => ShowSecondaryMonitorAlert(alertPayload));
                                        }
                                    }
                                    else if (string.Equals(msgType, "stop-alert", StringComparison.OrdinalIgnoreCase))
                                    {
                                        RunOnUi(() =>
                                        {
                                            if (_activeToastForm != null && !_activeToastForm.IsDisposed)
                                            {
                                                _activeToastForm.Close();
                                                _activeToastForm.Dispose();
                                                _activeToastForm = null;
                                            }
                                            CloseActiveScreenAlert();
                                        });
                                    }
                                    else if (string.Equals(msgType, "lan_broadcast", StringComparison.OrdinalIgnoreCase))
                                    {
                                        if (doc.RootElement.TryGetProperty("payload", out JsonElement payloadEl))
                                        {
                                            string payloadJson = payloadEl.GetRawText();
                                            _ = _lanBatteryServer?.BroadcastAsync(payloadJson);
                                        }
                                    }
                                    else if (string.Equals(msgType, "get-lan-pairing-code", StringComparison.OrdinalIgnoreCase))
                                    {
                                        string code = LanSecurityManager.GetPairingCode();
                                        string js = $"window.dispatchEvent(new CustomEvent('dayrhythm:lan-pairing-code', {{ detail: {JsonSerializer.Serialize(code)} }}));";
                                        _ = _webView.CoreWebView2.ExecuteScriptAsync(js);
                                    }
                                    else if (string.Equals(msgType, "set-lan-pairing-key", StringComparison.OrdinalIgnoreCase))
                                    {
                                        if (doc.RootElement.TryGetProperty("key", out JsonElement keyEl))
                                        {
                                            LanSecurityManager.SetPairingKeyFromBase64(keyEl.GetString());
                                        }
                                    }
                                }
                            }
                        }
                    }
                    catch { }
                };

                _webView.CoreWebView2.PermissionRequested += (_, args) =>
                {
                    if (args.Uri != null && args.Uri.StartsWith(VirtualAppOrigin, StringComparison.OrdinalIgnoreCase))
                    {
                        args.State = CoreWebView2PermissionState.Allow;
                    }
                };

                _webView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;
                // Windows' clock drifts (it was ~15 s fast) and only resyncs occasionally, so the PC
                // rang before the phone. Measure real time and let the page fire on it instead.
                _webView.CoreWebView2.NavigationCompleted += (_, __) => PushClockOffsetToWeb();
                _ = RefreshClockOffsetLoopAsync();
                _webView.CoreWebView2.Navigate(VirtualAppUrl);
                _bgServices.Start(_settings.RemoteWsUrl);
                try { File.AppendAllText(Path.Combine(AppConfig.GetDataDir(), "main_entry.log"), $"[{DateTime.UtcNow:O}] OnFormLoadedAsync completed successfully\n"); } catch {}
            }
            catch (Exception ex)
            {
                try { File.AppendAllText(Path.Combine(AppConfig.GetDataDir(), "main_entry.log"), $"[{DateTime.UtcNow:O}] OnFormLoadedAsync exception: {ex}\n"); } catch {}
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
                try { Process.Start(new ProcessStartInfo { FileName = uri, UseShellExecute = true }); } catch { }
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
                    BackColor = Color.FromArgb(7, 10, 15),
                    StartPosition = FormStartPosition.CenterParent,
                    Icon = Icon,
                };
                popupForm.HandleCreated += (_, __) => ApplyDarkObsidianTitleBar(popupForm.Handle);

                WebView2 popupWeb = new WebView2
                {
                    Dock = DockStyle.Fill,
                    DefaultBackgroundColor = Color.FromArgb(7, 10, 15),
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
            if (string.IsNullOrWhiteSpace(rawUrl) || string.Equals(rawUrl, "about:blank", StringComparison.OrdinalIgnoreCase))
                return true;
            if (!Uri.TryCreate(rawUrl, UriKind.Absolute, out Uri uri)) return false;
            string host = uri.Host.ToLowerInvariant();
            return host == VirtualAppHost
                || host == "localhost"
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

        private static readonly int WM_ACTIVATE_DAYRHYTHM = Program.RegisterWindowMessage(Program.ShowWindowMessageName);

        protected override void WndProc(ref Message m)
        {
            if (WM_ACTIVATE_DAYRHYTHM != 0 && m.Msg == WM_ACTIVATE_DAYRHYTHM)
            {
                RunOnUi(ShowAndFocusWindow);
                return;
            }
            base.WndProc(ref m);
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

        private void DispatchNetworkRecoveredToWebView()
        {
            if (_webView?.CoreWebView2 == null) return;
            _ = _webView.CoreWebView2.ExecuteScriptAsync(
                "window.dispatchEvent(new Event('dayrhythm:network-recovered'));"
            );
        }

        private void HandleUpdateAvailable(ReleaseUpdateInfo info)
        {
            _pendingUpdate = info;
            if (info != null && !string.IsNullOrWhiteSpace(info.WebOtaZipUrl) && !_isDownloadingUpdate)
            {
                _ = InstallPendingUpdateAsync();
                return;
            }

            if (_updateMenuItem != null && info != null)
            {
                _updateMenuItem.Text = $"تثبيت التحديث الجديد ({info.Tag})";
            }
        }

        private async Task InstallPendingUpdateAsync()
        {
            if (_isDownloadingUpdate || _pendingUpdate == null) return;
            _isDownloadingUpdate = true;

            try
            {
                if (!string.IsNullOrWhiteSpace(_pendingUpdate.WebOtaZipUrl))
                {
                    DispatchUpdateStatusToWebView("downloading", _pendingUpdate.Tag);
                    string newWwwDir = await _bgServices.ApplyWebOtaUpdateAsync(_pendingUpdate);
                    if (!string.IsNullOrWhiteSpace(newWwwDir))
                    {
                        string tagDone = _pendingUpdate.Tag;
                        _pendingUpdate = null;
                        RunOnUi(() =>
                        {
                            if (_updateMenuItem != null)
                            {
                                _updateMenuItem.Text = "فحص التحديثات الآن";
                            }
                            DispatchUpdateStatusToWebView("applied", tagDone);
                            if (_webView?.CoreWebView2 != null)
                            {
                                _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                                    VirtualAppHost,
                                    newWwwDir,
                                    CoreWebView2HostResourceAccessKind.Allow
                                );
                                _webView.CoreWebView2.Navigate(VirtualAppUrl + "?v=" + Uri.EscapeDataString(tagDone));
                            }
                            if (_capsuleForm != null && _webViewEnv != null)
                            {
                                _ = _capsuleForm.AttachWebContentAsync(_webViewEnv, newWwwDir);
                            }
                            ShowTrayBalloon("تم التحديث بنجاح ✓", $"تم تحديث إيقاع اليوم فوراً إلى {tagDone}.");
                        });
                        return;
                    }
                }

                DispatchUpdateStatusToWebView("downloading", _pendingUpdate.Tag);
                ShowTrayBalloon("جاري تنزيل التحديث...", $"جاري تحميل الإصدار {_pendingUpdate.Tag}.");
                bool started = await _bgServices.DownloadAndLaunchUpdateAsync(_pendingUpdate);
                if (started)
                {
                    _isQuitting = true;
                    Close();
                }
                else
                {
                    DispatchUpdateStatusToWebView("error", "", "تعذر تحميل التحديث حالياً.");
                }
            }
            finally
            {
                _isDownloadingUpdate = false;
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

        private void InitializeDesktopCapsule()
        {
            _capsuleForm = new DesktopCapsuleForm(
                _settings,
                onOpenMainWindow: () => RunOnUi(ShowAndFocusWindow),
                onVisibilityChanged: isVisible => RunOnUi(() =>
                {
                    if (_capsuleMenuItem != null && _capsuleMenuItem.Checked != isVisible)
                    {
                        _capsuleMenuItem.Checked = isVisible;
                    }
                }),
                onQuickWater: () => RunOnUi(() =>
                {
                    if (_webView?.CoreWebView2 != null)
                    {
                        _ = _webView.CoreWebView2.ExecuteScriptAsync(
                            "window.dispatchEvent(new CustomEvent('dayrhythm:water-confirmed'));"
                        );
                    }
                }),
                onQuickMedication: () => RunOnUi(() =>
                {
                    if (_webView?.CoreWebView2 != null)
                    {
                        _ = _webView.CoreWebView2.ExecuteScriptAsync(
                            "window.dispatchEvent(new CustomEvent('dayrhythm:quick-med-confirm'));"
                        );
                    }
                }),
                onPrefsChangedByUser: (orientation, size) =>
                {
                    string detailJson = JsonSerializer.Serialize(new { orientation, size });
                    DispatchToWeb($"window.dispatchEvent(new CustomEvent('dayrhythm:capsule-prefs', {{ detail: {detailJson} }}));");
                }
            );
            if (_settings.ShowDesktopCapsule)
            {
                _capsuleForm.ShowFloating();
            }
        }

        private void CloseActiveScreenAlert()
        {
            if (_activeScreenAlert != null && !_activeScreenAlert.IsDisposed)
            {
                _activeScreenAlert.Close();
                _activeScreenAlert.Dispose();
            }
            _activeScreenAlert = null;
        }

        private long _clockOffsetMs;

        private void PushClockOffsetToWeb()
        {
            long off = _clockOffsetMs;
            DispatchToWeb($"window.__drClockOffsetMs={off};window.dispatchEvent(new CustomEvent('dayrhythm:clock-offset',{{detail:{off}}}));");
        }

        private async System.Threading.Tasks.Task RefreshClockOffsetLoopAsync()
        {
            while (!_isQuitting)
            {
                long? off = await System.Threading.Tasks.Task.Run(NetworkClock.TryGetOffsetMs);
                if (off.HasValue)
                {
                    _clockOffsetMs = off.Value;
                    PushClockOffsetToWeb();
                }
                await System.Threading.Tasks.Task.Delay(off.HasValue ? TimeSpan.FromMinutes(30) : TimeSpan.FromMinutes(2));
            }
        }

        private void DispatchToWeb(string script)
        {
            RunOnUi(() =>
            {
                if (_webView?.CoreWebView2 != null) _ = _webView.CoreWebView2.ExecuteScriptAsync(script);
            });
        }

        /// <summary>
        /// Two monitors + "alerts on secondary screen": take over the whole secondary screen with a big,
        /// pulsing alert (the screen you're not working on). Returns false to fall back to the small card.
        /// </summary>
        private bool TryShowFullScreenSecondaryAlert(NativeAlertPayload payload)
        {
            Screen secondary = SecondaryScreenAlertForm.FindSecondaryScreen();
            if (!_settings.AlertsOnSecondaryScreen || secondary == null || _webViewEnv == null) return false;
            try
            {
                CloseActiveScreenAlert();
                int fallbackSnooze = payload != null && payload.snoozeMinutes > 0 ? payload.snoozeMinutes : 5;
                var form = new SecondaryScreenAlertForm(
                    payload,
                    secondary,
                    onWaterConfirmed: () => DispatchToWeb("window.dispatchEvent(new CustomEvent('dayrhythm:water-confirmed'));"),
                    onMedicationConfirmed: (medId, doseTime24) =>
                    {
                        string detailJson = JsonSerializer.Serialize(new { medicationId = medId ?? "", doseTime24 = doseTime24 ?? "" });
                        DispatchToWeb($"window.dispatchEvent(new CustomEvent('dayrhythm:medication-confirmed', {{ detail: {detailJson} }}));");
                    },
                    onSnoozed: (alertPayload, minutes) =>
                    {
                        string detailJson = JsonSerializer.Serialize(new
                        {
                            id = alertPayload?.id ?? "",
                            emoji = alertPayload?.emoji ?? "🔔",
                            title = alertPayload?.title ?? "",
                            sourceLabel = alertPayload?.sourceLabel ?? "تنبيه مؤجّل",
                            category = alertPayload?.category ?? "general",
                            isHydration = alertPayload?.isHydration ?? false,
                            medicationId = alertPayload?.medicationId ?? "",
                            medicationDoseTime24 = alertPayload?.medicationDoseTime24 ?? "",
                            minutes = minutes > 0 ? minutes : fallbackSnooze,
                        });
                        DispatchToWeb($"window.dispatchEvent(new CustomEvent('dayrhythm:alert-snoozed', {{ detail: {detailJson} }}));");
                    },
                    onDismissed: () => DispatchToWeb("window.dispatchEvent(new CustomEvent('dayrhythm:alert-dismissed'));")
                );
                _activeScreenAlert = form;
                form.FormClosed += (_, __) => { if (_activeScreenAlert == form) _activeScreenAlert = null; };
                form.Show();
                _ = form.LoadAsync(_webViewEnv, ResolveWwwDirectory());
                return true;
            }
            catch
            {
                return false;
            }
        }

        private void ShowSecondaryMonitorAlert(NativeAlertPayload payload)
        {
            if (TryShowFullScreenSecondaryAlert(payload)) return;
            try
            {
                if (_activeToastForm != null && !_activeToastForm.IsDisposed)
                {
                    _activeToastForm.Close();
                    _activeToastForm.Dispose();
                    _activeToastForm = null;
                }

                int fallbackSnooze = payload != null && payload.snoozeMinutes > 0 ? payload.snoozeMinutes : 5;

                _activeToastForm = new SecondaryMonitorToastForm(
                    payload,
                    preferSecondaryScreen: _settings.AlertsOnSecondaryScreen,
                    onWaterConfirmed: () => RunOnUi(() =>
                    {
                        if (_webView?.CoreWebView2 != null)
                        {
                            _ = _webView.CoreWebView2.ExecuteScriptAsync(
                                "window.dispatchEvent(new CustomEvent('dayrhythm:water-confirmed'));"
                            );
                        }
                    }),
                    onMedicationConfirmed: (medId, doseTime24) => RunOnUi(() =>
                    {
                        if (_webView?.CoreWebView2 != null)
                        {
                            string detailJson = JsonSerializer.Serialize(new { medicationId = medId ?? "", doseTime24 = doseTime24 ?? "" });
                            _ = _webView.CoreWebView2.ExecuteScriptAsync(
                                $"window.dispatchEvent(new CustomEvent('dayrhythm:medication-confirmed', {{ detail: {detailJson} }}));"
                            );
                        }
                    }),
                    onSnoozed: (alertPayload, minutes) => RunOnUi(() =>
                    {
                        if (_webView?.CoreWebView2 != null)
                        {
                            string detailJson = JsonSerializer.Serialize(new
                            {
                                id = alertPayload?.id ?? "",
                                emoji = alertPayload?.emoji ?? "🔔",
                                title = alertPayload?.title ?? "",
                                sourceLabel = alertPayload?.sourceLabel ?? "تنبيه مؤجّل",
                                category = alertPayload?.category ?? "general",
                                isHydration = alertPayload?.isHydration ?? false,
                                medicationId = alertPayload?.medicationId ?? "",
                                medicationDoseTime24 = alertPayload?.medicationDoseTime24 ?? "",
                                minutes = minutes > 0 ? minutes : fallbackSnooze,
                            });
                            _ = _webView.CoreWebView2.ExecuteScriptAsync(
                                $"window.dispatchEvent(new CustomEvent('dayrhythm:alert-snoozed', {{ detail: {detailJson} }}));"
                            );
                        }
                    }),
                    onDismissed: () => RunOnUi(() =>
                    {
                        if (_webView?.CoreWebView2 != null)
                        {
                            _ = _webView.CoreWebView2.ExecuteScriptAsync(
                                "window.dispatchEvent(new CustomEvent('dayrhythm:alert-dismissed'));"
                            );
                        }
                    })
                );
                _activeToastForm.Show();
            }
            catch { }
        }

        private void OnMainFormClosing(object sender, FormClosingEventArgs e)
        {
            try { File.AppendAllText(Path.Combine(AppConfig.GetDataDir(), "main_entry.log"), $"[{DateTime.UtcNow:O}] OnMainFormClosing called: reason={e.CloseReason}, isQuitting={_isQuitting}\n"); } catch {}
            if (!_isQuitting && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
                ShowInTaskbar = false;
                return;
            }

            if (_activeToastForm != null && !_activeToastForm.IsDisposed)
            {
                _activeToastForm.Close();
                _activeToastForm.Dispose();
                _activeToastForm = null;
            }

            if (_capsuleForm != null)
            {
                _capsuleForm.Close();
                _capsuleForm.Dispose();
                _capsuleForm = null;
            }

            if (_trayIcon != null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
                _trayIcon = null;
            }
            _lanBatteryServer?.Dispose();
            _lanBatteryServer = null;
            _bgServices.Dispose();
        }

        private void OnLanMessageReceived(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return;
            RunOnUi(() =>
            {
                if (_webView?.CoreWebView2 != null)
                {
                    string literal = JsonSerializer.Serialize(json);
                    string js = $"window.dispatchEvent(new CustomEvent('dayrhythm:ws-sync', {{ detail: {literal} }}));";
                    _ = _webView.CoreWebView2.ExecuteScriptAsync(js);
                }
            });
        }

        private void OnLanBatteryTelemetry(LanBatteryTelemetry telemetry)
        {
            if (telemetry == null) return;
            RunOnUi(() =>
            {
                _lastLanBattery = telemetry;
                _lastLanBatteryUtc = DateTime.UtcNow;

                int level = telemetry.EffectiveLevel;
                bool charging = telemetry.EffectiveCharging;
                int eta = telemetry.EffectiveEta;
                int limit = telemetry.EffectiveLimit;
                string device = telemetry.EffectiveDevice;

                // 1. Update floating desktop capsule live
                if (_capsuleForm != null)
                {
                    CapsuleStatePayload p = _capsuleForm.GetLastPayload() ?? new CapsuleStatePayload();
                    p.phoneBatteryPct = charging && level >= 0 ? level : -1;
                    p.phoneCharging = charging;
                    p.phoneChargeLimitPct = limit;
                    p.phoneChargeEtaMin = eta;
                    _capsuleForm.UpdateState(p);

                    // When charging begins, show floating capsule if not currently visible
                    if (charging && !_capsuleForm.Visible)
                    {
                        _capsuleForm.ShowFloating();
                    }
                }

                // 2. Dispatch to WebView2 web app
                if (_webView?.CoreWebView2 != null)
                {
                    // Serialized, never spliced as text: the device name arrives from the network, and
                    // pasting it inside quotes let any device on the Wi-Fi run code in this window.
                    string batteryJson = JsonSerializer.Serialize(new
                    {
                        levelPct = level,
                        charging,
                        chargeTimeRemainingMin = eta,
                        deviceLabel = device.Length > 40 ? device.Substring(0, 40) : device,
                        chargeLimitPct = limit,
                        updatedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    });
                    string js = $"window.__dayRhythmNativeBattery = {batteryJson};"
                        + "window.dispatchEvent(new CustomEvent('dayrhythm:native-battery', { detail: window.__dayRhythmNativeBattery }));";
                    _ = _webView.CoreWebView2.ExecuteScriptAsync(js);
                }

                // 3. Handle 90% alarm & unplug cancellation
                if ("alarm_dismiss".Equals(telemetry.action, StringComparison.OrdinalIgnoreCase) || (!charging && _activeToastForm != null && "charge".Equals(_activeToastForm.Tag as string, StringComparison.OrdinalIgnoreCase)))
                {
                    if (_activeToastForm != null && !_activeToastForm.IsDisposed)
                    {
                        _activeToastForm.Close();
                        _activeToastForm.Dispose();
                        _activeToastForm = null;
                    }
                    CloseActiveScreenAlert();
                    if (_webView?.CoreWebView2 != null)
                    {
                        _ = _webView.CoreWebView2.ExecuteScriptAsync("if (window.__stopSmartChargeAlert) window.__stopSmartChargeAlert();");
                    }
                }
                // Once per charging cycle: the phone repeats its battery packet every 10 s while on
                // the charger, which used to reopen this alert every 10 s.
                if (!charging || level < limit - 2)
                {
                    _lanChargeAlertShownThisCycle = false;
                }
                else if (level >= limit && !_lanChargeAlertShownThisCycle)
                {
                    _lanChargeAlertShownThisCycle = true;
                    NativeAlertPayload alert = new NativeAlertPayload
                    {
                        emoji = $"🔋 {level}%",
                        title = $"وصل شحن {device} إلى {level}% — افصل الشاحن الآن",
                        sourceLabel = "تنبيه الشحن الذكي (LAN)",
                        time12h = DateTime.Now.ToString("hh:mm tt"),
                        category = "charge",
                        isHydration = false,
                        isContinuous = true,
                        durationSeconds = 120,
                    };
                    ShowSecondaryMonitorAlert(alert);
                    if (_activeToastForm != null)
                    {
                        _activeToastForm.Tag = "charge";
                    }
                }
            });
        }

        private void RunOnUi(Action action)
        {
            if (IsDisposed) return;
            if (InvokeRequired)
            {
                try { BeginInvoke(action); } catch { }
            }
            else
            {
                action();
            }
        }
    }
}
