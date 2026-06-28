export function fmtUs(us) {
  const totalSec = Math.round((us || 0) / 1_000_000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
