// 번역 ON 시 모든 자막 텍스트를 모아 디바운스 배치 번역 → 캐시 저장.
import { useEffect, useRef } from "react";

import { translateTexts } from "../api/endpoints.js";
import { useStore } from "../store/useStore.js";
import { useTranslationStore } from "../store/translationStore.js";

const DEBOUNCE_MS = 500;
const CHUNK = 100;

export function useAutoTranslate() {
  const scenes = useStore((s) => s.scenes);
  const captions = useStore((s) => s.captions);
  const enabled = useTranslationStore((s) => s.enabled);
  const target = useTranslationStore((s) => s.target);
  const cache = useTranslationStore((s) => s.cache);
  const addTranslations = useTranslationStore((s) => s.addTranslations);
  const timer = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    // 모든 자막 텍스트 수집(자막1 + 자막2 캡션 트랙)
    const texts = new Set();
    for (const sc of scenes) {
      for (const ln of sc.subtitle1Lines || []) if (ln.text?.trim()) texts.add(ln.text);
    }
    for (const c of captions) if (c.text?.trim()) texts.add(c.text);
    const missing = [...texts].filter((t) => cache[`${target}:${t}`] === undefined);
    if (missing.length === 0) return;

    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      for (let i = 0; i < missing.length; i += CHUNK) {
        const batch = missing.slice(i, i + CHUNK);
        try {
          const translated = await translateTexts(batch, target);
          addTranslations(target, batch.map((t, j) => [t, translated[j] ?? ""]));
        } catch {
          // 실패는 조용히 무시(보조 기능)
        }
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer.current);
  }, [enabled, target, scenes, captions, cache, addTranslations]);
}
