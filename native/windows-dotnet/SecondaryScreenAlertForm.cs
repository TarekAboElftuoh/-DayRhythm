using System;
using System.Drawing;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace DayRhythm
{
    /// <summary>
    /// Full-screen alert on the SECONDARY monitor (the one you're not working on): a dimmed screen with
    /// a large pulsing card in the app's own theme (alert.html rendered by WebView2). The primary screen
    /// is left alone and focus is never stolen. Actions reuse the same callbacks as the small toast, so
    /// "done / snooze / stop" behave identically and still stop the alert on the phone.
    /// </summary>
    internal sealed class SecondaryScreenAlertForm : Form
    {
        private const string AlertHost = "gen-lang-client-0625331922.web.app";
        private const string AlertUrl = "https://gen-lang-client-0625331922.web.app/alert.html";

        private readonly NativeAlertPayload _payload;
        private readonly Action _onWaterConfirmed;
        private readonly Action<string, string> _onMedicationConfirmed;
        private readonly Action<NativeAlertPayload, int> _onSnoozed;
        private readonly Action _onDismissed;
        private WebView2 _web;
        private bool _actionDone;

        public static Screen FindSecondaryScreen()
        {
            return Screen.AllScreens.FirstOrDefault(s => !s.Primary);
        }

        public SecondaryScreenAlertForm(
            NativeAlertPayload payload,
            Screen target,
            Action onWaterConfirmed,
            Action<string, string> onMedicationConfirmed,
            Action<NativeAlertPayload, int> onSnoozed,
            Action onDismissed)
        {
            _payload = payload ?? new NativeAlertPayload();
            _onWaterConfirmed = onWaterConfirmed;
            _onMedicationConfirmed = onMedicationConfirmed;
            _onSnoozed = onSnoozed;
            _onDismissed = onDismissed;

            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            ShowInTaskbar = false;
            TopMost = true;
            BackColor = Color.Black;
            Bounds = target.Bounds;
        }

        protected override bool ShowWithoutActivation => true;

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= LayeredWindowHelper.WS_EX_TOOLWINDOW
                            | LayeredWindowHelper.WS_EX_TOPMOST
                            | LayeredWindowHelper.WS_EX_NOACTIVATE;
                return cp;
            }
        }

        public async Task LoadAsync(CoreWebView2Environment env, string wwwDir)
        {
            _web = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Black };
            Controls.Add(_web);
            await _web.EnsureCoreWebView2Async(env);
            CoreWebView2Settings s = _web.CoreWebView2.Settings;
            s.AreDefaultContextMenusEnabled = false;
            s.AreDevToolsEnabled = false;
            s.IsStatusBarEnabled = false;
            s.IsZoomControlEnabled = false;
            _web.CoreWebView2.SetVirtualHostNameToFolderMapping(AlertHost, wwwDir, CoreWebView2HostResourceAccessKind.Allow);
            _web.CoreWebView2.WebMessageReceived += OnWebMessage;
            _web.CoreWebView2.NavigationCompleted += (_, __) =>
            {
                try
                {
                    _web.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "alert-state", alert = _payload }));
                }
                catch
                {
                    // ignore
                }
            };
            _web.CoreWebView2.Navigate(AlertUrl + "?v=" + DateTime.UtcNow.Ticks);
        }

        private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            string type = "";
            int minutes = 0;
            try
            {
                using JsonDocument doc = JsonDocument.Parse(args.TryGetWebMessageAsString() ?? "{}");
                if (doc.RootElement.TryGetProperty("type", out JsonElement t)) type = t.GetString() ?? "";
                if (doc.RootElement.TryGetProperty("minutes", out JsonElement m) && m.ValueKind == JsonValueKind.Number) minutes = m.GetInt32();
            }
            catch
            {
                return;
            }

            if (_actionDone) return;
            switch (type)
            {
                case "alert-primary":
                    _actionDone = true;
                    bool isMed = _payload.isMedication || !string.IsNullOrWhiteSpace(_payload.medicationId);
                    if (_payload.isHydration) _onWaterConfirmed?.Invoke();
                    else if (isMed && !string.IsNullOrWhiteSpace(_payload.medicationId)) _onMedicationConfirmed?.Invoke(_payload.medicationId, _payload.medicationDoseTime24 ?? "");
                    else _onDismissed?.Invoke();
                    Close();
                    break;
                case "alert-snooze":
                    _actionDone = true;
                    _onSnoozed?.Invoke(_payload, minutes > 0 ? minutes : (_payload.snoozeMinutes > 0 ? _payload.snoozeMinutes : 5));
                    Close();
                    break;
                case "alert-dismiss":
                    _actionDone = true;
                    _onDismissed?.Invoke();
                    Close();
                    break;
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) _web?.Dispose();
            base.Dispose(disposing);
        }
    }
}
