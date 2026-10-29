"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, X, Trophy, Target, Clock3, ChartNoAxesCombined, Flag, Lightbulb } from "lucide-react";
import clsx from "clsx";
import type { Result } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { formatTime } from "@/lib/exam-utils";
import { useAuth } from "./providers";
import { AuthRequired, ErrorNotice, Loading } from "./ui";
import { LevelProgress } from "./level-progress";

function ResultContent({ id }: { id: string }) {
  const { user, loading } = useAuth();
  const params = useSearchParams();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [review, setReview] = useState(params.get("review") === "1");
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    if (!user) return;
    createClient().rpc("get_result", { p_submission_id: id }).then(({ data, error }) => {
      if (error) setError(error.message); else setResult(data as Result);
    });
  }, [id, user]);
  if (loading) return <Loading />;
  if (!user) return <AuthRequired next={`/results/${id}`} />;
  if (error) return <ErrorNotice message={error} />;
  if (!result) return <Loading text="Putting your performance in perspective..." />;
  const topics = new Map<string, { correct: number; total: number }>();
  result.questions.forEach(q => {
    const stats = topics.get(q.topic) || { correct: 0, total: 0 };
    stats.total++; if (result.answers_json[q.id] === q.correct_option_id) stats.correct++;
    topics.set(q.topic, stats);
  });
  const weak = [...topics].filter(([, s]) => s.correct / s.total < 0.6);
  const questions = result.questions.filter(q => filter === "all" || (filter === "correct" ? result.answers_json[q.id] === q.correct_option_id : filter === "incorrect" ? Boolean(result.answers_json[q.id]) && result.answers_json[q.id] !== q.correct_option_id : !result.answers_json[q.id]));
  return <><Link className="text-link" href="/dashboard"><ArrowLeft size={16} /> Back to dashboard</Link><section className="page-heading"><div><div className="eyebrow">ANOTHER STEP FORWARD</div><h1>Practice done. Progress unlocked<span className="green-text">.</span></h1><p>{result.exam_title} · {new Date(result.submitted_at).toLocaleDateString()}</p></div><Link href={`/leaderboards/${result.exam_id}`} className="button button-outline"><Trophy size={17} /> View leaderboard</Link></section><section className="result-overview panel"><div className="score-ring" style={{ "--score-progress": `${Math.max(0, result.score / result.total_marks) * 100}%` } as React.CSSProperties}><div><strong>{Number(result.score).toFixed(2)}</strong><span>out of {result.total_marks}</span></div></div><div className="result-message"><span className="eyebrow">YOUR SCORECARD</span><h2>{result.accuracy_percentage >= 80 ? "That's focused preparation." : "Every attempt teaches you something."}</h2><p>You got {result.correct_count} right, with {result.incorrect_count} incorrect and {result.questions.length - result.attempted_count} unanswered. Review the solutions to make your next attempt even stronger.</p><span className="score-chip">Best-attempt rank: #{result.rank} of {result.total_participants}</span></div></section><div className="stat-grid">{[
    { label: "Accuracy", value: `${Number(result.accuracy_percentage).toFixed(1)}%`, icon: Target },
    { label: "Percentile (best attempt)", value: `${Number(result.percentile).toFixed(1)}`, icon: ChartNoAxesCombined },
    { label: "Time spent", value: formatTime(result.time_taken_seconds), icon: Clock3 },
    { label: "Questions attempted", value: `${result.attempted_count} / ${result.questions.length}`, icon: Flag }
  ].map(({ label, value, icon: Icon }) => <div className="stat-card panel" key={label}><span className="benefit-icon mint"><Icon size={21} /></span><span>{label}</span><strong>{value}</strong></div>)}</div>
    <LevelProgress seriesId={result.series_id} currentId={result.exam_id} />
    <div className="notice insight"><Lightbulb size={22} /><div><strong>{weak.length ? "Your next opportunity" : "A strong foundation"}</strong><p>{weak.length ? `Focus on ${weak.map(([topic]) => topic).join(", ")}. These topics were below 60% correct in this attempt.` : "You scored at least 60% in each topic. Keep building consistency with another practice session."} Topic insights are based only on this mock&apos;s questions.</p></div></div><div className="section-heading"><div><h2>Understand every answer.</h2><p>Not just what&apos;s right. Why it&apos;s right.</p></div><button className="button button-primary" onClick={() => setReview(!review)}>{review ? "Hide solutions" : "View detailed solutions"}<ArrowRight size={17} /></button></div>{review && <section className="solutions-section"><div className="category-tabs">{["all", "correct", "incorrect", "unanswered"].map(f => <button key={f} className={clsx("category-tab", filter === f && "selected")} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}</div>{questions.length === 0 && <div className="empty-state"><h3>No questions in this group.</h3><p>Choose another filter to see the rest of your solutions.</p></div>}{questions.map(q => { const answer = result.answers_json[q.id]; const correct = answer === q.correct_option_id; return <article className="solution-card panel" key={q.id}><div className="solution-heading"><span className="eyebrow">QUESTION {result.questions.findIndex(question => question.id === q.id) + 1} · {q.topic}</span><span className={clsx("status-chip", correct ? "correct" : answer ? "incorrect" : "")}>{correct ? "Correct" : answer ? "Incorrect" : "Unanswered"}</span></div><h3>{q.question_text}</h3><div className="solution-options">{q.options.map((option, i) => <div key={option.id} className={clsx("solution-option", option.id === q.correct_option_id && "correct-option", option.id === answer && !correct && "incorrect-option")}><span className="option-letter">{String.fromCharCode(65 + i)}</span><span>{option.text}</span><span className="solution-indicator">{option.id === answer && <small>Your answer</small>}{option.id === q.correct_option_id ? <Check size={18} /> : option.id === answer ? <X size={18} /> : null}</span></div>)}</div><div className="explanation"><Lightbulb size={19} /><div><strong>The explanation</strong><p>{q.explanation}</p></div></div></article>; })}</section>}<p className="metric-note">Leaderboard rank and percentile reflect your best attempt for this level, not necessarily this attempt. Percentile is the percentage of participants ranked below your best attempt.</p></>;
}
export function Results({ id }: { id: string }) { return <Suspense fallback={<Loading />}><ResultContent id={id} /></Suspense>; }
