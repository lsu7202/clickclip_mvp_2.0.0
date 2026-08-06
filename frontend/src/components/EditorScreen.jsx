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
import FullPreview from "./FullPreview.jsx";
import LongformPanel from "./LongformPanel.jsx";
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
  const resetAll = useStore((s) => s.resetAll);
  const format = useStore((s) => s.format);
  const originalVolume = useStore((s) => s.originalVolume);
  const ttsVolume = useStore((s) => s.ttsVolume);
  const setOriginalVolume = useStore((s) => s.setOriginalVolume);
  const setTtsVolume = useStore((s) => s.setTtsVolume);
  const voices = useVoices();
  useAutoTranslate();

  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  const [exportErr, setExportErr] = useState("");
  const [ttsAllBusy, setTtsAllBusy] = useState(false);
  const [exportWarns, setExportWarns] = useState(null); // 내보내기 사전 검증 경고
  const [previewing, setPreviewing] = useState(false); // 전체 미리보기 재생 중
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

  // 내보내기 사전 검증: 빈 미디어 / TTS 미생성 장면 경고
  const validateExport = () => {
    const noMedia = scenes.filter((sc) => !sc.media).map((sc) => sc.sceneNumber);
    const noTts = scenes
      .filter((sc) => sc.subtitle1Lines?.some((l) => l.ttsText?.trim()) && !sc.sceneTts)
      .map((sc) => sc.sceneNumber);
    const warns = [];
    if (noMedia.length) warns.push(`장면 ${noMedia.join(", ")} — 미디어가 없습니다 (빈 화면으로 출력)`);
    if (noTts.length) warns.push(`장면 ${noTts.join(", ")} — 나레이션 자막은 있는데 TTS 미생성`);
    return warns;
  };

  const onExport = () => {
    const warns = validateExport();
    if (warns.length) { setExportWarns(warns); return; }
    doExport();
  };

  const doExport = async () => {
    setExportWarns(null);
    setExportErr("");
    setExporting(true);
    try {
      const res = await exportDraft({ title, language, templateId, scenes, captions, originalVolume, ttsVolume, format });
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
          await runSceneTts(sc, voices, language, setSceneTts, format === "longform" ? 1.0 : null);
        } catch (e) {
          // 크레딧 소진은 재시도해도 실패 → 즉시 중단하고 안내(헛호출 방지)
          if (e?.response?.status === 402) {
            alert("TTS 크레딧이 소진되어 생성을 중단했습니다.\nTypecast(https://typecast.ai/developers/api)에서 크레딧을 충전한 뒤 다시 시도하세요.");
            break;
          }
          /* 그 외 실패 장면은 건너뜀 */
        }
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
          <button className="ghost" style={{ marginLeft: 6 }} disabled={scenes.length === 0}
            onClick={() => setPreviewing((p) => !p)}>
            {previewing ? "⏹ 정지" : "▶ 전체 미리보기"}
          </button>
          <button className="ghost danger" style={{ marginLeft: 6 }} title="현재 작업을 모두 지우고 처음부터"
            onClick={() => {
              if (window.confirm("현재 작업을 모두 지우고 새 작업을 시작할까요? (되돌릴 수 없음)")) {
                resetAll();
                useStore.temporal.getState().clear();
              }
            }}>🗑 새 작업</button>
          <span className="total" style={{ marginLeft: "auto" }}>총 길이 {fmtUs(total)}</span>
        </div>
        {previewing ? (
          <FullPreview onEnd={() => setPreviewing(false)} />
        ) : selected ? (
          selected.media?.durationUs != null
            ? <SceneScrubber key={selected.sceneNumber} scene={selected} />
            : <ScenePreview scene={selected} />
        ) : <div className="empty">장면을 선택하세요</div>}

        {format === "longform" && <LongformPanel />}

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

          {/* 전역 볼륨(전체 장면 공통, export 반영) */}
          <div className="row" style={{ alignItems: "center", gap: 6 }}>
            <label style={{ margin: 0, fontSize: 12, width: 62 }}>🔊 원본</label>
            <input type="range" min="0" max="100" style={{ flex: 1 }}
              value={Math.round(originalVolume * 100)}
              onChange={(e) => setOriginalVolume(e.target.value / 100)} />
            <span className="muted" style={{ fontSize: 11, width: 34, textAlign: "right" }}>{Math.round(originalVolume * 100)}%</span>
          </div>
          <div className="row" style={{ alignItems: "center", gap: 6 }}>
            <label style={{ margin: 0, fontSize: 12, width: 62 }}>🎙 TTS</label>
            <input type="range" min="0" max="100" style={{ flex: 1 }}
              value={Math.round(ttsVolume * 100)}
              onChange={(e) => setTtsVolume(e.target.value / 100)} />
            <span className="muted" style={{ fontSize: 11, width: 34, textAlign: "right" }}>{Math.round(ttsVolume * 100)}%</span>
          </div>

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

      {/* 내보내기 사전 검증 모달 */}
      {exportWarns && (
        <div className="modal-backdrop" onClick={() => setExportWarns(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>내보내기 전 확인</h3>
            {exportWarns.map((w, i) => (
              <div key={i} style={{ padding: "6px 0", borderBottom: "1px dashed var(--line, #3a3a48)", fontSize: 13 }}>⚠️ {w}</div>
            ))}
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button onClick={() => setExportWarns(null)}>돌아가서 수정</button>
              <button className="primary" onClick={doExport}>무시하고 내보내기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
