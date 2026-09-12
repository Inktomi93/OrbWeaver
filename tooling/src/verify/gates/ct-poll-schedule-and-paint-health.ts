// Policy: ct-poll-schedule-and-paint-health — the founding-file blindness tripwire for the sibling
// `ct-poll-schedule-and-paint` occurrence policy (family `ct-poll-schedule-and-paint`; the family/authority
// receipts are recorded there). tests/client/lib/motion-stats.ct.tsx is the ONE file every matcher in that
// gate is derived from — every legal shape (a freshly-minted schedule, a derived paint barrier, an
// untrusted evaluate-driven trigger, a layout-shift-derived poll) must still be exercised there, or the
// occurrence gate is policing a vocabulary nothing on the tree demonstrates any more.
//
// `execution: "entire-population"` is deliberate: a narrowed/changed-files run must DEFER this policy
// rather than silently skip it, because "does the founding file still exercise every shape" is a
// whole-population question the occurrence gate's per-file dispatch structurally cannot answer.
//
// A RENAMED or DELETED anchor is no longer a gate-level finding — `population.named` resolving to zero
// paths from a nonempty `@tests` candidate set is a TOOL ERROR at population resolution itself (`resolvePopulation`
// throws "admitted zero paths"), which is a LOUDER blindness signal than the legacy hand-rolled ANCHOR_GONE
// finding it replaces: the run cannot even start, rather than reporting one gate-owned line. This policy's
// mustFlag/mustPass rows therefore prove content-level rot (the file still exists but stops exercising one
// of the four shapes), which is the part the population algebra cannot see for us.
//
// FAMILY: `ct-poll-schedule-and-paint`, shared with the occurrence sibling this was split out of. The
// shared computation is `barrierNames` / `isFreshSchedule` / `isMotionPoll` / `isUntrustedTrigger` /
// `pollOptionsArg`, and TODAY those are imported FROM THE SIBLING GATE MODULE — the exact shape the owner
// banned on 2026-09-12 (#2091/#2096: a gate module never imports another gate module; a shared predicate
// moves to `lib/<family>.ts`), and the shape `contract-derives-not-respells-health` was already repaired
// for. Recorded as what it is rather than restated as a `lib/` reader it is not: the move is code work,
// outside a header lane, and a FAMILY line naming a `lib/` module here would be a citation to nowhere.
// POPULATION PORT: BYTE-IDENTICAL, inherited — no legacy descriptor of its own, so the port is the
// parent's: legacy `scanRoot: (p) => p.startsWith("tests/")` is exactly `@tests`, which this policy then
// narrows to the one founding file.
// Re-derived 2026-09-12 by applying the legacy predicate and this declaration to the SAME 7,537-path
// compiler-source candidate set: 2,928 (the parent's port) admitted on both sides, symmetric difference ZERO in both directions.
// LEGACY SHA: (47c35b61c^) — the parent of the commit that split this policy out.
import type { CallExpression, SourceFile, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { barrierNames, isFreshSchedule, isMotionPoll, isUntrustedTrigger, MOTION_READS, PAINT_API, pollOptionsArg } from "../lib/ct-poll-schedule-and-paint.ts";

const ANCHOR_UNDER = "tests/client/lib/**";
const ANCHOR_NAME = "motion-stats.ct.tsx";

interface AnchorFacts {
  freshSchedules: number;
  barriers: number;
  untrustedTriggers: number;
  motionPolls: number;
}

const ANCHOR_BLIND: Readonly<Record<keyof AnchorFacts, string>> = {
  freshSchedules: "no freshly-minted poll schedule (ARM A's legal shape)",
  barriers: "no presented-paint barrier helper (ARM B's derived vocabulary)",
  untrustedTriggers: "no evaluate-driven untrusted trigger (ARM B's subject)",
  motionPolls: "no layout-shift-derived poll (ARM B's evidence read)",
};

function newFacts(): AnchorFacts {
  return { freshSchedules: 0, barriers: 0, untrustedTriggers: 0, motionPolls: 0 };
}

function collectFacts(sf: SourceFile, identifiers: readonly TsNode[], calls: readonly CallExpression[]): AnchorFacts {
  const facts = newFacts();
  facts.barriers = barrierNames(sf, identifiers).size;
  for (const call of calls) {
    const options = pollOptionsArg(call);
    facts.freshSchedules += isFreshSchedule(options) ? 1 : 0;
    facts.untrustedTriggers += isUntrustedTrigger(call, calls) ? 1 : 0;
    facts.motionPolls += isMotionPoll(call, identifiers) ? 1 : 0;
  }
  return facts;
}

function reportBlindArms(path: string, facts: AnchorFacts, report: (message: string) => void): void {
  for (const [key, what] of Object.entries(ANCHOR_BLIND) as [keyof AnchorFacts, string][]) {
    if (facts[key] === 0) {
      report(
        `${path} exercises ${what} any more — the matcher in tooling/src/verify/gates/ct-poll-schedule-and-paint.ts rotted against the file it was derived from. Re-derive the arm, do not delete it.`,
      );
    }
  }
}

export const gate = defineGate({
  id: "ct-poll-schedule-and-paint-health",
  family: "ct-poll-schedule-and-paint",
  authority: "hard",
  severity: "error",
  population: { in: ["@tests"], under: [ANCHOR_UNDER], named: [ANCHOR_NAME] },
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message:
    "the founding CT for the ct-poll-schedule-and-paint laws no longer exercises one of the shapes its matchers are derived from — re-derive the arm in tooling/src/verify/gates/ct-poll-schedule-and-paint.ts, do not delete it.",
  create: (ctx) => {
    // Collected once per file by the shared kind-indexed walk (never a private `SourceFile#getDescendants*`
    // walk), keyed by SourceFile so a run touching more than one candidate (never expected, given the
    // population, but never assumed) still judges each file's own occurrences.
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
          const path = ctx.relativePath(sf);
          const facts = collectFacts(sf, identifiersBySource.get(sf) ?? [], callsBySource.get(sf) ?? []);
          reportBlindArms(path, facts, (message) => ctx.report.file(path, { line: 1, message }));
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        [`tests/client/lib/${ANCHOR_NAME}`]:
          'import { expect, test } from "@playwright/experimental-ct-react";\n' +
          `function settle(page) { return page.evaluate(() => ${PAINT_API}(() => {})); }\n` +
          'test("g", async ({ page }) => {\n' +
          '  const button = page.getByRole("button");\n' +
          "  await settle(page);\n" +
          "  await button.evaluate((el) => el.click());\n" +
          `  await expect.poll(async () => (await read(page)).${[...MOTION_READS][0]}, POLL_OPTS).toBeGreaterThan(0);\n` +
          "});\n",
      },
      expect: { count: 1, messageIncludes: "no freshly-minted poll schedule" },
      why: "the founding file rotted to lose ARM A's legal shape entirely — no inline/factory schedule anywhere, only an imported/shared options identifier the occurrence reader cannot resolve",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [`tests/client/lib/${ANCHOR_NAME}`]:
          'import { expect, test } from "@playwright/experimental-ct-react";\n' +
          `function settlePaint(page) { return page.evaluate(() => ${PAINT_API}(() => {})); }\n` +
          'test("g", async ({ page }) => {\n' +
          '  const button = page.getByRole("button");\n' +
          "  await settlePaint(page);\n" +
          "  await button.evaluate((el) => el.click());\n" +
          `  await expect.poll(async () => (await read(page)).${[...MOTION_READS][0]}, { intervals: [50, 100, 200, 250] }).toBeGreaterThan(0);\n` +
          "});\n",
      },
      why: "the founding file still exercises all four shapes: a fresh inline schedule, a derived paint barrier, an untrusted evaluate trigger, and a layout-shift-derived poll — the tripwire stays quiet",
    },
  ],
});
