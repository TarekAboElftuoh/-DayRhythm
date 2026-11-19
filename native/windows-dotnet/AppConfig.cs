using System;
using System.IO;
using System.Text.Json;
using Microsoft.Win32;

namespace DayRhythm
{
    internal sealed class UserSettings
    {
        public bool AutoLaunch { get; set; } = true;
        public string RemoteWsUrl { get; set; } = "";
    }

    internal static class AppConfig
    {
        public const string GithubRepo = "DAYRHYTHM_GITHUB_OWNER/DAYRHYTHM_GITHUB_REPO";
        public const string AppVersion = "DAYRHYTHM_APP_VERSION";
        public const string DefaultRemoteWsUrl = "DAYRHYTHM_REMOTE_WS_URL";

        private const string RunRegistryKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RunValueName = "DayRhythm";

        public static string GetVersionString()
        {
            if (string.IsNullOrWhiteSpace(AppVersion) || AppVersion.StartsWith("DAYRHYTHM_", StringComparison.Ordinal))
            {
                return "1.0.0";
            }
            return AppVersion.Trim();
        }

        public static string GetGithubRepo()
        {
            if (string.IsNullOrWhiteSpace(GithubRepo) || GithubRepo.Contains("DAYRHYTHM_GITHUB", StringComparison.Ordinal))
            {
                return "";
            }
            return GithubRepo.Trim();
        }

        public static string GetDataDir()
        {
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "DayRhythm"
            );
            Directory.CreateDirectory(dir);
            return dir;
        }

        public static UserSettings LoadSettings()
        {
            try
            {
                string path = Path.Combine(GetDataDir(), "config.json");
                if (File.Exists(path))
                {
                    string json = File.ReadAllText(path);
                    UserSettings parsed = JsonSerializer.Deserialize<UserSettings>(json);
                    if (parsed != null)
                    {
                        return parsed;
                    }
                }
            }
            catch
            {
                // Fallback to defaults
            }

            string defaultWs = DefaultRemoteWsUrl.StartsWith("DAYRHYTHM_", StringComparison.Ordinal)
                ? ""
                : DefaultRemoteWsUrl.Trim();
            return new UserSettings { AutoLaunch = true, RemoteWsUrl = defaultWs };
        }

        public static void SaveSettings(UserSettings settings)
        {
            try
            {
                string path = Path.Combine(GetDataDir(), "config.json");
                string json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(path, json);
            }
            catch
            {
                // Ignore disk write issues
            }
        }

        public static void ApplyAutoLaunch(bool enabled)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunRegistryKey, true))
                {
                    if (key == null) return;
                    if (enabled)
                    {
                        string exePath = Environment.ProcessPath;
                        if (!string.IsNullOrWhiteSpace(exePath))
                        {
                            key.SetValue(RunValueName, "\"" + exePath + "\" --background");
                        }
                    }
                    else
                    {
                        key.DeleteValue(RunValueName, false);
                    }
                }
            }
            catch
            {
                // Ignore registry access issues
            }
        }
    }
}
