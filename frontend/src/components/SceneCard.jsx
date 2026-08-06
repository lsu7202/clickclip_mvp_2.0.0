import { useEffect, useRef, useState } from "react";

import { generateAiMedia, generateSceneTts, selectSoundEffect } from "../api/endpoints.js";
import { workspaceUrl } from "../api/client.js";
import { useStore } from "../store/useStore.js";
import { usePlaybackStore } from "../store/playbackStore.js";
import { lineDurationUs, sceneDurationUs } from "../store/sceneOps.js";
import { useSoundEffects, useVoices } from "../hooks/useResources.js";
import { NO_TEXT, styleP } from "../config/imageStyles.js";
import { fmtUs } from "../util/format.js";
import { playAudio } from "../util/audio.js";
import { Spinner } from "./Loading.jsx";
import TranslatedLine from "./TranslatedLine.jsx";

// 장면의 자막1 줄들을 합쳐 1회 합성(자연스러운 발화). 성우는 장면 단위.
export async function runSceneTts(scene, voices, language, setSceneTts, speed = null) {
  const voiceId = scene.voiceId || voices[0]?.voiceId;
  if (!voiceId) return;
  const lines = scene.subtitle1Lines.map((l) => ({ lineNumber: l.lineNumber, ttsText: l.ttsText || "" }));
  if (!lines.some((l) => l.ttsText.trim())) return;
  const res = await generateSceneTts({ sceneNumber: scene.sceneNumber, lines, voiceId, language, speed });
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
          placeholder="나레이션 자막 (TTS)"
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
    moveScene, duplicateScene,
    addCaption, updateCaption, removeCaption,
    addCommentaryLine, updateCommentary, removeCommentaryLine,
  } = useStore();
  const captions = useStore((s) => s.captions);
  // 이 장면에 표시되는 원본 자막(소스 윈도우 겹침, 소스 시간순)
  const origStart = scene.media?.origStartUs ?? 0;
  const sceneCaps = scene.media?.origSourceId
    ? captions
        .filter(
          (c) => c.sourceId === scene.media.origSourceId &&
            c.startUs < (scene.media.origEndUs ?? Infinity) &&
            c.endUs > origStart
        )
        .sort((a, b) => a.startUs - b.startUs)
    : [];
  // 재생 중 '지금 발화 중' 캡션(노래방식)
  const pbSourceId = usePlaybackStore((s) => s.sourceId);
  const pbTimeUs = usePlaybackStore((s) => s.sourceTimeUs);
  const pbPlaying = usePlaybackStore((s) => s.playing);
  const isNowCap = (c) =>
    pbPlaying && c.sourceId === pbSourceId && pbTimeUs != null &&
    pbTimeUs >= c.startUs && pbTimeUs < c.endUs;
  const [showCaps, setShowCaps] = useState(false);
  const [showCom, setShowCom] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [i2vBusy, setI2vBusy] = useState(false);
  const [ttsAllBusy, setTtsAllBusy] = useState(false);
  const [sfxBusy, setSfxBusy] = useState(false);
  const format = useStore((s) => s.format);
  const storeCharacters = useStore((s) => s.characters);
  const updateSceneStore = useStore((s) => s.updateScene);
  const setSceneMedia = useStore((s) => s.setSceneMedia);
  const isLongform = format === "longform";

  // 롱폼: 이 장면 이미지 생성(캐릭터 등장 시 레퍼런스 edit로 동일 인물 유지)
  const onGenImage = async () => {
    if (!scene.imagePrompt?.trim()) return;
    setImgBusy(true);
    try {
      const ref = storeCharacters.find((c) => (scene.characterNames || []).includes(c.name) && c.refLocalPath);
      const asset = await generateAiMedia({
        mediaType: "image",
        situationText: `${scene.imagePrompt}, ${styleP(useStore.getState().imageStyle)} ${NO_TEXT}`,
        referencePath: ref?.refLocalPath ?? null,
        aspectRatio: "16:9",
      });
      setSceneMedia(scene.sceneNumber, asset);
    } catch (e) {
      alert(`이미지 생성 실패: ${e?.response?.data?.error || e.message}`);
    } finally { setImgBusy(false); }
  };

  // 롱폼: 이 장면 이미지 → 영상(i2v, fal Wan). 선택한 장면만.
  const onI2v = async () => {
    if (!scene.media?.localPath || scene.media.durationUs != null) return;
    setI2vBusy(true);
    try {
      const asset = await generateAiMedia({
        mediaType: "video",
        situationText: scene.imagePrompt?.trim() || "Animate this illustration naturally with subtle motion and gentle camera movement.",
        referencePath: scene.media.localPath,
        durationS: Math.ceil(sceneDurationUs(scene) / 1e6), // 장면 체류시간(TTS)에 맞춰 자동(모델 허용값 스냅)
      });
      setSceneMedia(scene.sceneNumber, asset);
    } catch (e) {
      alert(`영상 변환 실패: ${e?.response?.data?.error || e.message}`);
    } finally { setI2vBusy(false); }
  };
  const language = useStore((s) => s.language);
  const setSceneTts = useStore((s) => s.setSceneTts);

  const selected = scene.sceneNumber === selectedSceneNumber;
  const dur = sceneDurationUs(scene);

  // 전체 미리보기 재생 중 현재 장면이면 카드가 보이게 스크롤
  const cardRef = useRef(null);
  const playingNow = usePlaybackStore((s) => s.playing && s.sceneNumber === scene.sceneNumber);
  useEffect(() => {
    if (playingNow) cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [playingNow]);

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
      await runSceneTts(scene, voices, language, setSceneTts, isLongform ? 1.0 : null); // 롱폼은 기본 속도
    } catch (e) {
      alert(e?.response?.status === 402
        ? "TTS 크레딧이 소진되었습니다.\nTypecast(https://typecast.ai/developers/api)에서 충전 후 다시 시도하세요."
        : `TTS 생성 실패: ${e?.response?.data?.error || e.message || "오류"}`);
    } finally {
      setTtsAllBusy(false);
    }
  };

  return (
    <div ref={cardRef} className={`scene-card${selected ? " selected" : ""}`} onClick={() => selectScene(scene.sceneNumber)}>
      <div className="head">
        <input type="checkbox" style={{ width: 22, height: 22, margin: "0 8px 0 0", cursor: "pointer", flex: "none" }} checked={checked} readOnly
          title="선택(다중 삭제). Shift+클릭으로 범위 선택"
          onClick={(e) => { e.stopPropagation(); onToggleCheck?.(e.shiftKey); }} />
        <span className="num">장면 {scene.sceneNumber}</span>
        <button className="ghost" style={{ fontSize: 12, padding: "1px 5px" }} title="위로 이동"
          onClick={(e) => { e.stopPropagation(); moveScene(scene.sceneNumber, -1); }}>↑</button>
        <button className="ghost" style={{ fontSize: 12, padding: "1px 5px" }} title="아래로 이동"
          onClick={(e) => { e.stopPropagation(); moveScene(scene.sceneNumber, 1); }}>↓</button>
        <button className="ghost" style={{ fontSize: 12, padding: "1px 5px" }} title="장면 복제(바로 아래)"
          onClick={(e) => { e.stopPropagation(); duplicateScene(scene.sceneNumber); }}>⧉</button>
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
          <button className="add-line" onClick={(e) => { e.stopPropagation(); addLine(scene.sceneNumber); }}>＋ 나레이션 자막 추가</button>

          {/* 원본 자막(소스 앵커 캡션) — 이 장면 창에 걸친 것들. 시간은 장면 기준 초로 표시 */}
          {scene.media?.origSourceId && (
            <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8 }}>
              <button className="ghost" style={{ fontSize: 12 }} onClick={() => setShowCaps((v) => !v)}>
                💬 원본 자막 {showCaps ? "▾" : `▸ (${sceneCaps.length})`}
              </button>
              {showCaps && (
                <div style={{ marginTop: 4 }}>
                  {sceneCaps.map((c) => (
                    <div key={c.id} className="sub2-edit" style={{
                      marginBottom: 6,
                      ...(isNowCap(c) ? { background: "rgba(124,92,255,.16)", outline: "1px solid var(--accent, #7c5cff)", borderRadius: 6 } : {}),
                    }}>
                      <input className="sub2-text" value={c.text} placeholder="원본 자막"
                        onChange={(e) => updateCaption(c.id, { text: e.target.value })} />
                      {c.ko && c.ko !== c.text && <div className="sub2-ko">🇰🇷 {c.ko}</div>}
                      <TranslatedLine text={c.text} />
                      <div className="sub2-time">
                        <input type="number" step="0.1" value={((c.startUs - origStart) / 1e6).toFixed(1)}
                          onChange={(e) => updateCaption(c.id, { startUs: origStart + Math.round(parseFloat(e.target.value || 0) * 1e6) })} />
                        <span>~</span>
                        <input type="number" step="0.1" value={((c.endUs - origStart) / 1e6).toFixed(1)}
                          onChange={(e) => updateCaption(c.id, { endUs: origStart + Math.round(parseFloat(e.target.value || 0) * 1e6) })} />
                        <span>s</span>
                        <button className="ghost danger" style={{ fontSize: 12, padding: "2px 6px" }}
                          onClick={() => removeCaption(c.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                  <button className="add-line" style={{ fontSize: 11 }}
                    onClick={() => addCaption({
                      id: `cap-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
                      sourceId: scene.media.origSourceId,
                      startUs: origStart, endUs: origStart + 2_000_000, text: "", ko: null,
                    })}>＋ 원본 자막 추가</button>
                </div>
              )}
            </div>
          )}

          {/* 해설 자막(장면 소유, 표시 전용) */}
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 6 }}>
            <button className="ghost" style={{ fontSize: 12 }} onClick={() => setShowCom((v) => !v)}>
              📝 해설 자막 {showCom ? "▾" : `▸ (${(scene.commentaryLines || []).length})`}
            </button>
            {showCom && (
              <div style={{ marginTop: 4 }}>
                {(scene.commentaryLines || []).map((ln) => (
                  <div key={ln.lineNumber} className="sub2-edit" style={{ marginBottom: 6 }}>
                    <input className="sub2-text" value={ln.text} placeholder="해설 자막"
                      onChange={(e) => updateCommentary(scene.sceneNumber, ln.lineNumber, { text: e.target.value })} />
                    <TranslatedLine text={ln.text} />
                    <div className="sub2-time">
                      <input type="number" step="0.1" min="0" value={(ln.startUs / 1e6).toFixed(1)}
                        onChange={(e) => updateCommentary(scene.sceneNumber, ln.lineNumber, { startUs: Math.round(parseFloat(e.target.value || 0) * 1e6) })} />
                      <span>~</span>
                      <input type="number" step="0.1" min="0" value={(ln.endUs / 1e6).toFixed(1)}
                        onChange={(e) => updateCommentary(scene.sceneNumber, ln.lineNumber, { endUs: Math.round(parseFloat(e.target.value || 0) * 1e6) })} />
                      <span>s</span>
                      <button className="ghost danger" style={{ fontSize: 12, padding: "2px 6px" }}
                        onClick={() => removeCommentaryLine(scene.sceneNumber, ln.lineNumber)}>✕</button>
                    </div>
                  </div>
                ))}
                <button className="add-line" style={{ fontSize: 11 }}
                  onClick={() => addCommentaryLine(scene.sceneNumber)}>＋ 해설 자막 추가</button>
              </div>
            )}
          </div>

          {/* 롱폼: 이미지 프롬프트 + 개별 생성 */}
          {isLongform && (
            <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 6 }}>
              <button className="ghost" style={{ fontSize: 12 }} onClick={() => setShowPrompt((v) => !v)}>
                🎨 이미지 프롬프트 {showPrompt ? "▾" : scene.imagePrompt?.trim() ? "▸ ✓" : "▸"}
              </button>
              {showPrompt && (
                <div style={{ marginTop: 4 }}>
                  <textarea rows={3} style={{ fontSize: 12 }} value={scene.imagePrompt || ""}
                    placeholder="이 장면의 이미지 프롬프트 (영어) — 좌측 '일괄 생성' 또는 직접 입력"
                    onChange={(e) => updateSceneStore(scene.sceneNumber, { imagePrompt: e.target.value })} />
                  {(scene.characterNames || []).length > 0 && (
                    <div className="muted" style={{ fontSize: 11, margin: "2px 0" }}>
                      🎭 등장: {scene.characterNames.join(", ")}
                    </div>
                  )}
                  {imgBusy ? <Spinner sm /> : (
                    <button className="ghost" style={{ fontSize: 12 }} onClick={onGenImage} disabled={!scene.imagePrompt?.trim()}>
                      🖼 {scene.media ? "이미지 재생성(교체)" : "이미지 생성"}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
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
        {/* 롱폼: 선택 장면만 이미지→영상 변환(i2v) */}
        {isLongform && scene.media && scene.media.durationUs == null && (
          i2vBusy ? <Spinner sm /> : (
            <button className="ghost" style={{ fontSize: 12 }} title="이 이미지를 AI 영상으로 변환 (선택한 장면만)"
              onClick={onI2v}>🎞 영상으로</button>
          )
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
