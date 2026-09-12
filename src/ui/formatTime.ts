export function formatTime(seconds: number, duration = 0): string {
  const total = Math.max(
    0,
    Math.floor(Number.isFinite(seconds) ? seconds : 0),
  );
  const showHours = duration >= 3600 || total >= 3600;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (showHours) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}
