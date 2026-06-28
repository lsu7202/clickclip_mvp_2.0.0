import { useEffect, useState } from "react";

import { generateTts, selectSoundEffect } from "../api/endpoints.js";
import { workspaceUrl } from "../api/client.js";
import { useStore } from "../store/useStore.js";
import { sceneDurationUs } from "../store/sceneOps.js";
import { useSoundEffects, useVoices } from "../hooks/useResources.js";
import { fmtUs } from "../util/format.js";
import { playAudio } from "../util/audio.js";
import { Spinner } from "./Loading.jsx";
import TranslatedLine from "./TranslatedLine.jsx";

function LineRow({ scene, line, voices }) {
  const {
    updateLineText, updateLineTtsText, setLineVoice, setLineTts,
    removeLine, splitLineAtCaret, addLine,
  } = useStore();
  const language = useStore((s) => s.language);
  const [showTts, setShowTts] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const onTts = async () => {
    const voiceId = line.voiceId || scene.voiceId || voices[0]?.voiceId;
    if (!voiceId) return;
    setBusy(true);
    try {
      const tts = await generateTts({
        ttsText: line.ttsText, voiceId, language,
        sceneNumber: scene.sceneNumber, lineNumber: line.lineNumber,
      });
      setLineTts(scene.sceneNumber, line.lineNumber, tts);
    } catch (e) {
      alert(`TTS 생성 실패: ${e?.response?.data?.error || e.message || "알 수 없는 오류"}`);
    } finally {
      setBusy(false);
    }
  };

  const sceneVoiceName = voices.find((v) => v.voiceId === scene.voiceId)?.name || "장면 성우";

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
            <div className="row" style={{ marginTop: 4 }}>
              <label style={{ margin: 0, fontSize: 11 }}>이 줄 성우</label>
              <select
                style={{ width: "auto" }}
                value={line.voiceId || ""}
                onChange={(e) => setLineVoice(scene.sceneNumber, line.lineNumber, e.target.value || null)}
              >
                <option value="">장면 기본 ({sceneVoiceName})</option>
                {voices.map((v) => <option key={v.voiceId} value={v.voiceId}>{v.name}</option>)}
              </select>
            </div>
          </div>
        )}
        <div className="line-tools">
          <button className="ghost" style={{ fontSize: 12 }} onClick={() => setShowTts((v) => !v)}>
            발음·성우{line.ttsTextEdited ? " ✎" : ""} ▾
          </button>
          {busy ? <Spinner sm /> : (
            <button className="ghost" style={{ fontSize: 12 }} onClick={onTts}>
              {line.tts ? `TTS ✓ ${fmtUs(line.tts.durationUs)}` : "TTS 생성"}
            </button>
          )}
          {line.tts && (
            <button className="ghost" style={{ fontSize: 12 }} title="미리듣기"
              onClick={() => playAudio(workspaceUrl(line.tts.localPath))}>▶</button>
          )}
          <button className="ghost danger" style={{ fontSize: 12 }} onClick={() => removeLine(scene.sceneNumber, line.lineNumber)}>✕</button>
        </div>
      </div>
    </div>
  );
}

export default function SceneCard({ scene }) {
  const voices = useVoices();
  const soundEffects = useSoundEffects();
  const selectedSceneNumber = useStore((s) => s.selectedSceneNumber);
  const {
    selectScene, toggleMuted, toggleFitToTts, setSceneVoice, deleteScene,
    addLine, mergeSceneUp, splitSceneAtLine, setSceneDuration, setSceneSfx,
  } = useStore();
  const [ttsAllBusy, setTtsAllBusy] = useState(false);
  const [sfxBusy, setSfxBusy] = useState(false);
  const language = useStore((s) => s.language);
  const setLineTts = useStore((s) => s.setLineTts);

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

  const onTtsAll = async () => {
    setTtsAllBusy(true);
    try {
      for (const line of scene.subtitle1Lines) {
        if (!line.ttsText?.trim()) continue;
        const voiceId = line.voiceId || scene.voiceId || voices[0]?.voiceId;
        if (!voiceId) continue;
        const tts = await generateTts({
          ttsText: line.ttsText, voiceId, language,
          sceneNumber: scene.sceneNumber, lineNumber: line.lineNumber,
        });
        setLineTts(scene.sceneNumber, line.lineNumber, tts);
      }
    } finally {
      setTtsAllBusy(false);
    }
  };

  return (
    <div className={`scene-card${selected ? " selected" : ""}`} onClick={() => selectScene(scene.sceneNumber)}>
      <div className="head">
        <span className="num">장면 {scene.sceneNumber}</span>
        <span className="spacer" />
        <button className="ghost" style={{ fontSize: 12 }} title="길이를 TTS에 맞춤"
          onClick={(e) => { e.stopPropagation(); toggleFitToTts(scene.sceneNumber); }}>
          {scene.fitToTts ? "⏱TTS맞춤 ✓" : "⏱TTS맞춤"}
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
        <div className="thumb" onClick={(e) => { e.stopPropagation(); selectScene(scene.sceneNumber); }}>
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
              <LineRow scene={scene} line={line} voices={voices} />
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
          <button className="ghost" onClick={onTtsAll} disabled={scene.subtitle1Lines.length === 0}>🔊 이 장면 TTS</button>
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
