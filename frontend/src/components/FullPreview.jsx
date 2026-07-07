// 전체 미리보기: 장면들을 이어서 순차 재생(왼쪽 미리보기 영역).
// - 장면 진입 시 그 장면을 선택(자막2 패널·장면 목록이 따라옴)
// - 원본 소리(🔇 장면 제외, 전역 볼륨) + 장면 TTS(TTS 볼륨) + 효과음 동시 재생
// - 재생 시각을 원본 소스 시각으로 환산해 현재 자막(노래방식) 하이라이트에 공급
import { useEffect, useRef, useState } from "react";

import { resUrl, workspaceUrl } from "../api/client.js";
import { useStore } from "../store/useStore.js";
import { usePlaybackStore } from "../store/playbackStore.js";
import { mediaSrcEnd, mediaSrcStart, sceneDurationUs } from "../store/sceneOps.js";

export default function FullPreview({ onEnd }) {
  const scenes = useStore((s) => s.scenes);
  const templateId = useStore((s) => s.templateId);
  const originalVolume = useStore((s) => s.originalVolume);
  const ttsVolume = useStore((s) => s.ttsVolume);
  const selectScene = useStore((s) => s.selectScene);
  const setPlayback = usePlaybackStore((s) => s.setPlayback);
  const resetPlayback = usePlaybackStore((s) => s.resetPlayback);

  const [idx, setIdx] = useState(0);
  const vref = useRef(null);
  const audiosRef = useRef([]); // 재생 중인 TTS/효과음(정지 시 일괄 정리)
  const timerRef = useRef(null);

  const scene = scenes[idx] || null;

  // 장면 진입: 선택 동기화 + 오디오 시작 + 체류시간 타이머로 다음 장면
  useEffect(() => {
    if (!scene) { onEnd?.(); return undefined; }
    selectScene(scene.sceneNumber);
    setPlayback({
      playing: true,
      sceneNumber: scene.sceneNumber,
      sourceId: scene.media?.origSourceId ?? null,
      sourceTimeUs: scene.media?.origStartUs ?? null,
    });

    const startAudio = (path, vol) => {
      if (!path) return;
      const a = new Audio(workspaceUrl(path));
      a.volume = Math.max(0, Math.min(1, vol));
      a.play().catch(() => {});
      audiosRef.current.push(a);
    };
    startAudio(scene.startSfx?.localPath, 1);
    startAudio(scene.sceneTts?.localPath, ttsVolume);

    const durUs = sceneDurationUs(scene);
    timerRef.current = setTimeout(() => setIdx((i) => i + 1), Math.max(50, durUs / 1000));
    return () => clearTimeout(timerRef.current);
  }, [idx]); // eslint-disable-line

  // 비디오: 메타데이터 로드 후 윈도우 시작점부터 재생
  const onLoadedMetadata = (e) => {
    const v = e.target;
    v.currentTime = mediaSrcStart(scene.media) / 1e6;
    v.muted = !!scene.muted;
    v.volume = Math.max(0, Math.min(1, originalVolume));
    v.play().catch(() => {});
  };

  // 재생 시각 → 원본 소스 시각(현재 자막 하이라이트) + 윈도우 끝에서 화면 정지
  const onTimeUpdate = () => {
    const v = vref.current;
    const m = scene?.media;
    if (!v || !m) return;
    const curUs = v.currentTime * 1e6;
    if (curUs >= mediaSrcEnd(m) - 20_000) v.pause(); // 분할 창 밖 프레임 방지
    if (m.origSourceId != null) {
      const local = Math.max(0, curUs - mediaSrcStart(m));
      setPlayback({ sourceTimeUs: (m.origStartUs ?? 0) + local });
    }
  };

  // 정지/언마운트: 모든 오디오 정리
  useEffect(() => () => {
    audiosRef.current.forEach((a) => a.pause());
    audiosRef.current = [];
    clearTimeout(timerRef.current);
    resetPlayback();
  }, []); // eslint-disable-line

  if (!scene) return null;
  const media = scene.media;
  const isVideo = media?.durationUs != null;
  const cover = { objectFit: "cover", width: "100%", height: "100%", transform: scene.flipH ? "scaleX(-1)" : undefined };

  return (
    <div className="preview-frame" style={{ position: "relative" }}>
      {isVideo ? (
        <video ref={vref} key={`${media.localPath}-${idx}`} src={workspaceUrl(media.localPath)}
          style={cover} playsInline preload="auto"
          onLoadedMetadata={onLoadedMetadata} onTimeUpdate={onTimeUpdate} />
      ) : media ? (
        <img src={workspaceUrl(media.localPath)} style={cover} alt="" />
      ) : (
        <div className="empty" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          빈 장면
        </div>
      )}
      {templateId && <img className="overlay" src={resUrl(`/res/templates/${templateId}`)} alt="" />}
      <div className="scrub-meta">▶ 장면 {scene.sceneNumber} / {scenes.length}</div>
    </div>
  );
}
