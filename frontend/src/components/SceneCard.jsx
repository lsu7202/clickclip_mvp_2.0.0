import { useEffect, useState } from "react";

import { generateSceneTts, selectSoundEffect } from "../api/endpoints.js";
import { workspaceUrl } from "../api/client.js";
import { useStore } from "../store/useStore.js";
import { lineDurationUs, sceneDurationUs } from "../store/sceneOps.js";
import { useSoundEffects, useVoices } from "../hooks/useResources.js";
import { fmtUs } from "../util/format.js";
import { playAudio } from "../util/audio.js";
import { Spinner } from "./Loading.jsx";
import TranslatedLine from "./TranslatedLine.jsx";

// 장면의 자막1 줄들을 합쳐 1회 합성(자연스러운 발화). 성우는 장면 단위.
export async function runSceneTts(scene, voices, language, setSceneTts) {
  const voiceId = scene.voiceId || voices[0]?.voiceId;
  if (!voiceId) return;
  const lines = scene.subtitle1Lines.map((l) => ({ lineNumber: l.lineNumber, ttsText: l.ttsText || "" }));
  if (!lines.some((l) => l.ttsText.trim())) return;
  const res = await generateSceneTts({ sceneNumber: scene.sceneNumber, lines, voiceId, language });
  setSceneTts(scene.sceneNumber, { localPath: res.localPath, durationUs: res.durationUs }, res.lineRanges);
}

function LineRow({ scene, line }) {
  const {
    updateLineText, updateLineTtsText, removeLine, splitLineAtCaret, addLine,
  } = useStore();
  const [showTts, setShowTts] = useState(false);

  const onKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    const caret = e.target.selectionStart ?? line.text.length;
    if (caret > 0 && caret < line.text.length) {
      splitLineAtCaret(scene.sceneNumber, line.lineNumber, caret);
    } else if (caret === 0) {
      addLine(scene.sceneNumber, line.lineNumber - 1);
    } else {
      addLine(scene.sceneNumber, line.lineNumber);
    }
  };
  const onKeyDownEmpty = (e) => {
    if (e.key === "Backspace" && line.text === "") {
      e.preventDefault();
      removeLine(scene.sceneNumber, line.lineNumber);
    }
  };

  const dur = lineDurationUs(line);

  return (
    <div className="line-row">
      <div className="num">{line.lineNumber}</div>
      <div className="grow">
        <textarea
          rows={1}
          value={line.text}
          placeholder="자막1 (내레이션)"
          onChange={(e) => updateLineText(scene.sceneNumber, line.lineNumber, e.target.value)}
          onKeyDown={(e) => { onKeyDown(e); onKeyDownEmpty(e); }}
        />
        <TranslatedLine text={line.text} />
        {showTts && (
          <div className="tts-edit">
            <textarea
              rows={1}
              value={line.ttsText}
              placeholder="발음 텍스트 (TTS)"
              onChange={(e) => updateLineTtsText(scene.sceneNumber, line.lineNumber, e.target.value)}
            />
          </div>
        )}
        <div className="line-tools">
          <button className="ghost" style={{ fontSize: 12 }} onClick={() => setShowTts((v) => !v)}>
            발음{line.ttsTextEdited ? " ✎" : ""} ▾
          </button>
          {dur > 0 && <span className="muted" style={{ fontSize: 11 }}>🔊 {fmtUs(dur)}</span>}
          <button className="ghost danger" style={{ fontSize: 12 }} onClick={() => removeLine(scene.sceneNumber, line.lineNumber)}>✕</button>
        </div>
      </div>
    </div>
  );
}

export default function SceneCard({ scene, checked = false, onToggleCheck }) {
  const voices = useVoices();
  const soundEffects = useSoundEffects();
  const selectedSceneNumber = useStore((s) => s.selectedSceneNumber);
  const {
    selectScene, toggleMuted, toggleFitToTts, setSceneVoice, deleteScene,
    addLine, mergeSceneUp, splitSceneAtLine, setSceneDuration, setSceneSfx, toggleFlipH,
  } = useStore();
  const [ttsAllBusy, setTtsAllBusy] = useState(false);
  const [sfxBusy, setSfxBusy] = useState(false);
  const language = useStore((s) => s.language);
  const setSceneTts = useStore((s) => s.setSceneTts);

  const selected = scene.sceneNumber === selectedSceneNumber;
  const dur = sceneDurationUs(scene);

  // 장면 시작 효과음: 라이브러리(my_sound_effect)에서 선택 → workspace 복사
  const onSfxPick = async (name) => {
    if (!name) return;
    setSfxBusy(true);
    try {
      const sfx = await selectSoundEffect(name);
      setSceneSfx(scene.sceneNumber, sfx);
    } catch (err) {
      alert(`효과음 적용 실패: ${err?.response?.data?.error || err.message || "오류"}`);
    } finally {
      setSfxBusy(false);
    }
  };

  // 장면 성우가 비었거나 목록에 없으면 첫 보이스로 자동 보정(빈 성우로 TTS 실패 방지)
  useEffect(() => {
    if (voices.length === 0) return;
    const valid = voices.some((v) => v.voiceId === scene.voiceId);
    if (!valid) setSceneVoice(scene.sceneNumber, voices[0].voiceId);
  }, [voices, scene.voiceId, scene.sceneNumber]);

  const onSceneTts = async () => {
    setTtsAllBusy(true);
    try {
      await runSceneTts(scene, voices, language, setSceneTts);
    } catch (e) {
      alert(`TTS 생성 실패: ${e?.response?.data?.error || e.message || "오류"}`);
    } finally {
      setTtsAllBusy(false);
    }
  };

  return (
    <div className={`scene-card${selected ? " selected" : ""}`} onClick={() => selectScene(scene.sceneNumber)}>
      <div className="head">
        <input type="checkbox" style={{ width: 22, height: 22, margin: "0 8px 0 0", cursor: "pointer", flex: "none" }} checked={checked} readOnly
          title="선택(다중 삭제). Shift+클릭으로 범위 선택"
          onClick={(e) => { e.stopPropagation(); onToggleCheck?.(e.shiftKey); }} />
        <span className="num">장면 {scene.sceneNumber}</span>
        <span className="spacer" />
        <button className="ghost" style={{ fontSize: 12 }} title="길이를 TTS에 맞춤"
          onClick={(e) => { e.stopPropagation(); toggleFitToTts(scene.sceneNumber); }}>
          {scene.fitToTts ? "⏱TTS맞춤 ✓" : "⏱TTS맞춤"}
        </button>
        <button className="ghost" style={{ fontSize: 12 }} title="좌우반전"
          onClick={(e) => { e.stopPropagation(); toggleFlipH(scene.sceneNumber); }}>
          {scene.flipH ? "⇋ 반전 ✓" : "⇋ 반전"}
        </button>
        <button className="ghost" style={{ fontSize: 12 }} title="원본 음소거"
          onClick={(e) => { e.stopPropagation(); toggleMuted(scene.sceneNumber); }}>
          {scene.muted ? "🔇" : "🔊"}
        </button>
        {scene.sceneNumber > 1 && (
          <button className="ghost" style={{ fontSize: 12 }} title="위 장면과 병합"
            onClick={(e) => { e.stopPropagation(); mergeSceneUp(scene.sceneNumber); }}>⇧병합</button>
        )}
        <button className="ghost danger" style={{ fontSize: 12 }}
          onClick={(e) => { e.stopPropagation(); deleteScene(scene.sceneNumber); }}>삭제</button>
      </div>

      <div className="body">
        <div className="thumb" onClick={(e) => { e.stopPropagation(); selectScene(scene.sceneNumber); }}
          style={scene.flipH ? { transform: "scaleX(-1)" } : undefined}>
          {scene.media && scene.media.durationUs != null ? (
            // 분할된 장면은 source 윈도우 시작 프레임만 미리보기(#t=start)
            <video src={workspaceUrl(scene.media.localPath) + (scene.media.sourceStartUs ? `#t=${(scene.media.sourceStartUs / 1e6).toFixed(2)}` : "")} muted />
          ) : scene.media ? (
            <img src={workspaceUrl(scene.media.localPath)} alt="" />
          ) : (
            "미디어\n선택"
          )}
        </div>

        <div>
          <div className="row" style={{ marginBottom: 8 }}>
            <label style={{ margin: 0 }}>장면 성우</label>
            <select style={{ width: "auto" }} value={scene.voiceId}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setSceneVoice(scene.sceneNumber, e.target.value)}>
              {voices.map((v) => <option key={v.voiceId} value={v.voiceId}>{v.name}</option>)}
            </select>
          </div>

          {scene.subtitle1Lines.map((line, i) => (
            <div key={line.lineNumber} onClick={(e) => e.stopPropagation()}>
              <LineRow scene={scene} line={line} />
              {i < scene.subtitle1Lines.length - 1 && (
                <button className="add-line" style={{ fontSize: 11 }}
                  onClick={() => splitSceneAtLine(scene.sceneNumber, i + 1)}>⎯ 여기서 장면 분리 ⎯</button>
              )}
            </div>
          ))}
          <button className="add-line" onClick={(e) => { e.stopPropagation(); addLine(scene.sceneNumber); }}>＋ 자막 추가</button>
        </div>
      </div>

      <div className="toolbar" onClick={(e) => e.stopPropagation()}>
        {ttsAllBusy ? <Spinner sm /> : (
          <button className="ghost" onClick={onSceneTts} disabled={scene.subtitle1Lines.length === 0}>🔊 장면 TTS</button>
        )}
        {scene.sceneTts?.localPath && (
          <button className="ghost" style={{ fontSize: 12 }} title="장면 TTS 미리듣기"
            onClick={() => playAudio(workspaceUrl(scene.sceneTts.localPath))}>▶ {fmtUs(scene.sceneTts.durationUs)}</button>
        )}
        {/* 장면 시작 효과음 */}
        {sfxBusy ? <Spinner sm /> : scene.startSfx ? (
          <span className="chip" style={{ display: "flex", alignItems: "center", gap: 3 }}>
            🔔 {fmtUs(scene.startSfx.durationUs || 0)}
            <button className="ghost" style={{ fontSize: 11, padding: "0 3px" }} title="미리듣기"
              onClick={() => playAudio(workspaceUrl(scene.startSfx.localPath))}>▶</button>
            <button className="ghost danger" style={{ fontSize: 11, padding: "0 3px" }}
              onClick={() => setSceneSfx(scene.sceneNumber, null)}>✕</button>
          </span>
        ) : (
          <select className="ghost" style={{ fontSize: 12, width: "auto" }} value=""
            title="장면 시작 효과음 선택 (my_sound_effect 폴더)"
            onChange={(e) => onSfxPick(e.target.value)}>
            <option value="">🔔 효과음…</option>
            {soundEffects.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        )}

        <span className="chip" style={{ display: "flex", alignItems: "center", gap: 3 }}
          title={scene.manualDurationUs != null ? "수동 체류시간" : "자동 체류시간 (편집하면 고정됨)"}>
          ⏱
          <input type="number" step="0.1" min="0.1" style={{ width: 50, padding: "1px 3px" }}
            value={(dur / 1e6).toFixed(1)}
            onChange={(e) => setSceneDuration(scene.sceneNumber, Math.max(100000, Math.round(parseFloat(e.target.value || 0) * 1e6)))} />
          s
          {scene.manualDurationUs != null && (
            <button className="ghost" style={{ fontSize: 11, padding: "0 4px" }} title="자동 길이로 되돌림"
              onClick={() => setSceneDuration(scene.sceneNumber, null)}>자동</button>
          )}
        </span>
      </div>
    </div>
  );
}
