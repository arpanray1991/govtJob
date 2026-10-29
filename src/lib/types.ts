export type Category = { id: string; name: string; slug: string; icon: string };
export type Exam = {
  id: string; category_id: string; title: string; description: string;
  series_id: string; level: number; completed: boolean; unlocked: boolean;
  best_score: number | null; latest_score: number | null; latest_result_id: string | null;
  duration_minutes: number; total_marks: number; negative_marking_rate: number;
  question_count: number; categories: Category;
};
export type Question = {
  id: string; question_text: string; options: { id: string; text: string }[];
  topic: string; correct_option_id?: string; explanation?: string;
};
export type ExamSession = {
  id: string; exam_id: string; started_at: string; expires_at: string;
  duration_minutes: number; total_marks: number; negative_marking_rate: number;
  questions: Question[]; answers_json: Record<string, string>; review_ids: string[];
};
export type RankEntry = {
  user_id: string; full_name: string; score: number; time_taken_seconds: number;
  submitted_at: string; rank: number;
};
export type Leaderboard = { entries: RankEntry[]; current_user: RankEntry | null; total_participants: number };
export type Result = {
  id: string; exam_id: string; exam_title: string; score: number; total_marks: number;
  series_id: string; level: number;
  accuracy_percentage: number; time_taken_seconds: number; attempted_count: number;
  correct_count: number; incorrect_count: number; answers_json: Record<string, string>;
  questions: Question[]; submitted_at: string; rank: number; total_participants: number; percentile: number;
};
export type Dashboard = {
  stats: { total_tests: number; average_score: number; average_accuracy: number; overall_rank: number | null };
  history: { id: string; exam_id: string; exam_title: string; score: number; total_marks: number; accuracy_percentage: number; submitted_at: string }[];
};
