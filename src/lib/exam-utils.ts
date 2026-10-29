export function remainingSeconds(expiresAt: string, now = Date.now()) {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
}
export function formatTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}
export function paletteState(answered: boolean, marked: boolean) {
  return answered ? (marked ? "answered-marked" : "answered") : marked ? "marked" : "unanswered";
}
export function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/dashboard";
}
