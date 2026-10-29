"use client";

import { useEffect, useState } from "react";
import { Save, UserRound } from "lucide-react";
import { useAuth } from "@/components/providers";
import { AuthRequired, ErrorNotice, Loading } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user) return;
    createClient().from("profiles").select("full_name,avatar_url").eq("id", user.id).single().then(({ data, error }) => {
      if (error) setError(error.message);
      else { setName(data.full_name); setAvatar(data.avatar_url || ""); }
    });
  }, [user]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true); setError(""); setMessage("");
    const client = createClient();
    const { error } = await client.from("profiles").update({ full_name: name.trim(), avatar_url: avatar.trim() || null }).eq("id", user.id);
    if (error) { setError(error.message); setBusy(false); return; }
    const { error: authError } = await client.auth.updateUser({ data: { full_name: name.trim() } });
    if (authError) setError(`Profile saved, but account display name could not be updated: ${authError.message}`);
    else setMessage("Your profile is up to date.");
    setBusy(false);
  }
  if (loading) return <Loading />;
  if (!user) return <AuthRequired next="/profile" />;
  return <><section className="page-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h1>Your profile<span className="green-text">.</span></h1><p>A name behind the ambition.</p></div></section><section className="panel profile-panel"><span className="auth-logo"><UserRound size={27} /></span><h2>Personal details</h2>{error && <ErrorNotice message={error} />}{message && <div className="notice success" role="status">{message}</div>}<form className="form-stack" onSubmit={save}><label>Full name<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label><label>Email address<input value={user.email || ""} disabled /><small>Your sign-in email is private and never appears on leaderboards.</small></label><label>Avatar URL (optional)<input type="url" value={avatar} onChange={e => setAvatar(e.target.value)} placeholder="https://example.com/avatar.jpg" maxLength={2048} /></label><button className="button button-primary" disabled={busy || !name.trim()}><Save size={16} />{busy ? "Saving..." : "Save changes"}</button></form></section></>;
}
