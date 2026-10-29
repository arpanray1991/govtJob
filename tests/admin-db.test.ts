import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const admin = "40000000-0000-0000-0000-000000000001";
const learner = "40000000-0000-0000-0000-000000000002";
const other = "40000000-0000-0000-0000-000000000003";
const originalExam = "20000000-0000-0000-0000-000000000001";
const originalCategory = "10000000-0000-0000-0000-000000000001";
type Exam = { id: string; series_id: string; level: number; archived: boolean; is_published: boolean; question_count: number };
type Question = { id: string; archived: boolean; question_text: string; correct_option_id: string; explanation: string };
type Content = { exams: Exam[]; questions: Question[] };
type Session = { id: string; total_marks: number; duration_minutes: number; negative_marking_rate: number; questions: Question[] };
type Result = { score: number; total_marks: number; correct_count: number; questions: Question[] };

test("admin access, reporting, content archives and guest analytics work end to end", async t => {
  const db = new PGlite();
  async function role(user: string, name = "authenticated") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
    await db.exec(`set role ${name}`);
  }
  async function rpc<T>(call: string, args: unknown[] = []) {
    return (await db.query<{ data: T }>(`select public.${call} as data`, args)).rows[0].data;
  }
  const content = (id: string | null = null) => rpc<Content>("admin_content($1::uuid)", [id]);
  const start = (id: string) => rpc<Session>("start_exam($1::uuid)", [id]);
  const submit = (id: string, answers = {}) => rpc<string>("submit_exam($1::uuid,$2::jsonb)", [id, JSON.stringify(answers)]);
  const archive = (kind: string, id: string) => rpc("admin_archive($1,$2::uuid)", [kind,id]);
  const examData = (series: string | null, level = 1, published = false) => ({
    series_id: series, level, title: "Admin practice", description: "Bilingual practice / अभ्यास",
    category_id: originalCategory, duration_minutes: 10, total_marks: 5, negative_marking_rate: 0.25,
    is_published: published
  });
  const questionData = (position = 1) => ({
    position, question_text: "What is 2 + 2? / 2 + 2 कितना है?", topic: "Arithmetic",
    options: [{ id: "A", text: "3" }, { id: "B", text: "4" }, { id: "C", text: "5" }, { id: "D", text: "6" }],
    correct_option_id: "B", explanation: "Two plus two is four. / दो और दो चार होते हैं।"
  });
  const saveExam = (id: string | null, data: object) => rpc<string>("admin_save_exam($1::uuid,$2::jsonb)", [id,JSON.stringify(data)]);
  const saveQuestion = (id: string | null, exam: string, data = questionData()) => rpc<string>(
    "admin_save_question($1::uuid,$2::uuid,$3::jsonb)", [id,exam,JSON.stringify(data)]);
  let originalSession: Session;
  let series: string;
  let question: string;
  let resultId: string;
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb,
        created_at timestamptz not null default now(), last_sign_in_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
    `);
    for (const migration of ["20261023220000_initial_schema.sql", "20261029100000_exam_levels.sql", "20261029120000_more_exams.sql"]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    }
    await db.query("insert into auth.users(id,email,raw_user_meta_data) values ($1,'admin@example.test','{}'),($2,'learner@example.test','{}'),($3,'other@example.test','{}')", [admin,learner,other]);
    await role(learner);
    originalSession = await start(originalExam);
    await db.exec("reset role");
    await db.exec(await readFile(new URL("../supabase/migrations/20261029150000_admin_dashboard.sql", import.meta.url), "utf8"));
    await db.query("insert into public.admin_users(user_id) values ($1)", [admin]);

    await t.test("catalog repair restores missing level fields without reseeding content", async () => {
      await db.exec(`create or replace function public.get_catalog()
        returns jsonb language sql stable security definer set search_path = '' as $$
          select public.get_catalog_without_levels();
        $$`);
      const legacy = await rpc<Record<string, unknown>[]>("get_catalog()");
      assert.equal(legacy.length, 120);
      assert.equal(legacy[0].series_id, undefined);
      const migration = await readFile(new URL("../supabase/migrations/20261029183000_repair_catalog_levels.sql", import.meta.url), "utf8");
      await db.exec(migration);
      await db.exec(migration);
      await role("", "anon");
      const catalog = await rpc<(Exam & { unlocked: boolean; completed: boolean })[]>("get_catalog()");
      assert.equal(catalog.length, 120);
      assert.equal(new Set(catalog.map(exam => exam.series_id)).size, 12);
      assert.ok(catalog.every(exam => exam.series_id && exam.level >= 1 && exam.level <= 10));
      assert.ok(catalog.every(exam => exam.unlocked === (exam.level === 1) && !exam.completed));
      await role(learner);
      const progress = await rpc<(Exam & { unlocked: boolean; completed: boolean })[]>("get_catalog()");
      assert.ok(progress.every(exam => !exam.completed));
      await db.exec("reset role");
    });

    await t.test("every admin endpoint rejects non-admins; no self-promotion or direct table access", async () => {
      await role(learner);
      assert.equal(await rpc("is_admin()"), false);
      const calls: [string, unknown[]][] = [
        ["admin_overview()",[]], ["admin_users_list()",[]], ["admin_attempts($1::uuid)",[other]],
        ["admin_result($1::uuid)",[other]], ["admin_content()",[]],
        ["admin_save_category(null,'X','x','book')",[]],
        ["admin_save_exam(null,$1::jsonb)",[JSON.stringify(examData(null))]],
        ["admin_save_question(null,$1::uuid,$2::jsonb)",[originalExam,JSON.stringify(questionData())]],
        ["admin_archive('series',$1::uuid)",[originalExam]]
      ];
      for (const [call,args] of calls) await assert.rejects(rpc(call,args), /Administrator access/);
      await assert.rejects(db.query("insert into public.admin_users(user_id) values ($1)",[learner]), /permission denied/);
      await assert.rejects(db.query("select * from public.guest_visits"), /permission denied/);
      await assert.rejects(rpc("require_admin()"), /permission denied/);
      await db.exec("reset role");
      await db.query("update auth.users set raw_user_meta_data = '{\"role\":\"admin\",\"is_admin\":true}' where id=$1",[learner]);
      await role(learner);
      assert.equal(await rpc("is_admin()"), false);
      await role("","anon");
      await assert.rejects(rpc("admin_overview()"), /permission denied/);
      await assert.rejects(rpc("is_admin()"), /permission denied/);
    });

    await t.test("migration snapshots existing sessions without resetting progress or scoring", async () => {
      await role(learner);
      const resumed = await start(originalExam);
      assert.equal(resumed.id,originalSession.id);
      assert.equal(resumed.total_marks,10);
      assert.equal(resumed.duration_minutes,10);
      const id = await submit(resumed.id);
      const result = await rpc<Result>("get_result($1::uuid)",[id]);
      assert.equal(result.score,0);
      assert.equal(result.total_marks,10);
    });

    await t.test("admin creates categories, series and questions; publication enforces prerequisites", async () => {
      await role(admin);
      assert.equal(await rpc("is_admin()"), true);
      const category = await rpc<string>("admin_save_category(null,'Practice','practice','book')");
      await rpc("admin_save_category($1::uuid,'Practice renamed','practice','train')",[category]);
      await assert.rejects(rpc("admin_save_category(null,'Bad','Bad Slug','book')"), /category name/);
      series = await saveExam(null, examData(null));
      assert.ok(series);
      await assert.rejects(saveExam(series,examData(series,1,true)), /Add questions/);
      question = await saveQuestion(null,series);
      await saveExam(series,examData(series,1,true));
      const second = await saveExam(null,examData(series,2));
      await saveQuestion(null,second);
      await saveExam(second,examData(series,2,true));
      await assert.rejects(saveExam(null,examData(series,2)), /duplicate key/);
      await assert.rejects(saveExam(null,examData(series,11)), /Check the category/);
      await assert.rejects(saveQuestion(null,series,{...questionData(2),correct_option_id:"Z"}), /four nonempty/);
      await assert.rejects(saveQuestion(null,series,{...questionData(2), options:[{id:"A",text:"x"}]}), /four nonempty/);
      await assert.rejects(saveExam(second,examData(series,3)), /cannot be moved/);
    });

    await t.test("editing a used question creates a version; active sessions keep original keys, marks and timing", async () => {
      await role(learner);
      const active = await start(series);
      assert.equal(active.questions.length,1);
      assert.equal(active.questions[0].correct_option_id,undefined);
      await role(admin);
      const replacement = await saveQuestion(question,series,{
        ...questionData(),question_text:"What is 1 + 2? / 1 + 2 कितना है?",
        correct_option_id:"A",explanation:"One plus two is three. / एक और दो तीन होते हैं।"
      });
      assert.notEqual(replacement,question);
      const versions = (await content(series)).questions;
      assert.equal(versions.find(q=>q.id===question)!.archived,true);
      await assert.rejects(saveExam(series,{...examData(series,1,true),total_marks:20}), /fixed after attempts/);
      await assert.rejects(saveExam(series,{...examData(series,1,true),negative_marking_rate:0.5}), /fixed after attempts/);
      await saveExam(series,{...examData(series,1,true),duration_minutes:30});
      await role(learner);
      const resumed = await start(series);
      assert.equal(resumed.total_marks,5);
      assert.equal(resumed.duration_minutes,10);
      assert.equal(resumed.negative_marking_rate,0.25);
      assert.equal(resumed.questions[0].id,question);
      resultId = await submit(active.id,{[question]:"B"});
      const result = await rpc<Result>("get_result($1::uuid)",[resultId]);
      assert.equal(result.score,5);
      assert.equal(result.total_marks,5);
      assert.equal(result.questions[0].correct_option_id,"B");
      await role(other);
      const newSession = await start(series);
      assert.equal(newSession.total_marks,5);
      assert.equal(newSession.duration_minutes,30);
      assert.equal(newSession.questions[0].id,replacement);
      assert.equal((await rpc<Result>("get_result($1::uuid)",[await submit(newSession.id,{[replacement]:"A"})])).score,5);
      await role(admin);
      await saveQuestion(null,series,questionData(2));
      question = replacement;
    });

    await t.test("archiving used questions, levels and series never deletes results; restore is draft-first", async () => {
      await role(learner);
      const activeBeforeArchive = await start(series);
      await role(admin);
      await archive("question",question);
      assert.equal((await content(series)).exams.find(e=>e.id===series)!.question_count,1);
      const remaining = (await content(series)).questions.find(q=>!q.archived)!;
      await archive("question",remaining.id);
      assert.equal((await content(series)).exams.find(e=>e.id===series)!.is_published,false);
      await archive("series",series);
      assert.ok((await content()).exams.filter(e=>e.series_id===series).every(e=>e.archived && !e.is_published));
      const review = await rpc<Result>("admin_result($1::uuid)",[resultId]);
      assert.equal(review.questions[0].correct_option_id,"B");
      assert.equal(review.questions[0].explanation,questionData().explanation);
      await role(learner);
      assert.equal((await rpc<Result>("get_result($1::uuid)",[resultId])).score,5);
      const details = await rpc<{exam:{total_marks:number;question_count:number}}>("get_exam_details($1::uuid)",[series]);
      assert.equal(details.exam.total_marks,5);
      assert.equal(details.exam.question_count,2);
      assert.equal((await start(series)).id,activeBeforeArchive.id);
      await submit(activeBeforeArchive.id);
      await assert.rejects(start(series), /not available/);
      await role(admin);
      await saveExam(series,examData(series));
      assert.equal((await content()).exams.find(e=>e.id===series)!.archived,false);
      const restored = await saveQuestion(question,series,{...questionData(),correct_option_id:"B"});
      assert.notEqual(restored,question);
      await saveExam(series,examData(series,1,true));
      const second = (await content()).exams.find(e=>e.series_id===series && e.level===2)!;
      await saveExam(second.id,examData(series,2,true));
      await archive("level",series);
      const levels = (await content()).exams.filter(e=>e.series_id===series);
      assert.equal(levels.find(e=>e.level===1)!.archived,true);
      assert.equal(levels.find(e=>e.level===2)!.is_published,false);
      await assert.rejects(archive("delete",series),/Choose question/);
    });

    await t.test("admin sees only requested account fields, paginated users and complete attempt reviews", async () => {
      await db.exec("reset role");
      await db.exec("insert into auth.users(id,email) select gen_random_uuid(), 'extra-' || n || '@example.test' from generate_series(1,27) n");
      await role(admin);
      const users = await rpc<{total:number;users: Record<string,unknown>[]}>("admin_users_list()");
      assert.equal(users.total,30);
      assert.equal(users.users.length,25);
      assert.ok(users.users.every(u=>!Object.hasOwn(u,"raw_user_meta_data") && !Object.hasOwn(u,"encrypted_password")));
      assert.equal((await rpc<{users:unknown[]}>("admin_users_list('',1)")).users.length,5);
      assert.equal((await rpc<{total:number}>("admin_users_list('learner@example.test')")).total,1);
      const attempts = await rpc<{total:number;attempts:unknown[]}>("admin_attempts($1::uuid)",[learner]);
      assert.equal(attempts.total,3);
      assert.equal(attempts.attempts.length,3);
      const overview = await rpc<{registered_users:number;total_attempts:number}>("admin_overview()");
      assert.equal(overview.registered_users,30);
      assert.equal(overview.total_attempts,4);
      await assert.rejects(rpc("admin_users_list('',-1)"),/Invalid user search/);
      await assert.rejects(rpc("admin_result($1::uuid)",[other]), /Submission not found/);
    });

    await t.test("guest views aggregate per UTC day and browser, signed-in requests do not count", async () => {
      const visitor = "60000000-0000-0000-0000-000000000001";
      await role("","anon");
      await rpc("record_guest_visit($1::uuid)",[visitor]);
      await rpc("record_guest_visit($1::uuid)",[visitor]);
      await rpc("record_guest_visit($1::uuid)",["60000000-0000-0000-0000-000000000002"]);
      await assert.rejects(rpc("record_guest_visit(null)"), /anonymous browser ID/);
      await assert.rejects(db.query("select * from public.guest_visits"), /permission denied/);
      await role(learner);
      await rpc("record_guest_visit($1::uuid)",[visitor]);
      await role(admin);
      const overview = await rpc<{guest_days:{browsers:number;page_views:number}[]}>("admin_overview()");
      assert.equal(overview.guest_days.length,30);
      assert.equal(overview.guest_days[0].browsers,2);
      assert.equal(overview.guest_days[0].page_views,3);
    });
  } finally { await db.close(); }
});
