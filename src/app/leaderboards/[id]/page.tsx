import { Leaderboard } from "@/components/leaderboard";
export default async function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  return <Leaderboard examId={(await params).id} />;
}
