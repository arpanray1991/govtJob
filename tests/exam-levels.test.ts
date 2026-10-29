import { test } from "node:test";
import assert from "node:assert/strict";
import { groupExamLevels, hasExamLevelMetadata, nextExamLevel, examLevelTitle, levelDifficulties } from "../src/lib/exam-levels.ts";
import type { Exam } from "../src/lib/types.ts";

function exam(series: string, level: number, completed = false, unlocked = true): Exam {
  return {
    id: `${series}-${level}`, series_id: series, level, title: series,
    category_id: "category", description: "", duration_minutes: 10,
    total_marks: 10, negative_marking_rate: 0.25, question_count: 5,
    categories: { id: "category", name: "SSC", slug: "ssc", icon: "landmark" },
    completed, unlocked, best_score: completed ? 0 : null,
    latest_score: completed ? -2.5 : null, latest_result_id: completed ? "result" : null
  };
}

test("detects legacy catalog rows before rendering unkeyed exam groups", () => {
  assert.equal(hasExamLevelMetadata([]), true);
  assert.equal(hasExamLevelMetadata([exam("SSC", 1), exam("SSC", 10)]), true);
  const legacy = exam("SSC", 1);
  Reflect.deleteProperty(legacy, "series_id");
  assert.equal(hasExamLevelMetadata([legacy]), false);
  for (const level of [0, 11, 1.5, NaN]) {
    assert.equal(hasExamLevelMetadata([exam("SSC", level)]), false);
  }
  assert.equal(hasExamLevelMetadata([exam("", 1)]), false);
});

test("groups every exam independently and sorts levels numerically without mutating input", () => {
  const exams = [exam("SSC", 10), exam("IBPS", 2), exam("SSC", 2), exam("SSC", 1)];
  const groups = groupExamLevels(exams);
  assert.deepEqual(groups.map(group => group.map(e => e.id)), [["SSC-1", "SSC-2", "SSC-10"], ["IBPS-2"]]);
  assert.equal(exams[0].level, 10);
  assert.deepEqual(groupExamLevels([]), []);
});

test("continues at the first unlocked incomplete level, not the highest score", () => {
  assert.equal(nextExamLevel([exam("SSC", 3, false, false), exam("SSC", 2), exam("SSC", 1, true)])?.level, 2);
  assert.equal(nextExamLevel([exam("SSC", 1, true), exam("SSC", 2, true)]), undefined);
  assert.equal(nextExamLevel([exam("SSC", 2, false, false)]), undefined);
});

test("labels all ten difficulty levels and level-specific leaderboards", () => {
  assert.equal(levelDifficulties.length, 10);
  assert.equal(new Set(levelDifficulties).size, 10);
  assert.equal(examLevelTitle(exam("SSC", 10)), "SSC · Level 10");
});
