// Gate: ct-poll-schedule-and-paint (issue #121) — the two Playwright poll idioms that lose their evidence
// SILENTLY. ARM A: an `intervals` schedule reached by IDENTIFIER (shared/spread/shorthand) — the poll loop
// MUTATES the array it is handed, so the second poll runs the drained default. ARM B: an
// `evaluate(el => el.click())` trigger fired with no presented-paint barrier before it while a later poll
// reads layout-shift-derived motion — a shift entry needs a PAINTED "before", so the poll times out on
// evidence that never existed. Pure AST — comment-SAFE by construction. DECLARED LIMITS: an options
// identifier declared outside module scope or imported is unresolvable, and a computed `intervals` value is
// invisible — each owns a mustPass row.
//
// FAMILY DECISION (gate-runtime-standardization.md): this module SPLITS into two policies sharing one
// family, `ct-poll-schedule-and-paint`. Both consume the EXACT SAME computation — `barrierNames`,
// `isFreshSchedule`/`isMotionPoll`/`isUntrustedTrigger`, and the founding-file counters below — so they are
// a real shared-reader family, not a filename-prefix coincidence:
//   - `ct-poll-schedule-and-paint` (this file): the PER-OCCURRENCE policy (ARM A + ARM B). Neither
//     arm ever carried an escape door in the legacy descriptor (a shared schedule or an unbarriered trigger
//     is always a real defect), so authority stays `hard` — no suppression door existed before and none is
//     introduced now. (The word `ordinary` stood in that first sentence as ENGLISH until #2092. In this
//     corpus `ordinary` and `hard` are CONTRACT VALUES — `ordinary` names a waiver door — and this is a file
//     lanes are pointed at to copy, so the sentence read as a policy declaring an authority two lines before
//     declaring the opposite one.)
//   - `ct-poll-schedule-and-paint-health` (sibling file): the FORMER "ARM C" whole-corpus blindness
//     tripwire — the founding CT file (tests/client/lib/motion-stats.ct.tsx) rotting against the matchers
//     here. It is a whole-population self-health question the per-file occurrence policy's dispatch cannot
//     answer, and it differs on `execution` (`entire-population` vs `selected-files`) — the split the design
//     doc requires whenever an old multi-arm module's arms differ in more than message text.
//
// The legacy module carried `begin`/`finalize` and a top-level mutable `anchorFacts` object — banned under
// the final contract ("`create` runs once per invocation and closes over mutable state... module-global
// accumulators... disappear"). The health counters now live in the sibling file's own `create` closure.
//
// POPULATION PORT: BYTE-IDENTICAL. Legacy `scanRoot: (p) => p.startsWith("tests/")` is exactly
// `{ in: ["@tests"] }`.
// Re-derived 2026-09-12 by applying the legacy predicate and this declaration to the SAME 7,537-path
// compiler-source candidate set: 2,928 admitted on both sides, symmetric difference ZERO in both directions.
// LEGACY SHA: (47c35b61c^) — the conversion's parent.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `ct-poll-schedule-and-paint` descriptor at bd56189bacbd0b4c79103fc10fe94d5499d9f3fd, the parent of the conversion
// `47c35b61c` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,360 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 2,869 and final `population` admits 2,869. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `tests/client/a11y/__cbbhr_in__ct-stories.tsx` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { CallExpression, SourceFile, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import {
  ancestorContains,
  barrierNames,
  EVALUATE,
  isBarrierCall,
  isMotionPoll,
  isUntrustedTrigger,
  pollOptionsArg,
  reportSharedSchedule,
} from "../lib/ct-poll-schedule-and-paint.ts";

const TEST_CALLEE = "test";
const MESSAGE =
  "a Playwright poll idiom that loses its evidence silently: an `intervals` schedule reached by identifier " +
  "(Playwright's pollAgainstDeadline pops/shifts the caller's array, so every later poll falls back to the " +
  "1000ms default), or an `evaluate(el => el.click())` trigger with no presented-paint barrier before it " +
  "while a later poll reads layout-shift-derived motion (a shift entry exists only relative to a PAINTED " +
  "previous position, so the poll runs out its budget on evidence that was never produced). Both laws are " +
  "written in tests/client/lib/motion-stats.ct.tsx.";

const FIX =
  "mint the schedule fresh per call (`intervals: [50, 100, 200, 250]` inline, or a factory call like " +
  "`evidencePoll()`), and await two presented animation frames (`settlePaint`) before an untrusted " +
  "evaluate-click whose evidence is a layout shift — tests/client/lib/motion-stats.ct.tsx.";

/** This node's own `test(…)` body, if it IS a test call. */
function testBodyOf(node: TsNode): TsNode | undefined {
  if (!(Node.isCallExpression(node) && node.getExpression().getText().startsWith(TEST_CALLEE))) {
    return;
  }
  const last = node.getArguments().at(-1);
  return last !== undefined && (Node.isArrowFunction(last) || Node.isFunctionExpression(last)) ? last : undefined;
}

/** The body of the `test(…)` call this node sits in — barriers only count within the SAME test. */
function enclosingTestBody(node: TsNode): TsNode | undefined {
  return node
    .getAncestors()
    .map((ancestor) => testBodyOf(ancestor))
    .find((body) => body !== undefined);
}

interface FileFacts {
  readonly sf: SourceFile;
  readonly identifiers: readonly TsNode[];
  readonly calls: readonly CallExpression[];
}

/** ARM B — an untrusted trigger with motion evidence polled after it and no barrier before it. */
function reportUnbarrieredTrigger(trigger: CallExpression, facts: FileFacts, report: (node: TsNode, token: string) => void): void {
  const body = enclosingTestBody(trigger);
  if (body === undefined) {
    return;
  }
  const inBody = facts.calls.filter((c) => ancestorContains(body, c));
  const at = trigger.getStart();
  const names = barrierNames(facts.sf, facts.identifiers);
  if (inBody.some((c) => c.getStart() < at && isBarrierCall(c, names, facts.identifiers))) {
    return;
  }
  if (inBody.some((c) => c.getStart() > at && isMotionPoll(c, facts.identifiers))) {
    report(trigger, EVALUATE);
  }
}

export const gate = defineGate({
  id: "ct-poll-schedule-and-paint",
  family: "ct-poll-schedule-and-paint",
  authority: "hard",
  severity: "error",
  population: { in: ["@tests"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    // Collected once per file by the shared kind-indexed walk, then judged in `evaluate` — the "is this
    // occurrence inside that scope" questions (a barrier before a trigger, a motion read in the same
    // statement) are answered by ANCESTRY over this list, never by a private descendant walk down from a
    // scope node.
    const identifiersBySource = new WeakMap<SourceFile, TsNode[]>();
    const callsBySource = new WeakMap<SourceFile, CallExpression[]>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.Identifier],
          visit: (node, sf) => {
            const list = identifiersBySource.get(sf) ?? [];
            list.push(node);
            identifiersBySource.set(sf, list);
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sf) => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const list = callsBySource.get(sf) ?? [];
            list.push(node);
            callsBySource.set(sf, list);
          },
        },
      ],
      evaluate: () => {
        for (const sf of ctx.files) {
          const identifiers = identifiersBySource.get(sf) ?? [];
          const calls = callsBySource.get(sf) ?? [];
          const facts: FileFacts = { sf, identifiers, calls };
          for (const call of calls) {
            const options = pollOptionsArg(call);
            if (options !== undefined) {
              reportSharedSchedule(options, sf, (target, token) => ctx.report.node(target, { token, offset: 0 }));
            }
            if (isUntrustedTrigger(call, calls)) {
              reportUnbarrieredTrigger(call, facts, (target, token) =>
                ctx.report.node(target, { token, offset: Math.max(target.getText().indexOf(token), 0) }),
              );
            }
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        "tests/client/features/chat/components/shared-array.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\nconst SCHEDULE = [50, 100, 250];\ntest("g", async () => {\n  await expect.poll(() => 1, { intervals: SCHEDULE, timeout: 10_000 }).toBe(1);\n});\n',
      },
      expect: { count: 1, token: "SCHEDULE" },
      why: "the founding ARM A shape (#121): a module-scope array handed to `intervals` — pollAgainstDeadline pops/shifts it, so the SECOND poll in the file runs the drained 1000ms default. Deeply-nested path",
    },
    {
      mode: "source",
      files: {
        "tests/x.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\nconst POLL_OPTS = { intervals: [50, 100], timeout: 10_000 };\ntest("g", async () => {\n  await expect.poll(() => 1, POLL_OPTS).toBe(1);\n});\n',
      },
      expect: { count: 1, token: "POLL_OPTS" },
      why: "the WHOLE options object shared by identifier — the same drained array one indirection out. Shallow path, so the reader is proven not to depend on directory depth",
    },
    {
      mode: "source",
      files: {
        "tests/client/lib/spread.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\nconst BASE = { intervals: [50, 100], timeout: 10_000 };\ntest("g", async () => {\n  await expect.poll(() => 1, { ...BASE, timeout: 20_000 }).toBe(1);\n});\n',
      },
      expect: { count: 1, token: "BASE" },
      why: "the SPREAD spelling — a spread copies the object but not the array inside it, so the shared reference survives; a literal-shape reader that only checked `intervals:` would ship a false clean",
    },
    {
      mode: "source",
      files: {
        "tests/client/lib/shorthand.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\nconst intervals = [50, 100];\ntest("g", async () => {\n  await expect.poll(() => 1, { intervals, timeout: 10_000 }).toBe(1);\n});\n',
      },
      expect: { count: 1, token: "intervals" },
      why: "the SHORTHAND spelling `{ intervals }` — the third syntactic form of the same shared reference",
    },
    {
      mode: "source",
      files: {
        "tests/client/lib/topass.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\nconst SCHEDULE = [50, 100];\ntest("g", async () => {\n  await expect(() => {}).toPass({ intervals: SCHEDULE });\n});\n',
      },
      expect: { count: 1, token: "SCHEDULE" },
      why: "`toPass` is the OTHER door into the same pollAgainstDeadline loop — an expect.poll-only reader would leave half the API unguarded",
    },
    {
      mode: "source",
      files: {
        "tests/client/features/motion/components/unbarriered.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("g", async ({ page }) => {\n  const button = page.getByRole("button");\n  await button.evaluate((el) => (el as HTMLButtonElement).click());\n  await expect.poll(async () => (await read(page)).observedCls, { intervals: [50], timeout: 10_000 }).toBeGreaterThan(0);\n});\n',
      },
      expect: { count: 1, token: "evaluate" },
      why: "the founding ARM B shape (#121): an untrusted evaluate-click with no painted `before`, then a poll on `observedCls`. Measured control in this exact chromium: 0 layout-shift entries without the barrier, 1 with it — the poll can only run out its budget",
    },
    {
      mode: "source",
      files: {
        "tests/client/features/motion/components/late-barrier.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\nfunction settle(page) {\n  return page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));\n}\ntest("g", async ({ page }) => {\n  const button = page.getByRole("button");\n  await button.evaluate((el) => (el as HTMLButtonElement).click());\n  await settle(page);\n  await expect.poll(async () => (await read(page)).cls, { intervals: [50] }).toBeGreaterThan(0);\n});\n',
      },
      expect: { count: 1, token: "evaluate" },
      why: "ORDER is the whole rule: a barrier that runs AFTER the trigger cannot resurrect an entry the browser never emitted. A presence-only reader would call this file conformant",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "tests/client/lib/inline.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("g", async () => {\n  await expect.poll(() => 1, { intervals: [50, 100, 200, 250], timeout: 10_000 }).toBe(1);\n});\n',
      },
      why: "the sanctioned ARM A shape: an INLINE array literal is a new array per evaluation, so the mutation has nothing to leak into",
    },
    {
      mode: "source",
      files: {
        "tests/client/lib/factory.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\nfunction evidencePoll() {\n  return { intervals: [50, 100, 200, 250], timeout: 10_000 };\n}\ntest("g", async () => {\n  await expect.poll(() => 1, evidencePoll()).toBe(1);\n});\n',
      },
      why: "the other sanctioned shape: a CALL mints a fresh object (and a fresh array) per poll — the `evidencePoll()` idiom the founding file uses",
    },
    {
      mode: "source",
      files: {
        "tests/client/lib/imported.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\nimport { POLL_OPTS } from "./support.ts";\ntest("g", async () => {\n  await expect.poll(() => 1, POLL_OPTS).toBe(1);\n});\n',
      },
      why: "DECLARED LIMIT: an options identifier with no module-scope declaration IN THIS FILE is unresolvable, so it is not judged — an imported factory result and an imported shared object are indistinguishable here without a checker walk",
    },
    {
      mode: "source",
      files: {
        "tests/client/lib/computed.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\nconst FAST = [50, 100];\ntest("g", async () => {\n  await expect.poll(() => 1, { intervals: FAST.slice(), timeout: 10_000 }).toBe(1);\n});\n',
      },
      why: "DECLARED LIMIT: a COMPUTED intervals value is invisible to a literal-shape reader. `.slice()` happens to be the correct fix, but any expression passes here — the arm judges identifiers, not aliasing",
    },
    {
      mode: "source",
      files: {
        "tests/client/features/motion/components/barriered.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\nfunction settle(page) {\n  return page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));\n}\ntest("g", async ({ page }) => {\n  await settle(page);\n  const button = page.getByRole("button");\n  await button.evaluate((el) => (el as HTMLButtonElement).click());\n  await expect.poll(async () => (await read(page)).observedCls, { intervals: [50] }).toBeGreaterThan(0);\n});\n',
      },
      why: "the sanctioned ARM B shape, with the barrier DERIVED from its body (a helper reaching requestAnimationFrame) rather than from the name `settlePaint` — a rename must not disarm the gate",
    },
    {
      mode: "source",
      files: {
        "tests/client/features/motion/components/trusted-click.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("g", async ({ page }) => {\n  await page.getByRole("button").click();\n  await expect.poll(async () => (await read(page)).cls, { intervals: [50] }).toBeGreaterThan(0);\n});\n',
      },
      why: "a REAL `locator.click()` already waits for two stable animation frames as part of its actionability check — the barrier is implicit, and demanding an explicit one would be noise",
    },
    {
      mode: "source",
      files: {
        "tests/client/features/motion/components/non-motion-poll.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("g", async ({ page }) => {\n  const lines: string[] = [];\n  await page.getByRole("button").evaluate((el) => (el as HTMLButtonElement).click());\n  await expect.poll(() => lines.length, { intervals: [50] }).toBeGreaterThan(0);\n});\n',
      },
      why: "an untrusted trigger whose evidence is a CONSOLE line, not a layout shift — nothing about it needs a painted previous position, so ARM B deliberately stays out of it",
    },
    {
      mode: "source",
      files: {
        "tests/client/features/motion/components/focus-trigger.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("g", async ({ page }) => {\n  await page.getByRole("button").evaluate((el) => (el as HTMLButtonElement).focus());\n  await expect.poll(async () => (await read(page)).observedCls, { intervals: [50] }).toBeGreaterThan(0);\n});\n',
      },
      why: "THE TRIGGER VOCABULARY, pinned (#2092): `UNTRUSTED_TRIGGERS` is a CLOSED set — `click` and `dispatchEvent`, the two inner calls whose real-locator twins carry an actionability wait this in-page `evaluate` skips. An in-evaluate `el.focus()` is not one of them: it dispatches no pointer event, so there is no skipped stable-frame wait to replace and demanding a barrier would be noise. Until this row existed the set was unenforced — cutting `UNTRUSTED_TRIGGERS.has(target.getName())` open (every inner member call is an untrusted trigger) came back CLEAN, because no row put a non-listed inner call in front of a motion poll. It reds now, measured 2026-09-12",
    },
  ],
});
