import { useState } from "react";

import { exportDraft, generateTts } from "../api/endpoints.js";
import { useStore } from "../store/useStore.js";
import { useAutoTranslate } from "../hooks/useAutoTranslate.js";
import { useVoices } from "../hooks/useResources.js";
import { totalDurationUs } from "../store/sceneOps.js";
import { fmtUs } from "../util/format.js";
import ScenePreview from "./ScenePreview.jsx";
import SceneCard from "./SceneCard.jsx";
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
  const setScenes = useStore((s) => s.setScenes);
  const selectScene = useStore((s) => s.selectScene);
  const setLineTts = useStore((s) => s.setLineTts);
  const voices = useVoices();
  useAutoTranslate();

  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  const [exportErr, setExportErr] = useState("");
  const [ttsAllBusy, setTtsAllBusy] = useState(false);

  const selected = scenes.find((sc) => sc.sceneNumber === selectedSceneNumber) || null;
  const total = totalDurationUs(scenes);

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

  // 모든 장면의 모든 자막1 줄 TTS 생성
  const onGenerateAllTts = async () => {
    const jobs = [];
    for (const sc of scenes) {
      for (const ln of sc.subtitle1Lines) {
        if (ln.ttsText?.trim()) jobs.push({ sc, ln });
      }
    }
    if (jobs.length === 0) return;
    setTtsAllBusy(true);
    try {
      for (const { sc, ln } of jobs) {
        const voiceId = ln.voiceId || sc.voiceId || voices[0]?.voiceId;
        if (!voiceId) continue;
        try {
          const tts = await generateTts({
            ttsText: ln.ttsText, voiceId, language,
            sceneNumber: sc.sceneNumber, lineNumber: ln.lineNumber,
          });
          setLineTts(sc.sceneNumber, ln.lineNumber, tts);
        } catch { /* 실패 줄은 건너뜀 */ }
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
        {scenes.length === 0 ? (
          <div className="empty">
            장면이 없습니다.
            <div style={{ marginTop: 12 }}>
              <button className="primary" onClick={addFirstScene}>+ 첫 장면 추가</button>
            </div>
          </div>
        ) : (
          scenes.map((sc) => (
            <div key={sc.sceneNumber}>
              <SceneCard scene={sc} />
              <button className="add-line" onClick={() => addSceneAfter(sc.sceneNumber)}>+ 여기에 장면 추가</button>
            </div>
          ))
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
