import React, { useState } from 'react';
import { Pencil, Volume2 } from 'lucide-react';
import { playSunlightChime } from '../engines/audioEngine';
import {
  DEFAULT_SUNLIGHT_SETTINGS,
  type SunlightSessionId,
  type SunlightSettings,
} from '../types/dayrhythm';
import { SunlightHeaderControls } from './SunlightHeaderControls';
import type { SunlightZoneBounds } from '../engines/sunlightEngine';
import {
  buildZoneGradient,
  EXPOSURE_OPTIONS,
  SESSION_ORDER,
  SESSION_ZONES,
  SKIN_TONE_OPTIONS,
} from './sunlightSettingsConfig';

interface SunlightSettingsSectionProps {
  settings: SunlightSettings;
  onChange: (next: SunlightSettings) => void;
}

export const SunlightSettingsSection: React.FC<SunlightSettingsSectionProps> = ({
  settings,
  onChange,
}) => {
  const [editingTextId, setEditingTextId] = useState<SunlightSessionId | null>(null);

  const updateSession = (
    id: SunlightSessionId,
    patch: Partial<SunlightSettings['sessions'][SunlightSessionId]>
  ) => {
    const prevCfg = settings.sessions[id] ?? DEFAULT_SUNLIGHT_SETTINGS.sessions[id];
    onChange({
      ...settings,
      sessions: {
        ...settings.sessions,
        [id]: {
          ...prevCfg,
          ...patch,
        },
      },
    });
  };

  return (
    <section
      dir="rtl"
      className="rounded-xl border border-white/10 bg-black/50 p-4 space-y-3.5 text-xs"
    >
      <SunlightHeaderControls
        enabled={settings.enabled}
        onToggle={() => onChange({ ...settings, enabled: !settings.enabled })}
      />

      {settings.enabled && (
        <div className="space-y-3.5 pt-1">
          {/* Lead Minutes + Skin Tone + Exposure Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="text-zinc-400 block">تنبيه قبل البدء (د)</span>
              <input
                type="number"
                min={0}
                max={15}
                step={1}
                value={settings.leadMinutes}
                onChange={(e) => {
                  const val = Math.max(0, Math.min(15, Math.round(Number(e.target.value) || 0)));
                  onChange({ ...settings, leadMinutes: val });
                }}
                className="w-full rounded-lg border border-white/15 bg-black px-3 py-1.5 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
              />
            </label>

            <div className="space-y-1">
              <span className="text-zinc-400 block">لون البشرة</span>
              <div className="grid grid-cols-3 gap-1">
                {SKIN_TONE_OPTIONS.map((opt) => {
                  const active = settings.skinTone === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onChange({ ...settings, skinTone: opt.value })}
                      className={`py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                        active
                          ? 'border-[#7FFFD4]/55 bg-[#7FFFD4]/15 text-[#7FFFD4]'
                          : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {opt.labelAr}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-zinc-400 block">نمط التعرّض</span>
              <div className="grid grid-cols-3 gap-1">
                {EXPOSURE_OPTIONS.map((opt) => {
                  const active = settings.exposureMode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onChange({ ...settings, exposureMode: opt.value })}
                      className={`py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                        active
                          ? 'border-[#7FFFD4]/55 bg-[#7FFFD4]/15 text-[#7FFFD4]'
                          : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {opt.labelAr}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Per-session Controls */}
          <div className="divide-y divide-white/[0.07] rounded-xl border border-white/[0.08] bg-white/[0.015] px-3">
            {SESSION_ORDER.map((id) => {
              const cfg = settings.sessions[id] ?? DEFAULT_SUNLIGHT_SETTINGS.sessions[id];
              const zones = SESSION_ZONES[id];
              const clampedCustom = Math.max(
                zones.minUseful,
                Math.min(zones.maxSafe, Math.round(cfg.customMinutes))
              );
              const isEditingText = editingTextId === id;

              return (
                <div key={id} className="py-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base leading-none" aria-hidden="true">
                        {cfg.emoji}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate">
                          {cfg.labelAr}
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate">
                          {cfg.descAr}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => playSunlightChime(id)}
                        aria-label={`تجربة صوت ${cfg.labelAr}`}
                        title="تجربة الصوت"
                        className="px-2 py-1 rounded-lg border border-white/10 bg-white/[0.02] text-zinc-300 hover:text-[#7FFFD4] hover:border-[#7FFFD4]/40 text-[11px] inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Volume2 className="w-3 h-3" aria-hidden="true" />
                        <span>تجربة</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingTextId(isEditingText ? null : id)}
                        aria-label={`تعديل نص ${cfg.labelAr}`}
                        title="تعديل العنوان والوصف"
                        className={`p-1.5 rounded-lg border cursor-pointer transition-colors ${
                          isEditingText
                            ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/12 text-[#7FFFD4]'
                            : 'border-white/10 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>

                      <button
                        type="button"
                        aria-pressed={cfg.autoDuration}
                        disabled={!cfg.enabled}
                        onClick={() => updateSession(id, { autoDuration: !cfg.autoDuration })}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors disabled:opacity-40 ${
                          cfg.autoDuration
                            ? 'border-emerald-400/45 bg-emerald-400/12 text-emerald-300'
                            : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        تلقائي ذكي (Auto)
                      </button>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={cfg.enabled}
                        onClick={() => updateSession(id, { enabled: !cfg.enabled })}
                        className={`px-2.5 py-1 rounded-lg border font-mono-tabular text-[11px] font-semibold cursor-pointer transition-colors ${
                          cfg.enabled
                            ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/15 text-[#7FFFD4]'
                            : 'border-white/10 bg-white/[0.02] text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {cfg.enabled ? 'مفعّل' : 'مطفأ'}
                      </button>
                    </div>
                  </div>

                  {isEditingText && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <input
                        type="text"
                        value={cfg.labelAr}
                        onChange={(e) => updateSession(id, { labelAr: e.target.value })}
                        placeholder="العنوان"
                        className="w-full rounded-lg border border-white/15 bg-black px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-[#7FFFD4]"
                      />
                      <input
                        type="text"
                        value={cfg.descAr}
                        onChange={(e) => updateSession(id, { descAr: e.target.value })}
                        placeholder="الوصف"
                        className="w-full rounded-lg border border-white/15 bg-black px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-[#7FFFD4]"
                      />
                    </div>
                  )}

                  {cfg.enabled && !cfg.autoDuration && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-zinc-400">المدة المخصصة</span>
                        <span className="font-mono-tabular font-semibold text-[#7FFFD4]">
                          {clampedCustom} دقيقة
                        </span>
                      </div>

                      <div dir="ltr" className="relative flex items-center h-6">
                        <div
                          className="w-full h-2 rounded-full border border-white/10"
                          style={{ background: buildZoneGradient(zones) }}
                          aria-hidden="true"
                        />
                        <input
                          type="range"
                          min={zones.minUseful}
                          max={zones.maxSafe}
                          step={1}
                          value={clampedCustom}
                          aria-label={`مدة ${cfg.labelAr} بالدقائق`}
                          onChange={(e) =>
                            updateSession(id, {
                              customMinutes: Math.max(
                                zones.minUseful,
                                Math.min(zones.maxSafe, Math.round(Number(e.target.value)))
                              ),
                            })
                          }
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div
                          className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[#7FFFD4] border-2 border-black shadow"
                          style={{
                            left: `${((clampedCustom - zones.minUseful) / Math.max(1, zones.maxSafe - zones.minUseful)) * 100}%`,
                          }}
                          aria-hidden="true"
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono-tabular text-zinc-500">
                        <span className="text-amber-300/75">أدنى {zones.minUseful}د</span>
                        <span className="text-emerald-300/80">مثالي {zones.optimal}د</span>
                        <span className="text-sky-300/75">أقصى مفيد {zones.maxUseful}د</span>
                        <span className="text-zinc-400">آمن {zones.maxSafe}د</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
