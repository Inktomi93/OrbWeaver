// Mirror test for @orb/server/kit/regex — the node:vm ReDoS watchdog (D53 step 1). This is a security
// boundary, so the suite is adversarial: the load-bearing case is that a catastrophic-backtracking
// pattern (the canonical `(a+)+$` the kit's pre-compile heuristic explicitly lets through) is
// INTERRUPTED and THROWS within the per-call budget — it does not hang the event loop and does not
// silently return the unmodified text. The remaining cases prove the happy path still works across the
// vm boundary (captures, named groups, whole-match), that a throwing replacer surfaces, and that the
// budget is PER-CALL (one runaway doesn't poison the next).
//
// "Doesn't hang" is proven WITHOUT reading a clock (the test-determinism gate bans Date.now/
// performance.now): the watchdog throws synchronously at ~50ms, so the assertion resolves near-instantly
// under the generous per-test deadline; a guard that failed to interrupt would never make the throw
// assertion pass.

import type { RegexReplacer } from "@orb/kit/regex";
import { matchEntryKeys } from "@orb/kit/world-info";
import { createRegexApplyReplace, createRegexTest, REGEX_APPLY_TIMEOUT_MS } from "@orb/server/kit/regex";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

// A generous deadline: the watchdog fires at REGEX_APPLY_TIMEOUT_MS (50ms) so the throwing assertions
// resolve in well under this. If the guard were broken, the 60-'a' backtrack (~2^60 steps) would never
// complete and this deadline would fail the run instead of letting it pass falsely.
const TEST_DEADLINE_MS = 2000;
const applyReplace = createRegexApplyReplace();
const testRegex = createRegexTest();

// The canonical ReDoS: nested quantifier + a long subject that can never satisfy the trailing `$`. One
// quantifier-stack, so the kit heuristic passes it — only the runtime watchdog catches this.
const EVIL_REGEX = /(a+)+$/u;
const EVIL_SUBJECT = `${"a".repeat(60)}!`;

const SWAP_WORDS = /(\w+)\s(\w+)/gu;
const ISO_DATE = /(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})/gu;
const DIGIT = /\d/gu;
const NO_MATCH = /xyz/gu;
const MATCH_LITERAL = /match/gu;
const SINGLE_A = /a/gu;
const O_GLOBAL = /o/gu;
const TIMED_OUT = /timed out/iu;
const REPLACER_BOOM = /replacer boom/u;

const noopReplacer: RegexReplacer = (match) => `[${String(match)}]`;

// Benign key patterns for the `.test` watchdog's happy-path arms.
const DRAGON = /dragon/iu;
const OK = /ok/u;

describe("createRegexApplyReplace — ReDoS watchdog", () => {
  test(
    "catastrophic backtracking is interrupted and THROWS within the budget (does not hang)",
    () => {
      expect(() => applyReplace(EVIL_SUBJECT, EVIL_REGEX, noopReplacer)).toThrow(TIMED_OUT);
    },
    TEST_DEADLINE_MS,
  );

  test(
    "the budget is PER-CALL: a runaway call does not consume the next call's budget",
    () => {
      // First runaway throws…
      expect(() => applyReplace(EVIL_SUBJECT, EVIL_REGEX, noopReplacer)).toThrow(TIMED_OUT);
      // …a SECOND runaway still gets its own full budget and also throws (not a cumulative/shared timer)…
      expect(() => applyReplace(EVIL_SUBJECT, EVIL_REGEX, noopReplacer)).toThrow(TIMED_OUT);
      // …and a normal call afterwards completes correctly on a fresh budget.
      const out = applyReplace("ab", SINGLE_A, (m) => String(m).toUpperCase());
      expect(out).toBe("Ab");
    },
    TEST_DEADLINE_MS,
  );
});

describe("createRegexApplyReplace — correctness across the vm boundary", () => {
  test("positional captures pass through and reorder correctly", () => {
    const out = applyReplace("hello world", SWAP_WORDS, (_m, p1, p2) => `${String(p2)} ${String(p1)}`);
    expect(out).toBe("world hello");
  });

  test("named groups reach the replacer's trailing groups object", () => {
    const replacer: RegexReplacer = (...args) => {
      const groups = args.at(-1) as Record<string, string>;
      return `${groups["d"]}/${groups["m"]}/${groups["y"]}`;
    };
    const out = applyReplace("2026-06-29", ISO_DATE, replacer);
    expect(out).toBe("29/06/2026");
  });

  test("the whole-match (arg 0) is available to the replacer", () => {
    const out = applyReplace("a1b2c3", DIGIT, (m) => `<${String(m)}>`);
    expect(out).toBe("a<1>b<2>c<3>");
  });

  test("no match → text returned unchanged", () => {
    const out = applyReplace("plain text", NO_MATCH, () => "REPLACED");
    expect(out).toBe("plain text");
  });
});

describe("createRegexApplyReplace — failure surfacing", () => {
  test("an error thrown by the replacer is re-thrown (routed to onScriptFailure upstream)", () => {
    const boom: RegexReplacer = () => {
      throw new Error("replacer boom");
    };
    expect(() => applyReplace("match-me", MATCH_LITERAL, boom)).toThrow(REPLACER_BOOM);
  });
});

describe("createRegexApplyReplace — factory budget override", () => {
  test("a custom budget still applies the same find/replace correctly", () => {
    const apply = createRegexApplyReplace(REGEX_APPLY_TIMEOUT_MS * 2);
    expect(apply("foo bar", O_GLOBAL, () => "0")).toBe("f00 bar");
  });

  test(
    "a tiny custom budget still interrupts the catastrophic pattern",
    () => {
      const apply = createRegexApplyReplace(20);
      expect(() => apply(EVIL_SUBJECT, EVIL_REGEX, noopReplacer)).toThrow(TIMED_OUT);
    },
    TEST_DEADLINE_MS,
  );
});

// #710 — the world-info regex-KEY `.test` watchdog. Same node:vm interrupt, `.test` instead of `.replace`:
// a `use_regex` entry's user-authored key is `.test`ed against the chat-history haystack every turn, so a
// catastrophic key that slips past the kit's pre-compile heuristic (the canonical `(a+)+$` — ONE
// quantifier-stack, so the heuristic passes it) must be interrupted rather than hang the event loop.
describe("createRegexTest — world-info key ReDoS watchdog", () => {
  test(
    "catastrophic backtracking is interrupted and THROWS within the budget (does not hang)",
    () => {
      expect(() => testRegex(EVIL_REGEX, EVIL_SUBJECT)).toThrow(TIMED_OUT);
    },
    TEST_DEADLINE_MS,
  );

  test("a benign key `.test` returns the correct boolean across the vm boundary", () => {
    expect(testRegex(DRAGON, "two dragons appear")).toBe(true);
    expect(testRegex(DRAGON, "no monsters here")).toBe(false);
  });

  test(
    "the budget is PER-CALL: a runaway does not consume the next call's budget",
    () => {
      expect(() => testRegex(EVIL_REGEX, EVIL_SUBJECT)).toThrow(TIMED_OUT);
      expect(testRegex(OK, "ok then")).toBe(true);
    },
    TEST_DEADLINE_MS,
  );
});

// The END-TO-END fix: the kit matcher `matchEntryKeys` running a catastrophic user key under the REAL server
// watchdog. On the pre-#710 source the matcher `.test`ed the key with a bare native `.test` and this build
// HUNG the turn for every user on the process; with the injected `testRegex` seam the key is interrupted,
// treated as a non-match, and reported — the turn survives. RED (hang → deadline) on old source, GREEN now.
describe("matchEntryKeys under the injected watchdog (#710 end-to-end)", () => {
  test(
    "a catastrophic use_regex key is capped + reported, and a benign sibling key still fires",
    () => {
      const failures: { key: string; reason: string }[] = [];
      const bounded = createRegexTest(50);
      const hits = matchEntryKeys(
        // 40 'a's + a non-matching tail: native `.test` of `(a+)+$` here is ~2^40 steps — it never returns.
        ["(a+)+$", "dragon"],
        `${"a".repeat(40)}! a dragon roars`,
        { keyMode: "regex", testRegex: bounded, onKeyCompileFailure: (key, reason) => failures.push({ key, reason }) },
      );
      // The evil key did NOT fire (interrupted → non-match); the benign one did. The turn was never hung.
      expect(hits).toEqual(["dragon"]);
      expect(failures).toHaveLength(1);
      const failure = failures[0];
      expect(failure?.key).toBe("(a+)+$");
      expect(TIMED_OUT.test(failure ? failure.reason : "")).toBe(true);
    },
    TEST_DEADLINE_MS,
  );
});
