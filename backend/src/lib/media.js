// ffprobe/ffmpeg 래퍼: 치수/길이/오디오 측정, 샷 슬라이스, TTS 무음 트림.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

// 동영상에서 한 프레임(시각 atUs)을 PNG로 추출(프리즈 장면용).
export async function extractFrame(srcAbs, atUs, outAbs) {
  const ss = (Math.max(0, atUs) / 1_000_000).toFixed(3);
  await execFileP("ffmpeg", [
    "-y", "-v", "error", "-ss", ss, "-i", srcAbs, "-frames:v", "1", "-q:v", "2", outAbs,
  ]);
}

// 오디오 포함 컨테이너의 길이(µs). probe()는 비디오 없는 파일에 null이라 별도 제공.
export async function probeDurationUs(filePath) {
  const { stdout } = await execFileP("ffprobe", [
    "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", filePath,
  ]);
  const sec = parseFloat(stdout);
  return Number.isNaN(sec) ? null : Math.round(sec * 1_000_000);
}

// (A) TTS 앞뒤 무음 제거 — 줄 시작/끝의 dead air만 제거(내부 숨은 보존).
// 성공 시 파일을 제자리 교체하고 새 길이(µs) 반환. 실패/결과 과소면 원본 유지하고 null.
export async function trimLeadTrailSilence(filePath, thresholdDb = -50) {
  const ext = path.extname(filePath) || ".mp3";
  const tmp = `${filePath}.trim${ext}`;
  const th = `${thresholdDb}dB`;
  // 앞 무음 제거 → 뒤집어 다시 앞(=원래 뒤) 무음 제거 → 되돌림. 0.03s 패딩으로 첫/끝 음소 보호.
  const af =
    `silenceremove=start_periods=1:start_silence=0.03:start_threshold=${th}:detection=peak,` +
    `areverse,` +
    `silenceremove=start_periods=1:start_silence=0.03:start_threshold=${th}:detection=peak,` +
    `areverse`;
  try {
    await execFileP("ffmpeg", ["-y", "-v", "error", "-i", filePath, "-af", af, tmp]);
    const dur = await probeDurationUs(tmp);
    if (!dur || dur < 50_000) { // 거의 무음(50ms 미만) → 원본 유지
      await fs.unlink(tmp).catch(() => {});
      return null;
    }
    await fs.rename(tmp, filePath);
    return dur;
  } catch {
    await fs.unlink(tmp).catch(() => {});
    return null;
  }
}

// 미디어 파일 측정 → { widthPx, heightPx, durationUs|null, hasAudio }
export async function probe(filePath) {
  const { stdout } = await execFileP("ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);
  const info = JSON.parse(stdout);
  const streams = info.streams || [];
  const video = streams.find((s) => s.codec_type === "video");
  const hasAudio = streams.some((s) => s.codec_type === "audio");

  const widthPx = video?.width ? parseInt(video.width, 10) : 0;
  const heightPx = video?.height ? parseInt(video.height, 10) : 0;

  // 이미지(정지)면 format.duration 이 "N/A" 또는 매우 작음 → 동영상만 길이 인정
  let durationUs = null;
  const isVideoContainer = video && video.codec_name !== "mjpeg" &&
    video.codec_name !== "png" && (video.nb_frames !== "1");
  const durSec = parseFloat(info.format?.duration);
  if (isVideoContainer && !Number.isNaN(durSec) && durSec > 0) {
    durationUs = Math.round(durSec * 1_000_000);
  }

  // fps(프레임 단위 스크럽용). "30/1" / "30000/1001" → 숫자. 못 구하면 null.
  let fps = null;
  if (durationUs != null) {
    const r = video?.r_frame_rate || video?.avg_frame_rate || "";
    const [a, b] = r.split("/").map(Number);
    if (a && b) fps = a / b;
  }

  return { widthPx, heightPx, durationUs, hasAudio, fps };
}

// [startUs, endUs] 구간을 잘라 outPath 로 저장(동영상 샷 슬라이스).
// 프레임 정확 재인코딩 + PTS 0 리셋. `-c copy`는 키프레임 경계로만 잘려
// 시작이 어긋나고 앞부분에 빈/멈춘 프레임이 생겨 '장면 사이 공백'을 유발하므로 쓰지 않는다.
export async function sliceVideo(srcPath, outPath, startUs, endUs) {
  const ss = (startUs / 1_000_000).toFixed(3);
  const dur = endUs > startUs ? ["-t", ((endUs - startUs) / 1_000_000).toFixed(3)] : [];
  const baseIn = ["-y", "-v", "error", "-ss", ss, "-i", srcPath, ...dur];
  const venc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p"];
  try {
    await execFileP("ffmpeg", [
      ...baseIn,
      "-vf", "setpts=PTS-STARTPTS",   // 비디오 PTS 0부터
      "-af", "asetpts=PTS-STARTPTS",  // 오디오 PTS 0부터(av 동기)
      ...venc, "-c:a", "aac",
      outPath,
    ]);
  } catch {
    // 오디오 없는 소스 → 비디오만
    await execFileP("ffmpeg", [...baseIn, "-an", "-vf", "setpts=PTS-STARTPTS", ...venc, outPath]);
  }
}
