"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient, isConfigured } from "@/lib/supabase/client";
import { dailyGuestId, guestBrowserKey, guestConsentKey, type GuestConsent } from "@/lib/guest-analytics";
import { useAuth } from "./providers";
import { ErrorNotice } from "./ui";

export function GuestAnalytics() {
  const { user, loading } = useAuth();
  const path = usePathname();
  const [consent, setConsent] = useState<GuestConsent | null>(null);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const lastRecorded = useRef("");
  useEffect(() => {
    if (!isConfigured) return;
    try {
      const saved = localStorage.getItem(guestConsentKey);
      setConsent(saved === "allowed" || saved === "denied" ? saved : null);
    } catch (error) {
      setError(`Visitor preferences could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }
    setReady(true);
  }, []);
  function choose(value: GuestConsent) {
    try {
      localStorage.setItem(guestConsentKey, value);
      if (value === "denied") localStorage.removeItem(guestBrowserKey);
      setConsent(value); setSettings(false); setError(""); lastRecorded.current = "";
    } catch (error) {
      setError(`Visitor preference could not be saved: ${error instanceof Error ? error.message : String(error)}. No visit was recorded.`);
    }
  }
  useEffect(() => {
    if (!isConfigured || loading || user || !ready || consent !== "allowed") return;
    const key = `${new Date().toISOString().slice(0, 10)}:${path}:${retry}`;
    if (lastRecorded.current === key) return;
    lastRecorded.current = key;
    async function record() {
      try {
        const visitorId = dailyGuestId(localStorage);
        const { error } = await createClient().rpc("record_guest_visit", { p_visitor_id: visitorId });
        if (error && lastRecorded.current === key) setError(`Guest visit was not recorded: ${error.message}`);
      } catch (error) {
        if (lastRecorded.current === key) setError(`Guest visit was not recorded: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    void record();
  }, [path, user, loading, ready, consent, retry]);
  if (!isConfigured || !ready) return null;
  return <section className="visitor-privacy" aria-label="Visitor privacy">
    {error && <><ErrorNotice message={error} /><button className="text-link" onClick={() => { setError(""); setRetry(value => value + 1); }}>Retry analytics</button></>}
    {(!consent || settings) && !user ? <div className="visitor-consent panel"><strong>Help us measure guest traffic?</strong><p>With your permission, we store a random browser ID that resets each UTC day and count guest page views. We do not store your IP address or page paths. Declining does not affect exams or account access. Revoking stops future tracking; earlier anonymous totals remain.</p><div className="admin-actions"><button className="button button-primary small" onClick={() => choose("allowed")}>Allow anonymous analytics</button><button className="button button-outline small" onClick={() => choose("denied")}>Decline / revoke</button></div></div> : null}
    {!user && consent && <button className="text-link" onClick={() => setSettings(value => !value)}>Visitor privacy settings</button>}
  </section>;
}
