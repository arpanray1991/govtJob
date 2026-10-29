import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyGuestId, guestBrowserKey } from "../src/lib/guest-analytics.ts";

test("guest IDs are reused for one UTC day and rotated at midnight without storing history", () => {
  const values = new Map<string,string>();
  const storage = { getItem: (key:string)=>values.get(key)??null, setItem: (key:string,value:string)=>{values.set(key,value);} };
  const first = "60000000-0000-0000-0000-000000000001";
  const second = "60000000-0000-0000-0000-000000000002";
  assert.equal(dailyGuestId(storage,new Date("2026-10-29T23:59:00Z"),()=>first),first);
  assert.equal(dailyGuestId(storage,new Date("2026-10-29T23:59:59Z"),()=>second),first);
  assert.equal(dailyGuestId(storage,new Date("2026-10-30T00:00:00Z"),()=>second),second);
  assert.equal(values.size,1);
  assert.equal(values.get(guestBrowserKey),`2026-10-30|${second}`);
});

test("malformed browser IDs are replaced; unavailable storage throws rather than silently counting", () => {
  const expected = "60000000-0000-0000-0000-000000000001";
  const storage = { getItem: ()=>"2026-10-29|not-a-uuid", setItem: ()=>{} };
  assert.equal(dailyGuestId(storage,new Date("2026-10-29"),()=>expected),expected);
  assert.throws(()=>dailyGuestId({getItem:()=>{throw new Error("Storage blocked");},setItem:()=>{}}),/Storage blocked/);
});
