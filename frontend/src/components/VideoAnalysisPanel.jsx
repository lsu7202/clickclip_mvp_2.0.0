// 동영상 분석: 업로드 → job → 폴링(1.7s) → 확인 모달 → 장면 삽입(§4.6/4.7).
// 분석 옵션: 원본 자막(STT+교정) / 해설 자막(전체 맥락 생성, 표시 전용) — 중복 선택 가능.
import { useEffect, useRef, useState } from "react";

import { getJob, startVideoAnalysis } from "../api/endpoints.js";
import { useStore } from "../store/useStore.js";
import Loading from "./Loading.jsx";

const POLL_MS = 1700;
const STYLES = [
  { key: "docu", name: "다큐형 (차분한 설명체)" },
  { key: "fun", name: "예능형 (드립·반말)" },
  { key: "story", name: "스토리텔링형 (긴장감)" },
  { key: "reaction", name: "리액션형 (시청자에게)" },
  { key: "custom", name: "커스텀 (예시 입력)" },
];

export default function VideoAnalysisPanel() {
  const language = useStore((s) => s.language);
  const selectedSceneNumber = useStore((s) => s.selectedSceneNumber);
  const scenes = useStore((s) => s.scenes);
  const insertScenesAt = useStore((s) => s.insertScenesAt);
  const addCaptions = useStore((s) => s.addCaptions);

  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null); // running/done/error
  const [result, setResult] = useState(null);
  const [wantCaptions, setWantCaptions] = useState(true);
  const [wantCommentary, setWantCommentary] = useState(false);
  const [commentaryStyle, setCommentaryStyle] = useState("docu");
  const [styleText, setStyleText] = useState("");
  const timer = useRef(null);

  const target = selectedSceneNumber ?? (scenes[scenes.length - 1]?.sceneNumber ?? 1);

  useEffect(() => () => clearTimeout(timer.current), []);

  const poll = (id) => {
    timer.current = setTimeout(async () => {
      try {
        const job = await getJob(id);
        setStatus(job.status);
        if (job.status === "done") { setResult(job.result); return; }
        if (job.status === "error") return;
        poll(id);
      } catch { poll(id); }
    }, POLL_MS);
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setResult(null); setStatus("running");
    const id = await startVideoAnalysis({
      video: f, language, targetSceneNumber: target,
      wantCaptions, wantCommentary, commentaryStyle, commentaryStyleText: styleText,
    });
    setJobId(id);
    poll(id);
  };

  const onApply = () => {
    if (!result) return;
    insertScenesAt(result.targetSceneNumber, result.scenes);
    addCaptions(result.captions || []); // 원본 자막 = 소스 캡션 트랙
    setResult(null); setStatus(null); setJobId(null);
  };
  const onCancel = () => { setResult(null); setStatus(null); setJobId(null); };

  const comTotal = result
    ? result.scenes.reduce((n, sc) => n + (sc.commentaryLines?.length || 0), 0)
    : 0;

  const checkStyle = { width: 20, height: 20, accentColor: "var(--accent, #7c5cff)", margin: 0, flex: "none", cursor: "pointer" };
  const optLabel = { display: "flex", alignItems: "center", gap: 10, margin: 0, fontSize: 14, cursor: "pointer" };

  return (
    <div>
      {/* 분석 옵션 */}
      <div style={{
        border: "1px solid var(--line, #3a3a48)", borderRadius: 10, padding: "12px 12px",
        display: "flex", flexDirection: "column", gap: 12, marginBottom: 12,
      }}>
        <div className="muted" style={{ fontSize: 12, letterSpacing: ".4px" }}>생성할 자막 (중복 선택 가능)</div>
        <label style={optLabel}>
          <input type="checkbox" style={checkStyle}
            checked={wantCaptions} onChange={(e) => setWantCaptions(e.target.checked)} />
          <span>💬 <b>원본 자막</b> <span className="muted" style={{ fontSize: 12 }}>— 실제 발화 전사</span></span>
        </label>
        <label style={optLabel}>
          <input type="checkbox" style={checkStyle}
            checked={wantCommentary} onChange={(e) => setWantCommentary(e.target.checked)} />
          <span>📝 <b>해설 자막</b> <span className="muted" style={{ fontSize: 12 }}>— 전체 맥락 기반 생성</span></span>
        </label>
        {wantCommentary && (
          <div style={{ paddingLeft: 30, display: "flex", flexDirection: "column", gap: 8 }}>
            <select value={commentaryStyle} onChange={(e) => setCommentaryStyle(e.target.value)}>
              {STYLES.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
            {commentaryStyle === "custom" && (
              <textarea rows={3} value={styleText} placeholder="원하는 말투의 예시 문장들을 붙여넣으세요 (이 말투를 모사합니다)"
                onChange={(e) => setStyleText(e.target.value)} />
            )}
          </div>
        )}
      </div>

      <label>분석할 동영상 업로드 <span className="muted">(장면 {target} 위치에 삽입)</span></label>
      <input type="file" accept="video/*" onChange={onFile}
        disabled={status === "running" || (!wantCaptions && !wantCommentary)} />
      {!wantCaptions && !wantCommentary && (
        <div style={{ color: "var(--danger, #ff5c7a)", fontSize: 12, marginTop: 6 }}>⚠ 자막 옵션을 하나 이상 선택하세요.</div>
      )}

      {status === "running" && <Loading text="동영상 분석 중… (다른 작업 가능)" />}
      {status === "error" && <div style={{ color: "var(--danger)", marginTop: 10 }}>분석 실패</div>}

      {result && (
        <div className="modal-backdrop" onClick={onCancel}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              감지된 샷 {result.scenes.length}개
              {wantCaptions ? ` · 원본 자막 ${(result.captions || []).length}줄` : ""}
              {wantCommentary ? ` · 해설 자막 ${comTotal}줄` : ""}
            </h3>
            <div className="shot-list">
              {(result.captions || []).map((c, j) => (
                <div key={`c${j}`} className="shot" style={{ display: "flex", gap: 8 }}>
                  <span className="muted" style={{ minWidth: 96 }}>
                    {(c.startUs / 1e6).toFixed(1)}~{(c.endUs / 1e6).toFixed(1)}s
                  </span>
                  <div>
                    <div style={{ color: "var(--sub2)" }}>{c.text}</div>
                    {c.ko && c.ko !== c.text && (
                      <div style={{ color: "#cbb6ff", fontSize: 11 }}>🇰🇷 {c.ko}</div>
                    )}
                  </div>
                </div>
              ))}
              {wantCommentary && result.scenes.map((sc, i) =>
                (sc.commentaryLines || []).length > 0 && (
                  <div key={`m${i}`} className="shot" style={{ display: "flex", gap: 8 }}>
                    <span className="muted" style={{ minWidth: 96 }}>📝 샷 {i + 1}</span>
                    <div>
                      {sc.commentaryLines.map((ln, j) => (
                        <div key={j} style={{ color: "#ffd28a" }}>{ln.text}</div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button onClick={onCancel}>취소</button>
              <button className="primary" onClick={onApply}>장면 {result.targetSceneNumber}에 적용</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
