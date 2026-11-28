import { useCallback, useEffect, useRef, useState } from 'react';
import {
  checkGeminiStatus,
  type GeminiConnectionStatus,
} from '../../services/apiClient';
import {
  getGeminiApiKey,
  resetGeminiApiKey,
  setGeminiApiKey,
} from '../../services/geminiClient';

export function useGeminiConnection(isActive: boolean) {
  const [geminiStatus, setGeminiStatus] = useState<GeminiConnectionStatus>({
    ok: false,
    connected: false,
    status: 'checking',
    model: 'gemini-3.1-flash-lite',
    latencyMs: 0,
  });
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState(() => getGeminiApiKey());
  const [keySaveMessage, setKeySaveMessage] = useState<string | null>(null);
  const [isProbingKey, setIsProbingKey] = useState(false);

  const probeInFlightRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const geminiStatusRef = useRef<GeminiConnectionStatus>(geminiStatus);

  useEffect(() => {
    geminiStatusRef.current = geminiStatus;
  }, [geminiStatus]);

  const runGeminiProbe = useCallback(async (forceProbe = false, silentCheck = false) => {
    if (probeInFlightRef.current) return;
    probeInFlightRef.current = true;
    if (!silentCheck) {
      setGeminiStatus((prev) => ({ ...prev, status: 'checking' }));
    }
    try {
      const res = await checkGeminiStatus(forceProbe);
      setGeminiStatus(res);
      if (res.status === 'online') reconnectAttemptsRef.current = 0;
    } finally {
      probeInFlightRef.current = false;
    }
  }, []);

  const handleSaveApiKey = async () => {
    setIsProbingKey(true);
    setKeySaveMessage(null);
    try {
      const res = setGeminiApiKey(apiKeyDraft);
      setApiKeyDraft(res.saved);
      const probeRes = await checkGeminiStatus(true);
      setGeminiStatus(probeRes);
      if (probeRes.status === 'online') {
        setKeySaveMessage(`✓ تم حفظ المفتاح بنجاح! الاتصال بـ Gemini جاهز (${probeRes.latencyMs}ms)`);
      } else {
        setKeySaveMessage(probeRes.error || 'تم حفظ المفتاح ولكن تعذر الوصول لـ Gemini حالياً.');
      }
    } finally {
      setIsProbingKey(false);
    }
  };

  const handleResetApiKey = async () => {
    const def = resetGeminiApiKey();
    setApiKeyDraft(def);
    setIsProbingKey(true);
    setKeySaveMessage(null);
    try {
      const probeRes = await checkGeminiStatus(true);
      setGeminiStatus(probeRes);
      setKeySaveMessage('تمت استعادة المفتاح الافتراضي الأصلي بنجاح ✓');
    } finally {
      setIsProbingKey(false);
    }
  };

  useEffect(() => {
    void runGeminiProbe(false, false);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        void runGeminiProbe(false, true);
      }
    }, 180_000);
    const handleNetworkRecover = () => {
      reconnectAttemptsRef.current = 0;
      void runGeminiProbe(true, true);
    };
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        const cur = geminiStatusRef.current;
        if (cur.status === 'offline' || cur.status === 'degraded') {
          void runGeminiProbe(false, true);
        }
      }
    };
    window.addEventListener('online', handleNetworkRecover);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleNetworkRecover);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [runGeminiProbe]);

  useEffect(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (geminiStatus.status === 'online' || geminiStatus.status === 'checking') return;
    const backoffDelaysMs = [3_000, 6_000, 12_000, 20_000, 30_000];
    const delayMs = backoffDelaysMs[Math.min(reconnectAttemptsRef.current, backoffDelaysMs.length - 1)];
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectAttemptsRef.current += 1;
      if (navigator.onLine !== false && document.visibilityState === 'visible') {
        void runGeminiProbe(geminiStatus.status === 'offline', true);
      }
    }, delayMs);
    return () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [geminiStatus.status, geminiStatus.checkedAtIso, runGeminiProbe]);

  useEffect(() => {
    if (!isActive) return;
    if (geminiStatusRef.current.status === 'offline' || geminiStatusRef.current.status === 'degraded') {
      void runGeminiProbe(false, true);
    }
  }, [isActive, runGeminiProbe]);

  useEffect(() => {
    const onKeyUpdated = () => {
      setApiKeyDraft(getGeminiApiKey());
      reconnectAttemptsRef.current = 0;
      void runGeminiProbe(true, false);
    };
    window.addEventListener('dayrhythm:gemini-key-updated', onKeyUpdated);
    return () => window.removeEventListener('dayrhythm:gemini-key-updated', onKeyUpdated);
  }, [runGeminiProbe]);

  return {
    geminiStatus,
    setGeminiStatus,
    runGeminiProbe,
    showApiKeyModal,
    setShowApiKeyModal,
    apiKeyDraft,
    setApiKeyDraft,
    keySaveMessage,
    setKeySaveMessage,
    isProbingKey,
    handleSaveApiKey,
    handleResetApiKey,
  };
}
