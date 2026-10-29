import { LoaderCircle, AlertCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

export function Loading({ text = "Getting things ready..." }: { text?: string }) {
  return <div className="loading-state" role="status"><LoaderCircle className="spin" size={28} /><p>{text}</p></div>;
}
export function ErrorNotice({ message }: { message: string }) {
  return <div className="notice error" role="alert"><AlertCircle size={18} /><span>{message}</span></div>;
}
export function SetupNotice() {
  return <div className="notice setup"><AlertCircle size={18} /><span><strong>Preview mode.</strong> Connect Supabase to create an account, take tests, and save your progress. The catalog below is sample content.</span></div>;
}
export function AuthRequired({ next }: { next: string }) {
  return <div className="empty-state"><span className="eyebrow">YOUR PERSONAL PREPARATION SPACE</span><h2>A little commitment.<br />A lot of possibility.</h2><p>Log in to take a test, track your progress, and see where you stand.</p><Link href={`/login?next=${encodeURIComponent(next)}`} className="button button-primary">Log in to continue <ArrowRight size={17} /></Link></div>;
}
