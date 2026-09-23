// roles/structured-turn — runStructuredTurn, the ONE structured-output mechanics helper (D79). Pins: valid first try never retries;
// invalid → ONE bounded retry with the zod issues appended → invalid again → throws; fence-wrapped / prose-
// padded JSON extracts (the retired json-extract cases, now fixtures); a valid retry returns the typed payload.

import type { StructuredRetrySummary } from "@orb/inference";
import { runStructuredTurn, StructuredOutputError } from "@orb/inference";
import { z } from "zod";
import { expect, test } from "../../support/fixtures.ts";

const SCHEMA = z.object({ genre: z.string(), score: z.number() });

/** A scripted `run` closure: returns the next reply per call, recording the `correction` it was handed. */
function scriptedRun(replies: readonly string[]): { run: (correction?: string) => Promise<string>; corrections: (string | undefined)[]; calls: () => number } {
  const corrections: (string | undefined)[] = [];
  let i = 0;
  return {
    run: (correction?: string): Promise<string> => {
      corrections.push(correction);
      const reply = replies[i] ?? "";
      i += 1;
      return Promise.resolve(reply);
    },
    corrections,
    calls: () => i,
  };
}

test("valid first try returns the typed payload and never retries", async () => {
  const script = scriptedRun([JSON.stringify({ genre: "fantasy", score: 3 })]);
  const payload = await runStructuredTurn({ payloadSchema: SCHEMA, run: script.run });
  expect(payload).toEqual({ genre: "fantasy", score: 3 });
  expect(script.calls()).toBe(1);
  expect(script.corrections).toEqual([undefined]); // first call carries no correction
});

test("invalid → ONE retry with the issues appended → valid → typed payload", async () => {
  const script = scriptedRun([
    JSON.stringify({ genre: "fantasy" }), // missing `score` → zod invalid
    JSON.stringify({ genre: "fantasy", score: 5 }),
  ]);
  const payload = await runStructuredTurn({ payloadSchema: SCHEMA, run: script.run });
  expect(payload).toEqual({ genre: "fantasy", score: 5 });
  expect(script.calls()).toBe(2);
  // The retry received the zod issue summary (the `score` path is named so the model can fix it).
  expect(script.corrections[0]).toBeUndefined();
  expect(script.corrections[1]).toContain("score");
});

test("invalid → retry still invalid → throws StructuredOutputError (never a partial payload)", async () => {
  const script = scriptedRun([JSON.stringify({ genre: "fantasy" }), JSON.stringify({ nope: true })]);
  await expect(runStructuredTurn({ payloadSchema: SCHEMA, run: script.run })).rejects.toBeInstanceOf(StructuredOutputError);
  expect(script.calls()).toBe(2); // exactly ONE retry, no more
});

test("extracts JSON wrapped in a markdown fence (structured-output backend that also narrates)", async () => {
  const fenced = '```json\n{"genre":"horror","score":1}\n```';
  const payload = await runStructuredTurn({ payloadSchema: SCHEMA, run: scriptedRun([fenced]).run });
  expect(payload).toEqual({ genre: "horror", score: 1 });
});

test("extracts JSON padded with prose / a <think> preamble", async () => {
  const padded = '<think>weighing the options</think> Here you go: {"genre":"comedy","score":9} — hope that helps!';
  const payload = await runStructuredTurn({ payloadSchema: SCHEMA, run: scriptedRun([padded]).run });
  expect(payload).toEqual({ genre: "comedy", score: 9 });
});

test("a `}` inside a string literal never closes the scan early", async () => {
  const tricky = JSON.stringify({ genre: "a } brace in text", score: 2 });
  const payload = await runStructuredTurn({ payloadSchema: SCHEMA, run: scriptedRun([tricky]).run });
  expect(payload).toEqual({ genre: "a } brace in text", score: 2 });
});

test("no JSON object at all → retry → still none → throws", async () => {
  const script = scriptedRun(["absolutely no object here", "still just prose"]);
  await expect(runStructuredTurn({ payloadSchema: SCHEMA, run: script.run })).rejects.toBeInstanceOf(StructuredOutputError);
  expect(script.calls()).toBe(2);
});

// ── `onRetry` — the injected observability seam (this module is BELOW foundation) ─────────────────────
// The retry was unobservable by construction: a lane that silently spends TWO provider calls instead of one
// looked identical to one that spent one. The seam reports the failure as METADATA — the schema paths and a
// count — never the zod MESSAGES, which quote the model's own output (RP content) and are prompt material
// only. The caller (`foundation/observability/structured-retry.ts`) turns it into a span event.

test("onRetry fires EXACTLY once, before the retry, carrying the failing schema paths", async () => {
  const script = scriptedRun([JSON.stringify({ genre: "fantasy" }), JSON.stringify({ genre: "fantasy", score: 5 })]);
  const seen: StructuredRetrySummary[] = [];
  await runStructuredTurn({ payloadSchema: SCHEMA, run: script.run, onRetry: (summary) => seen.push(summary) });
  expect(seen).toEqual([{ issueCount: 1, paths: ["score"] }]);
});

test("onRetry never fires when the first try validates", async () => {
  const script = scriptedRun([JSON.stringify({ genre: "fantasy", score: 3 })]);
  const seen: StructuredRetrySummary[] = [];
  await runStructuredTurn({ payloadSchema: SCHEMA, run: script.run, onRetry: (summary) => seen.push(summary) });
  expect(seen).toEqual([]);
});

test("onRetry fires ONCE even when the retry also fails — the final failure is the throw, not a second event", async () => {
  const script = scriptedRun([JSON.stringify({ genre: "fantasy" }), JSON.stringify({ nope: true })]);
  const seen: StructuredRetrySummary[] = [];
  await expect(runStructuredTurn({ payloadSchema: SCHEMA, run: script.run, onRetry: (s) => seen.push(s) })).rejects.toBeInstanceOf(StructuredOutputError);
  expect(seen).toHaveLength(1);
});

test("a reply with no JSON at all reports as one ROOT-path issue (the summary shape never varies)", async () => {
  const script = scriptedRun(["absolutely no object here", JSON.stringify({ genre: "noir", score: 1 })]);
  const seen: StructuredRetrySummary[] = [];
  await runStructuredTurn({ payloadSchema: SCHEMA, run: script.run, onRetry: (summary) => seen.push(summary) });
  expect(seen).toEqual([{ issueCount: 1, paths: [""] }]);
});
