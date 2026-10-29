import type { Category, Exam } from "./types";
import { additionalCategories, additionalExamSeries, additionalExamId, additionalExamDescription } from "./additional-exams";

export const demoCategories: Category[] = [
  { id: "10000000-0000-0000-0000-000000000001", name: "SSC", slug: "ssc", icon: "landmark" },
  { id: "10000000-0000-0000-0000-000000000002", name: "Banking", slug: "banking", icon: "building" },
  ...additionalCategories
];
const baseExams = [
  {
    id: "20000000-0000-0000-0000-000000000001", category_id: demoCategories[0].id,
    title: "SSC CGL · Foundation Mock", description: "Build your foundation with a focused mix of quantitative aptitude, reasoning, English and general awareness.",
    duration_minutes: 10, total_marks: 10, negative_marking_rate: 0.25, question_count: 5, categories: demoCategories[0]
  },
  {
    id: "20000000-0000-0000-0000-000000000002", category_id: demoCategories[1].id,
    title: "IBPS PO · Prelims Practice", description: "Sharpen your speed and accuracy with exam-style numerical ability, logical reasoning and English questions.",
    duration_minutes: 10, total_marks: 5, negative_marking_rate: 0.25, question_count: 5, categories: demoCategories[1]
  },
  ...additionalExamSeries.map(series => {
    const category = demoCategories.find(category => category.id.endsWith(String(series.category).padStart(12, "0")))!;
    return {
      id: additionalExamId(series.number), category_id: category.id, categories: category,
      title: series.title, description: additionalExamDescription(series.subjects),
      duration_minutes: 10, total_marks: 5, negative_marking_rate: 0.25, question_count: 5
    };
  })
];

export const demoExams: Exam[] = baseExams.flatMap(exam =>
  Array.from({ length: 10 }, (_, index) => ({
    ...exam,
    id: index === 0 ? exam.id : `21000000-0000-0000-${String(index + 1).padStart(4, "0")}-${exam.id.slice(-12)}`,
    series_id: exam.id,
    level: index + 1,
    completed: false,
    unlocked: index === 0,
    best_score: null,
    latest_score: null,
    latest_result_id: null
  }))
);
