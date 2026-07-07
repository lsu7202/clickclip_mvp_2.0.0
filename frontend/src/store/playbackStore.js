// 전체 미리보기 재생 상태(고빈도 갱신 → 메인 스토어/undo와 분리).
import { create } from "zustand";

export const usePlaybackStore = create((set) => ({
  playing: false,
  sceneNumber: null, // 현재 재생 중인 장면
  sourceId: null, // 현재 장면의 원본 소스(캡션 매칭용)
  sourceTimeUs: null, // 현재 재생 중인 원본 소스 시각(현재 자막 하이라이트용)
  setPlayback: (patch) => set(patch),
  resetPlayback: () => set({ playing: false, sceneNumber: null, sourceId: null, sourceTimeUs: null }),
}));
