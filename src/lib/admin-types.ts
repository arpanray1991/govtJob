import type { Category, Question } from "./types";

export type AdminOverview = {
  registered_users: number; total_attempts: number; exam_series: number;
  guest_days: { day: string; browsers: number; page_views: number }[];
};
export type AdminUser = {
  id: string; email: string | null; full_name: string; registered_at: string;
  last_sign_in_at: string | null; tests_completed: number; average_score: number;
};
export type AdminUsers = { total: number; users: AdminUser[] };
export type AdminAttempt = {
  id: string; exam_id: string; exam_title: string; level: number; score: number;
  total_marks: number; accuracy_percentage: number; time_taken_seconds: number;
  attempted_count: number; correct_count: number; incorrect_count: number; submitted_at: string;
};
export type AdminAttempts = {
  total: number; attempts: AdminAttempt[];
  active_sessions: { id: string; exam_title: string; level: number; started_at: string; expires_at: string }[];
};
export type AdminResult = AdminAttempt & { answers_json: Record<string, string>; questions: Question[] };
export type AdminExam = {
  id: string; series_id: string; level: number; category_id: string; title: string;
  description: string; duration_minutes: number; total_marks: number;
  negative_marking_rate: number; is_published: boolean; archived: boolean;
  question_count: number; has_sessions: boolean;
};
export type AdminQuestion = Question & {
  exam_id: string; position: number; archived: boolean; correct_option_id: string; explanation: string;
};
export type AdminContent = { categories: Category[]; exams: AdminExam[]; questions: AdminQuestion[] };
