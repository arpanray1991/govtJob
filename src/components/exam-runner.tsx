"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock3, Flag, Grid2X2, Send, ShieldCheck, X, CheckCircle2, FileQuestion, Target } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "./providers";
import { AuthRequired, ErrorNotice, Loading } from "./ui";
import { createClient, isConfigured } from "@/lib/supabase/client";
import type { Exam, ExamSession } from "@/lib/types";
import { formatTime, paletteState, remainingSeconds } from "@/lib/exam-utils";
import { demoExams } from "@/lib/demo";
import { examLevelTitle } from "@/lib/exam-levels";
import { ExamLevels } from "./exam-levels";

export function ExamRunner({ examId }: { examId: string }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [exam, setExam] = useState<Exam | null>(null);
  const [levels, setLevels] = useState<Exam[]>([]);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("All progress saved");
  const [confirm, setConfirm] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [expired, setExpired] = useState(false);
  const answersRef = useRef(answers);
  const markedRef = useRef(marked);
  const submitting = useRef(false);
  const autoAttempted = useRef(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    setExam(null); setLevels([]); setError("");
    let active = true;
    function loadExam(exams: Exam[]) {
      const selected = exams.find(e => e.id === examId);
      setExam(selected ? { ...selected, title: examLevelTitle(selected) } : null);
      setLevels(exams.filter(e => e.series_id === selected?.series_id));
      if (!selected) setError("This mock test is not available.");
    }
    if (!isConfigured) { loadExam(demoExams); return; }
    if (authLoading || !user) return;
    createClient().rpc("get_exam_details", { p_exam_id: examId }).then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message);
      else {
        const details = data as { exam: Exam; levels: Exam[] };
        setExam({ ...details.exam, title: examLevelTitle(details.exam) }); setLevels(details.levels);
      }
    });
    return () => { active = false; };
  }, [examId, user, authLoading]);

  const submit = useCallback(async () => {
    if (!session || submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    await saveQueue.current;
    const { data, error } = await createClient().rpc("submit_exam", { p_session_id: session.id, p_answers: answersRef.current });
    if (error) { setError(error.message); setBusy(false); submitting.current = false; return; }
    router.replace(`/results/${data}`);
  }, [session, router]);

  useEffect(() => {
    if (!session) return;
    const tick = () => {
      const remaining = remainingSeconds(session.expires_at);
      setSeconds(remaining);
      if (remaining === 0) {
        setExpired(true); setConfirm(false);
        if (!autoAttempted.current) { autoAttempted.current = true; void submit(); }
      }
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [session, submit]);
  useEffect(() => {
    if (!session || submitting.current) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [session]);
  useEffect(() => {
    if (!confirm) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) setConfirm(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [confirm, busy]);

  async function start() {
    setBusy(true); setError("");
    const { data, error } = await createClient().rpc("start_exam", { p_exam_id: examId });
    setBusy(false);
    if (error) { setError(error.message); return; }
    const active = data as ExamSession;
    setExam(previous => previous ? {
      ...previous, duration_minutes: active.duration_minutes, total_marks: active.total_marks,
      negative_marking_rate: active.negative_marking_rate, question_count: active.questions.length
    } : previous);
    answersRef.current = active.answers_json || {};
    markedRef.current = active.review_ids || [];
    setAnswers(answersRef.current); setMarked(markedRef.current);
    setSeconds(remainingSeconds(active.expires_at)); setSession(active);
  }
  function persist(nextAnswers: Record<string, string>, nextMarked: string[]) {
    if (!session || expired || submitting.current || remainingSeconds(session.expires_at) === 0) return;
    answersRef.current = nextAnswers; markedRef.current = nextMarked;
    setAnswers(nextAnswers); setMarked(nextMarked); setSaveStatus("Saving progress...");
    saveQueue.current = saveQueue.current.then(async () => {
      const { error } = await createClient().rpc("save_exam_progress", { p_session_id: session.id, p_answers: nextAnswers, p_review_ids: nextMarked });
      if (error) { setSaveStatus("Progress not saved"); setError(`Progress could not be saved: ${error.message}. Keep this tab open and retry saving.`); }
      else { setSaveStatus("All progress saved"); setError(""); }
    });
  }
  function retrySave() { persist({ ...answersRef.current }, [...markedRef.current]); }

  if (authLoading) return <Loading />;
  if (!user) return <AuthRequired next={`/exam/${examId}`} />;
  if (!session) return <div className="exam-instructions">
    <Link href="/" className="text-link"><ArrowLeft size={16} /> Back to mock tests</Link>
    <div className="panel instruction-card">
      <span className="eyebrow">YOUR NEXT CHALLENGE</span><h1>{exam?.title || "Mock test"}</h1><p>{exam?.description || "Get ready to practice with purpose."}</p>
      {error && <ErrorNotice message={error} />}
      {exam && <div className="instruction-metrics"><span><FileQuestion />{exam.question_count} questions</span><span><Clock3 />{exam.duration_minutes} minutes</span><span><Target />{exam.total_marks} marks</span></div>}
      {exam && !exam.unlocked && <div className="notice">This level is locked. Submit all earlier levels of this exam first.</div>}
      <h3>Before you begin</h3>
      <ul className="instructions-list">
        <li>The timer starts when you begin. Reopening this test resumes your active session.</li>
        <li>Each correct answer earns {exam ? (exam.total_marks / exam.question_count).toFixed(2) : "the assigned"} marks. Wrong answers lose {exam ? (exam.negative_marking_rate * exam.total_marks / exam.question_count).toFixed(2) : "the configured"} marks. Unanswered questions earn zero.</li>
        <li>Mark questions for review and move freely between them. Marked answers still count.</li>
        <li>Selections are saved to your account. Stay connected so your progress is safely stored.</li>
        <li>Time cannot be paused. At timeout, only answers saved before the deadline are scored.</li>
        <li>Submitting this level unlocks the next one. Your marks are tracked separately for each level.</li>
      </ul>
      <div className="notice"><ShieldCheck size={20} />Scores, timing and level access are verified securely on the server.</div>
      <button className="button button-primary" onClick={start} disabled={busy || !exam?.unlocked}>{busy ? "Opening your test..." : "Begin / resume test"}<ArrowRight size={18} /></button>
      <ExamLevels exams={levels} currentId={examId} />
    </div>
  </div>;
  const question = session.questions[index];
  const answered = Object.keys(answers).length;
  const unanswered = session.questions.length - answered;
  return <div className="exam-workspace">
    <div className="exam-header"><div><span className="eyebrow">STAY FOCUSED. YOU&apos;VE GOT THIS.</span><h1>{exam?.title || "Mock test"}</h1><span className="save-status"><CheckCircle2 size={13} />{saveStatus}</span></div><div className={clsx("exam-timer", seconds < 60 && "urgent")} role="timer" aria-label={`${formatTime(seconds)} remaining`}><Clock3 size={22} /><div><span>TIME REMAINING</span><strong>{formatTime(seconds)}</strong></div></div></div>
    {error && <><ErrorNotice message={error} />{!expired && <button className="text-link" onClick={retrySave}>Retry saving progress</button>}</>}
    {expired && <div className="notice error" role="alert">Time is up. Your saved answers are being submitted.{!busy && <button className="button button-dark small" onClick={submit}>Retry submission</button>}</div>}
    <div className="quiz-layout"><section className="question-panel panel"><div className="question-topline"><span>QUESTION <strong>{index + 1}</strong> OF {session.questions.length}</span><span className="topic-tag">{question.topic}</span><button className="mobile-palette button button-outline small" onClick={() => setDrawer(true)}><Grid2X2 size={16} /> Questions</button></div><div className="question-content"><div className="question-marking"><span>+{exam ? (exam.total_marks / session.questions.length).toFixed(2) : "1"} correct</span><span>−{exam ? (exam.negative_marking_rate * exam.total_marks / session.questions.length).toFixed(2) : "0.25"} incorrect</span></div><h2>{question.question_text}</h2><fieldset disabled={expired || busy} className="options-list"><legend className="sr-only">Select your answer</legend>{question.options.map((option, i) => <label key={option.id} className={clsx("answer-option", answers[question.id] === option.id && "selected")}><input type="radio" name={question.id} checked={answers[question.id] === option.id} onChange={() => persist({ ...answersRef.current, [question.id]: option.id }, markedRef.current)} /><span className="option-letter">{String.fromCharCode(65 + i)}</span><span>{option.text}</span><span className="radio-indicator" /></label>)}</fieldset></div><div className="question-tools"><button disabled={expired || busy} className={clsx("button button-quiet", marked.includes(question.id) && "marked-text")} onClick={() => persist(answersRef.current, markedRef.current.includes(question.id) ? markedRef.current.filter(id => id !== question.id) : [...markedRef.current, question.id])}><Flag size={16} />{marked.includes(question.id) ? "Unmark review" : "Mark for review"}</button><button disabled={expired || busy || !answers[question.id]} className="button button-quiet" onClick={() => { const next = { ...answersRef.current }; delete next[question.id]; persist(next, markedRef.current); }}>Clear response</button></div><div className="question-navigation"><button className="button button-outline" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft size={16} />Previous</button><span>{index + 1} / {session.questions.length}</span><button className="button button-primary" disabled={index === session.questions.length - 1} onClick={() => setIndex(index + 1)}>Next question<ArrowRight size={16} /></button></div></section>
    {drawer && <button className="palette-backdrop" onClick={() => setDrawer(false)} aria-label="Close question palette" />}
    <aside className={clsx("palette-panel panel", drawer && "drawer-open")}><div className="palette-heading"><h3>Question palette</h3><button className="mobile-palette icon-button" onClick={() => setDrawer(false)} aria-label="Close palette"><X size={20} /></button><Grid2X2 className="desktop-only" size={18} /></div><p>Your test, at a glance.</p><div className="palette-grid">{session.questions.map((q, i) => <button aria-label={`Question ${i + 1}, ${paletteState(Boolean(answers[q.id]), marked.includes(q.id)).replaceAll("-", " ")}`} aria-current={i === index ? "step" : undefined} key={q.id} onClick={() => { setIndex(i); setDrawer(false); }} className={clsx("palette-number", paletteState(Boolean(answers[q.id]), marked.includes(q.id)), i === index && "current")}>{i + 1}</button>)}</div><div className="palette-legend">{[["answered", "Answered"], ["unanswered", "Unanswered"], ["marked", "Marked for review"], ["answered-marked", "Answered & marked"]].map(([state, label]) => <div key={state}><span className={state} />{label}</div>)}</div><div className="palette-summary"><span>Answered <strong>{answered}/{session.questions.length}</strong></span><div className="progress-track"><div style={{ width: `${answered / session.questions.length * 100}%` }} /></div></div><button className="button button-dark full-width" disabled={busy || expired} onClick={() => setConfirm(true)}><Send size={16} />Submit test</button><p className="palette-note">Take a breath. Check your answers.<br />You&apos;re doing great.</p></aside></div>
    {confirm && <div className="modal-backdrop"><section className="confirm-modal panel" role="dialog" aria-modal="true" aria-labelledby="submit-title"><button autoFocus className="modal-close icon-button" onClick={() => setConfirm(false)} aria-label="Close confirmation" disabled={busy}><X size={20} /></button><span className="auth-logo"><Send size={25} /></span><h2 id="submit-title">Ready to finish?</h2><p>Take one last look. Once submitted, your answers cannot be changed.</p><div className="submit-summary"><div><strong>{answered}</strong><span>Answered</span></div><div><strong>{unanswered}</strong><span>Unanswered</span></div><div><strong>{marked.length}</strong><span>For review</span></div></div>{error && <ErrorNotice message={error} />}<button className="button button-primary full-width" disabled={busy} onClick={submit}>{busy ? "Submitting securely..." : "Yes, submit my test"}<CheckCircle2 size={17} /></button><button className="button button-quiet full-width" disabled={busy} onClick={() => setConfirm(false)}>Keep working</button></section></div>}
  </div>;
}
