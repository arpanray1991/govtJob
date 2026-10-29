import type { Category } from "./types.ts";

export const additionalCategories: Category[] = [
  { id: "10000000-0000-0000-0000-000000000003", name: "State PSC", slug: "psc", icon: "landmark" },
  { id: "10000000-0000-0000-0000-000000000004", name: "Railways", slug: "railways", icon: "train" },
  { id: "10000000-0000-0000-0000-000000000005", name: "Civil Services", slug: "civil-services", icon: "book" }
];

export const additionalExamSeries = [
  { number: 3, category: 3, title: "WBPSC Clerkship · Practice", subjects: "Arithmetic, reasoning, English, polity and West Bengal awareness." },
  { number: 4, category: 3, title: "Kerala PSC LDC / Clerk · Practice", subjects: "Arithmetic, reasoning, English, polity and Kerala awareness." },
  { number: 5, category: 1, title: "SSC CHSL · Practice", subjects: "Quantitative aptitude, reasoning, English, polity and science." },
  { number: 6, category: 1, title: "SSC MTS · Practice", subjects: "Numerical ability, reasoning, English, history and science." },
  { number: 7, category: 4, title: "RRB NTPC · Practice", subjects: "Mathematics, reasoning, history, geography and science." },
  { number: 8, category: 4, title: "RRB Group D · Practice", subjects: "Mathematics, reasoning, science, geography and environment." },
  { number: 9, category: 2, title: "SBI Clerk · Prelims Practice", subjects: "Numerical ability, data interpretation, reasoning and English." },
  { number: 10, category: 2, title: "IBPS Clerk · Prelims Practice", subjects: "Numerical ability, data interpretation, reasoning and English." },
  { number: 11, category: 5, title: "UPSC Civil Services · GS Prelims Practice", subjects: "Polity, history, geography, economy and environment. GS practice, not CSAT." },
  { number: 12, category: 3, title: "WBPSC WBCS · Prelims Practice", subjects: "Polity, history, geography, economy and West Bengal awareness." }
] as const;

export function additionalExamId(number: number, level = 1) {
  const suffix = String(number).padStart(12, "0");
  return level === 1 ? `20000000-0000-0000-0000-${suffix}`
    : `21000000-0000-0000-${String(level).padStart(4, "0")}-${suffix}`;
}

export function additionalExamDescription(subjects: string) {
  return `English + Hindi. Five-question practice sets, not full-length official mocks. ${subjects}`;
}
