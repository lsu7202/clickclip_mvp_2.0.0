import { useState } from "react";

import { splitScenes } from "../api/endpoints.js";
import { resUrl } from "../api/client.js";
import { useStore } from "../store/useStore.js";
import { useTemplates } from "../hooks/useResources.js";
import Loading from "./Loading.jsx";

export default function SetupScreen() {
  const templates = useTemplates();
  const {
    language, title, templateId, scriptText,
    setLanguage, setTitle, setTemplateId, setScriptText, setScenes, setStep, selectScene,
  } = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const onContinue = async () => {
    setErr("");
    if (!scriptText.trim()) {
      setStep("editor"); // 빈 editor 진입(§4.1)
      return;
    }
    setBusy(true);
    try {
      const scenes = await splitScenes(scriptText, language);
      setScenes(scenes);
      selectScene(scenes[0]?.sceneNumber ?? null);
      setStep("editor");
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || "분할 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setup">
      <h1>ClickClip</h1>
      <div className="sub">대본을 장면으로 나누고, 자막·TTS·미디어를 채워 CapCut으로 내보냅니다.</div>

      <div className="field">
        <label>프레임 템플릿 (선택)</label>
        <div className="template-grid">
          <div
            className={`tpl none${templateId === null ? " active" : ""}`}
            onClick={() => setTemplateId(null)}
          >
            없음
          </div>
          {templates.map((t) => (
            <div
              key={t.name}
              className={`tpl${templateId === t.name ? " active" : ""}`}
              title={t.name}
              onClick={() => setTemplateId(t.name)}
            >
              <img src={resUrl(t.previewPath)} alt={t.name} />
            </div>
          ))}
        </div>
      </div>

      <div className="field">
        <label>제목 (폴더명/파일명)</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 강민경 횟집" />
      </div>

      <div className="field">
        <label>언어</label>
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="ko">한국어</option>
          <option value="ja">일본어</option>
        </select>
      </div>

      <div className="field">
        <label>대본 (비우면 빈 편집기로 시작)</label>
        <textarea rows={8} value={scriptText} onChange={(e) => setScriptText(e.target.value)} placeholder="대본을 붙여넣으세요…" />
      </div>

      {err && <div className="field" style={{ color: "var(--danger)" }}>{err}</div>}

      {busy ? (
        <Loading text="장면으로 나누는 중…" />
      ) : (
        <button className="primary" onClick={onContinue}>계속하기</button>
      )}
    </div>
  );
}
