# Supabase setup

The app uses Supabase Auth and Postgres RPC functions for the exam catalog,
timed attempts, saved progress, results, dashboards, and leaderboards.

## Connect the app

1. Copy `.env.example` to `.env.local` in the project root.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the
   project URL and anon/publishable key from **Supabase → Project Settings →
   API**. The anon key is intended for browser use; never put a service-role
   key in a `NEXT_PUBLIC_` variable.
3. Set `NEXT_PUBLIC_SITE_URL` to the app origin (for local development,
   `http://localhost:3000`).
4. In **Supabase → SQL Editor**, run
   [`migrations/20261023220000_initial_schema.sql`](./migrations/20261023220000_initial_schema.sql).
   Then run
   [`migrations/20261029100000_exam_levels.sql`](./migrations/20261029100000_exam_levels.sql).
   Finally run
   [`migrations/20261029120000_more_exams.sql`](./migrations/20261029120000_more_exams.sql)
   for the expanded bilingual exam catalog.
   Then run
   [`migrations/20261029150000_admin_dashboard.sql`](./migrations/20261029150000_admin_dashboard.sql)
   for administration, safe content editing and guest statistics.
   The initial migration creates the tables, row-level security policies, auth
   profile trigger, app RPCs, and two sample mock exams. The second migration
   adds ten levels per exam. Apply migrations once, in filename order; do not
   reapply the initial migration after the level migration, because it replaces
   the level-aware RPCs.
5. In **Supabase → Authentication → URL Configuration**, set the Site URL to
   the same origin and add `<origin>/auth/callback` to the allowed redirect
   URLs. Add your deployed origin there before production use.
6. Enable Google in **Authentication → Sign In / Providers** if Google sign-in
   is needed. Configure the provider's OAuth credentials and callback URL in
   Supabase as shown on that page.
7. Restart the Next.js dev server after changing environment variables.

The configured project URL and anon key establish the client connection, but
the database migration must also be applied before catalog and exam features
can work. Keep `.env.local` private.

## Missing function or table in the schema cache

If the API reports `PGRST202` for `public.get_catalog()` or `PGRST205` for
`public.exams`, open the SQL Editor in the project configured by
`NEXT_PUBLIC_SUPABASE_URL` and check:

```sql
select
  to_regclass('public.exams') as exams_table,
  to_regprocedure('public.get_catalog()') as catalog_function;
```

If either value is null, run the complete migration linked above and resolve
any SQL errors. Creating the migration file locally does not apply it to the
hosted database.

## Progressive exam levels

### Catalog key warning or missing level metadata

If `Catalog` reports missing React keys and `get_catalog()` returns exams
without `series_id` and `level`, the hosted function is still the pre-level
version. After the four migrations above, apply
[`20261029183000_repair_catalog_levels.sql`](./migrations/20261029183000_repair_catalog_levels.sql).
It restores only the level-aware catalog function, retains archive filtering
and does not reseed or delete exams, questions or attempts. Do not rerun the
initial or level-seed migrations to fix this.

The level migration keeps the original SSC CGL and IBPS PO tests as level 1,
including their existing sessions and scores. It adds nine authored sets to
each series: **20 sets, five questions per set, 100 questions in total**.
Difficulty progresses from basic arithmetic and recall to multi-step
algebra, constrained reasoning, conditional probability and critical reading.
SSC retains general awareness; IBPS Prelims stays focused on numerical
ability, reasoning and English. Existing durations and marking rates apply
independently to each level.

- Level 1 is open initially. Submitting every earlier level in the same
  series unlocks the next level. There is no pass-mark requirement.
- Merely opening a test does not unlock anything. Timeouts count only once
  the attempt has been submitted. Completed levels can be retried.
- `start_exam` enforces prerequisites in Postgres, including for direct
  requests. Internal pre-level functions cannot be called by app roles.
- `get_catalog` returns each published level with `series_id`, `level`,
  `unlocked`, `completed`, `best_score`, `latest_score` and
  `latest_result_id`. Anonymous visitors see no personal marks.
- The catalog groups levels by series. Catalog, dashboard and result pages
  show best and latest marks per level with scorecard links. Result history
  and leaderboards identify each level separately.
- Scores are aggregated from all submissions, not just the dashboard's
  most recent 100 history entries.

For a new series, insert its level 1 exam first (its `series_id` defaults to its
own ID), then add levels 2–10 with that ID as `series_id`. Each level needs its
own authored questions and an accurate `total_marks`. The unique
`(series_id, level)` constraint prevents duplicate levels; missing prerequisites
remain locked. The seed migration authors sets for the two bundled exams,
not for future exams added by administrators.

## Additional exams and bilingual questions

The third migration adds the following **10 series**, each with **10 levels
and 5 questions per level**:

| Category | Added series |
| --- | --- |
| State PSC | WBPSC Clerkship; Kerala PSC LDC / Clerk; WBPSC WBCS Prelims |
| SSC | SSC CHSL; SSC MTS |
| Railways | RRB NTPC; RRB Group D |
| Banking | SBI Clerk Prelims; IBPS Clerk Prelims |
| Civil Services | UPSC Civil Services GS Prelims |

This adds **100 sets and 500 question placements**. Including the two original
series, the catalog has **12 series, 120 sets and 600 question placements**.
There are 130 new authored bilingual items; syllabus-overlapping items are
shared across relevant series. Each new series has 50 different questions,
with no repeats between its levels.

Questions and explanations display **English and Hindi together**. Descriptive
answer options are bilingual too; numeric answers are language-neutral, and
English grammar options deliberately remain in English. No language-specific
answer IDs or scoring changes are needed. The original CGL and PO content
remains unchanged and English-only.

Topic selection follows each series: the state clerk sets include relevant
state awareness, railway sets include science, bank prelims focus on aptitude,
reasoning and English, and civil-services sets focus on general studies.
These are short learning sets with a foundation-to-application progression,
**not official papers, complete syllabus coverage or full-length mocks**.
They do not cover Kerala regional-language papers, WBCS language sections,
UPSC CSAT, typing tests or changing current affairs. Consult the current
official notification for exam eligibility, paper structure and languages.

Each added level uses the app's practice scoring: 10 minutes, 5 available
marks, 1 mark per correct answer and a 0.25-mark penalty per wrong answer.
These are practice settings, not claims about each examination's official
marking scheme. Existing server-enforced sequencing, retries, level-wise
marks, result history and level leaderboards work without RPC changes.

Apply the third migration **once after both earlier migrations**. It is
transactional, checks for all 100 five-question sets before committing and
never updates the existing series, questions, sessions or submissions.
Creating the file locally does not apply it to hosted Supabase.

## Admin dashboard setup

Apply the fourth migration **once after the three earlier migrations**. This
adds `/admin`, role-backed reporting and content-management RPCs. No service-role
key is needed in the app. Regular users cannot read admin tables or call admin
RPCs successfully, and client-controlled profile metadata cannot grant access.

### Assign the first admin

Register and confirm the owner's account normally. In the Supabase SQL Editor,
run the following as the database owner, replacing the email:

```sql
insert into public.admin_users (user_id)
select id from auth.users
where lower(email) = lower('owner@example.com')
on conflict (user_id) do nothing;

select u.id, u.email
from public.admin_users a join auth.users u on u.id = a.user_id;
```

Verify the intended account appears in the second query. If it does not,
check that the account already exists and the email is correct. Reload the
app (or sign out and back in); **Admin dashboard** then appears in navigation.
The screen is at `/admin`. Assign additional trusted admins using the same SQL.
Do not grant admin access to untrusted users: admins can see learner emails,
answer reviews and the question bank's correct answers.

To revoke access:

```sql
delete from public.admin_users
where user_id in (select id from auth.users where lower(email) = lower('owner@example.com'));
```

Every admin RPC rechecks the database role, so revocation blocks subsequent
requests even if a browser still displays the old navigation link. Account
passwords, tokens and auth metadata are never returned by reporting APIs.

### What administrators can manage

- **Overview & guests:** total registered accounts, submitted attempts,
  non-archived exam series, and daily guest-browser/page-view counts for the
  last 30 UTC days.
- **Users & results:** name, email, registration date, last sign-in, tests
  completed and average score percentage; searchable and paginated 25 at a
  time. Open a user to browse submitted attempts, unsubmitted sessions and
  detailed answer/explanation reviews. Expired-but-unsubmitted sessions are
  identified separately.
- **Exams & questions:** create/edit categories, create a new series at level 1,
  add levels 2–10, edit descriptions/duration, add/edit questions and options,
  select correct answers, and write English/Hindi explanations.
- Create levels as drafts, add questions, then edit the level and select
  **Published**. All earlier levels must be published before publishing a
  higher level. An existing level cannot be moved to another series or
  renumbered.
- Total marks and the wrong-answer penalty cannot change once any attempt
  starts, keeping best/latest score denominators and comparisons valid.
  Use a new series or unused level for a new marking scheme. Duration changes
  affect new sessions only.
- **Archive level**, **Archive series**, and **Archive question** replace
  permanent deletion. Enable **Include archived levels and question versions**
  to edit/restore them. Restoring a used question creates a new version;
  restoration fails explicitly if another current question occupies its position.
- Archiving or unpublishing a level also unpublishes higher levels. Archiving
  the last question unpublishes its level and higher ones. Restore and publish
  prerequisites before republishing higher levels.

Questions referenced by a session are never overwritten: edits archive the old
version and create a replacement ID. Sessions snapshot question IDs, total
marks, penalty and duration. Existing attempts can resume after archival using
their original exam URL, and submission/review continues to use the original
question versions. Archived content is excluded from new sessions and the
public catalog, but historical scores, explanations and admin reports remain.
The migration backfills scoring snapshots for existing sessions.

### Guest analytics and privacy

The app asks signed-out visitors to opt in before recording visits or storing
an analytics identifier. Declining does not affect exams or login. With consent,
a random browser UUID is stored locally for the current UTC day and replaced
on the first navigation of a new UTC day. The database stores only the UTC date,
that random ID and an aggregate page-view count: no IP address, user-agent,
referrer or page path.

The initial page after consent and each subsequent pathname navigation count
as views; query-string-only changes do not. Signed-in users do not count as
guests, and the database ignores their tracking requests. The **Visitor privacy
settings** control allows guests to revoke consent and remove the local ID.
Past anonymous aggregate rows remain. Local storage failures and tracking
failures are displayed with a retry control, never reported as success.

These are **approximate counts of consenting browsers, not unique people**.
Daily browser totals cannot be summed into cross-day unique visitors. Clearing
storage, multiple devices, private mode, blocked scripts and forged requests
affect counts. The RPC caps each daily browser at 1000 page views, but this is
not bot-proof analytics. Statistics start after deployment; historical guest
traffic cannot be reconstructed. Hosting providers may keep separate request
logs under their own privacy policies; this feature does not collect those logs.

Run `npm test` for unit tests and PostgreSQL integration tests. The latter use
an isolated, in-memory PGlite database with synthetic users; they never connect
to the configured Supabase project. They cover all four migrations, question-set
integrity, unique seating-puzzle solutions, prerequisite enforcement, score
isolation, retries, timeouts, progress beyond the history limit, bilingual
content, numerical keys, all new level sequences, preservation of old data,
admin authorization, pagination, content versioning/archival, active session
snapshots, guest aggregation and daily browser-ID rotation.

If both exist, refresh the API schema cache:

```sql
notify pgrst, 'reload schema';
```

The migration also sends this notification at the end. Wait a few seconds,
then reload the app. If the error persists, confirm that the SQL Editor and
the app environment variables point to the same Supabase project.
