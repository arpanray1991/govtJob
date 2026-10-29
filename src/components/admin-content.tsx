"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Category } from "@/lib/types";
import type { AdminContent, AdminExam, AdminQuestion } from "@/lib/admin-types";
import { createClient } from "@/lib/supabase/client";
import { ErrorNotice, Loading } from "./ui";

type ExamDraft = {
  id: string | null; series_id: string; level: number; category_id: string; title: string;
  description: string; duration_minutes: number; total_marks: number;
  negative_marking_rate: number; is_published: boolean;
};
type ArchiveTarget = { kind: "series" | "level" | "question"; id: string; label: string };
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export function AdminContentManager() {
  const [content, setContent] = useState<AdminContent | null>(null);
  const [examId, setExamId] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [examDraft, setExamDraft] = useState<ExamDraft | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<Category | "new" | null>(null);
  const [questionDraft, setQuestionDraft] = useState<AdminQuestion | "new" | null>(null);
  const [archive, setArchive] = useState<ArchiveTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useRef(0);
  const load = useCallback(async () => {
    const version = ++request.current;
    setLoading(true); setError("");
    const { data, error } = await createClient().rpc("admin_content", { p_exam_id: examId || null });
    if (version !== request.current) return;
    if (error) setError(error.message); else setContent(data as AdminContent);
    setLoading(false);
  }, [examId]);
  useEffect(() => { void load(); return () => { request.current++; }; }, [load]);
  const selected = content?.exams.find(exam => exam.id === examId);
  const roots = content?.exams.filter(exam => exam.level === 1) ?? [];
  function chooseExam(exam: AdminExam) {
    setExamId(exam.id); setQuestionDraft(null); setExamDraft(null); setNotice(""); setError("");
  }
  function createExam(root?: AdminExam) {
    setExamDraft({
      id: null, series_id: root?.id ?? "", level: root ? Math.min(10, Math.max(...(content?.exams.filter(e => e.series_id === root.id).map(e => e.level) ?? [0])) + 1) : 1,
      category_id: root?.category_id ?? content?.categories[0]?.id ?? "",
      title: root?.title ?? "", description: root?.description ?? "",
      duration_minutes: 10, total_marks: 5, negative_marking_rate: 0.25, is_published: false
    });
    setQuestionDraft(null); setError(""); setNotice("");
  }
  async function saveCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    const { error } = await createClient().rpc("admin_save_category", {
      p_id: categoryDraft && categoryDraft !== "new" ? categoryDraft.id : null,
      p_name: text(form, "name"), p_slug: text(form, "slug"), p_icon: text(form, "icon")
    });
    if (error) setError(error.message);
    else { setCategoryDraft(null); setNotice("Category saved."); await load(); }
    setBusy(false);
  }
  async function saveExam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!examDraft) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    const { data, error } = await createClient().rpc("admin_save_exam", {
      p_id: examDraft.id,
      p_data: {
        series_id: examDraft.series_id || null, level: Number(text(form, "level")),
        category_id: text(form, "category_id"), title: text(form, "title"),
        description: text(form, "description"), duration_minutes: Number(text(form, "duration")),
        total_marks: Number(text(form, "marks")), negative_marking_rate: Number(text(form, "penalty")),
        is_published: form.has("published")
      }
    });
    if (error) setError(error.message);
    else {
      setExamDraft(null); setNotice("Level saved. Add questions before publishing a new level.");
      const savedId = String(data);
      if (savedId === examId) await load(); else setExamId(savedId);
    }
    setBusy(false);
  }
  async function saveQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    const { error } = await createClient().rpc("admin_save_question", {
      p_id: questionDraft && questionDraft !== "new" ? questionDraft.id : null,
      p_exam_id: examId,
      p_data: {
        position: Number(text(form, "position")), topic: text(form, "topic"),
        question_text: text(form, "question_text"), explanation: text(form, "explanation"),
        correct_option_id: text(form, "correct"),
        options: ["A", "B", "C", "D"].map(id => ({ id, text: text(form, `option_${id}`) }))
      }
    });
    if (error) setError(error.message);
    else { setQuestionDraft(null); setNotice("Question saved. Previous attempts retain their original question version."); await load(); }
    setBusy(false);
  }
  async function confirmArchive() {
    if (!archive) return;
    setBusy(true); setError(""); setNotice("");
    const { error } = await createClient().rpc("admin_archive", { p_kind: archive.kind, p_id: archive.id });
    if (error) setError(error.message);
    else {
      setArchive(null); setQuestionDraft(null); setExamDraft(null);
      setNotice("Archived. No attempts, scores or question versions were deleted."); await load();
    }
    setBusy(false);
  }
  if (!content && loading) return <Loading />;
  const question = questionDraft && questionDraft !== "new" ? questionDraft : null;
  return <section className="admin-content">
    <div className="notice">Archive replaces deletion. Old results and active attempts keep their question versions, timing and marking. Changes apply to new attempts. Total marks and penalty are fixed after attempts start to keep scores comparable. Restoring a level saves it as a draft unless you explicitly publish it.</div>
    {error && <ErrorNotice message={error} />}
    {notice && <div className="notice success" role="status">{notice}</div>}
    <div className="admin-actions"><button className="button button-primary small" disabled={busy || !content?.categories.length} onClick={() => createExam()}>Add new exam series</button><button className="button button-outline small" disabled={busy} onClick={() => setCategoryDraft("new")}>Add category</button><button className="button button-outline small" disabled={busy || loading} onClick={load}>Refresh content</button></div>
    {categoryDraft && <form key={categoryDraft === "new" ? "new-category" : categoryDraft.id} className="panel admin-form form-stack" onSubmit={saveCategory}>
      <h2>{categoryDraft === "new" ? "New category" : "Edit category"}</h2>
      <label>Name<input name="name" required maxLength={80} defaultValue={categoryDraft === "new" ? "" : categoryDraft.name} /></label>
      <label>Slug<input name="slug" required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="state-psc" defaultValue={categoryDraft === "new" ? "" : categoryDraft.slug} /></label>
      <label>Icon<select name="icon" defaultValue={categoryDraft === "new" ? "landmark" : categoryDraft.icon}>{["landmark","building","train","book"].map(icon => <option key={icon}>{icon}</option>)}</select></label>
      <div className="admin-actions"><button className="button button-primary" disabled={busy}>Save category</button><button type="button" className="button button-outline" disabled={busy} onClick={() => setCategoryDraft(null)}>Cancel</button></div>
    </form>}
    {examDraft && <form key={`${examDraft.id ?? "new"}-${examDraft.series_id}`} className="panel admin-form form-stack" onSubmit={saveExam}>
      <h2>{examDraft.id ? "Edit / restore level" : examDraft.series_id ? "Add level to exam" : "Create exam series (level 1)"}</h2>
      <p>Each level has its own title, category and marking. New levels start unpublished. Levels cannot be moved or renumbered.</p>
      <label>Title<input name="title" required maxLength={160} defaultValue={examDraft.title} /></label>
      <label>Category<select name="category_id" required defaultValue={examDraft.category_id}>{content?.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label>Description<textarea name="description" rows={3} maxLength={4000} defaultValue={examDraft.description} /></label>
      <div className="admin-form-grid">
        <label>Level (1-10)<input name="level" type="number" min={1} max={10} required readOnly={Boolean(examDraft.id) || !examDraft.series_id} defaultValue={examDraft.level} /></label>
        <label>Duration (minutes)<input name="duration" type="number" min={1} max={480} required defaultValue={examDraft.duration_minutes} /></label>
        <label>Total marks<input name="marks" type="number" min={0.01} max={10000} step="0.01" required readOnly={content?.exams.find(e => e.id === examDraft.id)?.has_sessions} defaultValue={examDraft.total_marks} /></label>
        <label>Wrong-answer penalty multiplier<input name="penalty" type="number" min={0} max={1} step="0.0001" required readOnly={content?.exams.find(e => e.id === examDraft.id)?.has_sessions} defaultValue={examDraft.negative_marking_rate} /></label>
      </div>
      <label className="admin-checkbox"><input type="checkbox" name="published" defaultChecked={examDraft.is_published} disabled={!examDraft.id} /> Published (requires questions and all earlier levels published)</label>
      <div className="admin-actions"><button className="button button-primary" disabled={busy}>Save level</button><button className="button button-outline" type="button" disabled={busy} onClick={() => setExamDraft(null)}>Cancel</button></div>
    </form>}
    <details className="admin-category-list"><summary>Edit existing categories</summary><div className="admin-actions">{content?.categories.map(category => <button key={category.id} className="button button-outline small" disabled={busy} onClick={() => setCategoryDraft(category)}>Edit {category.name}</button>)}</div></details>
    <div className="admin-filters"><label>Exam series<select value={seriesFilter} onChange={event => setSeriesFilter(event.target.value)}><option value="">All series</option>{roots.map(root => <option key={root.id} value={root.id}>{root.title}{root.archived ? " (archived)" : ""}</option>)}</select></label><label className="admin-checkbox"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} /> Include archived levels and question versions</label></div>
    {loading && <Loading text="Refreshing exam library..." />}
    <section className="panel table-scroll"><table><thead><tr><th>Exam</th><th>Level</th><th>Questions</th><th>Status</th><th>Actions</th></tr></thead><tbody>{content?.exams.filter(exam => (!seriesFilter || exam.series_id === seriesFilter) && (showArchived || !exam.archived)).map(exam => <tr key={exam.id} className={examId === exam.id ? "current-user-row" : ""}>
      <td>{exam.title}</td><td>{exam.level}</td><td>{exam.question_count}</td><td>{exam.archived ? "Archived" : exam.is_published ? "Published" : "Draft"}</td>
      <td><div className="admin-actions"><button className="text-link" disabled={busy} onClick={() => chooseExam(exam)}>Questions</button><button className="text-link" disabled={busy} onClick={() => { setExamDraft({ ...exam, is_published: exam.archived ? false : exam.is_published }); setError(""); }}>Edit{exam.archived ? " / restore" : ""}</button>
        {!exam.archived && <button className="text-link" disabled={busy} onClick={() => setArchive({ kind: "level", id: exam.id, label: `${exam.title} - Level ${exam.level}` })}>Archive level</button>}
        {exam.level === 1 && !exam.archived && <><button className="text-link" disabled={busy || (content?.exams.filter(e => e.series_id === exam.id).length ?? 0) >= 10} onClick={() => createExam(exam)}>Add level</button><button className="text-link" disabled={busy} onClick={() => setArchive({ kind: "series", id: exam.id, label: `${exam.title} (all levels)` })}>Archive series</button></>}
      </div></td>
    </tr>)}</tbody></table></section>
    {selected && !loading && <section className="admin-question-section">
      <div className="section-heading"><div><h2>{selected.title} · Level {selected.level}</h2><p>{selected.question_count} current questions. Archived versions remain available to historical results.</p></div><button className="button button-primary small" disabled={busy || selected.archived} onClick={() => setQuestionDraft("new")}>Add question</button></div>
      {questionDraft && <form key={question?.id ?? "new-question"} className="panel admin-form form-stack" onSubmit={saveQuestion}>
        <h3>{question ? "Edit / restore question" : "New question"}</h3>
        <div className="admin-form-grid"><label>Position<input name="position" type="number" min={1} max={1000} required defaultValue={question?.position ?? Math.max(0, ...(content?.questions.filter(q => !q.archived).map(q => q.position) ?? [])) + 1} /></label><label>Topic<input name="topic" maxLength={100} required defaultValue={question?.topic ?? ""} /></label></div>
        <label>Question text (English / Hindi supported)<textarea name="question_text" rows={4} maxLength={12000} required defaultValue={question?.question_text ?? ""} /></label>
        {["A","B","C","D"].map(id => <label key={id}>Option {id}<textarea name={`option_${id}`} rows={2} maxLength={4000} required defaultValue={question?.options.find(option => option.id === id)?.text ?? ""} /></label>)}
        <label>Correct option<select name="correct" defaultValue={question?.correct_option_id ?? "A"}>{["A","B","C","D"].map(id => <option key={id}>{id}</option>)}</select></label>
        <label>Explanation<textarea name="explanation" rows={4} maxLength={12000} required defaultValue={question?.explanation ?? ""} /></label>
        <div className="admin-actions"><button className="button button-primary" disabled={busy}>Save question</button><button className="button button-outline" type="button" disabled={busy} onClick={() => setQuestionDraft(null)}>Cancel</button></div>
      </form>}
      {content?.questions.filter(q => showArchived || !q.archived).map(q => <article className="panel admin-question" key={q.id}>
        <span className="eyebrow">POSITION {q.position} · {q.topic} · {q.archived ? "ARCHIVED VERSION" : "CURRENT"}</span><h3>{q.question_text}</h3>
        <p>Correct: {q.correct_option_id}</p><div className="admin-actions"><button className="text-link" disabled={busy || selected.archived} onClick={() => setQuestionDraft(q)}>Edit{q.archived ? " / restore" : ""}</button>{!q.archived && <button className="text-link" disabled={busy} onClick={() => setArchive({ kind: "question", id: q.id, label: `Question at position ${q.position}` })}>Archive question</button>}</div>
      </article>)}
      {selected.question_count === 0 && <p className="admin-empty">Add questions, then edit the level to publish it.</p>}
    </section>}
    {archive && <ArchiveConfirmation target={archive} busy={busy} onConfirm={confirmArchive} onCancel={() => setArchive(null)} />}
  </section>;
}

function ArchiveConfirmation({ target, busy, onConfirm, onCancel }: {
  target: ArchiveTarget; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="panel admin-confirm" aria-labelledby="archive-title" onCancel={event => {
    event.preventDefault(); if (!busy) onCancel();
  }}><h2 id="archive-title">Archive {target.kind}?</h2><p>{target.label}</p><p>No records will be permanently deleted. Archiving a level also unpublishes higher levels until prerequisites are restored. Archiving the last question unpublishes its level.</p><div className="admin-actions"><button className="button button-primary" disabled={busy} onClick={onConfirm}>Confirm archive</button><button autoFocus className="button button-outline" disabled={busy} onClick={onCancel}>Cancel archive</button></div></dialog>;
}
