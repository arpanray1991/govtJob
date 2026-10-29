"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Medal, Trophy, Users } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "./providers";
import { createClient, isConfigured } from "@/lib/supabase/client";
import type { Exam, Leaderboard as LeaderboardData } from "@/lib/types";
import { demoExams } from "@/lib/demo";
import { formatTime } from "@/lib/exam-utils";
import { examLevelTitle } from "@/lib/exam-levels";
import { ErrorNotice, Loading, SetupNotice } from "./ui";

export function Leaderboard({ examId }: { examId?: string }) {
  const { user } = useAuth();
  const [exams, setExams] = useState<Exam[]>(isConfigured ? [] : demoExams.map(exam => ({ ...exam, title: examLevelTitle(exam) })));
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!isConfigured) return;
    createClient().rpc("get_catalog").then(({ data, error }) => { if (error) setError(error.message); else setExams((data as Exam[]).map(exam => ({ ...exam, title: examLevelTitle(exam) }))); });
  }, []);
  useEffect(() => {
    if (!examId || !isConfigured) return;
    setData(null);
    createClient().rpc("get_leaderboard", { p_exam_id: examId }).then(({ data, error }) => { if (error) setError(error.message); else setData(data as LeaderboardData); });
  }, [examId, user]);
  const exam = exams.find(e => e.id === examId);
  return <>{examId && <Link className="text-link" href="/leaderboards"><ArrowLeft size={16} /> All leaderboards</Link>}<section className="page-heading"><div><div className="eyebrow">A LITTLE HEALTHY COMPETITION</div><h1>See where you stand<span className="green-text">.</span></h1><p>{exam?.title || "Great preparation deserves a little recognition. Find your next benchmark."}</p></div><span className="heading-trophy"><Trophy size={38} /></span></section>{!isConfigured && <SetupNotice />}{error && <ErrorNotice message={error} />}{!examId ? <div className="exam-grid">{exams.map(exam => <Link href={`/leaderboards/${exam.id}`} className="panel leaderboard-exam" key={exam.id}><span className="benefit-icon peach"><Trophy size={24} /></span><span className="eyebrow">{exam.categories.name}</span><h2>{exam.title}</h2><p>Best attempts. Real progress. Your next goal.</p><span className="text-link">Explore leaderboard <ArrowUpRight size={17} /></span></Link>)}</div> : !data && isConfigured && !error ? <Loading /> : <>{data && <><div className="ranking-summary"><span><Users size={18} />{data.total_participants} participants</span><span>Best attempt per person · Score ↓ · Time ↑ · Submitted ↑</span></div>{data.current_user && <div className="your-rank panel"><span className="benefit-icon mint"><Medal size={24} /></span><div><span>YOUR PLACE ON THE BOARD</span><h2>#{data.current_user.rank} <small>of {data.total_participants} participants</small></h2></div><div className="your-rank-score">{Number(data.current_user.score).toFixed(2)}<span>best score</span></div></div>}<section className="panel table-scroll"><table><thead><tr><th>Rank</th><th>Aspirant</th><th>Best score</th><th>Time taken</th><th>Submitted</th></tr></thead><tbody>{data.entries.map(entry => <tr key={entry.user_id} className={clsx(entry.user_id === user?.id && "current-user-row")}><td><span className={clsx("rank-badge", `rank-${entry.rank}`)}>{entry.rank <= 3 ? <Medal size={20} /> : "#"} {entry.rank}</span></td><td><div className="rank-user"><span className="avatar">{entry.full_name.slice(0, 1).toUpperCase()}</span><strong>{entry.full_name}</strong>{entry.user_id === user?.id && <span className="you-label">You</span>}</div></td><td><strong>{Number(entry.score).toFixed(2)}</strong></td><td>{formatTime(entry.time_taken_seconds)}</td><td>{new Date(entry.submitted_at).toLocaleDateString()}</td></tr>)}</tbody></table>{data.entries.length === 0 && <div className="empty-state"><Trophy size={36} /><h3>A fresh leaderboard. A new opportunity.</h3><p>Be the first to complete this mock test.</p><Link href={`/exam/${examId}`} className="button button-primary">Take the test <ArrowUpRight size={17} /></Link></div>}</section></>}{!user && <div className="notice"><Trophy size={20} /><span><Link className="text-link" href={`/login?next=${encodeURIComponent(`/exam/${examId}`)}`}>Log in and take this test</Link> to find your place on the leaderboard.</span></div>}</>}</>;
}
