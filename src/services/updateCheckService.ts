import { APP_VERSION } from '../types/dayrhythm';
import { isAndroidNativeApp, isMobileDevice } from './platform';

export const GITHUB_REPO = 'TarekAboElftuoh/-DayRhythm';
export const GITHUB_RELEASES_LATEST_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
export const UPDATE_CHECK_CACHE_KEY = 'dayrhythm_update_check_v1';
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  releasePageUrl: string;
  apkUrl: string | null;
  exeUrl: string | null;
  downloadUrl: string;
  checkedAtMs: number;
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
}

function parseSemver(raw: string): ParsedSemver | null {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^[vV]/, '')
    .split('+')[0];
  if (!cleaned) return null;
  const [core, prerelease = ''] = cleaned.split('-', 2);
  const parts = core.split('.');
  if (parts.length === 0) return null;
  const major = Number(parts[0]);
  const minor = parts.length > 1 ? Number(parts[1]) : 0;
  const patch = parts.length > 2 ? Number(parts[2]) : 0;
  if (![major, minor, patch].every((n) => Number.isInteger(n) && n >= 0)) {
    return null;
  }
  return { major, minor, patch, prerelease };
}

/**
 * Compares two semver strings (e.g. "v2.0.127" vs "v2.0.126").
 * Returns 1 if a > b, -1 if a < b, 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;

  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;

  if (pa.prerelease === pb.prerelease) return 0;
  if (!pa.prerelease && pb.prerelease) return 1;
  if (pa.prerelease && !pb.prerelease) return -1;
  return pa.prerelease.localeCompare(pb.prerelease) > 0 ? 1 : -1;
}

export function isNewerVersion(candidateVersion: string, currentVersion: string = APP_VERSION): boolean {
  return compareSemver(candidateVersion, currentVersion) > 0;
}

export function extractReleaseAssets(assets: unknown): {
  apkUrl: string | null;
  exeUrl: string | null;
} {
  if (!Array.isArray(assets)) {
    return { apkUrl: null, exeUrl: null };
  }

  let apkUrl: string | null = null;
  let setupExeUrl: string | null = null;
  let fallbackExeUrl: string | null = null;

  for (const item of assets) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { name?: unknown; browser_download_url?: unknown };
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const url =
      typeof record.browser_download_url === 'string' ? record.browser_download_url.trim() : '';
    if (!url || !/^https:\/\//i.test(url)) continue;

    const lower = name.toLowerCase();
    if (!apkUrl && lower.endsWith('.apk')) {
      apkUrl = url;
    } else if (lower.endsWith('setup.exe')) {
      setupExeUrl = url;
    } else if (!fallbackExeUrl && lower.endsWith('.exe')) {
      fallbackExeUrl = url;
    }
  }

  return {
    apkUrl,
    exeUrl: setupExeUrl || fallbackExeUrl,
  };
}

function readCachedUpdateCheck(currentVersion: string, nowMs: number): UpdateCheckResult | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(UPDATE_CHECK_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UpdateCheckResult>;
    if (
      typeof parsed.checkedAtMs !== 'number' ||
      nowMs - parsed.checkedAtMs >= ONE_DAY_MS ||
      typeof parsed.latestVersion !== 'string' ||
      typeof parsed.downloadUrl !== 'string'
    ) {
      return null;
    }
    return {
      hasUpdate: isNewerVersion(parsed.latestVersion, currentVersion),
      currentVersion,
      latestVersion: parsed.latestVersion,
      releaseName: typeof parsed.releaseName === 'string' ? parsed.releaseName : parsed.latestVersion,
      releaseNotes: typeof parsed.releaseNotes === 'string' ? parsed.releaseNotes : '',
      releasePageUrl:
        typeof parsed.releasePageUrl === 'string'
          ? parsed.releasePageUrl
          : `https://github.com/${GITHUB_REPO}/releases`,
      apkUrl: typeof parsed.apkUrl === 'string' ? parsed.apkUrl : null,
      exeUrl: typeof parsed.exeUrl === 'string' ? parsed.exeUrl : null,
      downloadUrl: parsed.downloadUrl,
      checkedAtMs: parsed.checkedAtMs,
    };
  } catch {
    return null;
  }
}

function writeCachedUpdateCheck(result: UpdateCheckResult): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(UPDATE_CHECK_CACHE_KEY, JSON.stringify(result));
  } catch {
    // ignore storage quota errors
  }
}

export async function checkForGitHubReleaseUpdate(options?: {
  currentVersion?: string;
  force?: boolean;
  fetchImpl?: typeof fetch;
  nowMs?: number;
}): Promise<UpdateCheckResult | null> {
  const currentVersion = options?.currentVersion || APP_VERSION;
  const nowMs = options?.nowMs ?? Date.now();
  const force = Boolean(options?.force);

  if (!force) {
    const cached = readCachedUpdateCheck(currentVersion, nowMs);
    if (cached) return cached;
  }

  const fetchFn = options?.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchFn) return null;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;

  try {
    const res = await fetchFn(GITHUB_RELEASES_LATEST_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
      },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      tag_name?: unknown;
      name?: unknown;
      body?: unknown;
      html_url?: unknown;
      assets?: unknown;
    };

    const latestVersion = typeof data.tag_name === 'string' ? data.tag_name.trim() : '';
    if (!latestVersion) return null;

    const releasePageUrl =
      typeof data.html_url === 'string' && /^https:\/\//i.test(data.html_url)
        ? data.html_url
        : `https://github.com/${GITHUB_REPO}/releases/latest`;
    const { apkUrl, exeUrl } = extractReleaseAssets(data.assets);
    const preferMobileAsset = isAndroidNativeApp() || isMobileDevice();
    const downloadUrl = preferMobileAsset
      ? apkUrl || exeUrl || releasePageUrl
      : exeUrl || apkUrl || releasePageUrl;

    const result: UpdateCheckResult = {
      hasUpdate: isNewerVersion(latestVersion, currentVersion),
      currentVersion,
      latestVersion,
      releaseName: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : latestVersion,
      releaseNotes: typeof data.body === 'string' ? data.body.trim().slice(0, 600) : '',
      releasePageUrl,
      apkUrl,
      exeUrl,
      downloadUrl,
      checkedAtMs: nowMs,
    };

    writeCachedUpdateCheck(result);
    return result;
  } catch {
    return null;
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}
