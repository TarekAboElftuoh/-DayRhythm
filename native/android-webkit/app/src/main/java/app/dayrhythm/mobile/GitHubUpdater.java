package app.dayrhythm.mobile;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Environment;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class GitHubUpdater {
    public static final String KEY_OTA_VERSION = "ota_web_version";
    public static final String OTA_WWW_DIR = "ota_www";

    public static class UpdateInfo {
        public final boolean hasUpdate;
        public final String latestTag;
        public final String apkDownloadUrl;
        public final String webOtaZipUrl;

        public UpdateInfo(boolean hasUpdate, String latestTag, String apkDownloadUrl, String webOtaZipUrl) {
            this.hasUpdate = hasUpdate;
            this.latestTag = latestTag;
            this.apkDownloadUrl = apkDownloadUrl;
            this.webOtaZipUrl = webOtaZipUrl;
        }
    }

    public static File getOtaWwwDir(Context context) {
        return new File(context.getFilesDir(), OTA_WWW_DIR);
    }

    public static String getEffectiveLocalVersion(Context context) {
        String baseVer = BuildConfig.VERSION_NAME;
        if (context == null) return baseVer;
        try {
            File indexFile = new File(getOtaWwwDir(context), "index.html");
            if (indexFile.exists()) {
                SharedPreferences prefs = context.getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE);
                String otaVer = prefs.getString(KEY_OTA_VERSION, "");
                if (otaVer != null && !otaVer.trim().isEmpty() && isVersionNewer(otaVer, baseVer)) {
                    return otaVer.replaceFirst("^[vV]", "");
                }
            }
        } catch (Exception ignored) {
        }
        return baseVer;
    }

    public static UpdateInfo checkLatestRelease() {
        return checkLatestRelease(null);
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
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Accept", "application/vnd.github+json");
            conn.setRequestProperty("User-Agent", "DayRhythm-Android/" + getEffectiveLocalVersion(context));

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
            String webZipUrl = "";
            if (assets != null) {
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject asset = assets.optJSONObject(i);
                    if (asset == null) continue;
                    String name = asset.optString("name", "");
                    String dl = asset.optString("browser_download_url", "");
                    if ("dayrhythm-web-ota.zip".equalsIgnoreCase(name)) {
                        webZipUrl = dl;
                    } else if (name.toLowerCase().endsWith(".apk")) {
                        apkUrl = dl;
                    }
                }
            }

            if (tag.isEmpty() || (apkUrl.isEmpty() && webZipUrl.isEmpty())) {
                return null;
            }

            String localVer = getEffectiveLocalVersion(context);
            boolean newer = isVersionNewer(tag, "v" + localVer);
            return new UpdateInfo(newer, tag, apkUrl, webZipUrl);
        } catch (Exception ignored) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /**
     * Downloads lightweight dayrhythm-web-ota.zip (~1.5 MB) and extracts atomically into filesDir/ota_www
     * so Android updates instantly in ~2 seconds with ZERO APK download or reinstall prompt!
     */
    public static boolean downloadAndApplyWebOta(Context context, String zipUrl, String tagName) {
        if (context == null || zipUrl == null || zipUrl.trim().isEmpty()) return false;

        File stagingDir = new File(context.getFilesDir(), "ota_www_staging");
        File liveDir = getOtaWwwDir(context);
        File backupDir = new File(context.getFilesDir(), "ota_www_prev");
        deleteRecursively(stagingDir);
        //noinspection ResultOfMethodCallIgnored
        stagingDir.mkdirs();

        HttpURLConnection conn = null;
        try {
            URL url = new URL(zipUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(12000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("User-Agent", "DayRhythm-Android/" + getEffectiveLocalVersion(context));

            if (conn.getResponseCode() != 200) {
                return false;
            }

            String canonicalStaging = stagingDir.getCanonicalPath() + File.separator;
            try (InputStream rawIn = new BufferedInputStream(conn.getInputStream());
                 ZipInputStream zis = new ZipInputStream(rawIn)) {
                byte[] buffer = new byte[8192];
                ZipEntry entry;
                while ((entry = zis.getNextEntry()) != null) {
                    String name = entry.getName();
                    if (name == null || name.isEmpty()) continue;
                    File outFile = new File(stagingDir, name);
                    String canonicalOut = outFile.getCanonicalPath();
                    // ZipSlip protection
                    if (!canonicalOut.startsWith(canonicalStaging)) {
                        continue;
                    }
                    if (entry.isDirectory()) {
                        //noinspection ResultOfMethodCallIgnored
                        outFile.mkdirs();
                    } else {
                        File parent = outFile.getParentFile();
                        if (parent != null && !parent.exists()) {
                            //noinspection ResultOfMethodCallIgnored
                            parent.mkdirs();
                        }
                        try (FileOutputStream fos = new FileOutputStream(outFile)) {
                            int len;
                            while ((len = zis.read(buffer)) > 0) {
                                fos.write(buffer, 0, len);
                            }
                        }
                    }
                    zis.closeEntry();
                }
            }

            File indexCheck = new File(stagingDir, "index.html");
            if (!indexCheck.exists() || indexCheck.length() < 64) {
                deleteRecursively(stagingDir);
                return false;
            }

            deleteRecursively(backupDir);
            if (liveDir.exists()) {
                //noinspection ResultOfMethodCallIgnored
                liveDir.renameTo(backupDir);
            }
            boolean swapped = stagingDir.renameTo(liveDir);
            if (!swapped) {
                if (backupDir.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    backupDir.renameTo(liveDir);
                }
                return false;
            }
            deleteRecursively(backupDir);

            String cleanVer = tagName == null ? "" : tagName.replaceFirst("^[vV]", "").trim();
            SharedPreferences prefs = context.getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(KEY_OTA_VERSION, cleanVer).apply();
            return true;
        } catch (Exception ignored) {
            deleteRecursively(stagingDir);
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static void deleteRecursively(File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) {
            File[] children = f.listFiles();
            if (children != null) {
                for (File c : children) {
                    deleteRecursively(c);
                }
            }
        }
        //noinspection ResultOfMethodCallIgnored
        f.delete();
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
        req.setDescription("جاري تنزيل أحدث إصدار تلقائياً من GitHub...");
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
