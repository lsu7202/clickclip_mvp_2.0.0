// 선택 장면의 프레임 스크러버(왼쪽 패널). 큰 미리보기 + 필름스트립 + 프리즈/분할.
// 위치(window offset)는 그대로 extractFrame(atUs)/splitSceneAtTimeUs(offset)에 전달 — 백엔드 수정 0.
import { useEffect, useMemo, useRef, useState } from "react";

import { extractFrame } from "../api/endpoints.js";
import { resUrl, workspaceUrl } from "../api/client.js";
import { useStore } from "../store/useStore.js";
import { mediaSrcEnd, mediaSrcStart } from "../store/sceneOps.js";
import { Spinner } from "./Loading.jsx";

const STRIP_N = 16;

export default function SceneScrubber({ scene }) {
  const templateId = useStore((s) => s.templateId);
  const insertFreezeScene = useStore((s) => s.insertFreezeScene);
  const splitSceneAtTimeUs = useStore((s) => s.splitSceneAtTimeUs);

  const media = scene.media;
  const winStart = mediaSrcStart(media);          // 파일 기준 윈도우 시작(us)
  const winEnd = mediaSrcEnd(media);              // 파일 기준 윈도우 끝(us)
  const winLen = Math.max(1, winEnd - winStart);
  const fps = media.fps || null;
  const url = workspaceUrl(media.localPath);

  const vref = useRef(null);
  const [offset, setOffset] = useState(0);        // 윈도우 내 오프셋(us)
  const [strip, setStrip] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showFreeze, setShowFreeze] = useState(false);

  const atUs = winStart + offset;                 // 파일 절대 시각(추출용)
  const frame = fps ? Math.round((offset / 1e6) * fps) : null;
  const totalFrames = fps ? Math.round((winLen / 1e6) * fps) : null;
  const stepUs = fps ? Math.round(1e6 / fps) : 50_000; // 1프레임 or 0.05s

  // 미리보기 비디오를 스크럽 위치로 동기화(재생 중이 아닐 때만)
  useEffect(() => {
    const v = vref.current;
    if (v && !playing) v.currentTime = atUs / 1e6;
  }, [atUs, playing]);

  // 필름스트립 생성: 같은 클립을 오프스크린에서 N장 샘플 → 캔버스
  useEffect(() => {
    let cancelled = false;
    const v = document.createElement("video");
    v.src = url; v.crossOrigin = "anonymous"; v.muted = true; v.preload = "auto";
    const canvas = document.createElement("canvas");
    const times = Array.from({ length: STRIP_N }, (_, k) =>
      (winStart + (winLen * (k + 0.5)) / STRIP_N) / 1e6);
    const thumbs = [];
    let i = 0;
    const seek = () => {
      if (cancelled) return;
      if (i >= STRIP_N) { setStrip([...thumbs]); return; }
      v.currentTime = times[i];
    };
    const onLoaded = () => {
      canvas.width = 64;
      canvas.height = Math.round(64 * (v.videoHeight / v.videoWidth)) || 114;
      seek();
    };
    const onSeeked = () => {
      try {
        canvas.getContext("2d").drawImage(v, 0, 0, canvas.width, canvas.height);
        thumbs.push(canvas.toDataURL("image/jpeg", 0.5));
      } catch { thumbs.push(null); }
      i += 1; seek();
    };
    v.addEventListener("loadeddata", onLoaded);
    v.addEventListener("seeked", onSeeked);
    v.load();
    return () => { cancelled = true; v.src = ""; };
  }, [url, winStart, winLen]);

  // 재생(윈도우 구간만): timeupdate로 플레이헤드 이동, 끝에서 정지
  const togglePlay = () => {
    const v = vref.current; if (!v) return;
    if (playing) { v.pause(); setPlaying(false); return; }
    if (v.currentTime * 1e6 >= winEnd - 20_000) v.currentTime = winStart / 1e6;
    v.play(); setPlaying(true);
  };
  const onTimeUpdate = () => {
    if (!playing) return;
    const v = vref.current; const cur = v.currentTime * 1e6;
    if (cur >= winEnd - 20_000) { v.pause(); setPlaying(false); setOffset(winLen); return; }
    setOffset(Math.max(0, cur - winStart));
  };

  const setFromX = (clientX, el) => {
    const r = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    if (playing) { vref.current?.pause(); setPlaying(false); }
    setOffset(Math.round(p * winLen));
  };
  const step = (dir) => { setOffset((o) => Math.max(0, Math.min(winLen, o + dir * stepUs))); };

  const dragging = useRef(false);
  useEffect(() => {
    const move = (e) => { if (dragging.current) setFromX(e.clientX, dragging.current); };
    const up = () => { dragging.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }); // eslint-disable-line

  const onFreeze = async (side) => {
    setBusy(true); setShowFreeze(false);
    try {
      const asset = await extractFrame(media.localPath, atUs);
      insertFreezeScene(scene.sceneNumber, side, asset);
    } catch (e) {
      alert(`프리즈 실패: ${e?.response?.data?.error || e.message || "오류"}`);
    } finally { setBusy(false); }
  };
  const onSplit = () => {
    if (offset <= 0 || offset >= winLen) return;
    splitSceneAtTimeUs(scene.sceneNumber, offset);
  };

  const pct = (offset / winLen) * 100;
  const fmt = (us) => (us / 1e6).toFixed(2);
  const cover = useMemo(() => ({ objectFit: "cover", width: "100%", height: "100%" }), []);

  return (
    <div className="scene-scrubber">
      <div className="preview-frame" style={{ position: "relative" }}>
        <video ref={vref} src={url} muted playsInline style={cover} onTimeUpdate={onTimeUpdate} />
        {templateId && <img className="overlay" src={resUrl(`/res/templates/${templateId}`)} alt="" />}
        <div className="scrub-meta">{fmt(atUs)}s {frame != null ? `· f${frame}` : ""}</div>
      </div>

      {/* 필름스트립 + 플레이헤드 */}
      <div className="strip-wrap" style={{ position: "relative", marginTop: 10, userSelect: "none" }}>
        <div className="strip" style={{ display: "flex", height: 44, borderRadius: 7, overflow: "hidden", border: "1px solid var(--line,#3a3a48)", cursor: "pointer" }}
          onMouseDown={(e) => { dragging.current = e.currentTarget; setFromX(e.clientX, e.currentTarget); }}>
          {(strip.length ? strip : Array.from({ length: STRIP_N })).map((src, i) => (
            <div key={i} style={{ flex: "1 0 auto", borderRight: "1px solid rgba(0,0,0,.25)", background: src ? `center/cover url(${src})` : "#262633" }} />
          ))}
        </div>
        <div className="playhead" style={{ position: "absolute", top: -4, bottom: 0, left: `${pct}%`, width: 2, background: "var(--accent2,#a48bff)", pointerEvents: "none" }}>
          <div style={{ position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)", width: 12, height: 12, borderRadius: "50%", background: "var(--accent2,#a48bff)", border: "2px solid #fff" }} />
        </div>
      </div>

      <div className="row" style={{ alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button className="ghost" onClick={togglePlay} title="구간 재생/정지">{playing ? "⏸" : "▶"}</button>
        <button className="ghost" onClick={() => step(-1)} title={fps ? "1프레임 뒤로" : "0.05s 뒤로"}>◀</button>
        <button className="ghost" onClick={() => step(1)} title={fps ? "1프레임 앞으로" : "0.05s 앞으로"}>▶</button>
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{fmt(offset)}s</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {frame != null ? `프레임 ${frame}/${totalFrames}` : `/ ${fmt(winLen)}s`}
        </span>
      </div>

      <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {busy ? <Spinner sm /> : (
          <span style={{ position: "relative", display: "inline-flex" }}>
            <button className="ghost" onClick={() => setShowFreeze((v) => !v)} title="이 프레임을 멈춘 장면으로 추가">⏸ 프리즈 ▾</button>
            {showFreeze && (
              <div style={{ position: "absolute", bottom: "110%", left: 0, zIndex: 5, background: "var(--panel,#1e1e28)", border: "1px solid #444", borderRadius: 6, padding: 4, display: "flex", flexDirection: "column", gap: 2, whiteSpace: "nowrap" }}>
                <button className="ghost" style={{ fontSize: 12 }} onClick={() => onFreeze("before")}>↤ 앞에 프리즈</button>
                <button className="ghost" style={{ fontSize: 12 }} onClick={() => onFreeze("after")}>↦ 뒤에 프리즈</button>
              </div>
            )}
          </span>
        )}
        <button className="primary" onClick={onSplit} disabled={offset <= 0 || offset >= winLen} title="이 위치에서 두 장면으로 분할">✂ 여기서 분할</button>
      </div>
    </div>
  );
}
