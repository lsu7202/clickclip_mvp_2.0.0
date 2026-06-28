// 동영상 분석: 업로드 → job → 폴링(1.7s) → 확인 모달 → 장면 삽입(§4.6/4.7).
import { useEffect, useRef, useState } from "react";

import { getJob, startVideoAnalysis } from "../api/endpoints.js";
import { useStore } from "../store/useStore.js";
import Loading from "./Loading.jsx";

const POLL_MS = 1700;

export default function VideoAnalysisPanel() {
  const language = useStore((s) => s.language);
  const selectedSceneNumber = useStore((s) => s.selectedSceneNumber);
  const scenes = useStore((s) => s.scenes);
  const insertScenesAt = useStore((s) => s.insertScenesAt);
  const addCaptions = useStore((s) => s.addCaptions);

  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null); // running/done/error
  const [result, setResult] = useState(null);
  const [applySubtitle, setApplySubtitle] = useState(true);
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
    const id = await startVideoAnalysis({ video: f, language, targetSceneNumber: target, applySubtitle });
    setJobId(id);
    poll(id);
  };

  const onApply = () => {
    if (!result) return;
    insertScenesAt(result.targetSceneNumber, result.scenes);
    addCaptions(result.captions || []); // 자막2 = 원본 소스 캡션 트랙
    setResult(null); setStatus(null); setJobId(null);
  };
  const onCancel = () => { setResult(null); setStatus(null); setJobId(null); };

  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <label style={{ margin: 0 }}>
          <input type="checkbox" style={{ width: "auto", marginRight: 6 }}
            checked={applySubtitle} onChange={(e) => setApplySubtitle(e.target.checked)} />
          자막2 포함
        </label>
      </div>
      <label>분석할 동영상 업로드 (장면 {target} 위치에 삽입)</label>
      <input type="file" accept="video/*" onChange={onFile} disabled={status === "running"} />

      {status === "running" && <Loading text="동영상 분석 중… (다른 작업 가능)" />}
      {status === "error" && <div style={{ color: "var(--danger)", marginTop: 10 }}>분석 실패</div>}

      {result && (
        <div className="modal-backdrop" onClick={onCancel}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>감지된 샷 {result.scenes.length}개 · 자막2 {(result.captions || []).length}줄</h3>
            <label style={{ margin: "8px 0" }}>
              <input type="checkbox" style={{ width: "auto", marginRight: 6 }}
                checked={applySubtitle} disabled />
              자막2 {applySubtitle ? "포함" : "제외"} (업로드 시 설정값)
            </label>
            <div className="shot-list">
              {(result.captions || []).map((c, j) => (
                <div key={j} className="shot" style={{ display: "flex", gap: 8 }}>
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
