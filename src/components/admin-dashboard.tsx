"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AdminAttempts, AdminOverview, AdminResult, AdminUser, AdminUsers } from "@/lib/admin-types";
import { formatTime } from "@/lib/exam-utils";
import { useAuth } from "./providers";
import { AuthRequired, ErrorNotice, Loading } from "./ui";
import { AdminContentManager } from "./admin-content";

const date = (value: string | null) => value ? new Date(value).toLocaleString() : "Never";

export function AdminDashboard() {
  const { user, loading, isAdmin, adminLoading, adminError } = useAuth();
  if (loading || adminLoading) return <Loading text="Checking administrator access..." />;
  if (!user) return <AuthRequired next="/admin" />;
  if (adminError) return <ErrorNotice message={`Cannot verify admin access: ${adminError}. Apply the admin migration and reload.`} />;
  if (!isAdmin) return <ErrorNotice message="Administrator access is required. Ask the site owner to assign your account an admin role." />;
  return <AdminWorkspace key={user.id} />;
}

function AdminWorkspace() {
  const [tab, setTab] = useState("overview");
  return <>
    <section className="page-heading"><div><span className="eyebrow">ADMINISTRATION</span><h1>Your site, at a glance.</h1><p>Manage learners, review performance and maintain your exam library.</p></div></section>
    <div className="category-tabs" role="group" aria-label="Admin sections">{[
      ["overview", "Overview & guests"], ["users", "Users & results"], ["content", "Exams & questions"]
    ].map(([value, label]) => <button key={value} className={`category-tab${tab === value ? " selected" : ""}`} onClick={() => setTab(value)}>{label}</button>)}</div>
    {tab === "overview" ? <Overview /> : tab === "users" ? <Users /> : <AdminContentManager />}
  </>;
}

function Overview() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error } = await createClient().rpc("admin_overview");
    if (error) setError(error.message); else setData(data as AdminOverview);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <section>
    <button className="button button-outline small" onClick={load} disabled={loading}>Refresh statistics</button>
    {error && <ErrorNotice message={error} />}
    {loading ? <Loading /> : data && <>
      <div className="stat-grid admin-stats">{[
        ["Registered users", data.registered_users], ["Submitted attempts", data.total_attempts],
        ["Active exam series", data.exam_series], ["Guest browsers today (UTC)", data.guest_days[0]?.browsers ?? 0]
      ].map(([label, count]) => <div className="stat-card panel" key={label}><span>{label}</span><strong>{count}</strong></div>)}</div>
      <div className="notice">Guest statistics cover consenting, signed-out browsers only, from deployment onward. Daily IDs reset at UTC midnight. Counts are approximate: private browsing, blockers and cleared storage affect them. Daily browser counts must not be added together as unique people. No IP addresses or page paths are stored.</div>
      <section className="panel table-scroll"><table><caption className="admin-caption">Guest traffic - last 30 UTC days</caption><thead><tr><th>Date (UTC)</th><th>Daily browsers</th><th>Page views</th></tr></thead><tbody>{data.guest_days.map(day => <tr key={day.day}><td>{day.day}</td><td>{day.browsers}</td><td>{day.page_views}</td></tr>)}</tbody></table></section>
    </>}
  </section>;
}

export function AdminPagination({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  return <div className="admin-pagination"><button className="button button-outline small" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button><span>{total} records · Page {page + 1} of {Math.max(1, Math.ceil(total / 25))}</span><button className="button button-outline small" disabled={(page + 1) * 25 >= total} onClick={() => onPage(page + 1)}>Next</button></div>;
}

function Users() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [users, setUsers] = useState<AdminUsers | null>(null);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setUsers(null); setError("");
    createClient().rpc("admin_users_list", { p_search: search, p_page: page }).then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message); else setUsers(data as AdminUsers);
    });
    return () => { active = false; };
  }, [search, page]);
  return <>
    <form className="admin-search" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); setPage(0); }}>
      <label>Find a registered user<input value={query} onChange={event => setQuery(event.target.value)} maxLength={200} placeholder="Name or email" /></label>
      <button className="button button-primary">Search users</button>
    </form>
    {error && <ErrorNotice message={error} />}
    {!users && !error ? <Loading /> : users && <section className="panel">
      <div className="table-scroll"><table><thead><tr><th>Name / email</th><th>Registered</th><th>Last sign-in</th><th>Tests</th><th>Average score</th><th>Details</th></tr></thead><tbody>{users.users.map(row => <tr key={row.id}><td><strong>{row.full_name || "Unnamed user"}</strong><br />{row.email || "No email"}</td><td>{date(row.registered_at)}</td><td>{date(row.last_sign_in_at)}</td><td>{row.tests_completed}</td><td>{Number(row.average_score).toFixed(1)}%</td><td><button className="text-link" onClick={() => setSelected(row)}>View attempts</button></td></tr>)}</tbody></table></div>
      {users.users.length === 0 && <p className="admin-empty">No registered users match your search.</p>}
      <AdminPagination page={page} total={users.total} onPage={setPage} />
    </section>}
    {selected && <UserAttempts key={selected.id} user={selected} onClose={() => setSelected(null)} />}
  </>;
}

function UserAttempts({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<AdminAttempts | null>(null);
  const [result, setResult] = useState<AdminResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reviewRequest = useRef(0);
  useEffect(() => {
    let active = true; setData(null); setError(""); setBusy(false); setResult(null);
    createClient().rpc("admin_attempts", { p_user_id: user.id, p_page: page }).then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message); else setData(data as AdminAttempts);
    });
    return () => { active = false; reviewRequest.current++; };
  }, [user.id, page]);
  async function review(id: string) {
    const request = ++reviewRequest.current;
    setBusy(true); setError(""); setResult(null);
    const { data, error } = await createClient().rpc("admin_result", { p_submission_id: id });
    if (request !== reviewRequest.current) return;
    if (error) setError(error.message); else setResult(data as AdminResult);
    setBusy(false);
  }
  return <section className="admin-user-detail">
    <div className="section-heading"><div><h2>{user.full_name || user.email}</h2><p>{user.email} · {user.id}</p></div><button className="button button-outline small" onClick={onClose}>Close user details</button></div>
    {error && <ErrorNotice message={error} />}
    {!data && !error ? <Loading /> : data && <>
      <div className="panel table-scroll"><table><thead><tr><th>Exam / level</th><th>Score</th><th>Accuracy</th><th>Time</th><th>Submitted</th><th>Answers</th></tr></thead><tbody>{data.attempts.map(row => <tr key={row.id}><td>{row.exam_title}<br />Level {row.level}</td><td>{Number(row.score).toFixed(2)} / {row.total_marks}</td><td>{row.accuracy_percentage}%</td><td>{formatTime(row.time_taken_seconds)}</td><td>{date(row.submitted_at)}</td><td><button className="text-link" disabled={busy} onClick={() => review(row.id)}>Review answers</button></td></tr>)}</tbody></table>{data.attempts.length === 0 && <p className="admin-empty">No submitted attempts.</p>}<AdminPagination page={page} total={data.total} onPage={setPage} /></div>
      <h3 className="admin-subheading">Unsubmitted sessions ({data.active_sessions.length})</h3>
      {data.active_sessions.map(session => <p key={session.id} className="admin-session">{session.exam_title} · Level {session.level} · Started {date(session.started_at)} · {Date.parse(session.expires_at) < Date.now() ? "Expired, not submitted" : "In progress"}</p>)}
    </>}
    {busy && <Loading text="Loading answer review..." />}
    {result && <section className="admin-answer-review"><div className="section-heading"><h3>{result.exam_title} · Level {result.level} · {Number(result.score).toFixed(2)} / {result.total_marks}</h3><button className="text-link" onClick={() => setResult(null)}>Close review</button></div>{result.questions.map((question, index) => <article className="panel solution-card" key={question.id}>
      <span className="eyebrow">QUESTION {index + 1} · {question.topic}</span><h3>{question.question_text}</h3>
      <p className="admin-answer-status">User answer: {result.answers_json[question.id] || "Unanswered"} · Correct answer: {question.correct_option_id}</p>
      {question.options.map(option => <p key={option.id} className={option.id === question.correct_option_id ? "admin-correct" : ""}>{option.id}. {option.text}{option.id === result.answers_json[question.id] ? " (selected)" : ""}</p>)}
      <div className="explanation"><p>{question.explanation}</p></div>
    </article>)}</section>}
  </section>;
}
