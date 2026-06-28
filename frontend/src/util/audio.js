// 단일 재생기: 새로 재생하면 이전 것 중지.
let current = null;

export function playAudio(url) {
  if (current) {
    current.pause();
    current.currentTime = 0;
  }
  current = new Audio(url);
  current.play().catch(() => {});
}
