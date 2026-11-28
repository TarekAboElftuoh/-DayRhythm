import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { PersistedChatMessage } from '../../types/dayrhythm';
import type { AssistantMode } from './types';

export interface UseGeminiScrollAndAutoSendParams {
  isActive: boolean;
  mode: AssistantMode;
  setMode: Dispatch<SetStateAction<AssistantMode>>;
  input: string;
  setInputForMode: (m: AssistantMode, v: string) => void;
  messages: PersistedChatMessage[];
  loading: boolean;
  streamingMsgIdByMode: Record<AssistantMode, string | null>;
  activeLocation: { nameAr: string; lat: number; lng: number };
  setUserCoords: Dispatch<SetStateAction<{ lat: number; lng: number }>>;
  setGpsStatus: Dispatch<SetStateAction<string>>;
  abortControllersRef: MutableRefObject<Record<AssistantMode, AbortController | null>>;
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  userScrolledUpRef: MutableRefObject<boolean>;
  recognitionRef: MutableRefObject<{ abort: () => void } | null>;
  toggleVoiceInput: () => void;
  setVoiceNote: (note: string) => void;
  initialPrompt?: string | null;
  onConsumeInitialPrompt?: () => void;
  autoStartVoice?: boolean;
  onConsumeAutoStartVoice?: () => void;
}

export function useGeminiScrollAndAutoSend(p: UseGeminiScrollAndAutoSendParams) {
  const {
    isActive,
    mode,
    setMode,
    input,
    setInputForMode,
    messages,
    loading,
    streamingMsgIdByMode,
    activeLocation,
    setUserCoords,
    setGpsStatus,
    abortControllersRef,
    textareaRef,
    scrollContainerRef,
    userScrolledUpRef,
    recognitionRef,
    toggleVoiceInput,
    setVoiceNote,
    initialPrompt,
    onConsumeInitialPrompt,
    autoStartVoice,
    onConsumeAutoStartVoice,
  } = p;

  useEffect(() => {
    const controllers = abortControllersRef.current;
    return () => {
      recognitionRef.current?.abort();
      controllers.chat?.abort();
      controllers.maps?.abort();
      controllers.search?.abort();
    };
  }, [abortControllersRef, recognitionRef]);

  useEffect(() => {
    setUserCoords({ lat: activeLocation.lat, lng: activeLocation.lng });
    setGpsStatus(activeLocation.nameAr);
  }, [activeLocation, setGpsStatus, setUserCoords]);

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      scrollContainerRef.current?.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: streamingMsgIdByMode[mode] ? 'auto' : 'smooth',
      });
    }
  }, [messages, loading, streamingMsgIdByMode, mode, scrollContainerRef, userScrolledUpRef]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '44px';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input, textareaRef]);

  const focusComposerInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
      const len = el.value.length;
      el.setSelectionRange(len, len);
    } catch {
      el.focus();
    }
  }, [textareaRef]);

  const scrollThreadToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    userScrolledUpRef.current = false;
  }, [scrollContainerRef, userScrolledUpRef]);

  useEffect(() => {
    if (!isActive) return;
    const rafId = window.requestAnimationFrame(() => {
      scrollThreadToBottom();
      focusComposerInput();
    });
    const timerId = window.setTimeout(() => {
      scrollThreadToBottom();
      focusComposerInput();
    }, 80);
    const lateId = window.setTimeout(scrollThreadToBottom, 600);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
      window.clearTimeout(lateId);
    };
  }, [isActive, mode, focusComposerInput, scrollThreadToBottom]);

  useEffect(() => {
    const onFocusChat = () => window.requestAnimationFrame(() => focusComposerInput());
    window.addEventListener('dayrhythm:focus-chat', onFocusChat);
    return () => window.removeEventListener('dayrhythm:focus-chat', onFocusChat);
  }, [focusComposerInput]);

  useEffect(() => {
    if (!initialPrompt) return;
    setMode('chat');
    setInputForMode('chat', initialPrompt);
    onConsumeInitialPrompt?.();
  }, [initialPrompt, onConsumeInitialPrompt, setInputForMode, setMode]);

  useEffect(() => {
    if (!autoStartVoice) return;
    setMode('chat');
    onConsumeAutoStartVoice?.();
    const timer = window.setTimeout(() => {
      try {
        toggleVoiceInput();
      } catch {
        setVoiceNote('اضغط على زر الميكروفون أدناه لبدء التحدث.');
      }
    }, 220);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartVoice, onConsumeAutoStartVoice]);

  return { focusComposerInput, scrollThreadToBottom };
}
