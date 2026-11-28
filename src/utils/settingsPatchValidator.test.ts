import { describe, expect, it } from 'vitest';
import { DEFAULT_LIFE_PROFILE } from '../engines/lifeRhythmEngine';
import { shouldAttachChatTools } from '../services/geminiClient';
import { extractPendingProposalFromFunctionCalls } from '../services/geminiSanitizer';
import type { SettingsSnapshotContext } from '../types/dayrhythm';
import {
  formatSettingsSchemaForGemini,
  validateAndNormalizeSettingsPatch,
} from './settingsPatchValidator';

const BASE_CONTEXT: SettingsSnapshotContext = {
  lifeProfile: {
    ...DEFAULT_LIFE_PROFILE,
    fastingDays: [1, 4],
    sanctuarySilenceMode: 'silent_inbox',
  },
  appSettings: {
    phoneChargeLimitPct: 90,
    waterRemindersEnabled: true,
    quietMode: 'normal',
    sunMode: false,
    language: 'ar',
  },
  fastingOverride: 'auto',
  medications: [
    {
      id: 'vit_d',
      name: 'فيتامين د',
      fastingPolicy: 'auto-nearest',
    },
  ],
};

describe('settingsPatchValidator', () => {
  it('normalizes valid multi-field patches cleanly and produces Arabic diffs', () => {
    const result = validateAndNormalizeSettingsPatch(
      BASE_CONTEXT.lifeProfile!,
      {
        phoneChargeLimitPct: 85,
        addFastingDays: [6],
        sleepTargetHours: 8,
        bedtime: '22:30',
        wakeLeadBeforeFajrMinutes: 20,
        suhoorLeadMinutes: 50,
        dailyWaterTargetLiters: 3.5,
        cupSizeMl: 300,
        waterRemindersEnabled: false,
        sanctuarySilenceMode: 'vibrate_notif',
        meetingMode: true,
        meetingModeMinutes: 45,
        fastingWhiteDays: false,
        fastingOverride: 'fasting',
        travelState: {
          active: true,
          cityName: 'الإسكندرية',
          durationMode: '2d',
        },
        medicationFastingPolicies: [
          {
            name: 'فيتامين د',
            fastingPolicy: 'after-maghrib',
          },
        ],
      },
      BASE_CONTEXT
    );

    expect(result.valid).toBe(true);
    expect(result.hasChanges).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.blockedKeys).toEqual([]);
    expect(result.affectsAlarms).toBe(true);

    expect(result.appSettingsPatch.phoneChargeLimitPct).toBe(85);
    expect(result.appSettingsPatch.waterRemindersEnabled).toBe(false);
    expect(result.appSettingsPatch.quietMode).toBe('vibrate_only');
    expect(result.appSettingsPatch.quietModeMinutes).toBe(45);

    expect(result.profilePatch.fastingDays).toEqual([1, 4, 6]);
    expect(result.profilePatch.sleepTargetMinutes).toBe(480);
    expect(result.profilePatch.bedtime24).toBe('22:30');
    expect(result.profilePatch.wakeLeadBeforeFajrMinutes).toBe(20);
    expect(result.profilePatch.suhoorLeadMinutes).toBe(50);
    expect(result.profilePatch.dailyWaterTargetMl).toBe(3500);
    expect(result.profilePatch.cupSizeMl).toBe(300);
    expect(result.profilePatch.sanctuarySilenceMode).toBe('vibrate_notif');
    expect(result.profilePatch.fastingWhiteDays).toBe(false);

    expect(result.fastingOverride).toBe('fasting');
    expect(result.travelStatePatch?.cityName).toBe('الإسكندرية');
    expect(result.medicationFastingPolicies).toEqual([
      {
        medicationId: 'vit_d',
        name: 'فيتامين د',
        fastingPolicy: 'after-maghrib',
      },
    ]);

    const chargeDiff = result.diffs.find((d) => d.key === 'phoneChargeLimitPct');
    expect(chargeDiff).toEqual({
      key: 'phoneChargeLimitPct',
      labelAr: 'حد شحن البطارية',
      beforeDisplay: '90%',
      afterDisplay: '85%',
    });

    const medDiff = result.diffs.find((d) => d.key === 'medFastingPolicy.vit_d');
    expect(medDiff?.afterDisplay).toContain('بعد المغرب');
  });

  it('clamps phoneChargeLimitPct to 50-100 and rejects out-of-range sleep hours with Arabic messages', () => {
    const lowCharge = validateAndNormalizeSettingsPatch(
      BASE_CONTEXT.lifeProfile!,
      { phoneChargeLimitPct: 20 },
      BASE_CONTEXT
    );
    expect(lowCharge.valid).toBe(true);
    expect(lowCharge.appSettingsPatch.phoneChargeLimitPct).toBe(50);
    expect(lowCharge.warnings.some((w) => w.includes('50%–100%'))).toBe(true);

    const highCharge = validateAndNormalizeSettingsPatch(
      BASE_CONTEXT.lifeProfile!,
      { phoneChargeLimitPct: 135 },
      BASE_CONTEXT
    );
    expect(highCharge.valid).toBe(true);
    expect(highCharge.appSettingsPatch.phoneChargeLimitPct).toBe(100);
    expect(highCharge.warnings.some((w) => w.includes('100%'))).toBe(true);

    const badSleep = validateAndNormalizeSettingsPatch(
      BASE_CONTEXT.lifeProfile!,
      { sleepTargetHours: 20, bedtime24: '25:99' },
      BASE_CONTEXT
    );
    expect(badSleep.valid).toBe(false);
    expect(badSleep.hasChanges).toBe(false);
    expect(badSleep.profilePatch.sleepTargetMinutes).toBeUndefined();
    expect(badSleep.profilePatch.bedtime24).toBeUndefined();
    expect(badSleep.errors.some((e) => e.includes('3 و14 ساعة'))).toBe(true);
    expect(badSleep.errors.some((e) => e.includes('HH:MM'))).toBe(true);

    const tooShortSleep = validateAndNormalizeSettingsPatch(
      BASE_CONTEXT.lifeProfile!,
      { sleepTargetHours: 2 },
      BASE_CONTEXT
    );
    expect(tooShortSleep.valid).toBe(false);
    expect(tooShortSleep.errors.some((e) => e.includes('3 و14 ساعة'))).toBe(true);
  });

  it('strictly strips blocklisted keys like geminiApiKey, tokens, firebaseConfig, uid, and autoExecuteChat', () => {
    const result = validateAndNormalizeSettingsPatch(
      BASE_CONTEXT.lifeProfile!,
      {
        geminiApiKey: 'AIzaSySecretKey',
        accessToken: 'ya29.secret',
        firebaseConfig: { apiKey: 'nested-key', projectId: 'dayrhythm' },
        uid: 'user-123',
        autoExecuteChat: true,
        phoneChargeLimitPct: 85,
        travelState: {
          active: true,
          cityName: 'القاهرة',
          uid: 'nested-uid',
        },
      },
      BASE_CONTEXT
    );

    expect(result.blockedKeys).toContain('geminiApiKey');
    expect(result.blockedKeys).toContain('accessToken');
    expect(result.blockedKeys).toContain('firebaseConfig');
    expect(result.blockedKeys).toContain('uid');
    expect(result.blockedKeys).toContain('autoExecuteChat');
    expect(result.blockedKeys).toContain('travelState.uid');
    expect(result.warnings.some((w) => w.includes('geminiApiKey'))).toBe(true);

    expect(JSON.stringify(result.normalizedPatch)).not.toContain('AIzaSySecretKey');
    expect(JSON.stringify(result.normalizedPatch)).not.toContain('ya29.secret');
    expect(JSON.stringify(result.normalizedPatch)).not.toContain('nested-uid');
    expect('geminiApiKey' in result.normalizedPatch).toBe(false);
    expect('autoExecuteChat' in result.appSettingsPatch).toBe(false);
    expect(result.appSettingsPatch.phoneChargeLimitPct).toBe(85);
  });

  it('supports Mon/Thu helper, early sanctuary cancel, and Gemini proposal extraction', () => {
    const toggleMonThuOff = validateAndNormalizeSettingsPatch(
      BASE_CONTEXT.lifeProfile!,
      { fastingMonThu: false, cancelActiveSanctuaryEarly: true },
      BASE_CONTEXT
    );
    expect(toggleMonThuOff.profilePatch.fastingDays).toEqual([]);
    expect(toggleMonThuOff.cancelActiveSanctuaryEarly).toBe(true);
    expect(toggleMonThuOff.affectsAlarms).toBe(true);

    const proposal = extractPendingProposalFromFunctionCalls(
      [
        {
          name: 'update_app_settings',
          args: {
            summaryAr: 'ضبط حد الشحن 85% وصيام السبت وفيتامين د بعد المغرب',
            patch: {
              phoneChargeLimitPct: 85,
              addFastingDays: [6],
              medicationFastingPolicies: [
                { name: 'فيتامين د', fastingPolicy: 'after-maghrib' },
              ],
              geminiApiKey: 'SHOULD_BE_STRIPPED',
            },
          },
        },
      ],
      { settingsSnapshot: BASE_CONTEXT }
    );

    expect(proposal).toBeDefined();
    expect(proposal?.settingsPatchProposal?.patch.phoneChargeLimitPct).toBe(85);
    expect(proposal?.settingsPatchProposal?.patch.fastingDays).toEqual([1, 4, 6]);
    expect(proposal?.settingsPatchProposal?.blockedKeys).toEqual(['geminiApiKey']);
    expect(proposal?.settingsPatchProposal?.diffs?.length).toBe(3);

    expect(shouldAttachChatTools('خلّي حد الشحن 85% وصيام السبت شغال وانقل فيتامين د لبعد المغرب')).toBe(
      true
    );
    expect(shouldAttachChatTools('set sleep hours to 8')).toBe(true);

    const schemaText = formatSettingsSchemaForGemini(
      BASE_CONTEXT.lifeProfile!,
      BASE_CONTEXT
    );
    expect(schemaText).toContain('phoneChargeLimitPct=90');
    expect(schemaText).toContain('فيتامين د: auto-nearest');
  });
});
