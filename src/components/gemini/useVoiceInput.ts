import { useRef, useState } from 'react';
import type { AppLanguage } from '../../types/dayrhythm';

export function useVoiceInput({
  language,
  input,
  setInput,
}: {
  language: AppLanguage;
  input: string;
  setInput: (val: string) => void;
}) {
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [voiceNote, setVoiceNote] = useState('');
  const voiceBaseInputRef = useRef('');
  const recognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(null);

  const toggleVoiceInput = () => {
    if (isListeningVoice) {
      recognitionRef.current?.stop();
      setIsListeningVoice(false);
      return;
    }

    const nativeVoice = (window as Window & {
      DayRhythmNative?: { startVoiceInput?: (lang: string) => void };
    }).DayRhythmNative;
    if (nativeVoice?.startVoiceInput) {
      voiceBaseInputRef.current = input.trim();
      setVoiceNote(language === 'ar' ? 'تكلّم دلوقتي…' : 'Listening…');
      nativeVoice.startVoiceInput(language === 'ar' ? 'ar-EG' : 'en-US');
      return;
    }

    type SpeechRecognitionCtor = new () => {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      maxAlternatives: number;
      onstart: (() => void) | null;
      onend: (() => void) | null;
      onerror: ((ev: { error?: string }) => void) | null;
      onresult: ((ev: {
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
      }) => void) | null;
      start: () => void;
      stop: () => void;
      abort: () => void;
    };

    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const SpeechRec = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRec) {
      setVoiceNote('الإملاء الصوتي غير مدعوم في هذا المتصفح.');
      window.setTimeout(() => setVoiceNote(''), 4000);
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = language === 'ar' ? 'ar-EG' : 'en-US';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;

      voiceBaseInputRef.current = input.trim();

      rec.onstart = () => {
        setIsListeningVoice(true);
        setVoiceNote(language === 'ar' ? 'أتسمّع الآن... تكلّم بأمرك' : 'Listening...');
      };

      rec.onresult = (ev) => {
        let transcript = '';
        for (let i = 0; i < ev.results.length; i++) {
          transcript += ev.results[i]?.[0]?.transcript ?? '';
        }
        const combined = [voiceBaseInputRef.current, transcript.trim()].filter(Boolean).join(' ');
        setInput(combined);
      };

      rec.onerror = (ev) => {
        setIsListeningVoice(false);
        if (ev.error === 'not-allowed') {
          setVoiceNote('يرجى السماح بصلاحية الميكروفون لاستخدام الإدخال الصوتي.');
        } else if (ev.error !== 'no-speech') {
          setVoiceNote('تعذر التقاط الصوت — جرّب مرة أخرى.');
        } else {
          setVoiceNote('');
        }
        window.setTimeout(() => setVoiceNote(''), 3500);
      };

      rec.onend = () => {
        setIsListeningVoice(false);
        setVoiceNote('');
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setIsListeningVoice(false);
      setVoiceNote('تعذر تشغيل الميكروفون.');
      window.setTimeout(() => setVoiceNote(''), 3000);
    }
  };

  return {
    isListeningVoice,
    setIsListeningVoice,
    voiceNote,
    setVoiceNote,
    voiceBaseInputRef,
    recognitionRef,
    toggleVoiceInput,
  };
}
