"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, GraduationCap, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { createClient, isConfigured } from "@/lib/supabase/client";
import { safeNext } from "@/lib/exam-utils";
import { ErrorNotice, Loading, SetupNotice } from "./ui";

function Form({ register }: { register: boolean }) {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("error") || "");
  const [success, setSuccess] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!isConfigured) { setError("Connect Supabase before signing in. See the project README for setup."); return; }
    setBusy(true); setError("");
    const supabase = createClient();
    const result = register
      ? await supabase.auth.signUp({ email, password, options: { data: { full_name: name.trim() }, emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` } })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    if (register && !result.data.session) setSuccess(true);
    else { router.push(next); router.refresh(); }
  }
  async function google() {
    if (!isConfigured) { setError("Connect Supabase and enable Google OAuth to continue."); return; }
    setBusy(true); setError("");
    const { error } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    if (error) { setError(error.message); setBusy(false); }
  }
  return <div className="auth-layout"><div className="auth-intro"><span className="eyebrow">YOUR NEXT CHAPTER</span><h1>Big dreams.<br />Real progress.<br /><span className="green-text">Starts here.</span></h1><p>A focused space for your government exam preparation. Practice with purpose, learn from every attempt, and keep moving forward.</p><div className="auth-feature"><CheckCircle2 /> Realistic, timed mock tests</div><div className="auth-feature"><CheckCircle2 /> Detailed solutions & personal insights</div><div className="auth-feature"><CheckCircle2 /> Rankings that keep you motivated</div></div><section className="auth-card"><span className="auth-logo"><GraduationCap size={28} /></span><h2>{register ? "Make your next move." : "Welcome back."}</h2><p>{register ? "Create your free account. Your goals are waiting." : "Your goals haven't gone anywhere. Let's get to work."}</p>{!isConfigured && <SetupNotice />}{error && <ErrorNotice message={error} />}{success ? <div className="notice success"><CheckCircle2 size={22} /><span>Check your email to confirm your account, then come back to sign in.</span></div> : <><button type="button" className="button google-button" disabled={busy} onClick={google}><span className="google-g">G</span> Continue with Google</button><div className="auth-divider"><span />or continue with email<span /></div><form onSubmit={submit} className="form-stack">{register && <label>Full name<input required value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={80} placeholder="Your full name" /></label>}<label>Email address<input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" /></label><label>Password<div className="password-field"><input required type={showPassword ? "text" : "password"} minLength={register ? 8 : 1} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} autoComplete={register ? "new-password" : "current-password"} placeholder={register ? "At least 8 characters" : "Your password"} /><button type="button" className="icon-button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label><button className="button button-primary full-width" disabled={busy}>{busy ? "Please wait..." : register ? "Create account" : "Log in"}<ArrowRight size={17} /></button></form></>}<p className="auth-switch">{register ? "Already part of Examforge?" : "New to Examforge?"} <Link href={`/${register ? "login" : "register"}?next=${encodeURIComponent(next)}`}>{register ? "Log in" : "Create an account"}</Link></p><p className="privacy-note">Your progress stays private. Only your display name and best scores appear on leaderboards.</p></section></div>;
}
export function AuthForm({ register = false }: { register?: boolean }) {
  return <Suspense fallback={<Loading />}><Form register={register} /></Suspense>;
}
