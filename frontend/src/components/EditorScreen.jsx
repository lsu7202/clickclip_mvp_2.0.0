import { useRef, useState } from "react";

import { exportDraft } from "../api/endpoints.js";
import { useStore } from "../store/useStore.js";
import { useAutoTranslate } from "../hooks/useAutoTranslate.js";
import { useVoices } from "../hooks/useResources.js";
import { totalDurationUs } from "../store/sceneOps.js";
import { fmtUs } from "../util/format.js";
import ScenePreview from "./ScenePreview.jsx";
import SceneCard, { runSceneTts } from "./SceneCard.jsx";
import AssetPanel from "./AssetPanel.jsx";
import BottomDock from "./BottomDock.jsx";
import CaptionTrack from "./CaptionTrack.jsx";
import Loading from "./Loading.jsx";
import SceneScrubber from "./SceneScrubber.jsx";

export default function EditorScreen() {
  const scenes = useStore((s) => s.scenes);
  const captions = useStore((s) => s.captions);
  const selectedSceneNumber = useStore((s) => s.selectedSceneNumber);
  const title = useStore((s) => s.title);
  const language = useStore((s) => s.language);
  const templateId = useStore((s) => s.templateId);
  const setStep = useStore((s) => s.setStep);
  const addSceneAfter = useStore((s) => s.addSceneAfter);
  const addSceneAtStart = useStore((s) => s.addSceneAtStart);
  const setScenes = useStore((s) => s.setScenes);
  const selectScene = useStore((s) => s.selectScene);
  const setSceneTts = useStore((s) => s.setSceneTts);
  const defaultVoiceId = useStore((s) => s.defaultVoiceId);
  const setDefaultVoice = useStore((s) => s.setDefaultVoice);
  const deleteScenes = useStore((s) => s.deleteScenes);
  const setAllFlipH = useStore((s) => s.setAllFlipH);
  const voices = useVoices();
  useAutoTranslate();

  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  const [exportErr, setExportErr] = useState("");
  const [ttsAllBusy, setTtsAllBusy] = useState(false);
  const [checked, setChecked] = useState(() => new Set()); // 다중삭제 체크
  const anchorRef = useRef(null); // Shift 범위 선택 기준점(직전 체크한 장면)

  const toggleCheck = (sceneNumber, shiftKey) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (shiftKey && anchorRef.current != null) {
        // 기준점~현재 사이 범위 전체 선택(기준점은 그대로 유지)
        const a = scenes.findIndex((s) => s.sceneNumber === anchorRef.current);
        const b = scenes.findIndex((s) => s.sceneNumber === sceneNumber);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i += 1) next.add(scenes[i].sceneNumber);
          return next;
        }
      }
      next.has(sceneNumber) ? next.delete(sceneNumber) : next.add(sceneNumber);
      return next;
    });
    // 기준점은 '일반 클릭'에서만 갱신 — 쉬프트 클릭은 기준점을 안 옮김
    if (!shiftKey) anchorRef.current = sceneNumber;
  };
  const onDeleteChecked = () => {
    if (checked.size === 0) return;
    deleteScenes([...checked]);
    setChecked(new Set());
  };

  const selected = scenes.find((sc) => sc.sceneNumber === selectedSceneNumber) || null;
  const total = totalDurationUs(scenes);
  const allFlipped = scenes.length > 0 && scenes.every((sc) => sc.flipH);

  const onExport = async () => {
    setExportErr("");
    setExporting(true);
    try {
      const res = await exportDraft({ title, language, templateId, scenes, captions });
      setExportResult(res);
    } catch (e) {
      setExportErr(e?.response?.data?.error || e.message || "내보내기 실패");
    } finally {
      setExporting(false);
    }
  };

  // 모든 장면 TTS 생성(장면별로 줄을 합쳐 1회 합성)
  const onGenerateAllTts = async () => {
    if (scenes.length === 0) return;
    setTtsAllBusy(true);
    try {
      for (const sc of scenes) {
        try {
          await runSceneTts(sc, voices, language, setSceneTts);
        } catch { /* 실패 장면은 건너뜀 */ }
      }
    } finally {
      setTtsAllBusy(false);
    }
  };

  const addFirstScene = () => {
    if (scenes.length === 0) {
      const voiceId = voices[0]?.voiceId || "";
      setScenes([{ sceneNumber: 1, media: null, voiceId, muted: false, fitToTts: true, subtitle1Lines: [], durationUs: 0 }]);
      selectScene(1);
    }
  };

  return (
    <div className="editor">
      {/* 좌 */}
      <div className="pane left">
        <div className="topbar">
          <button className="ghost" onClick={() => setStep("setup")}>← 설정</button>
          <span className="total" style={{ marginLeft: "auto" }}>총 길이 {fmtUs(total)}</span>
        </div>
        {selected ? (
          selected.media?.durationUs != null
            ? <SceneScrubber key={selected.sceneNumber} scene={selected} />
            : <ScenePreview scene={selected} />
        ) : <div className="empty">장면을 선택하세요</div>}

        <CaptionTrack />

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* 대표 성우: 선택하면 전 장면 적용 + 이후 새 장면 기본 */}
          <div className="row" style={{ alignItems: "center", gap: 6 }}>
            <label style={{ margin: 0, fontSize: 13 }}>🎙 대표 성우</label>
            <select style={{ flex: 1 }} value={defaultVoiceId || ""}
              onChange={(e) => setDefaultVoice(e.target.value)}>
              <option value="">개별 설정</option>
              {voices.map((v) => <option key={v.voiceId} value={v.voiceId}>{v.name}</option>)}
            </select>
          </div>

          <button onClick={() => setAllFlipH(!allFlipped)} disabled={scenes.length === 0}
            title="모든 장면을 한 번에 좌우반전">
            ⇋ 전체 좌우반전 {allFlipped ? "✓" : ""}
          </button>

          {ttsAllBusy ? (
            <Loading text="모든 장면 TTS 생성 중…" />
          ) : (
            <button style={{ width: "100%" }} onClick={onGenerateAllTts} disabled={scenes.length === 0}>
              🔊 모든 장면 TTS 생성
            </button>
          )}

          {exporting ? (
            <Loading text="CapCut 내보내는 중…" />
          ) : (
            <button className="primary" style={{ width: "100%" }} onClick={onExport} disabled={scenes.length === 0}>
              CapCut으로 내보내기
            </button>
          )}
        </div>

        {exportErr && <div style={{ color: "var(--danger)", marginTop: 8 }}>{exportErr}</div>}
        {exportResult && (
          <div className="ctx-banner" style={{ marginTop: 10 }}>
            ✅ CapCut에 생성됨: <b>{exportResult.folderName}</b>
            <div className="muted" style={{ wordBreak: "break-all" }}>{exportResult.draftPath}</div>
            <div className="muted" style={{ marginTop: 4 }}>CapCut을 새로고침하면 드래프트 목록에 나타납니다.</div>
          </div>
        )}
      </div>

      {/* 중 */}
      <div className="pane center">
        {checked.size > 0 && (
          <div className="row" style={{ alignItems: "center", gap: 8, marginBottom: 8, position: "sticky", top: 0, zIndex: 2, background: "var(--bg,#14141b)", padding: "4px 0" }}>
            <span className="muted" style={{ fontSize: 13 }}>{checked.size}개 선택됨</span>
            <span style={{ flex: 1 }} />
            <button className="ghost" onClick={() => setChecked(new Set())}>선택 해제</button>
            <button className="ghost danger" onClick={onDeleteChecked}>🗑 선택 삭제</button>
          </div>
        )}
        {scenes.length === 0 ? (
          <div className="empty">
            장면이 없습니다.
            <div style={{ marginTop: 12 }}>
              <button className="primary" onClick={addFirstScene}>+ 첫 장면 추가</button>
            </div>
          </div>
        ) : (
          <>
            <button className="add-line" onClick={addSceneAtStart}>+ 여기에 장면 추가</button>
            {scenes.map((sc) => (
              <div key={sc.sceneNumber}>
                <SceneCard scene={sc} checked={checked.has(sc.sceneNumber)} onToggleCheck={(shift) => toggleCheck(sc.sceneNumber, shift)} />
                <button className="add-line" onClick={() => addSceneAfter(sc.sceneNumber)}>+ 여기에 장면 추가</button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* 우 */}
      <div className="pane right">
        <AssetPanel />
      </div>

      <BottomDock />
    </div>
  );
}
