// §7 CapCut draft 빌더 — 골든 스켈레톤(CAPCUT_TEMPLATE_DIR) 기반.
// 철학(1.0 계승): 스키마를 직접 작성하지 않고 '대표 세그먼트 + 그 세그먼트가 참조하는
//   extra material 번들 전체'를 fresh UUID로 복제 후 가변부만 치환 → 참조 무결성 유지.
//
// 실제 스켈레톤에서 확인된 사실(중요):
//   - 이미지/동영상 모두 materials.videos 버킷에 저장(type "photo"|"video"). photos 버킷 미사용.
//   - 미디어 세그먼트 extra_refs: speeds/placeholder_infos/canvases/material_animations/
//       sound_channel_mappings/material_colors/loudnesses/vocal_separations
//   - 오디오 extra_refs: speeds/placeholder_infos/beats/sound_channel_mappings/vocal_separations
//   - 텍스트 extra_refs: material_animations. 텍스트 문자열은 material.content(JSON).text +
//       styles[].range + recognize_text + base_content + words 에 동시 존재.
//   - 자막 위치는 clip.transform(정규화 좌표) → 방향 무관 전이.
//   - 스켈레톤은 가로(1920x1080)지만 출력은 1080x1920로 강제(빌드 시 retarget).
import fs from "node:fs";
import path from "node:path";

import { v4 as uuid } from "uuid";

import { config } from "../../config.js";
import { sceneStartsUs, subtitle1LineStartsUs, sceneDurationUs, mediaSrcStart, mediaUsedUs } from "../timing.js";

const UID = () => uuid().toUpperCase();
const clone = (o) => JSON.parse(JSON.stringify(o));

function loadSkeleton() {
  const infoPath = path.join(config.capcutTemplateDir, "draft_info.json");
  const metaPath = path.join(config.capcutTemplateDir, "draft_meta_info.json");
  if (!fs.existsSync(infoPath) || !fs.existsSync(metaPath)) {
    const e = new Error("capcut_skeleton_missing: CAPCUT_TEMPLATE_DIR 에 draft_info.json/draft_meta_info.json 필요");
    e.status = 400;
    throw e;
  }
  return {
    info: JSON.parse(fs.readFileSync(infoPath, "utf-8")),
    meta: JSON.parse(fs.readFileSync(metaPath, "utf-8")),
  };
}

// id → [bucketName, materialObj]
function findMaterial(info, id) {
  for (const [bucket, arr] of Object.entries(info.materials || {})) {
    if (Array.isArray(arr)) {
      const m = arr.find((x) => x && x.id === id);
      if (m) return [bucket, m];
    }
  }
  return [null, null];
}

function trackWithSegments(info, type) {
  const cands = (info.tracks || []).filter((t) => t.type === type && (t.segments || []).length > 0);
  // 가장 세그먼트 많은 트랙을 대표로(메인 미디어/자막)
  return cands.sort((a, b) => b.segments.length - a.segments.length)[0] || null;
}

// 정규화 cover 배율(스케일 1=contain 가정)
function coverScale(w, h, cw, ch) {
  if (!w || !h) return 1;
  const ma = w / h;
  const ca = cw / ch;
  return Math.max(ma / ca, ca / ma);
}

// 원본 소스 캡션(자막2) → 출력 텍스트 세그먼트.
// 장면(미디어 윈도우)이 원본 [origStart,origEnd]를 출력 [outStart, +sceneDur]로 매핑.
// 캡션은 소스 시간 기준이므로 장면 분할/삽입/순서변경과 무관하게 자기 footage를 따라간다.
// 한 캡션이 출력상 맞닿은 여러 창에 걸치면 하나로 병합(끼움 장면으로 끊긴 곳만 분리).
function buildCaptionSegments(scenes, starts, captions) {
  if (!captions?.length) return [];
  const windows = [];
  scenes.forEach((scene, i) => {
    const m = scene.media;
    if (!m || m.origSourceId == null || m.origStartUs == null || m.origEndUs == null) return;
    const srcLen = Math.max(1, m.origEndUs - m.origStartUs);
    const outLen = sceneDurationUs(scene); // 보통 srcLen과 같음(fitToTts면 늘어남)
    windows.push({
      sourceId: m.origSourceId, oStart: m.origStartUs, oEnd: m.origEndUs,
      outStart: starts[i], scale: outLen / srcLen,
    });
  });
  if (!windows.length) return [];

  const out = [];
  for (const c of captions) {
    if (!c.text?.trim()) continue;
    const pieces = [];
    for (const w of windows) {
      if (w.sourceId !== c.sourceId) continue;
      const s = Math.max(c.startUs, w.oStart);
      const e = Math.min(c.endUs, w.oEnd);
      if (s >= e) continue;
      pieces.push([w.outStart + (s - w.oStart) * w.scale, w.outStart + (e - w.oStart) * w.scale]);
    }
    if (!pieces.length) continue;
    pieces.sort((a, b) => a[0] - b[0]);
    let [cs, ce] = pieces[0];
    for (let k = 1; k < pieces.length; k++) {
      const [ps, pe] = pieces[k];
      if (ps - ce <= 1000) ce = Math.max(ce, pe); // 출력상 인접(≤1ms) → 병합
      else { out.push({ text: c.text, startUs: Math.round(cs), durationUs: Math.round(ce - cs) }); [cs, ce] = [ps, pe]; }
    }
    out.push({ text: c.text, startUs: Math.round(cs), durationUs: Math.round(ce - cs) });
  }
  out.sort((a, b) => a.startUs - b.startUs);
  return out.filter((s) => s.durationUs > 0);
}

export function buildDraft(scenes, { templateId, framePath, folderName, captions = [] }) {
  const { info, meta } = loadSkeleton();
  const draft = clone(info);
  const CW = config.canvasWidth; // 1080
  const CH = config.canvasHeight; // 1920

  const { starts, totalUs } = sceneStartsUs(scenes);

  // 출력용 머티리얼 버킷: 스켈레톤 구조 유지하되 가변 버킷은 비우고 새로 채움.
  const M = draft.materials;
  const VARIABLE_BUCKETS = [
    "videos", "audios", "texts",
    "speeds", "placeholder_infos", "canvases", "material_animations",
    "sound_channel_mappings", "material_colors", "loudnesses",
    "vocal_separations", "beats",
  ];
  // 템플릿 추출은 '원본 info'에서, 채우기는 draft.M 에.
  for (const b of VARIABLE_BUCKETS) if (Array.isArray(M[b])) M[b] = [];
  const push = (bucket, mat) => {
    if (!Array.isArray(M[bucket])) M[bucket] = [];
    M[bucket].push(mat);
  };

  // 템플릿 세그먼트/머티리얼 (원본 info 기준)
  const mediaTrackTpl = trackWithSegments(info, "video");
  const textTrackTpl = trackWithSegments(info, "text");
  const audioTrackTpl = trackWithSegments(info, "audio");
  const mediaSegTpl = mediaTrackTpl?.segments[0];
  const textSegTpl = textTrackTpl?.segments[0];
  const audioSegTpl = audioTrackTpl?.segments[0];

  // 세그먼트의 extra_material_refs 번들을 통째로 복제 → 새 ref id 배열 반환
  function cloneBundle(tplSeg) {
    const newRefs = [];
    for (const refId of tplSeg.extra_material_refs || []) {
      const [bucket, mat] = findMaterial(info, refId);
      if (!mat) continue;
      const nm = clone(mat);
      nm.id = UID();
      push(bucket, nm);
      newRefs.push(nm.id);
    }
    return newRefs;
  }

  // 1차 머티리얼 복제(+override)
  function clonePrimary(tplMaterialId, bucket, overrides) {
    const [, tpl] = findMaterial(info, tplMaterialId);
    const nm = tpl ? clone(tpl) : { type: bucket.slice(0, -1) };
    nm.id = UID();
    Object.assign(nm, overrides);
    push(bucket, nm);
    return nm.id;
  }

  // 세그먼트 복제(공통)
  function cloneSeg(tplSeg, { materialId, refs, startUs, durationUs, sourceUs, sourceStartUs = 0, clipOverride, volume }) {
    const seg = clone(tplSeg);
    seg.id = UID();
    seg.material_id = materialId;
    seg.extra_material_refs = refs;
    seg.target_timerange = { start: startUs, duration: durationUs };
    if (sourceUs != null) seg.source_timerange = { start: sourceStartUs, duration: sourceUs };
    if (volume != null) { seg.volume = volume; seg.last_nonzero_volume = volume || 1; }
    if (clipOverride) seg.clip = { ...(seg.clip || {}), ...clipOverride };
    seg.keyframe_refs = [];
    seg.common_keyframes = [];
    return seg;
  }

  const newTracks = [];

  // ---- 1) 미디어 트랙(최하) ----
  if (mediaSegTpl) {
    const track = { ...clone(mediaTrackTpl), id: UID(), segments: [] };
    scenes.forEach((scene, i) => {
      if (!scene.media) return;
      const durUs = sceneDurationUs(scene);
      const isVideo = scene.media.sourceType === "video_shot" || scene.media.durationUs != null;
      const fullUs = scene.media.durationUs ?? durUs;        // 파일 본연의 전체 길이(머티리얼 duration)
      const srcStart = isVideo ? mediaSrcStart(scene.media) : 0; // 분할 윈도우 시작 오프셋
      const usedUs = isVideo ? (mediaUsedUs(scene.media) ?? fullUs) : durUs; // 이 장면이 쓰는 길이
      const matId = clonePrimary(mediaSegTpl.material_id, "videos", {
        type: isVideo ? "video" : "photo",
        path: scene.media.capcutPath,
        media_path: scene.media.capcutPath,
        width: scene.media.widthPx || CW,
        height: scene.media.heightPx || CH,
        duration: isVideo ? fullUs : durUs,
        has_audio: !!scene.media.hasAudio,
      });
      const refs = cloneBundle(mediaSegTpl);
      const cover = coverScale(scene.media.widthPx, scene.media.heightPx, CW, CH);
      track.segments.push(
        cloneSeg(mediaSegTpl, {
          materialId: matId,
          refs,
          startUs: starts[i],
          durationUs: durUs,
          sourceUs: isVideo ? Math.min(usedUs, durUs) : durUs,
          sourceStartUs: srcStart,
          volume: isVideo ? (scene.muted ? 0 : 1) : undefined,
          clipOverride: { scale: { x: cover, y: cover }, transform: { x: 0, y: 0 } },
        })
      );
    });
    if (track.segments.length) newTracks.push(track);
  }

  // ---- 2) 프레임 오버레이 트랙 ----
  if (framePath && mediaSegTpl) {
    const track = { ...clone(mediaTrackTpl), id: UID(), segments: [] };
    const matId = clonePrimary(mediaSegTpl.material_id, "videos", {
      type: "photo",
      path: framePath,
      media_path: framePath,
      width: CW,
      height: CH,
      duration: totalUs,
      has_audio: false,
    });
    const refs = cloneBundle(mediaSegTpl);
    track.segments.push(
      cloneSeg(mediaSegTpl, {
        materialId: matId, refs, startUs: 0, durationUs: totalUs, sourceUs: totalUs,
        clipOverride: { scale: { x: 1, y: 1 }, transform: { x: 0, y: 0 } },
      })
    );
    newTracks.push(track);
  }

  // ---- 텍스트 머티리얼 문자열 치환 ----
  function makeTextMaterial(textStr, durUs) {
    const [, tpl] = findMaterial(info, textSegTpl.material_id);
    const nm = clone(tpl);
    nm.id = UID();
    let contentObj;
    try { contentObj = JSON.parse(nm.content); } catch { contentObj = { styles: [{ range: [0, 0] }], text: "" }; }
    contentObj.text = textStr;
    if (Array.isArray(contentObj.styles) && contentObj.styles.length) {
      contentObj.styles[0].range = [0, textStr.length];
      contentObj.styles = [contentObj.styles[0]]; // 단일 스타일로 단순화
    }
    nm.content = JSON.stringify(contentObj);
    nm.base_content = nm.content;
    nm.recognize_text = textStr;
    nm.name = textStr;
    if (nm.words && typeof nm.words === "object") {
      nm.words = { start_time: [0], end_time: [durUs], text: [textStr] };
    }
    push("texts", nm);
    return nm.id;
  }

  // ---- 3/4) 자막1 / 자막2 텍스트 트랙 ----
  function buildTextTrack(entries, yTransform) {
    const track = { ...clone(textTrackTpl), id: UID(), segments: [] };
    for (const e of entries) {
      const matId = makeTextMaterial(e.text, e.durationUs);
      const refs = cloneBundle(textSegTpl);
      track.segments.push(
        cloneSeg(textSegTpl, {
          materialId: matId, refs, startUs: e.startUs, durationUs: e.durationUs,
          clipOverride: yTransform != null
            ? { transform: { x: 0, y: yTransform } } : undefined,
        })
      );
    }
    return track;
  }

  if (textSegTpl) {
    const baseY = textSegTpl.clip?.transform?.y ?? -0.73;
    // 자막1 (기본 위치)
    const s1 = [];
    scenes.forEach((scene, i) => {
      const lineStarts = subtitle1LineStartsUs(scene);
      (scene.subtitle1Lines || []).forEach((ln, li) => {
        const dur = ln.tts?.durationUs || 0;
        if (dur > 0 && ln.text?.trim()) {
          s1.push({ text: ln.text, startUs: starts[i] + lineStarts[li], durationUs: dur });
        }
      });
    });
    if (s1.length) newTracks.push(buildTextTrack(s1, baseY));

    // 자막2 (살짝 아래로 분리 배치) — 원본 소스 타임라인 캡션을 '소스→출력' 매핑으로 투영.
    // 각 장면(미디어 윈도우)이 원본 [origStart,origEnd]를 출력 [outStart,+used]로 매핑.
    // 캡션은 소스 시간 기준이라, 장면을 자르거나 사이에 끼워도 자기 footage만 따라간다.
    // 한 캡션이 출력상 맞닿은 여러 창에 걸치면 하나로 합쳐 끊김 없이 표시.
    const s2 = buildCaptionSegments(scenes, starts, captions);
    if (s2.length) newTracks.push(buildTextTrack(s2, baseY + 0.12));
  }

  // ---- 오디오 트랙(자막1 TTS) ----
  if (audioSegTpl) {
    const track = { ...clone(audioTrackTpl), id: UID(), segments: [] };
    scenes.forEach((scene, i) => {
      const lineStarts = subtitle1LineStartsUs(scene);
      (scene.subtitle1Lines || []).forEach((ln, li) => {
        if (!ln.tts?.capcutPath) return;
        const matId = clonePrimary(audioSegTpl.material_id, "audios", {
          type: "extract_music",
          path: ln.tts.capcutPath,
          duration: ln.tts.durationUs,
          name: `tts-${scene.sceneNumber}-${ln.lineNumber}`,
        });
        const refs = cloneBundle(audioSegTpl);
        track.segments.push(
          cloneSeg(audioSegTpl, {
            materialId: matId, refs,
            startUs: starts[i] + lineStarts[li],
            durationUs: ln.tts.durationUs,
            sourceUs: ln.tts.durationUs,
            volume: 1,
          })
        );
      });
    });
    if (track.segments.length) newTracks.push(track);
  }

  // ---- 효과음 트랙(장면 시작점, TTS와 겹칠 수 있어 별도 트랙) ----
  if (audioSegTpl) {
    const track = { ...clone(audioTrackTpl), id: UID(), segments: [] };
    scenes.forEach((scene, i) => {
      const sfx = scene.startSfx;
      if (!sfx?.capcutPath || !sfx.durationUs) return;
      const matId = clonePrimary(audioSegTpl.material_id, "audios", {
        type: "extract_music",
        path: sfx.capcutPath,
        duration: sfx.durationUs,
        name: `sfx-${scene.sceneNumber}`,
      });
      const refs = cloneBundle(audioSegTpl);
      track.segments.push(
        cloneSeg(audioSegTpl, {
          materialId: matId, refs,
          startUs: starts[i],
          durationUs: sfx.durationUs,
          sourceUs: sfx.durationUs,
          volume: 1,
        })
      );
    });
    if (track.segments.length) newTracks.push(track);
  }

  // ---- 마무리: 캔버스 9:16 강제, 트랙/길이 교체 ----
  draft.tracks = newTracks;
  draft.canvas_config = { ...(draft.canvas_config || {}), width: CW, height: CH, ratio: "original" };
  draft.duration = totalUs;
  const draftId = UID();
  draft.id = draftId;

  // ---- draft_meta_info: 호스트 절대경로 주입 + 미디어 레지스트리 재구성 ----
  const hostRoot = config.capcutDraftRootHost;
  const hostFold = `${hostRoot}/${folderName}`;
  draft.path = hostFold;
  meta.draft_id = draftId;
  meta.draft_name = folderName;
  meta.draft_root_path = hostRoot;
  meta.draft_fold_path = hostFold;
  meta.tm_duration = totalUs;

  // draft_materials: 템플릿 엔트리 복제 후 우리 에셋(host file_Path)으로 치환
  const mediaEntries = [];
  scenes.forEach((scene) => {
    if (scene.media?.capcutPath) {
      const isVideo = scene.media.sourceType === "video_shot" || scene.media.durationUs != null;
      mediaEntries.push({
        path: scene.media.capcutPath,
        duration: isVideo ? (scene.media.durationUs ?? sceneDurationUs(scene)) : sceneDurationUs(scene),
        width: scene.media.widthPx || CW,
        height: scene.media.heightPx || CH,
        isVideo,
      });
    }
    (scene.subtitle1Lines || []).forEach((ln) => {
      if (ln.tts?.capcutPath) {
        mediaEntries.push({ path: ln.tts.capcutPath, duration: ln.tts.durationUs, width: 0, height: 0, isVideo: false, isAudio: true });
      }
    });
    if (scene.startSfx?.capcutPath) {
      mediaEntries.push({ path: scene.startSfx.capcutPath, duration: scene.startSfx.durationUs, width: 0, height: 0, isVideo: false, isAudio: true });
    }
  });
  if (framePath) mediaEntries.push({ path: framePath, duration: totalUs, width: CW, height: CH, isVideo: false });

  // 템플릿 엔트리 추출
  let tplEntry = null;
  const groups = Array.isArray(meta.draft_materials) ? meta.draft_materials : [];
  for (const g of groups) {
    if (Array.isArray(g.value) && g.value.length) { tplEntry = clone(g.value[0]); break; }
  }
  const baseName = (p) => p.split("/").pop();
  const newValue = mediaEntries.map((e) => {
    const entry = tplEntry ? clone(tplEntry) : {};
    entry.id = uuid(); // CapCut 은 소문자 uuid
    entry.file_Path = e.path;
    entry.extra_info = baseName(e.path);
    entry.duration = e.duration || 0;
    entry.width = e.width || 0;
    entry.height = e.height || 0;
    return entry;
  });
  // type 0 그룹에 우리 미디어, 나머지 그룹 value 는 비움
  meta.draft_materials = groups.map((g, i) =>
    i === 0 ? { ...g, value: newValue } : { ...g, value: [] }
  );
  if (!groups.length) meta.draft_materials = [{ type: 0, value: newValue }];

  return { draft, meta };
}
