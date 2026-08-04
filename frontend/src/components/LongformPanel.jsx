// 롱폼 제작 패널(왼쪽): 등장인물 시트(동일 인물 일관성) + 이미지 프롬프트/이미지 일괄 생성.
// 흐름: 인물 추출 → 레퍼런스 생성(확인·재생성) → 프롬프트 일괄 → 이미지 일괄(캐릭터 장면은 레퍼런스 edit).
import { useState } from "react";

import { extractCharacters, generateAiMedia, generateImagePrompts, saveStockCharacter, uploadAsset, useStockCharacter } from "../api/endpoints.js";
import { workspaceUrl } from "../api/client.js";
import { useStore } from "../store/useStore.js";
import { IMAGE_STYLES, styleP } from "../config/imageStyles.js";
import { ARCHETYPE_KEYS, archetypeDesc } from "../config/archetypes.js";
import { Spinner } from "./Loading.jsx";
import Loading from "./Loading.jsx";

const CHAR_CATEGORIES = new Set(["war", "folktale"]);

// 캐릭터 레퍼런스 생성(외형 묘사 → 전신 1장, 선택한 스타일 적용). 장면 이미지의 기준이 됨.
async function makeReference(description, stylePrompt) {
  return generateAiMedia({
    mediaType: "image",
    situationText: `${description}. Character reference, full body, front view, standing, plain white background. ${stylePrompt}`,
    aspectRatio: "1:1",
  });
}

export default function LongformPanel() {
  const scenes = useStore((s) => s.scenes);
  const scriptText = useStore((s) => s.scriptText);
  const category = useStore((s) => s.category);
  const language = useStore((s) => s.language);
  const characters = useStore((s) => s.characters);
  const setCharacters = useStore((s) => s.setCharacters);
  const updateCharacter = useStore((s) => s.updateCharacter);
  const updateScene = useStore((s) => s.updateScene);
  const setSceneMedia = useStore((s) => s.setSceneMedia);

  const imageStyle = useStore((s) => s.imageStyle);
  const setImageStyle = useStore((s) => s.setImageStyle);
  const [open, setOpen] = useState(true);
  const [busyMsg, setBusyMsg] = useState(null); // 진행 중 안내(애니메이션 로딩)
  const [refBusy, setRefBusy] = useState(null); // 레퍼런스 생성 중인 캐릭터명

  const hasChars = CHAR_CATEGORIES.has(category);
  const stylePrompt = styleP(imageStyle);

  // 스톡 캐스팅: 아키타입 캐릭터의 레퍼런스를 라이브러리에서 가져오고(use),
  // 없으면 1회 생성 후 라이브러리에 저장(save) → 이후 전 영상 재사용(채널 고정 출연진)
  const castStock = async (char, style) => {
    try {
      const hit = await useStockCharacter({ style, archetype: char.archetype });
      return hit.localPath; // 라이브러리 히트
    } catch { /* 404 → 생성 */ }
    const desc = archetypeDesc(char.archetype) || char.description;
    const asset = await makeReference(desc, styleP(style));
    await saveStockCharacter({ style, archetype: char.archetype, localPath: asset.localPath }).catch(() => {});
    return asset.localPath;
  };

  // 1) 등장인물 추출 → 아키타입 캐릭터는 스톡 자동 캐스팅
  const onExtract = async () => {
    setBusyMsg("등장인물 추출 중…");
    try {
      const chars = await extractCharacters({ scriptText, category, language, archetypeNames: ARCHETYPE_KEYS });
      const out = [];
      for (const c of chars) {
        let refLocalPath = null;
        if (c.archetype) {
          setBusyMsg(`스톡 캐스팅 중… ${c.name} (${c.archetype})`);
          try { refLocalPath = await castStock(c, imageStyle); } catch { /* 실패 시 수동 생성 */ }
        }
        out.push({ ...c, refLocalPath });
      }
      setCharacters(out);
    } catch (e) {
      alert(`추출 실패: ${e?.response?.data?.error || e.message}`);
    } finally { setBusyMsg(null); }
  };

  // 스타일 변경 → 아키타입 캐릭터들을 새 스타일의 스톡으로 재캐스팅
  const onStyleChange = async (newStyle) => {
    setImageStyle(newStyle);
    const targets = characters.filter((c) => c.archetype);
    if (!targets.length) return;
    for (const c of targets) {
      setBusyMsg(`스타일 재캐스팅 중… ${c.name}`);
      try { updateCharacter(c.name, { refLocalPath: await castStock(c, newStyle) }); } catch { /* skip */ }
    }
    setBusyMsg(null);
  };

  // 2) 캐릭터 레퍼런스 생성/재생성
  const onMakeRef = async (c) => {
    setRefBusy(c.name);
    try {
      const asset = await makeReference(c.description, stylePrompt);
      updateCharacter(c.name, { refLocalPath: asset.localPath });
    } catch (e) {
      alert(`레퍼런스 생성 실패: ${e?.response?.data?.error || e.message}`);
    } finally { setRefBusy(null); }
  };

  // 2-b) 내 이미지를 캐릭터 레퍼런스로 업로드(원하는 캐릭터 이미지 직접 지정)
  const onUploadRef = async (c, file) => {
    if (!file) return;
    setRefBusy(c.name);
    try {
      const asset = await uploadAsset(file);
      updateCharacter(c.name, { refLocalPath: asset.localPath });
    } catch (e) {
      alert(`업로드 실패: ${e?.response?.data?.error || e.message}`);
    } finally { setRefBusy(null); }
  };

  // 인물 직접 추가(대본 추출 없이 내 캐릭터를 등록하고 싶을 때)
  const onAddCharacter = () => {
    const name = window.prompt("인물 이름 (이미지 프롬프트에서 이 이름으로 참조됩니다)");
    if (!name?.trim()) return;
    if (characters.some((c) => c.name === name.trim())) { alert("같은 이름이 이미 있습니다."); return; }
    setCharacters([...characters, { name: name.trim(), description: "", refLocalPath: null }]);
  };

  // 3) 이미지 프롬프트 일괄 생성(전체 맥락 1회)
  const onPrompts = async () => {
    setBusyMsg("이미지 프롬프트 생성 중…");
    try {
      const payload = scenes.map((sc) => ({
        sceneNumber: sc.sceneNumber,
        text: (sc.subtitle1Lines || []).map((l) => l.text).join(" "),
      }));
      const out = await generateImagePrompts({
        category, language,
        characters: characters.map(({ name, description }) => ({ name, description })),
        scenes: payload,
      });
      for (const p of out) {
        updateScene(p.sceneNumber, { imagePrompt: p.prompt, characterNames: p.characterNames || [] });
      }
    } catch (e) {
      alert(`프롬프트 생성 실패: ${e?.response?.data?.error || e.message}`);
    } finally { setBusyMsg(null); }
  };

  // 4) 이미지 일괄 생성(미디어 없는 장면만, 캐릭터 등장 시 레퍼런스 edit)
  //    실패 시 1회 자동 재시도 → 그래도 실패한 장면은 마지막에 요약 보고(재실행하면 그 장면들만 다시 시도)
  const onImages = async () => {
    const targets = scenes.filter((sc) => sc.imagePrompt?.trim() && !sc.media);
    if (!targets.length) { alert("생성할 장면이 없습니다 (프롬프트 생성 먼저, 이미 미디어 있는 장면은 건너뜀)."); return; }
    const failed = [];
    const genOne = async (sc) => {
      const ref = characters.find((c) => (sc.characterNames || []).includes(c.name) && c.refLocalPath);
      const asset = await generateAiMedia({
        mediaType: "image",
        situationText: `${sc.imagePrompt}, ${stylePrompt}`,
        referencePath: ref?.refLocalPath ?? null,
        aspectRatio: "16:9",
      });
      setSceneMedia(sc.sceneNumber, asset);
    };
    for (const sc of targets) {
      setBusyMsg(`이미지 생성 중… 장면 ${sc.sceneNumber}`);
      try {
        await genOne(sc);
      } catch {
        try {
          await new Promise((r) => setTimeout(r, 2000)); // 잠시 대기 후 1회 재시도
          await genOne(sc);
        } catch (e2) {
          failed.push(sc.sceneNumber);
          console.error(`장면 ${sc.sceneNumber} 이미지 실패`, e2);
        }
      }
    }
    setBusyMsg(null);
    if (failed.length) {
      alert(`장면 ${failed.join(", ")} 이미지 생성 실패.\n"이미지 일괄 생성"을 다시 누르면 실패한 장면만 재시도합니다.`);
    }
  };

  const promptCount = scenes.filter((sc) => sc.imagePrompt?.trim()).length;

  return (
    <div style={{ marginTop: 12, border: "1px solid var(--border, #3a3a48)", borderRadius: 10, padding: 10 }}>
      <button className="ghost" style={{ fontSize: 12 }} onClick={() => setOpen((v) => !v)}>
        🎬 롱폼 제작 {open ? "▾" : "▸"}
      </button>

      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* 이미지 스타일 템플릿 — 전 장면·캐릭터 레퍼런스에 공통 적용 */}
          <div className="row" style={{ alignItems: "center", gap: 6 }}>
            <label style={{ margin: 0, fontSize: 12, width: 70 }}>🖼 스타일</label>
            <select style={{ flex: 1 }} value={imageStyle} onChange={(e) => onStyleChange(e.target.value)}>
              {IMAGE_STYLES.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
          </div>

          {/* 등장인물(전쟁/전래동화만 — 경제는 사물만 규칙) */}
          {hasChars && (
            <div>
              <div className="row" style={{ alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>🎭 등장인물 ({characters.length})</span>
                <span style={{ flex: 1 }} />
                <button className="ghost" style={{ fontSize: 12 }} onClick={onAddCharacter}>＋ 직접 추가</button>
                <button className="ghost" style={{ fontSize: 12 }} onClick={onExtract} disabled={!scriptText.trim() || !!busyMsg}>
                  대본에서 추출
                </button>
              </div>
              {characters.map((c) => (
                <div key={c.name} style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "flex-start" }}>
                  <div style={{ width: 52, height: 52, borderRadius: 8, overflow: "hidden", background: "#000", flex: "none", border: "1px solid var(--border, #3a3a48)" }}>
                    {c.refLocalPath && <img src={workspaceUrl(c.refLocalPath)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>
                      {c.name}
                      {c.archetype && <span className="muted" style={{ fontWeight: 400, marginLeft: 6, fontSize: 11 }}>📦 스톡: {c.archetype}</span>}
                    </div>
                    <textarea rows={2} style={{ fontSize: 11, marginTop: 2 }} value={c.description}
                      onChange={(e) => updateCharacter(c.name, { description: e.target.value })} />
                    {refBusy === c.name ? <Spinner sm /> : (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="ghost" style={{ fontSize: 11 }} onClick={() => onMakeRef(c)}>
                          {c.refLocalPath ? "🔄 AI 재생성" : "🖼 AI 생성"}
                        </button>
                        <label className="ghost" style={{ fontSize: 11, cursor: "pointer", padding: "3px 8px", border: "1px solid var(--border, #3a3a48)", borderRadius: 6 }}
                          title="내 이미지를 이 캐릭터의 레퍼런스로 사용">
                          📤 내 이미지
                          <input type="file" accept="image/*" style={{ display: "none" }}
                            onChange={(e) => { onUploadRef(c, e.target.files?.[0]); e.target.value = ""; }} />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 프롬프트/이미지 일괄 */}
          {busyMsg ? <Loading text={busyMsg} /> : (
            <>
              <button onClick={onPrompts} disabled={scenes.length === 0}>
                🎨 이미지 프롬프트 일괄 생성 {promptCount > 0 ? `(완료 ${promptCount})` : ""}
              </button>
              <button onClick={onImages} disabled={promptCount === 0}>
                🖼 이미지 일괄 생성 (미디어 없는 장면만)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
