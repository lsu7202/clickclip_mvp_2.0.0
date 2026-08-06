// 롱폼 제작 패널(왼쪽): 등장인물 시트(동일 인물 일관성) + 이미지 프롬프트/이미지 일괄 생성.
// 흐름: 인물 추출 → 레퍼런스 생성(확인·재생성) → 프롬프트 일괄 → 이미지 일괄(캐릭터 장면은 레퍼런스 edit).
import { useEffect, useState } from "react";

import { extractCharacters, generateAiMedia, generateImagePrompts, listCustomCharacters, saveStockCharacter, uploadAsset, useStockCharacter } from "../api/endpoints.js";
import { workspaceUrl } from "../api/client.js";
import { useStore } from "../store/useStore.js";
import { IMAGE_STYLES, NO_TEXT, styleP } from "../config/imageStyles.js";
import { ARCHETYPE_KEYS, archetypeDesc } from "../config/archetypes.js";
import { Spinner } from "./Loading.jsx";
import Loading from "./Loading.jsx";


// 캐릭터 레퍼런스 생성(외형 묘사 → 전신 1장, 선택한 스타일 적용). 장면 이미지의 기준이 됨.
async function makeReference(description, stylePrompt) {
  return generateAiMedia({
    mediaType: "image",
    situationText: `${description}. Character reference, full body, front view, standing, plain white background. ${stylePrompt} ${NO_TEXT}`,
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
  const [customList, setCustomList] = useState([]); // my_characters/custom/ 폴더 인물들
  useEffect(() => { listCustomCharacters().then(setCustomList).catch(() => {}); }, []);

  // 폴더 인물 선택 → workspace 복사본을 레퍼런스로
  const onPickCustom = async (c, name) => {
    if (!name) return;
    setRefBusy(c.name);
    try {
      const hit = await useStockCharacter({ style: "custom", archetype: name });
      updateCharacter(c.name, { refLocalPath: hit.localPath });
    } catch (e) {
      alert(`폴더 인물 적용 실패: ${e?.response?.data?.error || e.message}`);
    } finally { setRefBusy(null); }
  };

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

  // 추출 소스: 대본이 있으면 대본, 없으면 장면 자막을 이어붙여 사용(대본 없이도 추출 가능)
  const extractSource = () =>
    scriptText.trim() ||
    scenes.map((sc) => (sc.subtitle1Lines || []).map((l) => l.text).join(" ")).join(" ").trim();

  // 1) 등장인물 추출 → 아키타입 캐릭터는 스톡 자동 캐스팅
  const onExtract = async () => {
    setBusyMsg("등장인물 추출 중…");
    try {
      const chars = await extractCharacters({ scriptText: extractSource(), category, language, archetypeNames: ARCHETYPE_KEYS });
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
        // 묘사가 빈 캐릭터(직접 추가)는 기본 문구로 보정 — 빈 묘사면 Gemini가 캐스팅을 누락함
        characters: characters.map(({ name, description }) => ({
          name,
          description: description?.trim() ||
            "a distinctive recurring mascot character; its exact appearance follows its reference image",
        })),
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
        situationText: `${sc.imagePrompt}, ${stylePrompt} ${NO_TEXT}`,
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


  // 🚀 한 번에 생성: 인물(없으면 추출+캐스팅) → 레퍼런스 → 프롬프트(항상 새로) → 이미지.
  // 단계 순서를 몰라도 되도록 전체 사슬을 올바른 순서로 자동 실행. 스토어 지연을 피하려고 로컬 변수로 연결.
  const FALLBACK_DESC = "a distinctive recurring mascot character; its exact appearance follows its reference image";
  const onAuto = async () => {
    try {
      // 1) 등장인물: 하나도 없으면 대본/자막에서 추출 + 스톡 캐스팅
      let chars = characters.map((c) => ({ ...c }));
      if (!chars.length && extractSource()) {
        setBusyMsg("등장인물 추출 중…");
        const ex = await extractCharacters({ scriptText: extractSource(), category, language, archetypeNames: ARCHETYPE_KEYS });
        chars = [];
        for (const c of ex) {
          let refLocalPath = null;
          if (c.archetype) {
            setBusyMsg(`스톡 캐스팅 중… ${c.name}`);
            try { refLocalPath = await castStock(c, imageStyle); } catch { /* 수동 처리 가능 */ }
          }
          chars.push({ ...c, refLocalPath });
        }
        setCharacters(chars.map((c) => ({ ...c })));
      }
      // 2) 레퍼런스 없는 인물 자동 생성(외형 묘사가 있을 때)
      for (const c of chars) {
        if (!c.refLocalPath && c.description?.trim()) {
          setBusyMsg(`레퍼런스 생성 중… ${c.name}`);
          try {
            const a = await makeReference(c.description, stylePrompt);
            c.refLocalPath = a.localPath;
            updateCharacter(c.name, { refLocalPath: a.localPath });
          } catch { /* skip */ }
        }
      }
      // 3) 프롬프트: 항상 새로 생성 → 현재 인물(밥 포함)이 장면에 배정됨
      setBusyMsg("이미지 프롬프트 생성 중…");
      const payload = scenes.map((sc) => ({
        sceneNumber: sc.sceneNumber,
        text: (sc.subtitle1Lines || []).map((l) => l.text).join(" "),
      }));
      const out = await generateImagePrompts({
        category, language,
        characters: chars.map(({ name, description }) => ({ name, description: description?.trim() || FALLBACK_DESC })),
        scenes: payload,
      });
      const byNum = {};
      for (const pr of out) {
        byNum[pr.sceneNumber] = pr;
        updateScene(pr.sceneNumber, { imagePrompt: pr.prompt, characterNames: pr.characterNames || [] });
      }
      // 4) 이미지: 미디어 없는 장면만(로컬 데이터로 직접 연결)
      const targets = scenes.filter((sc) => !sc.media && byNum[sc.sceneNumber]?.prompt?.trim());
      const failed = [];
      for (const sc of targets) {
        const pr = byNum[sc.sceneNumber];
        setBusyMsg(`이미지 생성 중… 장면 ${sc.sceneNumber}`);
        const gen = async () => {
          const ref = chars.find((c) => (pr.characterNames || []).includes(c.name) && c.refLocalPath);
          const asset = await generateAiMedia({
            mediaType: "image",
            situationText: `${pr.prompt}, ${stylePrompt} ${NO_TEXT}`,
            referencePath: ref?.refLocalPath ?? null,
            aspectRatio: "16:9",
          });
          setSceneMedia(sc.sceneNumber, asset);
        };
        try { await gen(); }
        catch { try { await new Promise((r) => setTimeout(r, 2000)); await gen(); } catch { failed.push(sc.sceneNumber); } }
      }
      const skipped = scenes.filter((sc) => sc.media).length;
      let msg = `완료! 이미지 ${targets.length - failed.length}개 생성.`;
      if (skipped) msg += `\n이미 이미지가 있던 장면 ${skipped}개는 건너뜀 — 새 인물을 반영하려면 그 장면 카드의 "이미지 재생성(교체)"를 누르세요.`;
      if (failed.length) msg += `\n실패: 장면 ${failed.join(", ")} (다시 실행하면 재시도)`;
      alert(msg);
    } catch (e) {
      alert(`자동 생성 실패: ${e?.response?.data?.error || e.message}`);
    } finally { setBusyMsg(null); }
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

          {/* 메인: 버튼 하나로 인물→레퍼런스→프롬프트→이미지 전체 실행 */}
          {busyMsg ? <Loading text={busyMsg} /> : (
            <button className="primary" onClick={onAuto} disabled={scenes.length === 0}>
              🚀 이미지 한 번에 생성 (인물→프롬프트→이미지)
            </button>
          )}

          {/* 등장인물 — 전 카테고리(경제 마스코트 포함). 캐릭터 없으면 경제는 사물만 지침 유지 */}
          {(
            <div>
              <div className="row" style={{ alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>🎭 등장인물 ({characters.length})</span>
                <span style={{ flex: 1 }} />
                <button className="ghost" style={{ fontSize: 12 }} onClick={onAddCharacter}>＋ 직접 추가</button>
                <button className="ghost" style={{ fontSize: 12 }} onClick={onExtract} disabled={!extractSource() || !!busyMsg}>
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
                        {customList.length > 0 && (
                          <select style={{ fontSize: 11, width: "auto" }} value=""
                            title="resources/my_characters/custom 폴더의 인물 선택"
                            onChange={(e) => { onPickCustom(c, e.target.value); e.target.value = ""; }}>
                            <option value="">📁 폴더에서…</option>
                            {customList.map((it) => <option key={it.file} value={it.name}>{it.name}</option>)}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 고급: 단계별 실행(수동 제어가 필요할 때만) */}
          <details>
            <summary style={{ fontSize: 12, cursor: "pointer", color: "var(--muted, #9a9aab)" }}>고급: 단계별 실행</summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              <button onClick={onPrompts} disabled={scenes.length === 0 || !!busyMsg}>
                🎨 이미지 프롬프트 일괄 생성 {promptCount > 0 ? `(완료 ${promptCount})` : ""}
              </button>
              <button onClick={onImages} disabled={promptCount === 0 || !!busyMsg}>
                🖼 이미지 일괄 생성 (미디어 없는 장면만)
              </button>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
