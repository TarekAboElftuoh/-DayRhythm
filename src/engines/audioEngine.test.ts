import { describe, expect, it } from 'vitest';
import { classifyTaskSound } from './audioEngine';

describe('audioEngine: classifyTaskSound', () => {
  it('correctly classifies prayer anchors and prayer keywords', () => {
    expect(classifyTaskSound('صلاة الظهر', '🕌')).toBe('prayer');
    expect(classifyTaskSound('موعد أذان المغرب', '')).toBe('prayer');
    expect(classifyTaskSound('Random Task', '', true)).toBe('prayer');
    expect(classifyTaskSound('Fajr Prayer', '')).toBe('prayer');
  });

  it('correctly classifies hydration and water tasks', () => {
    expect(classifyTaskSound('شرب كوب ماء', '💧')).toBe('water');
    expect(classifyTaskSound('تذكير المياه', '')).toBe('water');
    expect(classifyTaskSound('Hydration check', '🥤')).toBe('water');
  });

  it('correctly classifies medication tasks', () => {
    expect(classifyTaskSound('أخذ فيتامين د', '💊')).toBe('medication');
    expect(classifyTaskSound('جرعة الدواء المسائية', '')).toBe('medication');
  });

  it('correctly classifies sleep, exercise, and focus tasks', () => {
    expect(classifyTaskSound('وقت النوم والاسترخاء', '🌙')).toBe('sleep_suhoor');
    expect(classifyTaskSound('جلسة مشي مسائي', '🚶')).toBe('walk_health');
    expect(classifyTaskSound('مذاكرة كورس الديف أوبس', '💻')).toBe('focus_work');
    expect(classifyTaskSound('مهمة عامة غير مصنفة', '')).toBe('general');
  });
});
