import { describe, expect, it } from 'vitest';
import {
  checkForGitHubReleaseUpdate,
  compareSemver,
  extractReleaseAssets,
  isNewerVersion,
} from './updateCheckService';

describe('updateCheckService', () => {
  it('compares semver strings accurately', () => {
    expect(compareSemver('v2.0.127', 'v2.0.126')).toBe(1);
    expect(compareSemver('2.0.126', 'v2.0.126')).toBe(0);
    expect(compareSemver('v2.0.125', 'v2.0.126')).toBe(-1);
    expect(compareSemver('v2.1.0', 'v2.0.999')).toBe(1);
    expect(isNewerVersion('v2.0.127', 'v2.0.126')).toBe(true);
    expect(isNewerVersion('v2.0.126', 'v2.0.126')).toBe(false);
  });

  it('extracts APK and Setup EXE assets from GitHub release payload', () => {
    const assets = extractReleaseAssets([
      { name: 'dayrhythm-web-ota.zip', browser_download_url: 'https://github.com/x/y/ota.zip' },
      { name: 'DayRhythm-v2.0.127.apk', browser_download_url: 'https://github.com/x/y/app.apk' },
      { name: 'DayRhythm-Setup.exe', browser_download_url: 'https://github.com/x/y/setup.exe' },
    ]);
    expect(assets.apkUrl).toBe('https://github.com/x/y/app.apk');
    expect(assets.exeUrl).toBe('https://github.com/x/y/setup.exe');
  });

  it('returns update info when remote tag is newer and null on fetch failure', async () => {
    const mockFetch = (async () =>
      new Response(
        JSON.stringify({
          tag_name: 'v2.0.130',
          name: 'Release 2.0.130',
          html_url: 'https://github.com/TarekAboElftuoh/-DayRhythm/releases/tag/v2.0.130',
          assets: [
            {
              name: 'DayRhythm-Setup.exe',
              browser_download_url: 'https://github.com/TarekAboElftuoh/-DayRhythm/releases/download/v2.0.130/DayRhythm-Setup.exe',
            },
          ],
        }),
        { status: 200 }
      )) as unknown as typeof fetch;

    const result = await checkForGitHubReleaseUpdate({
      currentVersion: 'v2.0.126',
      force: true,
      fetchImpl: mockFetch,
    });
    expect(result?.hasUpdate).toBe(true);
    expect(result?.latestVersion).toBe('v2.0.130');
    expect(result?.exeUrl).toContain('DayRhythm-Setup.exe');

    const failed = await checkForGitHubReleaseUpdate({
      currentVersion: 'v2.0.126',
      force: true,
      fetchImpl: (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
    });
    expect(failed).toBeNull();
  });
});
