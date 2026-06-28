// 자막 줄 아래 번역 표시(이해 보조용). 번역 ON + 텍스트 있을 때만.
import { useTranslationStore } from "../store/translationStore.js";

export default function TranslatedLine({ text }) {
  const enabled = useTranslationStore((s) => s.enabled);
  const target = useTranslationStore((s) => s.target);
  const cache = useTranslationStore((s) => s.cache);
  if (!enabled || !text?.trim()) return null;
  const tr = cache[`${target}:${text}`];
  return <div className="translated">🌐 {tr ?? "…"}</div>;
}
