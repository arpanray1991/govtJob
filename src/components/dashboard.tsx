"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, ChartNoAxesCombined, Target, Trophy, History } from "lucide-react";
import { useAuth } from "./providers";
import { AuthRequired, ErrorNotice, Loading } from "./ui";
import { createClient } from "@/lib/supabase/client";
import type { Dashboard as DashboardData } from "@/lib/types";
import { LevelProgress } from "./level-progress";

export function Dashboard() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    createClient().rpc("get_dashboard").then(({ data, error }) => { if (error) setError(error.message); else setData(data as DashboardData); });
  }, [user]);
  if (loading) return <Loading />;
  if (!user) return <AuthRequired next="/dashboard" />;
  return <>
    <section className="page-heading"><div><div className="eyebrow">EVERY ATTEMPT IS A STEP FORWARD</div><h1>Your progress, in perspective<span className="green-text">.</span></h1><p>Welcome back, {user.user_metadata.full_name || "aspirant"}. Let&apos;s turn your practice into progress.</p></div><Link href="/" className="button button-primary">Take a mock test <ArrowRight size={17} /></Link></section>
    {error && <ErrorNotice message={error} />}
    <LevelProgress />
    {!data && !error ? <Loading /> : data && <><div className="stat-grid">{[
      { label: "Tests completed", value: data.stats.total_tests, icon: BookOpen, color: "mint" },
      { label: "Average score", value: `${Number(data.stats.average_score).toFixed(1)}%`, icon: ChartNoAxesCombined, color: "peach" },
      { label: "Average accuracy", value: `${Number(data.stats.average_accuracy).toFixed(1)}%`, icon: Target, color: "lilac" },
      { label: "Overall rank", value: data.stats.overall_rank ? `#${data.stats.overall_rank}` : "—", icon: Trophy, color: "mint" }
    ].map(({ label, value, icon: Icon, color }) => <div className="stat-card panel" key={label}><span className={`benefit-icon ${color}`}><Icon size={22} /></span><span>{label}</span><strong>{value}</strong></div>)}</div>
    <p className="metric-note">Average score is a percentage of available marks. Overall rank compares average best-attempt score percentages across exams; average time breaks ties.</p>
    <section className="panel history-panel"><div className="panel-heading"><div><h2>Your practice journal</h2><p>Every attempt, every lesson, all in one place.</p></div><History size={23} /></div>{data.history.length === 0 ? <div className="empty-state"><BookOpen size={36} /><h3>Your story starts with one test.</h3><p>Take your first mock test to start tracking your progress here.</p><Link href="/" className="button button-primary">Find a mock test <ArrowRight size={16} /></Link></div> : <div className="table-scroll"><table><thead><tr><th>Mock test</th><th>Score</th><th>Accuracy</th><th>Date</th><th><span className="sr-only">Review</span></th></tr></thead><tbody>{data.history.map(row => <tr key={row.id}><td><strong>{row.exam_title}</strong></td><td><span className="score-chip">{Number(row.score).toFixed(2)} / {row.total_marks}</span></td><td>{Number(row.accuracy_percentage).toFixed(1)}%</td><td>{new Date(row.submitted_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</td><td><Link className="text-link" href={`/results/${row.id}?review=1`}>View detailed solutions <ArrowRight size={15} /></Link></td></tr>)}</tbody></table></div>}</section></>}
  </>;
}
