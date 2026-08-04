import { useState } from "react";

import { generateScript, splitScenes, splitScenesLongform } from "../api/endpoints.js";
import { resUrl } from "../api/client.js";
import { useStore } from "../store/useStore.js";
import { useTemplates } from "../hooks/useResources.js";
import Loading from "./Loading.jsx";

const CATEGORIES = [
  { key: "economy", name: "💰 경제" },
  { key: "war", name: "⚔️ 전쟁" },
  { key: "folktale", name: "📖 전래동화" },
];

export default function SetupScreen() {
  const templates = useTemplates();
  const {
    language, title, templateId, scriptText, format, category,
    setLanguage, setTitle, setTemplateId, setScriptText, setScenes, setStep, selectScene,
    setFormat, setCategory,
  } = useStore();
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [topic, setTopic] = useState("");
  const [topicDesc, setTopicDesc] = useState("");
  const [targetChars, setTargetChars] = useState(3000); // 대본 목표 글자수
  const [err, setErr] = useState("");

  const isLongform = format === "longform";

  // 롱폼: 카테고리별 AI 대본 생성(검색 그라운딩) → 대본란에 채움(편집 가능)
  const onGenerateScript = async () => {
    if (!topic.trim()) return;
    setErr("");
    setGenBusy(true);
    try {
      const script = await generateScript({ category, topic, description: topicDesc, language, targetChars });
      setScriptText(script);
      if (!title.trim()) setTitle(topic.trim());
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || "대본 생성 실패");
    } finally {
      setGenBusy(false);
    }
  };

  const onContinue = async () => {
    setErr("");
    if (!scriptText.trim()) {
      setStep("editor"); // 빈 editor 진입(§4.1)
      return;
    }
    setBusy(true);
    try {
      // 롱폼: 1문장=1장면 파싱 / 쇼츠: 기존 의미 분할
      const scenes = isLongform
        ? await splitScenesLongform(scriptText, language)
        : await splitScenes(scriptText, language);
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

      {/* 프로젝트 형식 */}
      <div className="field">
        <label>형식</label>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={format === "shorts" ? "primary" : ""} style={{ flex: 1 }}
            onClick={() => setFormat("shorts")}>📱 쇼츠 (9:16)</button>
          <button className={format === "longform" ? "primary" : ""} style={{ flex: 1 }}
            onClick={() => setFormat("longform")}>🖥 롱폼 (16:9)</button>
        </div>
      </div>

      {/* 롱폼: 카테고리 + AI 대본 생성 */}
      {isLongform && (
        <div className="field" style={{ border: "1px solid var(--border, #3a3a48)", borderRadius: 10, padding: 12 }}>
          <label>카테고리</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {CATEGORIES.map((c) => (
              <button key={c.key} className={category === c.key ? "primary" : ""} style={{ flex: 1 }}
                onClick={() => setCategory(c.key)}>{c.name}</button>
            ))}
          </div>
          <label>🤖 AI 대본 생성 <span className="sub" style={{ fontSize: 11 }}>(주제 입력 → 아래 대본란에 채워짐, 수정 가능)</span></label>
          <input value={topic} onChange={(e) => setTopic(e.target.value)}
            placeholder={category === "war" ? "예: 명량해전" : category === "folktale" ? "예: 해와 달이 된 오누이" : "예: 금리 인하가 주식시장에 미치는 영향"} />
          <textarea rows={2} style={{ marginTop: 6 }} value={topicDesc} onChange={(e) => setTopicDesc(e.target.value)}
            placeholder="설명·방향 (선택) 예: 초보 투자자 눈높이로" />
          <div className="row" style={{ alignItems: "center", gap: 6, marginTop: 6 }}>
            <label style={{ margin: 0, fontSize: 12, width: 70 }}>대본 길이</label>
            <select style={{ flex: 1 }} value={targetChars} onChange={(e) => setTargetChars(parseInt(e.target.value, 10))}>
              <option value={1500}>짧게 (~1,500자, 약 2~3분)</option>
              <option value={3000}>기본 (~3,000자, 약 5분)</option>
              <option value={5000}>길게 (~5,000자, 약 8분)</option>
              <option value={8000}>아주 길게 (~8,000자, 약 12분)</option>
            </select>
          </div>
          {genBusy ? (
            <Loading text="대본 생성 중… (검색 기반)" />
          ) : (
            <button style={{ marginTop: 6, width: "100%" }} onClick={onGenerateScript} disabled={!topic.trim()}>
              🤖 대본 생성
            </button>
          )}
        </div>
      )}

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
