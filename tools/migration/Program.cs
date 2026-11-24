using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace DayRhythm.Migration
{
    internal static class Program
    {
        private const string VirtualAppHost = "gen-lang-client-0625331922.web.app";
        private const string VirtualAppUrl = "https://gen-lang-client-0625331922.web.app/index.html";

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            var form = new Form
            {
                Width = 400,
                Height = 300,
                ShowInTaskbar = false,
                WindowState = FormWindowState.Minimized
            };

            var webView = new WebView2 { Dock = DockStyle.Fill };
            form.Controls.Add(webView);

            form.Load += async (_, __) =>
            {
                try
                {
                    Console.WriteLine("[DumpUserData] Initializing WebView2 environment...");
                    string tempUserDataDir = Path.Combine(Path.GetTempPath(), "DayRhythm_Migration_WebView2Data");
                    string lockFile = Path.Combine(tempUserDataDir, "EBWebView", "lockfile");
                    if (File.Exists(lockFile))
                    {
                        try { File.Delete(lockFile); } catch { }
                    }

                    // Locate www directory
                    string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                    string wwwDir = Path.Combine(baseDir, "..", "..", "..", "..", "native", "windows-dotnet", "www");
                    if (!Directory.Exists(wwwDir))
                    {
                        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                        wwwDir = Path.Combine(localAppData, "DayRhythm", "ota_releases");
                        if (Directory.Exists(wwwDir))
                        {
                            var dirs = Directory.GetDirectories(wwwDir);
                            if (dirs.Length > 0) wwwDir = dirs[dirs.Length - 1];
                        }
                    }
                    wwwDir = Path.GetFullPath(wwwDir);
                    Console.WriteLine($"[DumpUserData] Using wwwDir: {wwwDir}");
                    Console.WriteLine($"[DumpUserData] Using userDataDir: {tempUserDataDir}");

                    var env = await CoreWebView2Environment.CreateAsync(null, tempUserDataDir);
                    await webView.EnsureCoreWebView2Async(env);

                    webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                        VirtualAppHost,
                        wwwDir,
                        CoreWebView2HostResourceAccessKind.Allow
                    );

                    var tcs = new TaskCompletionSource<bool>();
                    webView.CoreWebView2.NavigationCompleted += (s, e) =>
                    {
                        if (e.IsSuccess) tcs.TrySetResult(true);
                        else tcs.TrySetException(new Exception($"Navigation failed: {e.WebErrorStatus}"));
                    };

                    Console.WriteLine("[DumpUserData] Navigating to VirtualAppUrl...");
                    webView.CoreWebView2.Navigate(VirtualAppUrl);

                    await tcs.Task;
                    Console.WriteLine("[DumpUserData] Navigation complete. Waiting 2.5s for storage to hydrate...");
                    await Task.Delay(2500);

                    string script = @"(() => {
                        const ls = {};
                        for (let i = 0; i < localStorage.length; i++) {
                            const k = localStorage.key(i);
                            ls[k] = localStorage.getItem(k);
                        }
                        return JSON.stringify(ls);
                    })()";

                    string rawJson = await webView.CoreWebView2.ExecuteScriptAsync(script);
                    Console.WriteLine($"[DumpUserData] Raw dump length: {rawJson?.Length ?? 0}");

                    // ExecuteScriptAsync returns a JSON-encoded string
                    string outputPath = Path.Combine(baseDir, "..", "..", "..", "migration_backup_localstorage.json");
                    outputPath = Path.GetFullPath(outputPath);

                    // Unescape JSON string if necessary
                    if (!string.IsNullOrEmpty(rawJson))
                    {
                        string unescaped = System.Text.Json.JsonSerializer.Deserialize<string>(rawJson);
                        File.WriteAllText(outputPath, unescaped, System.Text.Encoding.UTF8);
                        Console.WriteLine($"[DumpUserData] Successfully saved full storage dump to: {outputPath}");
                    }
                    else
                    {
                        Console.WriteLine("[DumpUserData] ERROR: Returned empty script result!");
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[DumpUserData] Exception: {ex}");
                }
                finally
                {
                    form.Close();
                    Application.Exit();
                }
            };

            Application.Run(form);
        }
    }
}
