import type { Exam } from "./types.ts";

export const levelDifficulties = [
  "Beginner", "Easy", "Developing", "Intermediate", "Challenging",
  "Advanced", "Hard", "Very hard", "Expert", "Master"
] as const;

export function hasExamLevelMetadata(exams: Exam[]) {
  return exams.every(exam =>
    typeof exam.series_id === "string" && exam.series_id.length > 0 &&
    Number.isInteger(exam.level) && exam.level >= 1 && exam.level <= 10
  );
}

export function groupExamLevels(exams: Exam[]) {
  const groups = new Map<string, Exam[]>();
  for (const exam of exams) {
    const group = groups.get(exam.series_id) ?? [];
    group.push(exam);
    groups.set(exam.series_id, group);
  }
  return [...groups.values()].map(levels => [...levels].sort((a, b) => a.level - b.level));
}

export function nextExamLevel(levels: Exam[]) {
  return [...levels].sort((a, b) => a.level - b.level).find(exam => exam.unlocked && !exam.completed);
}

export function examLevelTitle(exam: Exam) {
  return `${exam.title} · Level ${exam.level}`;
}
