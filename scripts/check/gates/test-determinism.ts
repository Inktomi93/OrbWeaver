// Gate: test-determinism (Spine-Testing.md §3, Core-0-Architecture-and-Structure.md §7) — no ambient
// clock/random/unseeded id under tests/. Tests inject the frozen clock + seeded ids (tests/support)
// through the same composition seam production uses; the real clock/Math.random makes ordering assertions
// flaky. COMMENTS ARE BLANKED before the line scan (issue #132) — a comment EXPLAINING a determinism fix
// names the banned call, and reading prose as code cost two CTs a reworded comment. DECLARED LIMIT: string
// literals still scan (a fixture that spells the call is code the test could evaluate). Exempts support/ +
// e2e/ via scanRoot, so a predicate that stops matching REDs on the zero-scan alarm instead of passing.
import { blankTsComments } from "../comment-spans.ts";
import type { GateDescriptor } from "../contract.ts";

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
    "ambient nondeterminism in a test (Date.now/new Date()/Math.random/randomUUID/performance.now) — inject the frozen clock + seeded ids via the fixture seam (core/Spine-Testing.md §3).",
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
    // is still the real line — and the line stays the finding's ONLY position, which is what keeps this a
    // genuinely file-level Finding overload (finding-overload-provenance: no ts-morph position API).
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
  ],
  mustPass: [
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
