package app.dayrhythm.mobile;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Environment;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class AutoUpdateManager {
    public static class UpdateInfo {
        public final boolean hasUpdate;
        public final String latestTag;
        public final String apkDownloadUrl;

        public UpdateInfo(boolean hasUpdate, String latestTag, String apkDownloadUrl) {
            this.hasUpdate = hasUpdate;
            this.latestTag = latestTag;
            this.apkDownloadUrl = apkDownloadUrl;
        }
    }

    public static UpdateInfo checkLatestRelease(Context context) {
        String repo = BuildConfig.GITHUB_REPO;
        if (repo == null || repo.trim().isEmpty() || !repo.contains("/")) {
            return null;
        }

        HttpURLConnection conn = null;
        try {
            URL url = new URL("https://api.github.com/repos/" + repo.trim() + "/releases/latest");
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Accept", "application/vnd.github+json");
            conn.setRequestProperty("User-Agent", "DayRhythm-Android/" + BuildConfig.VERSION_NAME);

            if (conn.getResponseCode() != 200) {
                return null;
            }

            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) {
                    sb.append(line);
                }
            }

            JSONObject json = new JSONObject(sb.toString());
            String tag = json.optString("tag_name", "").trim();
            JSONArray assets = json.optJSONArray("assets");
            String apkUrl = "";
            if (assets != null) {
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject asset = assets.optJSONObject(i);
                    if (asset == null) continue;
                    String name = asset.optString("name", "");
                    if (name.toLowerCase().endsWith(".apk")) {
                        apkUrl = asset.optString("browser_download_url", "");
                        break;
                    }
                }
            }

            if (tag.isEmpty() || apkUrl.isEmpty()) {
                return null;
            }

            String current = "v" + BuildConfig.VERSION_NAME;
            boolean newer = isVersionNewer(tag, current);
            return new UpdateInfo(newer, tag, apkUrl);
        } catch (Exception ignored) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static boolean isVersionNewer(String remoteTag, String localTag) {
        String r = remoteTag.replaceFirst("^[vV]", "");
        String l = localTag.replaceFirst("^[vV]", "");
        String[] rp = r.split("\\.");
        String[] lp = l.split("\\.");
        int len = Math.max(rp.length, lp.length);
        for (int i = 0; i < len; i++) {
            int rv = parseIntSafe(i < rp.length ? rp[i] : "0");
            int lv = parseIntSafe(i < lp.length ? lp[i] : "0");
            if (rv > lv) return true;
            if (rv < lv) return false;
        }
        return false;
    }

    private static int parseIntSafe(String raw) {
        try {
            String digits = raw.replaceAll("[^0-9]", "");
            return digits.isEmpty() ? 0 : Integer.parseInt(digits);
        } catch (Exception e) {
            return 0;
        }
    }

    public static long enqueueApkDownload(Context context, String apkUrl, String tagName) {
        File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir != null) {
            File oldFile = new File(dir, "DayRhythm-Update.apk");
            if (oldFile.exists()) {
                //noinspection ResultOfMethodCallIgnored
                oldFile.delete();
            }
        }

        DownloadManager dm = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) return -1L;

        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(apkUrl));
        req.setTitle("تحديث إيقاع اليوم " + tagName);
        req.setDescription("جاري تنزيل أحدث إصدار تلقائياً...");
        req.setMimeType("application/vnd.android.package-archive");
        req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        req.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, "DayRhythm-Update.apk");
        return dm.enqueue(req);
    }

    public static void installDownloadedApk(Context context) {
        File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) return;
        File apkFile = new File(dir, "DayRhythm-Update.apk");
        if (!apkFile.exists()) return;

        Uri apkUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                apkFile
        );
        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(apkUri, "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(install);
    }
}
