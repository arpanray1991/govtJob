export const guestConsentKey = "examforge-guest-analytics-consent";
export const guestBrowserKey = "examforge-daily-guest";
export type GuestConsent = "allowed" | "denied";

export function dailyGuestId(storage: Pick<Storage, "getItem" | "setItem">, now = new Date(), randomId = () => crypto.randomUUID()) {
  const day = now.toISOString().slice(0, 10);
  const stored = storage.getItem(guestBrowserKey);
  if (stored) {
    const [storedDay, id] = stored.split("|");
    if (storedDay === day && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? "")) return id;
  }
  const id = randomId();
  storage.setItem(guestBrowserKey, `${day}|${id}`);
  return id;
}
