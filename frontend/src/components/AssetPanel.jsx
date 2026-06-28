import { useState } from "react";

import {
  downloadAsset, generateAiMedia, searchGif, searchImage, uploadAsset,
} from "../api/endpoints.js";
import { resUrl, workspaceUrl } from "../api/client.js";
import { useStore } from "../store/useStore.js";
import { useStyles, useSamples } from "../hooks/useResources.js";
import Loading from "./Loading.jsx";
import VideoAnalysisPanel from "./VideoAnalysisPanel.jsx";

const TABS = [
  ["gif", "GIF"],
  ["image", "이미지"],
  ["ai_media", "AI 미디어"],
  ["upload", "업로드"],
  ["video_analysis", "동영상 분석"],
];

function SearchTab({ kind, onApply }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = kind === "gif" ? await searchGif(q) : await searchImage(q);
      setResults(r);
    } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <input value={q} maxLength={kind === "gif" ? 50 : 100}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder={`${kind === "gif" ? "GIF" : "이미지"} 검색…`} />
        <button onClick={run}>검색</button>
      </div>
      {busy ? <Loading text="검색 중…" /> : (
        <div className="grid-results">
          {results.map((r, i) => (
            <div key={i} className="cell" onClick={() => onApply(() => downloadAsset(r.url))}>
              <img src={r.url} alt="" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AiMediaTab({ onApply }) {
  const styles = useStyles();
  const samples = useSamples();
  const { aiMedia } = useStore((s) => s.assetPanel);
  const setAiMedia = useStore((s) => s.setAiMedia);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const isVideo = aiMedia.mediaType === "video";
  const hasRef = !!aiMedia.referenceName;
  // 동영상+참조(I2V)는 비율 파라미터 없음 → 비율 숨김(§6.3)
  const showAspect = !(isVideo && hasRef);

  const run = async () => {
    setBusy(true);
    try {
      const asset = await generateAiMedia({
        mediaType: aiMedia.mediaType,
        styleId: aiMedia.styleId,
        situationText: aiMedia.situationText,
        referenceName: aiMedia.referenceName,
        aspectRatio: showAspect ? aiMedia.aspectRatio : null,
      });
      setResult(asset);
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="tabs">
        <button className={!isVideo ? "active" : ""} onClick={() => setAiMedia({ mediaType: "image" })}>이미지</button>
        <button className={isVideo ? "active" : ""} onClick={() => setAiMedia({ mediaType: "video" })}>동영상</button>
      </div>

      <label>스타일 프리셋</label>
      <div className="style-grid" style={{ marginBottom: 12 }}>
        <div className={`cell${aiMedia.styleId === null ? " active" : ""}`} onClick={() => setAiMedia({ styleId: null })}>
          <div className="nm" style={{ padding: 16 }}>없음</div>
        </div>
        {styles.map((st) => (
          <div key={st.name} className={`cell${aiMedia.styleId === st.name ? " active" : ""}`} onClick={() => setAiMedia({ styleId: st.name })}>
            <img src={resUrl(st.examplePath)} alt={st.name} />
            <div className="nm">{st.name}</div>
          </div>
        ))}
      </div>

      <label>참조 이미지 (선택)</label>
      <select style={{ marginBottom: 12 }} value={aiMedia.referenceName || ""} onChange={(e) => setAiMedia({ referenceName: e.target.value || null })}>
        <option value="">없음</option>
        {samples.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
      </select>

      {showAspect && (
        <>
          <label>비율</label>
          <select style={{ marginBottom: 12 }} value={aiMedia.aspectRatio} onChange={(e) => setAiMedia({ aspectRatio: e.target.value })}>
            <option value="9:16">9:16 (세로)</option>
            <option value="1:1">1:1</option>
            <option value="16:9">16:9 (가로)</option>
          </select>
        </>
      )}

      <label>{aiMedia.styleId ? "상황 입력" : "프롬프트"}</label>
      <textarea rows={3} value={aiMedia.situationText} onChange={(e) => setAiMedia({ situationText: e.target.value })}
        placeholder={aiMedia.styleId ? "무슨 상황인지만 적으세요" : "전체 프롬프트"} />

      <div style={{ marginTop: 10 }}>
        {busy ? <Loading text="생성 중…" /> : (
          <button className="primary" style={{ width: "100%" }} onClick={run} disabled={!aiMedia.situationText.trim()}>생성</button>
        )}
      </div>

      {result && !busy && (
        <div style={{ marginTop: 12 }}>
          <div className="preview-frame" style={{ maxWidth: 180, margin: "0 auto" }}>
            {result.sourceType === "ai_video"
              ? <video src={workspaceUrl(result.localPath)} muted loop autoPlay playsInline />
              : <img src={workspaceUrl(result.localPath)} alt="" />}
          </div>
          <button className="primary" style={{ width: "100%", marginTop: 8 }} onClick={() => onApply(() => Promise.resolve(result))}>이 결과 적용</button>
        </div>
      )}
    </div>
  );
}

function UploadTab({ onApply }) {
  const [busy, setBusy] = useState(false);
  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    onApply(() => uploadAsset(f)).finally(() => setBusy(false));
  };
  return busy ? <Loading text="업로드 중…" /> : (
    <div>
      <label>이미지/동영상 업로드</label>
      <input type="file" accept="image/*,video/*" onChange={onFile} />
    </div>
  );
}

export default function AssetPanel() {
  const tab = useStore((s) => s.assetPanel.tab);
  const setAssetPanel = useStore((s) => s.setAssetPanel);
  const selectedSceneNumber = useStore((s) => s.selectedSceneNumber);
  const setSceneMedia = useStore((s) => s.setSceneMedia);

  // 에셋을 받아 선택 장면에 적용
  const applyAsset = async (producer) => {
    if (selectedSceneNumber == null) return;
    const asset = await producer();
    setSceneMedia(selectedSceneNumber, asset);
  };

  return (
    <div>
      <div className="ctx-banner">
        {selectedSceneNumber != null ? <>장면 <b>{selectedSceneNumber}</b> 적용 중</> : "장면을 선택하세요"}
      </div>
      <div className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? "active" : ""} onClick={() => setAssetPanel({ tab: k })}>{label}</button>
        ))}
      </div>

      {tab === "gif" && <SearchTab kind="gif" onApply={applyAsset} />}
      {tab === "image" && <SearchTab kind="image" onApply={applyAsset} />}
      {tab === "ai_media" && <AiMediaTab onApply={applyAsset} />}
      {tab === "upload" && <UploadTab onApply={applyAsset} />}
      {tab === "video_analysis" && <VideoAnalysisPanel />}
    </div>
  );
}
