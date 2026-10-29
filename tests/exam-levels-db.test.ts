import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { additionalExamSeries, additionalCategories, additionalExamId, additionalExamDescription } from "../src/lib/additional-exams.ts";

const ssc = "20000000-0000-0000-0000-000000000001";
const ibps = "20000000-0000-0000-0000-000000000002";
const alice = "40000000-0000-0000-0000-000000000001";
const bob = "40000000-0000-0000-0000-000000000002";
const levelId = (series: string, level: number) => level === 1 ? series
  : `21000000-0000-0000-${String(level).padStart(4, "0")}-${series.slice(-12)}`;
type CatalogRow = {
  id: string; series_id: string; level: number; completed: boolean;
  unlocked: boolean; question_count: number; best_score: number | null;
  latest_score: number | null; latest_result_id: string | null;
};
type Session = { id: string; questions: { id: string; correct_option_id?: string; explanation?: string }[] };

function* permutations(letters: string): Generator<string> {
  if (!letters) { yield ""; return; }
  for (const letter of letters) {
    for (const rest of permutations(letters.replace(letter, ""))) yield letter + rest;
  }
}

test("Postgres migrations preserve attempts and enforce ten-level progress end to end", async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261023220000_initial_schema.sql", import.meta.url), "utf8"));
    await db.query("insert into auth.users (id, email) values ($1, 'alice@example.test'), ($2, 'bob@example.test')", [alice, bob]);
    async function signIn(user: string, role = "authenticated") {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
      await db.exec(`set role ${role}`);
    }
    async function rpc<T>(sql: string, args: unknown[] = []) {
      const { rows } = await db.query<{ data: T }>(`select ${sql} as data`, args);
      return rows[0].data;
    }
    const catalog = () => rpc<CatalogRow[]>("public.get_catalog()");
    const start = (id: string) => rpc<Session>("public.start_exam($1::uuid)", [id]);
    const submit = (id: string, answers = {}) => rpc<string>("public.submit_exam($1::uuid, $2::jsonb)", [id, JSON.stringify(answers)]);

    await signIn(alice);
    const original = await start(ssc);
    const originalResult = await submit(original.id);
    await db.exec("reset role");
    await db.exec(await readFile(new URL("../supabase/migrations/20261029100000_exam_levels.sql", import.meta.url), "utf8"));
    await signIn(alice);

    await t.test("all twenty sets have five distinct questions, four options and valid explained keys", async () => {
      const rows = await catalog();
      assert.equal(rows.length, 20);
      for (const series of [ssc, ibps]) {
        assert.deepEqual(rows.filter(e => e.series_id === series).map(e => e.level), [1,2,3,4,5,6,7,8,9,10]);
      }
      assert.ok(rows.every(e => e.question_count === 5));
      await db.exec("reset role");
      const { rows: questions } = await db.query<{
        question_text: string; options: { id: string; text: string }[];
        correct_option_id: string; explanation: string; position: number;
      }>("select * from public.questions");
      await signIn(alice);
      assert.equal(questions.length, 100);
      assert.equal(new Set(questions.map(q => q.question_text)).size, 100);
      for (const q of questions) {
        assert.equal(q.options.length, 4);
        assert.equal(new Set(q.options.map(o => o.id)).size, 4);
        assert.equal(new Set(q.options.map(o => o.text)).size, 4);
        assert.ok(q.options.some(o => o.id === q.correct_option_id));
        assert.ok(q.explanation.length > 20);
        assert.ok(q.position >= 1 && q.position <= 5);
      }
    });

    await t.test("authored seating puzzles have unique solutions matching their answer keys", async () => {
      const cases: { series: string; level: number; question: number; people: string; answerIndex: number; valid: (row: string) => boolean }[] = [
        { series: ssc, level: 6, question: 2, people: "ABCDE", answerIndex: 2,
          valid: r => r[0] === "D" && r[4] === "E" && r.includes("ABC") },
        { series: ssc, level: 9, question: 2, people: "ABCDEF", answerIndex: 2,
          valid: r => r[5] === "F" && r[0] !== "D" && r.includes("ABC") && r.includes("DE") },
        { series: ssc, level: 10, question: 2, people: "ABCDEFG", answerIndex: 4,
          valid: r => r[2] === "C" && r[6] === "G" && r.includes("AB") && r.includes("ED") && r.indexOf("F") > 2 && r.indexOf("F") < r.indexOf("E") },
        { series: ibps, level: 5, question: 5, people: "PQRST", answerIndex: 3,
          valid: r => r[0] === "S" && r[4] === "T" && r.includes("PQR") },
        { series: ibps, level: 7, question: 2, people: "ABCDEF", answerIndex: 3,
          valid: r => r[0] === "A" && r[5] === "F" && r.includes("BC") && r.includes("DE") && r.indexOf("B") < r.indexOf("D") },
        { series: ibps, level: 9, question: 2, people: "ABCDEFG", answerIndex: 5,
          valid: r => r[3] === "D" && r[6] === "G" && r.includes("ABC") && r.includes("EF") },
        { series: ibps, level: 10, question: 2, people: "ABCDEFGH", answerIndex: 5,
          valid: r => r[0] === "A" && r[7] === "H" && r[3] === "D" && r.includes("BC") && r.indexOf("B") < 3 && r.includes("EF") && r.indexOf("G") > r.indexOf("F") }
      ];
      await db.exec("reset role");
      try {
        for (const puzzle of cases) {
          const solutions = [...permutations(puzzle.people)].filter(puzzle.valid);
          assert.equal(solutions.length, 1, `Unique arrangement at ${puzzle.series} level ${puzzle.level}`);
          const { rows } = await db.query<{ options: { id: string; text: string }[]; correct_option_id: string }>(
            "select options, correct_option_id from public.questions where exam_id = $1 and position = $2",
            [levelId(puzzle.series, puzzle.level), puzzle.question]
          );
          const correct = rows[0].options.find(o => o.id === rows[0].correct_option_id)!;
          assert.equal(correct.text, solutions[0][puzzle.answerIndex]);
        }
      } finally {
        await signIn(alice);
      }
    });

    await t.test("existing level-1 history survives; zero score unlocks only the next level of its own series", async () => {
      const rows = await catalog();
      const first = rows.find(e => e.id === ssc)!;
      assert.equal(first.latest_result_id, originalResult);
      assert.equal(first.best_score, 0);
      assert.equal(first.completed, true);
      assert.equal(rows.find(e => e.id === levelId(ssc, 2))!.unlocked, true);
      assert.equal(rows.find(e => e.id === levelId(ssc, 3))!.unlocked, false);
      assert.equal(rows.find(e => e.id === levelId(ibps, 2))!.unlocked, false);
      const result = await rpc<{ level: number; exam_title: string }>("public.get_result($1::uuid)", [originalResult]);
      assert.equal(result.level, 1);
      assert.match(result.exam_title, /Level 1$/);
    });

    await t.test("skipping levels and calling the internal bypass functions are rejected", async () => {
      await assert.rejects(start(levelId(ssc, 3)), /Complete all earlier levels/);
      for (const call of [
        "public.start_exam_without_levels($1::uuid)",
        "public.get_catalog_without_levels()",
        "public.get_result_without_levels($1::uuid)",
        "public.get_dashboard_without_levels()"
      ]) {
        await assert.rejects(rpc(call, call.includes("$1") ? [ssc] : []), /permission denied/);
      }
    });

    await t.test("starting or saving does not unlock; resuming keeps the same session and hides answer keys", async () => {
      const second = await start(levelId(ssc, 2));
      assert.equal((await start(levelId(ssc, 2))).id, second.id);
      assert.ok(second.questions.every(q => q.correct_option_id === undefined && q.explanation === undefined));
      await rpc("public.save_exam_progress($1::uuid, '{}'::jsonb, '{}'::uuid[])", [second.id]);
      assert.equal((await catalog()).find(e => e.id === levelId(ssc, 3))!.unlocked, false);
      await submit(second.id);
      assert.equal((await catalog()).find(e => e.id === levelId(ssc, 3))!.unlocked, true);
    });

    await t.test("retries keep best and latest marks separate, including negative scores; scoring remains unchanged", async () => {
      await db.exec("reset role");
      const { rows: keys } = await db.query<{ id: string; correct_option_id: string }>("select id, correct_option_id from public.questions where exam_id = $1", [ssc]);
      const correct = Object.fromEntries(keys.map(q => [q.id, q.correct_option_id]));
      const wrong = Object.fromEntries(keys.map(q => [q.id, q.correct_option_id === "A" ? "B" : "A"]));
      await signIn(alice);
      const full = await start(ssc);
      await submit(full.id, correct);
      const retry = await start(ssc);
      const latestId = await submit(retry.id, wrong);
      assert.equal(await submit(retry.id, wrong), latestId);
      const first = (await catalog()).find(e => e.id === ssc)!;
      assert.equal(first.best_score, 10);
      assert.equal(first.latest_score, -2.5);
      assert.equal(first.latest_result_id, latestId);
      assert.equal((await catalog()).find(e => e.id === levelId(ssc, 2))!.best_score, 0);
    });

    await t.test("all ten levels can be completed in order and each result and history row identifies its level", async () => {
      for (let level = 3; level <= 10; level++) {
        const session = await start(levelId(ssc, level));
        const id = await submit(session.id);
        const result = await rpc<{ level: number; series_id: string; exam_title: string }>("public.get_result($1::uuid)", [id]);
        assert.equal(result.level, level);
        assert.equal(result.series_id, ssc);
        assert.match(result.exam_title, new RegExp(`Level ${level}$`));
      }
      assert.equal((await catalog()).filter(e => e.series_id === ssc && e.completed).length, 10);
      const dashboard = await rpc<{ history: { level: number; exam_title: string }[] }>("public.get_dashboard()");
      assert.ok(dashboard.history.every(row => row.exam_title.endsWith(`Level ${row.level}`)));
    });

    await t.test("an expired session does not unlock until submitted and ignores late answers", async () => {
      const session = await start(ibps);
      await db.exec("reset role");
      await db.query("update public.exam_sessions set started_at = now() - interval '11 minutes', expires_at = now() - interval '1 minute' where id = $1", [session.id]);
      await signIn(alice);
      assert.equal((await catalog()).find(e => e.id === levelId(ibps, 2))!.unlocked, false);
      const resultId = await submit(session.id, { [session.questions[0].id]: "A" });
      const result = await rpc<{ score: number; attempted_count: number }>("public.get_result($1::uuid)", [resultId]);
      assert.equal(result.score, 0);
      assert.equal(result.attempted_count, 0);
      assert.equal((await catalog()).find(e => e.id === levelId(ibps, 2))!.unlocked, true);
    });

    await t.test("level-wise marks and completed levels survive the hundred-attempt history limit", async () => {
      for (let attempt = 0; attempt < 101; attempt++) {
        await submit((await start(ibps)).id);
      }
      const dashboard = await rpc<{ history: { exam_id: string }[] }>("public.get_dashboard()");
      assert.equal(dashboard.history.length, 100);
      assert.ok(dashboard.history.every(row => row.exam_id === ibps));
      const rows = await catalog();
      assert.equal(rows.filter(e => e.series_id === ssc && e.completed).length, 10);
      assert.equal(rows.find(e => e.id === ssc)!.best_score, 10);
      assert.equal(rows.find(e => e.id === ssc)!.latest_score, -2.5);
    });

    await t.test("marks and unlocks are isolated between users and anonymous visitors", async () => {
      await signIn(bob);
      const rows = await catalog();
      assert.ok(rows.every(e => !e.completed && e.best_score === null && e.latest_result_id === null));
      assert.ok(rows.every(e => e.unlocked === (e.level === 1)));
      await assert.rejects(start(levelId(ssc, 2)), /Complete all earlier levels/);
      await assert.rejects(rpc("public.get_result($1::uuid)", [originalResult]), /not found/i);
      await signIn("", "anon");
      assert.ok((await catalog()).every(e => !e.completed && e.best_score === null && e.unlocked === (e.level === 1)));
      await assert.rejects(start(ssc), /permission denied/);
    });

    await db.exec("reset role");
    const snapshot = () => rpc("jsonb_build_object('exams', (select jsonb_agg(to_jsonb(e) order by id) from public.exams e where series_id in ($1::uuid, $2::uuid)), 'questions', (select jsonb_agg(to_jsonb(q) order by id) from public.questions q where exam_id in (select id from public.exams where series_id in ($1::uuid, $2::uuid))), 'sessions', (select jsonb_agg(to_jsonb(s) order by id) from public.exam_sessions s), 'submissions', (select jsonb_agg(to_jsonb(s) order by id) from public.submissions s))", [ssc, ibps]);
    const beforeExpansion = await snapshot();
    await db.exec(await readFile(new URL("../supabase/migrations/20261029120000_more_exams.sql", import.meta.url), "utf8"));

    await t.test("expansion preserves every existing exam, question, session and submission", async () => {
      assert.deepEqual(await snapshot(), beforeExpansion);
    });

    type ExpandedRow = CatalogRow & { title: string; description: string; categories: { id: string; slug: string; name: string; icon: string } };
    type BankQuestion = {
      id: string; exam_id: string; position: number; level: number; topic: string;
      question_text: string; options: { id: string; text: string }[];
      correct_option_id: string; explanation: string;
    };
    const { rows: addedQuestions } = await db.query<BankQuestion>(
      "select q.*, e.level from public.questions q join public.exams e on e.id = q.exam_id where e.series_id not in ($1, $2) order by q.exam_id, q.position",
      [ssc, ibps]
    );
    await t.test("ten selected exams have ten complete bilingual levels each and match the demo descriptors", async () => {
      await signIn("", "anon");
      const rows = await rpc<ExpandedRow[]>("public.get_catalog()");
      assert.equal(rows.length, 120);
      assert.equal(new Set(rows.map(e => e.categories.id)).size, 5);
      for (const series of additionalExamSeries) {
        const levels = rows.filter(e => e.series_id === additionalExamId(series.number));
        assert.deepEqual(levels.map(e => e.level), [1,2,3,4,5,6,7,8,9,10]);
        for (const level of levels) {
          assert.equal(level.id, additionalExamId(series.number, level.level));
          assert.equal(level.title, series.title);
          assert.equal(level.description, additionalExamDescription(series.subjects));
          assert.equal(level.question_count, 5);
          assert.equal(level.unlocked, level.level === 1);
          assert.equal(level.best_score, null);
          assert.equal(level.categories.id, `10000000-0000-0000-0000-${String(series.category).padStart(12, "0")}`);
        }
      }
      for (const category of additionalCategories) {
        assert.deepEqual(rows.find(e => e.categories.id === category.id)!.categories, category);
      }
      assert.equal(addedQuestions.length, 500);
      assert.equal(new Set(addedQuestions.map(q => q.question_text)).size, 130);
      for (const q of addedQuestions) {
        assert.match(q.question_text, /[A-Za-z]/);
        assert.match(q.question_text, /[\u0900-\u097f]/);
        assert.match(q.explanation, /[A-Za-z]/);
        assert.match(q.explanation, /[\u0900-\u097f]/);
        assert.equal(q.options.length, 4);
        assert.deepEqual(q.options.map(o => o.id), ["A","B","C","D"]);
        assert.equal(new Set(q.options.map(o => o.text)).size, 4);
        assert.ok(q.options.some(o => o.id === q.correct_option_id));
        assert.ok(q.options.every(o => o.text.trim().length > 0));
      }
      for (const series of additionalExamSeries) {
        const questions = addedQuestions.filter(q => q.exam_id.endsWith(String(series.number).padStart(12, "0")));
        assert.equal(new Set(questions.map(q => q.question_text)).size, 50, series.title);
        for (let level = 1; level <= 10; level++) {
          assert.deepEqual(questions.filter(q => q.level === level).map(q => q.position).sort(), [1,2,3,4,5]);
        }
      }
    });

    await t.test("question topics fit their selected exams instead of copying a generic set", () => {
      const topics = (number: number) => new Set(addedQuestions.filter(q => q.exam_id === additionalExamId(number)).map(q => q.topic));
      assert.deepEqual(topics(3), new Set(["Mathematics","Reasoning","English","Polity","West Bengal"]));
      assert.deepEqual(topics(4), new Set(["Mathematics","Reasoning","English","Polity","Kerala"]));
      assert.deepEqual(topics(11), new Set(["Polity","History","Geography","Economy","Environment"]));
      assert.deepEqual(topics(12), new Set(["Polity","History","Geography","Economy","West Bengal"]));
      for (const number of [9,10]) assert.deepEqual(topics(number), new Set(["Mathematics","Reasoning","English","Data Interpretation","Logic"]));
      assert.ok(topics(7).has("Science") && topics(8).has("Science"));
    });

    await t.test("new numerical answer keys agree with independently calculated results", () => {
      const mathAnswers = [
        String(160/4), String(180*3/5), `${(460-400)/400*100}%`, String(Math.round(800*0.9*1.1)),
        "6 days / दिन", String((150+225)/(54/3.6)), String(Math.round(8000*(1.05**2-1))),
        "7.5 L / लीटर", String(4**3-3*4), "5/18"
      ];
      const dataAnswers = ["30","60","140","25%","234","8%","29","60%","72%","37.5%"];
      for (const q of addedQuestions.filter(q => q.topic === "Mathematics" || q.topic === "Data Interpretation")) {
        const expected = (q.topic === "Mathematics" ? mathAnswers : dataAnswers)[q.level-1];
        assert.equal(q.options.find(o => o.id === q.correct_option_id)!.text, expected, `${q.topic} level ${q.level}`);
      }
      const conditions: [number, number, (row: string) => boolean, string][] = [
        [7, 3, r => r[0] === "D" && r[4] === "E" && r.includes("ABC"), "ABCDE"],
        [10, 3, r => r[2] === "C" && r[6] === "G" && r.includes("AB") && r.includes("ED") && r.indexOf("F") > 2 && r.indexOf("F") < r.indexOf("E"), "ABCDEFG"]
      ];
      for (const [level, index, valid, people] of conditions) {
        const solutions = [...permutations(people)].filter(valid);
        assert.equal(solutions.length, 1);
        const q = addedQuestions.find(q => q.topic === "Reasoning" && q.level === level)!;
        assert.equal(q.options.find(o => o.id === q.correct_option_id)!.text, solutions[0][index]);
      }
    });

    await t.test("all new series enforce sequencing, bilingual results, scoring and independent marks", async () => {
      await signIn(bob);
      for (const series of additionalExamSeries) {
        await assert.rejects(start(additionalExamId(series.number, 2)), /Complete all earlier levels/);
        for (let level = 1; level <= 10; level++) {
          const examId = additionalExamId(series.number, level);
          const session = await start(examId);
          assert.equal(session.questions.length, 5);
          assert.ok(session.questions.every(q => q.correct_option_id === undefined && q.explanation === undefined));
          const keys = addedQuestions.filter(q => q.exam_id === examId);
          const answers = Object.fromEntries(keys.map(q => [q.id, q.correct_option_id]));
          const resultId = await submit(session.id, answers);
          const result = await rpc<{ level: number; score: number; questions: { explanation: string }[] }>("public.get_result($1::uuid)", [resultId]);
          assert.equal(result.level, level);
          assert.equal(result.score, 5);
          assert.ok(result.questions.every(q => /[\u0900-\u097f]/.test(q.explanation)));
        }
      }
      const completed = (await catalog()).filter(e => e.series_id !== ssc && e.series_id !== ibps);
      assert.equal(completed.length, 100);
      assert.ok(completed.every(e => e.completed && e.best_score === 5 && e.unlocked));
      assert.ok((await catalog()).filter(e => e.series_id === ssc || e.series_id === ibps).every(e => !e.completed));
      await signIn(alice);
      assert.ok((await catalog()).filter(e => e.series_id !== ssc && e.series_id !== ibps).every(e => !e.completed && e.best_score === null));
    });
  } finally {
    await db.close();
  }
});
