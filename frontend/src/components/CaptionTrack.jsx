// 자막2 = 원본 소스 타임라인 캡션 트랙(장면과 분리). 소스 시간 기준으로 편집.
import { useState } from "react";

import { useStore } from "../store/useStore.js";
import TranslatedLine from "./TranslatedLine.jsx";

export default function CaptionTrack() {
  const captions = useStore((s) => s.captions);
  const updateCaption = useStore((s) => s.updateCaption);
  const removeCaption = useStore((s) => s.removeCaption);
  const addCaption = useStore((s) => s.addCaption);
  const language = useStore((s) => s.language);
  const scenes = useStore((s) => s.scenes);
  const selectedSceneNumber = useStore((s) => s.selectedSceneNumber);
  const [open, setOpen] = useState(true);

  const sorted = [...captions].sort(
    (a, b) => (a.sourceId || "").localeCompare(b.sourceId || "") || a.startUs - b.startUs
  );

  // 선택 장면의 원본 소스에 수동 캡션 추가(그 장면 시작 위치)
  const sel = scenes.find((sc) => sc.sceneNumber === selectedSceneNumber);
  const m = sel?.media;
  const canAdd = !!m?.origSourceId;
  const onAdd = () => {
    if (!canAdd) return;
    const start = m.origStartUs ?? 0;
    addCaption({
      id: `cap-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      sourceId: m.origSourceId,
      startUs: start,
      endUs: start + 2_000_000,
      text: "",
      ko: null,
    });
  };

  return (
    <div className="caption-track" style={{ marginTop: 12 }}>
      <div className="row" style={{ alignItems: "center" }}>
        <button className="ghost" style={{ fontSize: 12 }} onClick={() => setOpen((v) => !v)}>
          자막2 (원본 음성 캡션) {open ? "▾" : "▸"} {captions.length > 0 ? `(${captions.length})` : ""}
        </button>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="ghost" style={{ fontSize: 12 }} disabled={!canAdd}
          title={canAdd ? "선택한 장면 위치에 캡션 추가" : "원본 영상 장면을 선택하세요"}
          onClick={onAdd}>＋ 캡션</button>
      </div>

      {open && (
        <div className="caption-list" style={{ marginTop: 6, maxHeight: 280, overflowY: "auto" }}>
          {sorted.length === 0 && (
            <div className="muted" style={{ fontSize: 12 }}>동영상 분석 시 자동 생성됩니다.</div>
          )}
          {sorted.map((c) => (
            <div key={c.id} className="sub2-edit" style={{ marginBottom: 6 }}>
              <input
                className="sub2-text"
                value={c.text}
                placeholder="자막2 (원본 음성)"
                onChange={(e) => updateCaption(c.id, { text: e.target.value })}
              />
              {c.ko && c.ko !== c.text && <div className="sub2-ko">🇰🇷 {c.ko}</div>}
              <TranslatedLine text={c.text} />
              <div className="sub2-time">
                <input type="number" step="0.1" min="0" value={(c.startUs / 1e6).toFixed(1)}
                  onChange={(e) => updateCaption(c.id, { startUs: Math.round(parseFloat(e.target.value || 0) * 1e6) })} />
                <span>~</span>
                <input type="number" step="0.1" min="0" value={(c.endUs / 1e6).toFixed(1)}
                  onChange={(e) => updateCaption(c.id, { endUs: Math.round(parseFloat(e.target.value || 0) * 1e6) })} />
                <span>s</span>
                <button className="ghost danger" style={{ fontSize: 12, padding: "2px 6px" }}
                  onClick={() => removeCaption(c.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
