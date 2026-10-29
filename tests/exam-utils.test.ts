import { test } from "node:test";
import assert from "node:assert/strict";
import { remainingSeconds, formatTime, paletteState, safeNext } from "../src/lib/exam-utils.ts";

test("timer uses absolute expiry and clamps expired sessions", () => {
  assert.equal(remainingSeconds("2026-01-01T00:01:00Z", Date.parse("2026-01-01T00:00:00Z")), 60);
  assert.equal(remainingSeconds("2026-01-01T00:01:00Z", Date.parse("2026-01-01T00:02:00Z")), 0);
  assert.equal(formatTime(3661), "61:01");
  assert.equal(formatTime(-2), "00:00");
});
test("palette distinguishes all four answer states", () => {
  assert.equal(paletteState(false, false), "unanswered");
  assert.equal(paletteState(true, false), "answered");
  assert.equal(paletteState(false, true), "marked");
  assert.equal(paletteState(true, true), "answered-marked");
});
test("auth redirect only accepts local paths", () => {
  for (const path of ["https://evil.test", "//evil.test", "/\\evil.test", null]) assert.equal(safeNext(path), "/dashboard");
  assert.equal(safeNext("/exam/123"), "/exam/123");
});
