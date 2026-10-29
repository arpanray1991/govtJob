import { ExamRunner } from "@/components/exam-runner";
export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExamRunner key={id} examId={id} />;
}
