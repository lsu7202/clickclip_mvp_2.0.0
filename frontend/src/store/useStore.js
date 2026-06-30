// 프론트 SSOT(zustand) + Undo/Redo(zundo temporal). §3.1 AppState.
import { temporal } from "zundo";
import { create } from "zustand";

import {
  emptyScene,
  mediaSrcEnd,
  mediaSrcStart,
  newSubtitle1Line,
  renumber,
} from "./sceneOps.js";

const initialAssetPanel = {
  tab: "ai_media", // 'gif'|'image'|'ai_media'|'upload'|'video_analysis'
  searchQuery: "",
  aiMedia: {
    mediaType: "image",
    styleId: null,
    referenceName: null,
    aspectRatio: "9:16",
    situationText: "",
  },
};

// 장면 배열 변형 후 재번호 + 선택 보정
const mapScenes = (set, get, fn) =>
  set((s) => {
    const scenes = renumber(fn(s.scenes));
    return { scenes };
  });

export const useStore = create(
  temporal(
    (set, get) => ({
      // ---- AppState ----
      step: "setup",
      language: "ko",
      title: "",
      templateId: null,
      scriptText: "",
      scenes: [],
      captions: [], // 자막2 = 원본 소스 타임라인 캡션 트랙(장면과 분리)
      defaultVoiceId: null, // 대표 성우(설정 시 전 장면 적용 + 새 장면 기본)
      selectedSceneNumber: null,
      assetPanel: initialAssetPanel,
      jobs: [],

      // ---- setup ----
      setStep: (step) => set({ step }),
      setLanguage: (language) => set({ language }),
      setTitle: (title) => set({ title }),
      setTemplateId: (templateId) => set({ templateId }),
      setScriptText: (scriptText) => set({ scriptText }),
      setScenes: (scenes) => set({ scenes: renumber(scenes) }),

      selectScene: (selectedSceneNumber) => set({ selectedSceneNumber }),

      // ---- asset panel(transient) ----
      setAssetPanel: (patch) =>
        set((s) => ({ assetPanel: { ...s.assetPanel, ...patch } })),
      setAiMedia: (patch) =>
        set((s) => ({
          assetPanel: { ...s.assetPanel, aiMedia: { ...s.assetPanel.aiMedia, ...patch } },
        })),

      // ---- scene level ----
      updateScene: (sceneNumber, patch) =>
        mapScenes(set, get, (scenes) =>
          scenes.map((sc) => (sc.sceneNumber === sceneNumber ? { ...sc, ...patch } : sc))
        ),
      setSceneMedia: (sceneNumber, media) =>
        get().updateScene(sceneNumber, { media }),
      toggleMuted: (sceneNumber) =>
        mapScenes(set, get, (scenes) =>
          scenes.map((sc) =>
            sc.sceneNumber === sceneNumber ? { ...sc, muted: !sc.muted } : sc
          )
        ),
      toggleFitToTts: (sceneNumber) =>
        mapScenes(set, get, (scenes) =>
          scenes.map((sc) =>
            sc.sceneNumber === sceneNumber ? { ...sc, fitToTts: !sc.fitToTts } : sc
          )
        ),
      setSceneVoice: (sceneNumber, voiceId) =>
        get().updateScene(sceneNumber, { voiceId }),
      // 대표 성우: 설정하면 모든 장면을 그 성우로 바꾸고, 이후 새 장면 기본값이 됨.
      // 빈 값("개별 설정")이면 대표 해제만 — 기존 장면 성우는 건드리지 않음.
      setDefaultVoice: (voiceId) => {
        set({ defaultVoiceId: voiceId || null });
        if (voiceId) mapScenes(set, get, (scenes) => scenes.map((sc) => ({ ...sc, voiceId })));
      },
      // 좌우반전(미디어 가로 뒤집기)
      toggleFlipH: (sceneNumber) =>
        mapScenes(set, get, (scenes) =>
          scenes.map((sc) => (sc.sceneNumber === sceneNumber ? { ...sc, flipH: !sc.flipH } : sc))
        ),
      // 전체 장면 좌우반전 일괄 설정
      setAllFlipH: (value) =>
        mapScenes(set, get, (scenes) => scenes.map((sc) => ({ ...sc, flipH: value }))),
      // 수동 체류시간 override. us=null → 자동(도출값)으로 리셋.
      setSceneDuration: (sceneNumber, us) =>
        get().updateScene(sceneNumber, { manualDurationUs: us }),
      // 장면 시작 효과음(오디오 요소). sfx=null → 제거.
      setSceneSfx: (sceneNumber, sfx) =>
        get().updateScene(sceneNumber, { startSfx: sfx }),
      deleteScene: (sceneNumber) =>
        mapScenes(set, get, (scenes) => scenes.filter((sc) => sc.sceneNumber !== sceneNumber)),
      // 여러 장면 한꺼번에 삭제(체크박스 선택)
      deleteScenes: (sceneNumbers) =>
        mapScenes(set, get, (scenes) => {
          const kill = new Set(sceneNumbers);
          return scenes.filter((sc) => !kill.has(sc.sceneNumber));
        }),

      addSceneAfter: (sceneNumber) =>
        mapScenes(set, get, (scenes) => {
          const voiceId = get().defaultVoiceId || scenes[0]?.voiceId || "";
          const idx = scenes.findIndex((sc) => sc.sceneNumber === sceneNumber);
          const copy = [...scenes];
          copy.splice(idx + 1, 0, emptyScene(voiceId));
          return copy;
        }),
      // 맨 앞(장면 1 위)에 장면 추가
      addSceneAtStart: () =>
        mapScenes(set, get, (scenes) => {
          const voiceId = get().defaultVoiceId || scenes[0]?.voiceId || "";
          return [emptyScene(voiceId), ...scenes];
        }),

      // ---- subtitle1 line level ----
      _mapLines: (sceneNumber, fn) =>
        mapScenes(set, get, (scenes) =>
          scenes.map((sc) =>
            sc.sceneNumber === sceneNumber
              ? { ...sc, subtitle1Lines: fn(sc.subtitle1Lines, sc) }
              : sc
          )
        ),

      // text↔ttsText 바인딩(§3.6 f)
      updateLineText: (sceneNumber, lineNumber, text) =>
        get()._mapLines(sceneNumber, (lines) =>
          lines.map((ln) =>
            ln.lineNumber === lineNumber
              ? { ...ln, text, ttsText: ln.ttsTextEdited ? ln.ttsText : text }
              : ln
          )
        ),
      updateLineTtsText: (sceneNumber, lineNumber, ttsText) =>
        get()._mapLines(sceneNumber, (lines) =>
          lines.map((ln) =>
            ln.lineNumber === lineNumber ? { ...ln, ttsText, ttsTextEdited: true } : ln
          )
        ),
      // 장면 TTS 결과 반영: 합친 오디오(sceneTts) + 줄별 시간범위(ttsRange) 매핑
      setSceneTts: (sceneNumber, sceneTts, lineRanges) =>
        set((s) => ({
          scenes: s.scenes.map((sc) => {
            if (sc.sceneNumber !== sceneNumber) return sc;
            const byNum = new Map((lineRanges || []).map((r) => [r.lineNumber, r]));
            return {
              ...sc,
              sceneTts,
              subtitle1Lines: sc.subtitle1Lines.map((ln) => {
                const r = byNum.get(ln.lineNumber);
                return { ...ln, ttsRange: r && r.startUs != null ? { startUs: r.startUs, endUs: r.endUs } : null };
              }),
            };
          }),
        })),
      addLine: (sceneNumber, atIndex = null) =>
        get()._mapLines(sceneNumber, (lines, sc) => {
          const ln = newSubtitle1Line("");
          if (atIndex == null) return [...lines, ln];
          const copy = [...lines];
          copy.splice(atIndex, 0, ln);
          return copy;
        }),
      removeLine: (sceneNumber, lineNumber) =>
        get()._mapLines(sceneNumber, (lines) =>
          lines.filter((ln) => ln.lineNumber !== lineNumber)
        ),
      // 줄 중간 ENTER 분리(§4.4): caret 기준 앞/뒤
      splitLineAtCaret: (sceneNumber, lineNumber, caret) =>
        get()._mapLines(sceneNumber, (lines) => {
          const i = lines.findIndex((ln) => ln.lineNumber === lineNumber);
          if (i < 0) return lines;
          const ln = lines[i];
          const before = ln.text.slice(0, caret);
          const after = ln.text.slice(caret);
          const copy = [...lines];
          copy[i] = { ...ln, text: before, ttsText: ln.ttsTextEdited ? ln.ttsText : before };
          copy.splice(i + 1, 0, newSubtitle1Line(after));
          return copy;
        }),

      // ---- 자막2 = 원본 소스 타임라인 캡션 트랙(장면과 분리) ----
      // caption: { id, sourceId, startUs, endUs, text, ko } — 소스 시간 기준. 장면 편집과 직교.
      addCaptions: (list) =>
        set((s) => ({ captions: [...s.captions, ...(list || [])] })),
      addCaption: (caption) =>
        set((s) => ({ captions: [...s.captions, caption] })),
      updateCaption: (id, patch) =>
        set((s) => ({ captions: s.captions.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      removeCaption: (id) =>
        set((s) => ({ captions: s.captions.filter((c) => c.id !== id) })),

      // ---- 장면 분리/병합(§4.5) ----
      // 자막1 기준 분리: lineIndex 이후 줄들을 새 장면(빈 미디어)으로 내림
      splitSceneAtLine: (sceneNumber, lineIndex) =>
        mapScenes(set, get, (scenes) => {
          const idx = scenes.findIndex((sc) => sc.sceneNumber === sceneNumber);
          if (idx < 0) return scenes;
          const sc = scenes[idx];
          const top = sc.subtitle1Lines.slice(0, lineIndex);
          const bottom = sc.subtitle1Lines.slice(lineIndex);
          if (bottom.length === 0) return scenes;
          const upper = { ...sc, subtitle1Lines: top };
          const lower = { ...emptyScene(sc.voiceId, sc.fitToTts), subtitle1Lines: bottom };
          const copy = [...scenes];
          copy.splice(idx, 1, upper, lower);
          return copy;
        }),

      // 미디어(동영상 클립)를 로컬 시각 atUs에서 두 장면으로 분할.
      // 한 파일 공유 + source/orig 윈도우만 분할(재인코딩 0). 자막2(캡션)는 소스 앵커라
      // 두 창에 자동으로 이어져 표시되고, 사이에 장면을 끼우면 자연히 갈라진다.
      splitSceneAtTimeUs: (sceneNumber, atUs) =>
        mapScenes(set, get, (scenes) => {
          const idx = scenes.findIndex((sc) => sc.sceneNumber === sceneNumber);
          if (idx < 0) return scenes;
          const sc = scenes[idx];
          if (!sc.media || sc.media.durationUs == null) return scenes;
          const srcStart = mediaSrcStart(sc.media);
          const srcEnd = mediaSrcEnd(sc.media);
          const boundary = srcStart + atUs;
          if (boundary <= srcStart || boundary >= srcEnd) return scenes;
          const oStart = sc.media.origStartUs;
          const oBoundary = oStart != null ? oStart + atUs : null;
          const upper = {
            ...sc,
            media: {
              ...sc.media, sourceStartUs: srcStart, sourceEndUs: boundary,
              ...(oBoundary != null ? { origEndUs: oBoundary } : {}),
            },
          };
          const lower = {
            ...emptyScene(sc.voiceId, sc.fitToTts),
            muted: sc.muted,
            media: {
              ...sc.media, sourceStartUs: boundary, sourceEndUs: srcEnd,
              ...(oBoundary != null ? { origStartUs: oBoundary } : {}),
            },
          };
          const copy = [...scenes];
          copy.splice(idx, 1, upper, lower);
          return copy;
        }),

      // 프리즈 장면 삽입: 추출한 프레임(asset)을 스틸 장면으로 만들어 base 장면 앞/뒤에 삽입.
      // 독립 편집 가능(자기 수동 체류시간). origSourceId 없음 → 자막2가 그 위에 안 뜸.
      insertFreezeScene: (sceneNumber, side, asset, durationUs = 1_000_000) =>
        mapScenes(set, get, (scenes) => {
          const idx = scenes.findIndex((sc) => sc.sceneNumber === sceneNumber);
          if (idx < 0) return scenes;
          const base = scenes[idx];
          const freeze = {
            ...emptyScene(base.voiceId, false),
            media: {
              sourceType: "image",
              localPath: asset.localPath,
              capcutPath: "",
              widthPx: asset.widthPx,
              heightPx: asset.heightPx,
              durationUs: null,
              hasAudio: false,
            },
            manualDurationUs: durationUs,
          };
          const copy = [...scenes];
          copy.splice(side === "before" ? idx : idx + 1, 0, freeze);
          return copy;
        }),

      // sceneNumber 를 위 장면에 병합. 같은 파일·연속 윈도우면 미디어 재결합(source+orig).
      mergeSceneUp: (sceneNumber) =>
        mapScenes(set, get, (scenes) => {
          const idx = scenes.findIndex((sc) => sc.sceneNumber === sceneNumber);
          if (idx <= 0) return scenes;
          const up = scenes[idx - 1];
          const cur = scenes[idx];

          let media = up.media;
          const contiguous =
            up.media && cur.media &&
            up.media.localPath === cur.media.localPath &&
            mediaSrcEnd(up.media) === mediaSrcStart(cur.media);
          if (contiguous) {
            media = {
              ...up.media,
              sourceStartUs: mediaSrcStart(up.media),
              sourceEndUs: mediaSrcEnd(cur.media),
              ...(up.media.origStartUs != null && cur.media.origEndUs != null
                ? { origStartUs: up.media.origStartUs, origEndUs: cur.media.origEndUs }
                : {}),
            };
          }

          const merged = {
            ...up,
            media,
            subtitle1Lines: [...up.subtitle1Lines, ...cur.subtitle1Lines],
          };
          const copy = [...scenes];
          copy.splice(idx - 1, 2, merged);
          return copy;
        }),

      // ---- 동영상 분석 job + 삽입(§3.6 g) ----
      addJob: (job) => set((s) => ({ jobs: [...s.jobs, job] })),
      updateJobState: (jobId, patch) =>
        set((s) => ({
          jobs: s.jobs.map((j) => (j.jobId === jobId ? { ...j, ...patch } : j)),
        })),
      removeJob: (jobId) =>
        set((s) => ({ jobs: s.jobs.filter((j) => j.jobId !== jobId) })),
      insertScenesAt: (targetSceneNumber, insert) =>
        mapScenes(set, get, (scenes) => {
          const idx = scenes.findIndex((sc) => sc.sceneNumber === targetSceneNumber);
          const at = idx < 0 ? scenes.length : idx;
          const copy = [...scenes];
          // 대상 장면을 샷들로 치환(§3.6 g: 장면 N → N..N+M-1)
          copy.splice(at, 1, ...insert);
          return copy;
        }),

      resetAll: () =>
        set({
          step: "setup",
          title: "",
          templateId: null,
          scriptText: "",
          scenes: [],
          captions: [],
          defaultVoiceId: null,
          selectedSceneNumber: null,
          jobs: [],
          assetPanel: initialAssetPanel,
        }),
    }),
    {
      // Undo 추적 대상만(transient 제외)
      partialize: (s) => ({
        scenes: s.scenes,
        captions: s.captions,
        defaultVoiceId: s.defaultVoiceId,
        title: s.title,
        templateId: s.templateId,
        language: s.language,
        scriptText: s.scriptText,
        selectedSceneNumber: s.selectedSceneNumber,
      }),
      limit: 100,
    }
  )
);

export const useTemporal = () => useStore.temporal;
