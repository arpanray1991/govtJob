"use client";

import { useEffect, useState } from "react";
import type { Exam } from "@/lib/types";
import { groupExamLevels } from "@/lib/exam-levels";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./providers";
import { ErrorNotice, Loading } from "./ui";
import { ExamLevels } from "./exam-levels";

export function LevelProgress({ seriesId, currentId }: { seriesId?: string; currentId?: string }) {
  const { user } = useAuth();
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    let active = true;
    setExams(null); setError("");
    createClient().rpc("get_catalog").then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message); else setExams(data as Exam[]);
    });
    return () => { active = false; };
  }, [user]);
  if (error) return <ErrorNotice message={error} />;
  if (!exams) return <Loading text="Loading level-wise marks..." />;
  const groups = groupExamLevels(exams.filter(exam => !seriesId || exam.series_id === seriesId));
  return <section className="level-progress"><div className="section-heading"><div><h2>Your level-wise progress</h2><p>Ten steps from foundation to mastery. Marks are saved separately for each level.</p></div></div>
    {groups.map(levels => <section className="panel level-progress-panel" key={levels[0].series_id}><h3>{levels[0].title}</h3><p className="metric-note">{levels.filter(exam => exam.completed).length} / {levels.length} levels completed</p><ExamLevels exams={levels} currentId={currentId} /></section>)}
  </section>;
}
