// 번역 상태(이해 보조용). SSOT/Undo와 분리된 transient 스토어.
import { create } from "zustand";

export const useTranslationStore = create((set, get) => ({
  enabled: false,
  target: "ko", // 'ko' | 'en' | 'ja'
  cache: {}, // `${target}:${text}` -> translatedText

  setEnabled: (enabled) => set({ enabled }),
  setTarget: (target) => set({ target }),

  // 번역 결과 병합 저장
  addTranslations: (target, pairs) =>
    set((s) => {
      const next = { ...s.cache };
      for (const [text, translated] of pairs) next[`${target}:${text}`] = translated;
      return { cache: next };
    }),

  get: (text) => get().cache[`${get().target}:${text}`],
}));
