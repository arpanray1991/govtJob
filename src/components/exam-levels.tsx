"use client";

import Link from "next/link";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import type { Exam } from "@/lib/types";
import { levelDifficulties } from "@/lib/exam-levels";

export function ExamLevels({ exams, currentId }: { exams: Exam[]; currentId?: string }) {
  const levels = [...exams].sort((a, b) => a.level - b.level);
  return <div className="exam-levels">
    <p className="metric-note">Complete levels in order. Submitting a test unlocks the next level, regardless of score. Retry completed levels anytime.</p>
    <ol className="level-grid" aria-label="Exam levels and marks">
      {levels.map(exam => <li key={exam.id} className={`level-card${exam.completed ? " completed" : ""}${!exam.unlocked ? " locked" : ""}${exam.id === currentId ? " current" : ""}`}>
        <div className="level-card-heading"><strong>Level {exam.level}</strong>{exam.completed ? <CheckCircle2 size={16} aria-label="Completed" /> : !exam.unlocked ? <LockKeyhole size={16} aria-label="Locked" /> : <span className="green-dot" />}</div>
        <span className="level-difficulty">{levelDifficulties[exam.level - 1]}</span>
        <span>{exam.question_count} questions · {exam.total_marks} marks</span>
        {exam.completed ? <><strong className="level-score">Best: {Number(exam.best_score).toFixed(2)} / {exam.total_marks}</strong><span>Latest: {Number(exam.latest_score).toFixed(2)} / {exam.total_marks}</span></> : <span className="level-score">{exam.unlocked ? "Not attempted" : `Complete levels 1-${exam.level - 1}`}</span>}
        <div className="level-actions">{exam.unlocked ? <Link className="text-link" href={`/exam/${exam.id}`} aria-current={exam.id === currentId ? "page" : undefined}>{exam.completed ? "Retry level" : "Start / resume"}</Link> : <span>Locked</span>}
          {exam.latest_result_id && <Link className="text-link" href={`/results/${exam.latest_result_id}`}>Scorecard</Link>}
          <Link className="text-link" href={`/leaderboards/${exam.id}`}>Leaderboard</Link>
        </div>
      </li>)}
    </ol>
  </div>;
}
