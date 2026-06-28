// 하단 고정 작업바(부가기능 도크): 뒤로/앞으로 · 번역 · 향후 확장.
// 화면 하단 중앙 고정, 가로 1/3, 항상 떠 있음.
import { useEffect, useState } from "react";

import { useStore } from "../store/useStore.js";
import { useTranslationStore } from "../store/translationStore.js";

export default function BottomDock() {
  const [, force] = useState(0);
  const temporal = useStore.temporal;
  useEffect(() => temporal.subscribe(() => force((n) => n + 1)), [temporal]);
  const { undo, redo, pastStates, futureStates } = temporal.getState();

  const trEnabled = useTranslationStore((s) => s.enabled);
  const trTarget = useTranslationStore((s) => s.target);
  const setTrEnabled = useTranslationStore((s) => s.setEnabled);
  const setTrTarget = useTranslationStore((s) => s.setTarget);

  return (
    <div className="bottom-dock">
      <button className="ghost" disabled={pastStates.length === 0} onClick={() => undo()} title="실행취소">↶</button>
      <button className="ghost" disabled={futureStates.length === 0} onClick={() => redo()} title="다시실행">↷</button>
      <span className="dock-div" />
      <label className="dock-toggle">
        <input type="checkbox" checked={trEnabled} onChange={(e) => setTrEnabled(e.target.checked)} />
        번역
      </label>
      {trEnabled && (
        <select value={trTarget} onChange={(e) => setTrTarget(e.target.value)}>
          <option value="ko">한국어</option>
          <option value="en">EN</option>
          <option value="ja">日本語</option>
        </select>
      )}
    </div>
  );
}
