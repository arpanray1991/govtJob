"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, LayoutDashboard, Trophy, ArrowUpRight, LogOut, Menu, X, GraduationCap, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { useAuth } from "./providers";
import { createClient } from "@/lib/supabase/client";
import clsx from "clsx";

const links = [
  { href: "/", label: "Mock tests", icon: BookOpen },
  { href: "/dashboard", label: "My dashboard", icon: LayoutDashboard },
  { href: "/leaderboards", label: "Leaderboards", icon: Trophy }
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const examMode = path.startsWith("/exam/");
  async function signOut() {
    const { error } = await createClient().auth.signOut();
    if (error) { setError(error.message); return; }
    router.push("/"); router.refresh();
  }
  return <div className={clsx("app-shell", examMode && "exam-mode")}>
    <aside className={clsx("sidebar", open && "is-open")}>
      <Link href="/" className="brand" onClick={() => setOpen(false)}><span className="brand-icon"><GraduationCap size={25} /></span>exam<span className="brand-accent">forge</span><span className="brand-dot">.</span></Link>
      <button className="mobile-close icon-button" onClick={() => setOpen(false)} aria-label="Close menu"><X /></button>
      <div className="workspace-label">YOUR PREPARATION SPACE</div>
      <nav aria-label="Main navigation">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} className={clsx("nav-item", path === href && "active")}><Icon size={19} />{label}{path === href && <span className="nav-dot" />}</Link>)}{isAdmin && <Link href="/admin" onClick={() => setOpen(false)} className={clsx("nav-item", path === "/admin" && "active")}><ShieldCheck size={19} />Admin dashboard</Link>}</nav>
      <div className="sidebar-tip"><span className="tip-icon"><Sparkles size={21} /></span><h3>A little better, every day.</h3><p>One mock test today.<br />One step closer to your dream.</p><Link href="/">Find your next test <ArrowUpRight size={15} /></Link></div>
      <div className="sidebar-bottom"><ShieldCheck size={17} /><span>Practice with purpose.<br /><strong>Prepare with confidence.</strong></span></div>
    </aside>
    {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <div className="main-wrap">
      <header className="topbar">
        <div className="topbar-left"><button className="mobile-menu icon-button" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={22} /></button><span className="breadcrumb">Your next chapter starts here</span><span className="live-dot" /><span className="topbar-label">LET&apos;S MAKE IT COUNT</span></div>
        <div className="topbar-right">{user ? <><Link href="/profile" className="user-chip"><span className="avatar">{(user.user_metadata.full_name || user.email || "U").slice(0, 1).toUpperCase()}</span><span>{user.user_metadata.full_name || "My profile"}</span></Link><button className="icon-button" aria-label="Sign out" onClick={signOut}><LogOut size={18} /></button></> : <><Link href="/login" className="login-link">Log in</Link><Link href="/register" className="button button-dark small">Get started <ArrowUpRight size={15} /></Link></>}</div>
      </header>
      {error && <div role="alert" className="notice error">{error}</div>}
      <main className={clsx("page-content", examMode && "exam-content")}>{children}</main>
      <footer className="footer"><span>© {new Date().getFullYear()} Examforge. Built for your next big step.</span><span>Practice. Analyze. Improve. <span className="footer-dot" /></span></footer>
    </div>
  </div>;
}
