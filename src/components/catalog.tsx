"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Search, Clock3, FileQuestion, Target, Trophy, Layers3, Check, ChartNoAxesCombined, Sparkles, SlidersHorizontal, X, BookOpen } from "lucide-react";
import clsx from "clsx";
import { createClient, isConfigured } from "@/lib/supabase/client";
import { demoCategories, demoExams } from "@/lib/demo";
import type { Category, Exam } from "@/lib/types";
import { ErrorNotice, Loading, SetupNotice } from "./ui";
import { useAuth } from "./providers";
import { ExamLevels } from "./exam-levels";
import { groupExamLevels, hasExamLevelMetadata, nextExamLevel } from "@/lib/exam-levels";
import { CategoryIcon } from "./category-icon";

export function Catalog() {
  const { user, loading: authLoading } = useAuth();
  const [exams, setExams] = useState<Exam[]>(isConfigured ? [] : demoExams);
  const [categories, setCategories] = useState<Category[]>(isConfigured ? [] : demoCategories);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recommended");
  const [loading, setLoading] = useState(isConfigured);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!isConfigured || authLoading) return;
    let active = true;
    setLoading(true); setError(""); setExams([]); setCategories([]);
    createClient().rpc("get_catalog").then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message);
      else {
        const rows = data as Exam[];
        if (!Array.isArray(rows) || !hasExamLevelMetadata(rows)) {
          setError("The database catalog is missing exam-level metadata. Apply the catalog repair migration (20261029183000_repair_catalog_levels.sql), then reload this page.");
        } else {
          setExams(rows);
          setCategories(Array.from(new Map(rows.map((exam) => [exam.categories.id, exam.categories])).values()));
        }
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [user, authLoading]);
  const series = groupExamLevels(exams);
  const roots = series.map(levels => levels[0]);
  const filtered = roots.filter(e => (category === "all" || e.categories.slug === category) && `${e.title} ${e.description}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === "duration" ? a.duration_minutes - b.duration_minutes : sort === "questions" ? b.question_count - a.question_count : a.title.localeCompare(b.title));
  return <>
    <section className="page-heading"><div><div className="eyebrow"><span className="tiny-line" /> BUILT FOR YOUR AMBITION</div><h1>Your preparation,<br className="mobile-only" /> a step ahead<span className="green-text">.</span></h1><p>The right practice. The real exam experience. A more confident you.</p></div><div className="heading-date"><span className="green-dot" /> A fresh start, every day</div></section>
    <section className="hero">
      <div className="hero-copy"><div className="hero-tag"><Sparkles size={13} /> SMALL STEPS. BIG BREAKTHROUGHS.</div><h2>Dream big.<br />Practice <span>smarter.</span></h2><p>Your dream government job deserves a great plan.<br className="desktop-only" /> Start with exam-like mocks. Finish with a clear way forward.</p><a href="#test-series" className="button button-primary">Explore mock tests <ArrowUpRight size={18} /></a><div className="hero-checks"><span><Check size={14} /> Exam-pattern questions</span><span><Check size={14} /> In-depth analysis</span></div></div>
      <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="art-cross cross-one">+</div><div className="art-cross cross-two">+</div><div className="art-dot" /><div className="art-card"><div className="art-card-top"><span className="art-icon"><ChartNoAxesCombined size={20} /></span><span>YOUR NEXT CHAPTER</span><span className="art-mini-dot" /></div><div className="art-score">A little practice.<br /><strong>A big difference.</strong></div><div className="bar-chart">{[30, 42, 36, 57, 51, 70, 87, 100].map((height, i) => <div key={i} style={{ height: `${height}%` }} className={i > 5 ? "bar-bright" : ""} />)}</div><div className="art-chart-label"><span>CONSISTENCY</span><span>CONFIDENCE <ArrowUpRight size={12} /></span></div></div><div className="floating-badge"><span><Target size={21} /></span><div>One test closer<strong>to your goal.</strong></div><span className="badge-check"><Check size={14} /></span></div></div>
    </section>
    <section className="benefit-grid" aria-label="Platform benefits">
      <div className="benefit"><span className="benefit-icon mint"><FileQuestion size={21} /></span><div><strong>Real exam feel</strong><p>Practice the way you&apos;ll perform</p></div></div>
      <div className="benefit"><span className="benefit-icon peach"><ChartNoAxesCombined size={21} /></span><div><strong>Insights that matter</strong><p>Know your strengths. Find your gaps.</p></div></div>
      <div className="benefit"><span className="benefit-icon lilac"><Trophy size={21} /></span><div><strong>A little healthy competition</strong><p>See where you stand. Keep climbing.</p></div></div>
    </section>
    <section id="test-series" className="catalog-section">
      <div className="section-heading"><div><div className="eyebrow muted">FIND YOUR FOCUS</div><h2>Pick your next challenge<span className="green-text">.</span></h2><p>Ten progressively harder practice sets per exam. Start at level 1 and work your way up.</p></div><span className="test-count">{roots.length} exam series · {exams.length} sets</span></div>
      {!isConfigured && <SetupNotice />}
      {error && <ErrorNotice message={error} />}
      <div className="catalog-toolbar"><div className="category-tabs" role="group" aria-label="Filter by exam category"><button className={clsx("category-tab", category === "all" && "selected")} onClick={() => setCategory("all")}><Layers3 size={16} />All exams<span>{roots.length}</span></button>{categories.map(c => <button key={c.id} className={clsx("category-tab", category === c.slug && "selected")} onClick={() => setCategory(c.slug)}><CategoryIcon category={c} />{c.name}<span>{roots.filter(e => e.category_id === c.id).length}</span></button>)}</div><label className="search-input"><Search size={17} /><input placeholder="Find a mock test..." value={query} onChange={e => setQuery(e.target.value)} aria-label="Search mock tests" />{query && <button className="icon-button" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}</label></div>
      <div className="results-toolbar"><span>Showing <strong>{filtered.length} mock tests</strong>{category !== "all" && ` in ${category.toUpperCase()}`}</span><label><SlidersHorizontal size={14} /><span className="sort-label">Sort by:</span><select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort tests"><option value="recommended">Recommended</option><option value="duration">Shortest duration</option><option value="questions">Most questions</option></select></label></div>
      {loading ? <Loading text="Loading your next challenge..." /> : <div className="exam-grid">{filtered.map((exam, index) => {
        const levels = series.find(group => group[0].series_id === exam.series_id)!;
        const next = nextExamLevel(levels);
        return <article key={exam.series_id} className="exam-card">
          <div className="exam-card-top"><span className={clsx("exam-category-icon", exam.categories.slug === "banking" && "bank-icon")}><CategoryIcon category={exam.categories} size={25} /></span><span className={clsx("exam-badge", index === 0 && "popular")}>10 PROGRESSIVE LEVELS</span></div>
          <div className="exam-category-label">{exam.categories.name} EXAM PREPARATION</div><h3>{exam.title}</h3><p className="exam-description">{exam.description}</p>
          <div className="exam-metrics"><span><FileQuestion size={16} /><strong>{exam.question_count}</strong> questions / set</span><span><Clock3 size={16} /><strong>{exam.duration_minutes}</strong> mins / set</span><span><Target size={16} /><strong>{exam.total_marks}</strong> marks / set</span></div>
          <div className="exam-marking"><span className="green-dot" />Full solutions included<span>−{exam.negative_marking_rate}× per wrong answer</span></div>
          <div className="exam-card-actions"><Link href={`/exam/${next?.id ?? exam.id}`} className="button button-outline">{next ? `Continue level ${next.level}` : "Retry level 1"} <ArrowRight size={16} /></Link><span className="metric-note">{levels.filter(level => level.completed).length} / {levels.length} completed</span></div>
          <details className="level-details"><summary>View all levels &amp; marks</summary><ExamLevels exams={levels} /></details>
        </article>;
      })}</div>}
      {!loading && !error && filtered.length === 0 && <div className="empty-state"><Search size={32} /><h3>No tests found</h3><p>Try a different search or select another category.</p><button className="button button-outline" onClick={() => { setQuery(""); setCategory("all"); }}>Reset filters</button></div>}
    </section>
    <section className="bottom-banner"><div className="bottom-banner-icon"><BookOpen size={24} /></div><div><h3>Don&apos;t just take a test. Take a step forward.</h3><p>Every attempt comes with detailed solutions and insights to make your next one better.</p></div><Link href="/dashboard">Your preparation journey <ArrowUpRight size={17} /></Link></section>
  </>;
}
