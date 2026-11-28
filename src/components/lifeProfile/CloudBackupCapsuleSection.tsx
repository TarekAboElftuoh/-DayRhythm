import React, { useRef, useState } from 'react';
import { Cloud, Columns2, Download, ExternalLink, Monitor, RefreshCw, Rows2, ShieldCheck, Upload } from 'lucide-react';
import { getDriveApiStatus } from '../../services/googleDriveStorage';
import type { CapsulePrefs } from '../FloatingPiPCapsule';

export const CloudBackupCapsuleSection: React.FC<{
  isMobile: boolean;
  calendarConnected: boolean;
  googleDriveSynced: boolean;
  onSyncGoogleDriveNow?: () => Promise<boolean>;
  isSyncingGoogleDrive: boolean;
  onExportBackupJson?: () => void;
  onImportBackupJson?: (rawText: string) => Promise<{ ok: boolean; summaryAr: string }>;
  capsulePrefs?: CapsulePrefs;
  onChangeCapsulePrefs?: (next: CapsulePrefs) => void;
}> = ({
  isMobile,
  calendarConnected,
  googleDriveSynced,
  onSyncGoogleDriveNow,
  isSyncingGoogleDrive,
  onExportBackupJson,
  onImportBackupJson,
  capsulePrefs,
  onChangeCapsulePrefs,
}) => {
  const [backupStatus, setBackupStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [driveSyncNotice, setDriveSyncNotice] = useState<string | null>(null);
  const [driveEnableUrl, setDriveEnableUrl] = useState<string | null>(null);
  const [isSyncingDriveLocal, setIsSyncingDriveLocal] = useState(false);
  const [pendingRestoreFile, setPendingRestoreFile] = useState<{ fileName: string; rawText: string; previewSummary: string } | null>(null);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  const capsuleOrientation = capsulePrefs?.orientation ?? 'horizontal';
  const capsuleSize = capsulePrefs?.size ?? 'md';

  const handleSelectBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBackupStatus(null);
    const reader = new FileReader();
    reader.onload = () => {
      const rawText = typeof reader.result === 'string' ? reader.result : '';
      try {
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object' || parsed.app !== 'DayRhythm') {
          setBackupStatus({ tone: 'error', text: 'الملف غير صالح — اختر ملف نسخة احتياطية مُصدَّر من «إيقاع اليوم».' });
          setPendingRestoreFile(null);
          return;
        }
        const medsCount = Array.isArray(parsed.medications) ? parsed.medications.length : 0;
        const memCount = Array.isArray(parsed.memories) ? parsed.memories.length : 0;
        const actsCount = Array.isArray(parsed.creativeActivities) ? parsed.creativeActivities.length : 0;
        const exportedAt = typeof parsed.exportedAtIso === 'string' ? parsed.exportedAtIso.slice(0, 10) : 'غير محدد';
        setPendingRestoreFile({
          fileName: file.name,
          rawText,
          previewSummary: `تاريخ النسخة: ${exportedAt} · ${medsCount} علاجات · ${memCount} ذاكرة · ${actsCount} نشاط إبداعي + الثوابت والماء والإعدادات`,
        });
      } catch {
        setBackupStatus({ tone: 'error', text: 'تعذر قراءة ملف JSON — تأكد أنه ملف نسخة احتياطية سليم.' });
        setPendingRestoreFile(null);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRestoreBackup = async () => {
    if (!pendingRestoreFile || !onImportBackupJson) return;
    setIsRestoringBackup(true);
    try {
      const res = await onImportBackupJson(pendingRestoreFile.rawText);
      setBackupStatus({ tone: res.ok ? 'ok' : 'error', text: res.summaryAr });
      if (res.ok) setPendingRestoreFile(null);
    } finally {
      setIsRestoringBackup(false);
    }
  };

  return (
    <>
      <div className="pt-3 border-t border-white/10 space-y-2.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-white flex items-center gap-1.5">
              <Cloud className="w-4 h-4 text-[#7FFFD4]" />
              <span>مزامنة الحساب السحابية (Google Drive AppData)</span>
              {googleDriveSynced && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">✓ متزامن</span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              تخزين سحابي مجاني ومشفّر ومحمي في حسابك Google لحفظ الدستور، العلاجات، ذاكرة Gemini، وإعدادات الكبسولة دون فقدانها أبداً.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {calendarConnected && onSyncGoogleDriveNow ? (
              <button
                type="button" disabled={isSyncingGoogleDrive || isSyncingDriveLocal}
                onClick={async () => {
                  setIsSyncingDriveLocal(true); setDriveSyncNotice(null); setDriveEnableUrl(null);
                  try {
                    const ok = await onSyncGoogleDriveNow();
                    if (ok) {
                      setDriveSyncNotice('✓ تم حفظ ومزامنة جميع الإعدادات والدستور مع حسابك على Google Drive بنجاح');
                    } else {
                      const statusInfo = getDriveApiStatus();
                      if (statusInfo.status === 'service_disabled') {
                        setDriveSyncNotice('⚠️ خدمة Google Drive API معطلة في مشروع Google Cloud الخاص بك. اضغط على الزر بالأسفل لتفعيلها بضغطة زر واحدة (Enable):');
                        setDriveEnableUrl(statusInfo.enableUrl);
                      } else {
                        setDriveSyncNotice('⚠️ تعذر رفع النسخة السحابية الآن — تأكد من الاتصال وجدد ربط Google إذا تطلب الأمر.');
                      }
                    }
                  } finally { setIsSyncingDriveLocal(false); }
                }}
                className="px-3 py-1.5 rounded-lg border border-[#7FFFD4]/45 bg-[#7FFFD4]/15 text-[#7FFFD4] text-xs font-bold hover:bg-[#7FFFD4]/25 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingGoogleDrive || isSyncingDriveLocal ? 'animate-spin' : ''}`} />
                <span>{isSyncingGoogleDrive || isSyncingDriveLocal ? 'جارٍ المزامنة...' : 'مزامنة الحساب الآن'}</span>
              </button>
            ) : (
              <span className="text-[11px] text-zinc-500">{calendarConnected ? 'المزامنة التلقائية قيد العمل' : 'سجّل الدخول بـ Google لتفعيل المزامنة'}</span>
            )}
          </div>
        </div>
        {driveSyncNotice && (
          <div className="text-[11px] text-zinc-200 bg-black/40 border border-[#7FFFD4]/30 rounded-lg p-3 space-y-2">
            <p>{driveSyncNotice}</p>
            {driveEnableUrl && (
              <div>
                <a href={driveEnableUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs hover:bg-emerald-500/30 transition-colors">
                  <span>تفعيل Google Drive API في مشروعك (اضغط هنا)</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {(onExportBackupJson || onImportBackupJson) && (
        <div className="pt-3 border-t border-white/10 space-y-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#7FFFD4]" />
                <span>النسخ الاحتياطي والاسترجاع الكامل (JSON)</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">يحفظ علاجاتك، ذاكرة Gemini، الثوابت، الأنشطة، الماء، وتفضيلات الكبسولة واللوجو في ملف آمن بدون أي مفاتيح أو توكنات.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onExportBackupJson && (
                <button
                  type="button"
                  onClick={() => { onExportBackupJson(); setBackupStatus({ tone: 'ok', text: 'تم تنزيل ملف النسخة الاحتياطية بنجاح ✓' }); }}
                  className="px-3 py-1.5 rounded-lg border border-[#7FFFD4]/45 bg-[#7FFFD4]/15 text-[#7FFFD4] text-xs font-bold hover:bg-[#7FFFD4]/25 flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تصدير نسخة</span>
                </button>
              )}
              {onImportBackupJson && (
                <>
                  <input ref={backupFileInputRef} type="file" accept=".json,application/json" onChange={handleSelectBackupFile} className="hidden" />
                  <button
                    type="button" onClick={() => backupFileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.04] text-zinc-200 text-xs font-semibold hover:border-[#7FFFD4]/50 hover:text-[#7FFFD4] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>استرجاع نسخة</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {pendingRestoreFile && (
            <div className="rounded-xl border border-amber-400/45 bg-amber-500/10 p-3 space-y-2">
              <div className="text-xs font-bold text-amber-200">تأكيد استرجاع: {pendingRestoreFile.fileName}</div>
              <div className="text-[11px] text-zinc-200">{pendingRestoreFile.previewSummary}</div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setPendingRestoreFile(null)} className="px-3 py-1 rounded-lg border border-white/15 text-[11px] text-zinc-300 hover:text-white cursor-pointer">إلغاء</button>
                <button type="button" disabled={isRestoringBackup} onClick={() => void handleConfirmRestoreBackup()} className="px-3.5 py-1 rounded-lg bg-amber-400 text-black text-[11px] font-bold hover:bg-amber-300 disabled:opacity-50 cursor-pointer">
                  {isRestoringBackup ? 'جارٍ الاسترجاع...' : 'تأكيد الاسترجاع ومزامنة السحابة ✓'}
                </button>
              </div>
            </div>
          )}

          {backupStatus && (
            <div className={`rounded-lg border px-3 py-2 text-[11px] font-medium ${backupStatus.tone === 'ok' ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200' : 'border-rose-400/35 bg-rose-500/10 text-rose-200'}`}>
              {backupStatus.text}
            </div>
          )}
        </div>
      )}

      {!isMobile && (
        <div className="space-y-3 pt-3 border-t border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <Monitor className="w-4 h-4 text-[#7FFFD4]" />
              <span>إعدادات كبسولة سطح المكتب للكمبيوتر (Desktop PiP Capsule)</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-[#7FFFD4]/10 text-[#7FFFD4] border border-[#7FFFD4]/20 font-mono">Windows / Desktop</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            الكبسولة العائمة تظل ظاهرة فوق كافة البرامج والنوافذ على شاشة الكمبيوتر لتعرض العد التنازلي للحدث القادم والتنبيهات السريعة.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-zinc-400 text-[11px]">اتجاه الكبسولة:</span>
            <button type="button" onClick={() => onChangeCapsulePrefs?.({ orientation: 'horizontal', size: capsuleSize })} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${capsuleOrientation === 'horizontal' ? 'border-[#7FFFD4] bg-[#7FFFD4]/20 text-[#7FFFD4]' : 'border-white/10 bg-black/40 text-zinc-400 hover:text-white'}`}>
              <Rows2 className="w-3.5 h-3.5" /><span>أفقي (مستطيل)</span>
            </button>
            <button type="button" onClick={() => onChangeCapsulePrefs?.({ orientation: 'vertical', size: capsuleSize })} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${capsuleOrientation === 'vertical' ? 'border-[#7FFFD4] bg-[#7FFFD4]/20 text-[#7FFFD4]' : 'border-white/10 bg-black/40 text-zinc-400 hover:text-white'}`}>
              <Columns2 className="w-3.5 h-3.5" /><span>رأسي (عمودي)</span>
            </button>
            <span className="text-zinc-400 text-[11px] mr-2">الحجم:</span>
            {(['sm', 'md', 'lg'] as const).map((s) => (
              <button key={s} type="button" onClick={() => onChangeCapsulePrefs?.({ orientation: capsuleOrientation, size: s })} className={`px-2.5 py-1 rounded-lg border font-mono-tabular text-xs cursor-pointer transition ${capsuleSize === s ? 'border-[#7FFFD4] bg-[#7FFFD4]/20 text-[#7FFFD4] font-bold' : 'border-white/10 text-zinc-400 hover:text-white'}`}>
                {s === 'sm' ? 'صغير' : s === 'md' ? 'متوسط' : 'عريض'}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
