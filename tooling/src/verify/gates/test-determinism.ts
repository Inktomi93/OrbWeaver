// Gate: test-determinism (Spine-Testing.md §3, Core-0-Architecture-and-Structure.md §7) — no ambient
// clock/random/unseeded id under tests/. Tests inject the frozen clock + seeded ids (tests/support)
// through the same composition seam production uses; the real clock/Math.random makes ordering assertions
// flaky. COMMENTS ARE BLANKED before the line scan (issue #132) — a comment EXPLAINING a determinism fix
// names the banned call, and reading prose as code cost two CTs a reworded comment. DECLARED LIMIT: string
// literals still scan (a fixture that spells the call is code the test could evaluate). Exempts support/ +
// e2e/ via scanRoot, so a predicate that stops matching REDs on the zero-scan alarm instead of passing.
// PER-SITE ESCAPE (#828): the shared `@orb-gate-ignore test-determinism: <reason>` marker on the line
// IMMEDIATELY above the call — for a test whose SUBJECT is elapsed real time. Two-sided via
// gate-ignore-inventory; comments are blanked, so the marker line can never itself match.
// WIDENED SPELLINGS (#831): four real sites routed around the gate through spellings the old regex did
// not recognise — process.hrtime()/process.hrtime.bigint() (an ambient monotonic clock; one member match
// covers both call forms) and performance.timeOrigin (an ambient clock PROPERTY, not a call). All four
// now carry the #828 marker. DECLARED LIMIT, unchanged by #831: a guest-realm probe that reaches a stub
// via SUBSCRIPT/bracket access (`Date['now']()`, `performance['now']()`) still evades every regex in this
// file by construction — the probe never spells the dotted member the regex matches on. That is
// tests/server/infra/plugin-host/realm.test.ts's documented choice (its own header), not a gap this gate
// closes; a future "flag bracket access too" would need to special-case away from EVERY legitimate bracket
// property read, which is not this gate's job.

import type { GateDescriptor } from "../contract/gate.ts";
import { blankTsComments } from "../lib/comment-spans.ts";

const TESTS_ROOT = "tests/";
// A scan-SCOPE decision, NOT an exemption table (hence the name — `gate-modernization` reds an
// exemption-vocabulary collection with no stale arm, and rightly): support/ is the determinism seam ITSELF
// (it is where the frozen clock lives) and e2e/ is a real browser against a live clock. Neither is a
// sanctioned home for a violation; both are tiers the rule does not apply to.
const UNSCANNED_ROOTS: readonly string[] = [`${TESTS_ROOT}support/`, `${TESTS_ROOT}e2e/`];

const BANNED: readonly { readonly re: RegExp; readonly what: string }[] = [
  {
    re: /\bDate\.now\s*\(/u,
    what: "Date.now() — inject the frozen clock (tests/support/clock.ts)",
  },
  {
    re: /\bnew\s+Date\s*\(\s*\)/u,
    what: "new Date() with no args — ambient clock; use the injected clock",
  },
  { re: /\bMath\.random\s*\(/u, what: "Math.random() — nondeterministic; seed it or inject" },
  {
    re: /\.randomUUID\s*\(/u,
    what: "randomUUID() — unseeded id; use the seeded ids (tests/support/ids.ts)",
  },
  { re: /\bperformance\.now\s*\(/u, what: "performance.now() — ambient clock" },
  {
    re: /\bprocess\.hrtime\b/u,
    what: "process.hrtime()/process.hrtime.bigint() — ambient monotonic clock; mark it if the test's SUBJECT is elapsed real time (#828)",
  },
  {
    re: /\bperformance\.timeOrigin\b/u,
    what: "performance.timeOrigin — ambient clock property",
  },
];

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

export const gate: GateDescriptor = {
  name: "test-determinism",
  docRow: "core/Spine-Testing.md §3 (core/Core-0-Architecture-and-Structure.md §7)",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "ambient nondeterminism in a test (Date.now/new Date()/Math.random/randomUUID/performance.now/process.hrtime/performance.timeOrigin) — inject the frozen clock + seeded ids via the fixture seam (core/Spine-Testing.md §3).",
  fix: "inject the frozen clock (tests/support/clock.ts) + seeded ids (tests/support/ids.ts) through the composition seam production uses.",
  scanRoot: (p) => p.startsWith(TESTS_ROOT) && !UNSCANNED_ROOTS.some((root) => p.startsWith(root)),
  visitFile: (sf, ctx) => {
    const raw = sf.getFullText();
    // CANDIDATE FENCE, and it is a MEMORY one, not a micro-optimisation: `blankTsComments` walks
    // `getDescendants()`, which materialises every wrapped node for the file, and doing that for all ~1,836
    // in-scope test files OOMs the whole `report.ts` run (measured: heap limit at 4GB, exit 134). It is
    // SOUND because blanking only ever REMOVES matches — a file whose RAW text matches no banned regex
    // cannot match after comments are blanked, so skipping it can hide nothing.
    if (!BANNED.some(({ re }) => re.test(raw))) {
      return;
    }
    const file = relPath(ctx.root, sf.getFilePath());
    // Comments are TRIVIA to a value scan. Blanking is length-preserving (comment-spans.ts), so `index + 1`
    // is still the real line — and the line stays the finding's ONLY position (no ts-morph position API, so
    // finding-overload-provenance is satisfied), which is also what makes the line-adjacent escape exact.
    for (const [index, line] of blankTsComments(sf).split("\n").entries()) {
      for (const { re, what } of BANNED) {
        if (re.test(line)) {
          ctx.report({
            file,
            line: index + 1,
            column: 0,
            message: `ambient nondeterminism: ${what} — inject the frozen clock / seeded ids via the fixture seam (Spine-Testing.md §3).`,
          });
        }
      }
    }
  },
  mustFlag: [
    {
      files: { "tests/server/x.test.ts": "export const t = Date.now();\n" },
      expect: { messageIncludes: "Date.now" },
      why: "an ambient Date.now() in a test — inject the frozen clock (§3)",
    },
    {
      files: { "tests/server/newdate.test.ts": "export const t = new Date();\n" },
      expect: { messageIncludes: "new Date()" },
      why: "a no-arg new Date() — its own BANNED entry, distinct message + regex arm",
    },
    {
      files: { "tests/server/rand.test.ts": "export const r = Math.random();\n" },
      expect: { messageIncludes: "Math.random" },
      why: "Math.random() — its own BANNED entry (member call biome can't ban)",
    },
    {
      files: { "tests/server/uuid.test.ts": "export const id = crypto.randomUUID();\n" },
      expect: { messageIncludes: "randomUUID" },
      why: "a .randomUUID() call — its own BANNED entry (unseeded id)",
    },
    {
      files: { "tests/server/perf.test.ts": "export const p = performance.now();\n" },
      expect: { messageIncludes: "performance.now" },
      why: "performance.now() — its own BANNED entry (ambient clock)",
    },
    {
      files: { "tests/server/parked.test.ts": "// export const t = Date.now();\nexport const t = Date.now();\n" },
      expect: { count: 1, line: 2 },
      why: "the LINE arithmetic after blanking: only the real call on line 2 fires, and it still reports line 2 (blanking preserves length + newlines, so a comment above a violation cannot shift it). The PARKED call on line 1 is not this gate's business — `commented-code` owns it and REDs it, receipted on a planted tests/ probe 2026-08-17",
    },
    {
      files: { "tests/server/literal.test.ts": 'export const src = "Date.now()";\n' },
      expect: { messageIncludes: "Date.now" },
      why: "DECLARED LIMIT (issue #132): only COMMENTS are blanked. A banned call spelled inside a STRING is code a test could evaluate, and two live suites (check-gates.int, gate-ignore-grammar.int) assemble their fixtures precisely to stay clean of this arm — keeping it proven stops a future 'blank strings too' from silently disarming them",
    },
    {
      files: { "tests/server/hrtime.test.ts": "export const t = process.hrtime();\n" },
      expect: { messageIncludes: "process.hrtime" },
      why: "#831 — process.hrtime() is an ambient monotonic clock the old regex did not recognise; four real sites routed around the gate through this spelling before the class was widened",
    },
    {
      files: { "tests/server/hrtime-bigint.test.ts": "export const t = process.hrtime.bigint();\n" },
      expect: { messageIncludes: "process.hrtime" },
      why: "#831 — process.hrtime.bigint() is the same ambient clock family; one member match (\\bprocess\\.hrtime\\b) covers both call forms, no separate BANNED entry needed",
    },
    {
      files: { "tests/server/time-origin.test.ts": "export const t = performance.timeOrigin;\n" },
      expect: { messageIncludes: "performance.timeOrigin" },
      why: "#831 — performance.timeOrigin is an ambient clock property (not a call); the old performance.now()-only regex missed it and a guest-realm probe string spelled it undetected",
    },
  ],
  mustPass: [
    {
      files: {
        "tests/server/marked.test.ts":
          "// @orb-gate-ignore test-determinism: the SUBJECT is elapsed real time — ends when the assertion stops measuring wall-clock\nexport const p = performance.now();\n",
      },
      why: "#828 — the per-site escape this gate had no way to express: its findings go through the `Finding` overload, which honours a marker on the line IMMEDIATELY above. Before #828 a test whose subject IS elapsed real time had to contort or change instrument; the marker is two-sided (gate-ignore-inventory reds it the day the call goes away)",
    },
    {
      files: {
        "tests/server/marked-hrtime.test.ts":
          "// @orb-gate-ignore test-determinism: monotonic elapsed-ms for a real-timer race; no frozen clock to inject\nexport const t = process.hrtime.bigint();\n",
      },
      why: "#831 — the same per-site escape for the newly-recognised process.hrtime family, proving the marker reaches it identically to performance.now()",
    },
    {
      files: { "tests/server/y.test.ts": "export const t = clock.now();\n" },
      why: "the injected clock (clock.now()) — no ambient nondeterminism, passes",
    },
    {
      files: { "tests/support/clock.test.ts": "export const t = Date.now();\n" },
      why: "a banned call under support/ — the determinism seam itself is scanRoot-excluded, passes",
    },
    {
      files: { "tests/e2e/flow.test.ts": "export const t = Date.now();\n" },
      why: "a banned call under e2e/ — real-browser full-stack is scanRoot-excluded, passes",
    },
    {
      files: { "tests/client/line-comment.ct.tsx": "// The frozen clock stands in for Date.now() here.\nexport const t = clock.now();\n" },
      why: "ISSUE #132, the founding defect: a LINE comment explaining the determinism fix names the banned call. Two home CTs were reworded to 'wall-clock read' to dodge this — the gate was wrong, not the comments",
    },
    {
      files: {
        "tests/client/block-comment.ct.tsx":
          "/** Seeded, never Math.random() / crypto.randomUUID().\n *  performance.now() is ambient too. */\nexport const id = seededId();\n",
      },
      why: "#132's block-comment half — a JSDoc naming three banned calls is prose, and ts-morph's leading-comment ranges cover it",
    },
    {
      files: { "tests/server/trailing-comment.test.ts": "export const t = clock.now(); // not Date.now(), which the gate bans\n" },
      why: "a TRAILING comment on a violation-free line — the blanker is span-based, not line-based, so the code half of the line is still scanned while the prose half is not",
    },
  ],
};
