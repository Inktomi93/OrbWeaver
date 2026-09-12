// Gate: test-determinism (Spine-Testing.md §3, Core-0-Architecture-and-Structure.md §7) — no ambient
// clock/random/unseeded id under tests/. Tests inject the frozen clock + seeded ids (tests/support)
// through the same composition seam production uses; the real clock/Math.random makes ordering assertions
// flaky. COMMENTS ARE BLANKED before the line scan (issue #132) — a comment EXPLAINING a determinism fix
// names the banned call, and reading prose as code cost two CTs a reworded comment. DECLARED LIMIT: string
// literals still scan (a fixture that spells the call is code the test could evaluate). Exempts support/ +
// e2e/ via population, so a predicate that stops matching REDs on the zero-scan alarm instead of passing.
// PER-SITE ESCAPE (#828, RESPELLED at the conversion): the central `@orb-waive test-determinism(<position>):
// <reason>` marker on the line IMMEDIATELY above the call — for a test whose SUBJECT is elapsed real time.
// The position is the finding's `token`: the matched banned spelling trimmed of its call parens
// (`Date.now`, `process.hrtime`, `performance.timeOrigin`). Comments are blanked, so the marker line can
// never itself match.
// MARKER CENSUS (#1963, 2026-09-11). The conversion commit (`7be684811`) converted this module's own proof
// rows to `@orb-waive` but did NOT translate the live tree, and marker routing is FENCED (design §7):
// legacy `@orb-gate-ignore` reaches only LEGACY owners, so all 14 real-tree markers naming this now-FINAL
// policy went inert in one commit — 14 suppressions LOST, reported by `gate-ignore-inventory` as 14 STALE
// markers and by this policy as 14 newly-effective findings. Translated 1:1 (14 legacy = 14 waives, no
// MULTI split, no DEAD marker) across 9 files: `Date.now` ×4 (tests/tooling/{vitest-supervised,
// snap/ops/session-client,snap/ops/stage-keeper,_shared/proc}), `process.hrtime` ×9
// (plugin-host/{sandbox ×4,escape.suite ×2}, entry/{compose/chat ×2,lifecycle}), `performance.timeOrigin` ×1
// (plugin-host/realm). The 22 raw grep hits minus 4 legacy-engine fixtures in
// tests/tooling/gate-ignore-grammar.repo.int.test.ts, 3 file-header prose mentions and this header's own
// quote = those 14. THAT ARITHMETIC IS FROZEN AT THE CONVERSION COMMIT and is no longer reproducible: this
// policy was that suite's Finding-arm carrier, the conversion made the arm vacuous (a legacy marker cannot
// reach a final policy), and #1974 re-pointed it at `no-test-fabrication` — so its 4 fixtures no longer
// name this policy. Re-derive from the tree, never from this paragraph.
// WIDENED SPELLINGS (#831): four real sites routed around the gate through spellings the old regex did
// not recognise — process.hrtime()/process.hrtime.bigint() (an ambient monotonic clock; one member match
// covers both call forms) and performance.timeOrigin (an ambient clock PROPERTY, not a call). All four
// now carry the #828 marker. DECLARED LIMIT, unchanged by #831: a guest-realm probe that reaches a stub
// via SUBSCRIPT/bracket access (`Date['now']()`, `performance['now']()`) still evades every regex in this
// file by construction — the probe never spells the dotted member the regex matches on. That is
// tests/server/infra/plugin-host/realm.test.ts's documented choice (its own header), not a gap this gate
// closes; a future "flag bracket access too" would need to special-case away from EVERY legitimate bracket
// property read, which is not this gate's job.

import { defineGate } from "../contract/policy.ts";
import { blankTsComments } from "../lib/comment-spans.ts";

// A scan-SCOPE decision, NOT an exemption table (hence the name — `gate-modernization` reds an
// exemption-vocabulary collection with no stale arm, and rightly): support/ is the determinism seam ITSELF
// (it is where the frozen clock lives) and e2e/ is a real browser against a live clock. Neither is a
// sanctioned home for a violation; both are tiers the rule does not apply to.
const UNSCANNED_UNDER: readonly [string, ...string[]] = ["tests/support/**", "tests/e2e/**"];

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

export const gate = defineGate({
  id: "test-determinism",
  family: "test-determinism",
  // The legacy descriptor carried no `markerImmune`, so it was suppressible via the ordinary
  // `@orb-gate-ignore` marker (#828's per-site escape) — never a hard, unsuppressible boundary.
  authority: "ordinary",
  severity: "error",
  population: { in: ["@tests"], notUnder: UNSCANNED_UNDER },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message:
    "ambient nondeterminism in a test (Date.now/new Date()/Math.random/randomUUID/performance.now/process.hrtime/performance.timeOrigin) — inject the frozen clock + seeded ids via the fixture seam (core/Spine-Testing.md §3).",
  fix: "inject the frozen clock (tests/support/clock.ts) + seeded ids (tests/support/ids.ts) through the composition seam production uses.",
  create: (ctx) => ({
    visitFile: (sf) => {
      const raw = sf.getFullText();
      // CANDIDATE FENCE, and it is a MEMORY one, not a micro-optimisation: `blankTsComments` walks
      // `getDescendants()`, which materialises every wrapped node for the file, and doing that for all
      // ~1,836 in-scope test files OOMs the whole run (measured: heap limit at 4GB, exit 134). It is SOUND
      // because blanking only ever REMOVES matches — a file whose RAW text matches no banned regex cannot
      // match after comments are blanked, so skipping it can hide nothing.
      if (!BANNED.some(({ re }) => re.test(raw))) {
        return;
      }
      const file = ctx.relativePath(sf);
      // Comments are TRIVIA to a value scan. Blanking is length-preserving (comment-spans.ts), so
      // `index + 1` is still the real line — and the line stays the finding's ONLY position, which is
      // also what makes the line-adjacent escape exact.
      for (const [index, line] of blankTsComments(sf).split("\n").entries()) {
        for (const { re, what } of BANNED) {
          const match = re.exec(line);
          if (match !== null) {
            // An ordinary finding binds its waiver by exact position `token` — the matched banned
            // spelling itself is the identity a `@orb-waive <policy>(<position>): <reason>` marker
            // names. The marker grammar's `(<position>)` capture excludes literal parens, so a call-form
            // match ("Date.now(", "new Date()") is trimmed to its bare identity before reporting; the
            // trimmed text is still an exact prefix slice at the same offset.
            const token = match[0].replace(/[()]+$/u, "");
            ctx.report.file(file, {
              line: index + 1,
              column: match.index + 1,
              token,
              message: `ambient nondeterminism: ${what} — inject the frozen clock / seeded ids via the fixture seam (Spine-Testing.md §3).`,
            });
          }
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "tests/server/x.test.ts": "export const t = Date.now();\n" },
      expect: { count: 1, messageIncludes: "Date.now" },
      why: "an ambient Date.now() in a test — inject the frozen clock (§3)",
    },
    {
      mode: "source",
      files: { "tests/server/newdate.test.ts": "export const t = new Date();\n" },
      expect: { count: 1, messageIncludes: "new Date()" },
      why: "a no-arg new Date() — its own BANNED entry, distinct message + regex arm",
    },
    {
      mode: "source",
      files: { "tests/server/rand.test.ts": "export const r = Math.random();\n" },
      expect: { count: 1, messageIncludes: "Math.random" },
      why: "Math.random() — its own BANNED entry (member call biome can't ban)",
    },
    {
      mode: "source",
      files: { "tests/server/uuid.test.ts": "export const id = crypto.randomUUID();\n" },
      expect: { count: 1, messageIncludes: "randomUUID" },
      why: "a .randomUUID() call — its own BANNED entry (unseeded id)",
    },
    {
      mode: "source",
      files: { "tests/server/perf.test.ts": "export const p = performance.now();\n" },
      expect: { count: 1, messageIncludes: "performance.now" },
      why: "performance.now() — its own BANNED entry (ambient clock)",
    },
    {
      mode: "source",
      files: { "tests/server/parked.test.ts": "// export const t = Date.now();\nexport const t = Date.now();\n" },
      expect: { count: 1, line: 2 },
      why: "the LINE arithmetic after blanking: only the real call on line 2 fires, and it still reports line 2 (blanking preserves length + newlines, so a comment above a violation cannot shift it). The PARKED call on line 1 is not this gate's business — `commented-code` owns it and REDs it, receipted on a planted tests/ probe 2026-08-17",
    },
    {
      mode: "source",
      files: { "tests/server/literal.test.ts": 'export const src = "Date.now()";\n' },
      expect: { count: 1, messageIncludes: "Date.now" },
      why: "DECLARED LIMIT (issue #132): only COMMENTS are blanked. A banned call spelled inside a STRING is code a test could evaluate — tests/tooling/vitest-supervised.test.ts's SPIN_SRC is exactly that, a string spawned as a real grandchild — so keeping this row proven stops a future 'blank strings too' from silently disarming the arm. THE LIMIT CANNOT BE NARROWED (#1975, 2026-09-11): a syntax line-scanner cannot tell a string parsed by ts-morph from one that runs, and the parser fixtures that spell a banned call to prove a READER (tests/tooling/verify/lib/{ambient-determinism,origin-verdict,reference-fact-origin.suite}) each carry their own `@orb-waive` instead — nine of them, one reason apiece, which is the per-site door this arm is supposed to have",
    },
    {
      mode: "source",
      files: { "tests/server/hrtime.test.ts": "export const t = process.hrtime();\n" },
      expect: { count: 1, messageIncludes: "process.hrtime" },
      why: "#831 — process.hrtime() is an ambient monotonic clock the old regex did not recognise; four real sites routed around the gate through this spelling before the class was widened",
    },
    {
      mode: "source",
      files: { "tests/server/hrtime-bigint.test.ts": "export const t = process.hrtime.bigint();\n" },
      expect: { count: 1, messageIncludes: "process.hrtime" },
      why: "#831 — process.hrtime.bigint() is the same ambient clock family; one member match (\\bprocess\\.hrtime\\b) covers both call forms, no separate BANNED entry needed",
    },
    {
      mode: "source",
      files: { "tests/server/time-origin.test.ts": "export const t = performance.timeOrigin;\n" },
      expect: { count: 1, messageIncludes: "performance.timeOrigin" },
      why: "#831 — performance.timeOrigin is an ambient clock property (not a call); the old performance.now()-only regex missed it and a guest-realm probe string spelled it undetected",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "tests/server/marked.test.ts":
          "// @orb-waive test-determinism(performance.now): the SUBJECT is elapsed real time — ends when the assertion stops measuring wall-clock\nexport const p = performance.now();\n",
      },
      why: "#828 — the per-site escape this gate had no way to express: an ordinary finding now consumes the one central `@orb-waive <policy>(<position>): <reason>` marker on the line IMMEDIATELY above. Before #828 a test whose subject IS elapsed real time had to contort or change instrument; the marker is two-sided (central grant/marker reconciliation reds it the day the call goes away)",
    },
    {
      mode: "source",
      files: {
        "tests/server/marked-hrtime.test.ts":
          "// @orb-waive test-determinism(process.hrtime): monotonic elapsed-ms for a real-timer race; no frozen clock to inject\nexport const t = process.hrtime.bigint();\n",
      },
      why: "#831 — the same per-site escape for the newly-recognised process.hrtime family, proving the marker reaches it identically to performance.now()",
    },
    {
      mode: "source",
      files: { "tests/server/y.test.ts": "export const t = clock.now();\n" },
      why: "the injected clock (clock.now()) — no ambient nondeterminism, passes",
    },
    {
      mode: "source",
      files: {
        "tests/support/clock.test.ts": "export const t = Date.now();\n",
        // A companion IN-population file: `notUnder` excludes every candidate here otherwise, and a
        // population resolving zero paths from a nonempty candidate set is a tool error, not a pass.
        "tests/server/companion.test.ts": "export const t = clock.now();\n",
      },
      why: "a banned call under support/ — the determinism seam itself is population-excluded, passes",
    },
    {
      mode: "source",
      files: {
        "tests/e2e/flow.test.ts": "export const t = Date.now();\n",
        "tests/server/companion.test.ts": "export const t = clock.now();\n",
      },
      why: "a banned call under e2e/ — real-browser full-stack is population-excluded, passes",
    },
    {
      mode: "source",
      files: { "tests/client/line-comment.ct.tsx": "// The frozen clock stands in for Date.now() here.\nexport const t = clock.now();\n" },
      why: "ISSUE #132, the founding defect: a LINE comment explaining the determinism fix names the banned call. Two home CTs were reworded to 'wall-clock read' to dodge this — the gate was wrong, not the comments",
    },
    {
      mode: "source",
      files: {
        "tests/client/block-comment.ct.tsx":
          "/** Seeded, never Math.random() / crypto.randomUUID().\n *  performance.now() is ambient too. */\nexport const id = seededId();\n",
      },
      why: "#132's block-comment half — a JSDoc naming three banned calls is prose, and ts-morph's leading-comment ranges cover it",
    },
    {
      mode: "source",
      files: { "tests/server/trailing-comment.test.ts": "export const t = clock.now(); // not Date.now(), which the gate bans\n" },
      why: "a TRAILING comment on a violation-free line — the blanker is span-based, not line-based, so the code half of the line is still scanned while the prose half is not",
    },
  ],
});
