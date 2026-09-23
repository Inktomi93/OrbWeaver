// Policy: suppressions — every FOREIGN-tool lint/type suppression directive in authored TS/TSX is licensed
// by an exact reviewed grant naming its RULE CLASS and its SCOPE, or it is a finding with no door.
//
// WHAT THIS GATE IS FOR. A `biome-ignore` / `eslint-disable` / `@ts-expect-error` is a foreign analyzer's
// permission, invisible to every Orb mechanism. The population is therefore measured here — and the
// question worth asking of it is never "how many" but "under WHICH RULE, and was that rule ruled". A
// suppression of a rule the repository has decided against (the snake_case wire vocabulary, the PNG codec's
// bitwise operators, a documented biome false positive) is law being obeyed; a suppression of any other
// rule is an unargued silence.
//
// === THE AUTHORITY MIGRATION, 2026-09-12 (#2063 / #1584 / #1922) — READ THIS BEFORE COPYING ANYTHING ===
//
// WHAT WAS HELD BEFORE: a committed BOTH-WAYS PER-FILE COUNT RATCHET (`suppressions.baseline.json`, 281 file
// rows / 587 occurrences at its last regeneration) plus TWO gate-owned ratification tables keyed by rule
// class per scope (`RATIFIED_RULES` 46 rows, `RATIFIED_TEST_RULES` 7 rows). Four arms: EXCEED (a marker past
// a file's committed budget), STALE (a budget the file no longer spends), CLASS DRIFT (a hand-declared
// `ratified` the tables do not earn), and STALE RULE (a ratification classifying zero live sites in its
// scope). Every marker of a ratified rule was permitted; every marker of an unratified rule was permitted
// too, up to its file's committed budget, and that budget was the only thing holding it.
//
// WHAT IS HELD NOW: `authority: "reviewed-grant"`, one finding per `(rule, scope)` class, one exact grant
// row per ruled class in `lib/reviewed-grants.ts`. No baseline, no counts, no gate-owned table.
//
// WHICH DIRECTION EACH HALF MOVED — both, and in OPPOSITE directions. State this plainly wherever this gate
// is described; it is a MEASURED trade, not an inherited one (owner ruling 2026-09-12, on this lane's
// escalation):
//   · THE RATIFIED HALF GOT WEAKER. Per-occurrence cardinality is GONE. A new `useNamingConvention` marker
//     in a new file is now invisible, where the ratchet REDded it until someone regenerated the budget. The
//     measurement that bought this: between the census of 2026-09-05 and 2026-09-12 the ratified half grew
//     from 545 to 560 occurrences while the burnable half moved by ZERO — a ratchet whose permitted side
//     admits fifteen new occurrences a week and whose debt side is frozen is not ratcheting the thing that
//     matters. The counts were being regenerated, never argued.
//   · THE UNRATIFIED HALF GOT STRICTLY STRONGER. A marker naming a rule with no grant row now has NO DOOR
//     AT ALL and REDs on sight, where the ratchet budgeted it as admitted debt (30 such occurrences were
//     live at conversion, 27 of them budgeted and 3 already past their budget).
//
// THE 30 BURNABLE OCCURRENCES, DISPOSED ONE BY ONE (owner ruling 2026-09-12, on this lane's escalation).
// All 30 were in `tests` scope, and NONE was unratified because anyone judged it debt: `RATIFIED_TEST_RULES`
// was a 7-row table beside a 46-row source one, and seven of the thirteen debt classes were ALREADY ruled in
// the SOURCE table for the same technical reason. So the honest verdict was UNRECORDED RULINGS, not
// unresolved findings — §4.4's "debt is never converted into a grant to make a run clean" governs the
// latter. FIVE were genuinely fixable and were FIXED IN THIS COMMIT, never granted:
//   · tests/server/domain/chat/wire-capture-fidelity.suite.int.test.ts:275,289,313 — three
//     `noNonNullAssertion` markers claiming "the backend always implements runChatTurn", a claim about the
//     runtime the type deliberately does not make. Replaced by ONE `requireRunChatTurn` guard that throws
//     by name.
//   · tests/ui/styles/css-structure.suite.test.ts:58,133 — two `noAssignInExpressions` markers on the
//     assign-in-condition exec loop. Both loops are now `css.matchAll(re)`, which also retires the
//     hand-rolled regex clone the first one carried.
// The remaining 25 occurrences across 12 classes are exact grant rows in `lib/reviewed-grants.ts`, each
// carrying its site's own stated reason VERBATIM plus an `endsWhen`, each strikeable in one edit:
// `suppressions:tests-format` · `-lint-correctness-use-unique-element-ids` ·
// `-lint-nursery-no-playwright-wait-for-timeout` · `-lint-nursery-no-unnecessary-template-expression` ·
// `-lint-nursery-use-nullish-coalescing` · `-lint-performance-no-namespace-import` ·
// `-lint-style-no-non-null-assertion` · `-lint-suspicious-no-misplaced-assertion` ·
// `-lint-suspicious-no-template-curly-in-string` · `-lint-suspicious-no-unknown-attribute` ·
// `-lint-suspicious-use-await` · `-lint-suspicious-use-error-message`. The thirteenth class,
// `lint/suspicious/noAssignInExpressions` in `tests`, has NO ROW because the fix emptied it.
// It is also why per-occurrence cardinality could not simply be kept: `lib/gate-authority.ts`'s
// `processReviewed` grants a row ONLY when it matches EXACTLY ONE finding — two or more and it licenses
// NOTHING and raises `over-broad-reviewed-grant`. Finding granularity must equal grant granularity, which
// for a rule-class ruling means ONE finding per class. (the gate-runtime exception-authority census states the
// opposite — "one matching grant suppresses every finding with that identity" — and is WRONG against the
// engine it cites; routed for correction, do not build on it.)
//
// THE FOUR LEGACY ARMS, EACH WITH ITS SUCCESSOR OR ITS OBITUARY:
//   · EXCEED and STALE were the count ratchet. DELETED with the baseline (§12.5: "no count ratchet";
//     `lib/gate-contract.ts:294` mechanically refuses any `*.baseline.json` literal in a gate module).
//   · CLASS DRIFT guarded a hand-edited `ratified` number against the derived one. It cannot exist without
//     the number; DELETED.
//   · STALE RULE survives with a STRONGER successor and no code here. A ruled class with zero live sites
//     now produces no finding, its grant is consumed zero times, and central reconciliation raises
//     `stale-reviewed-grant` ("reviewed grant was unused after a complete owner run"). Same verdict, owned
//     by the engine, and it additionally catches the over-broad direction the legacy arm had no word for.
//
// MARKER CENSUS: ZERO. This gate never owned an `@orb-gate-ignore` vocabulary — its exemption mechanism was
// the baseline JSON, not a comment grammar — so nothing was translated and nothing was dropped. The
// `biome-ignore`/`eslint-disable` comments this gate COUNTS are foreign-tool syntax, never Orb waivers
// (`lib/suppression-directive.ts`'s header is the one home for that distinction), and they are DATA to this
// policy rather than a door into it.
//
// FAMILY: a declared SINGLETON under its own id. The shared reader is `lib/suppression-directive.ts`
// `suppressionSites` (with `readDirectiveComment` as its grammar door), co-consumed by
// `gates/no-blanket-suppression.ts`, which judges the same syntax for the opposite reason — this policy
// budgets each site, that one refuses the FILE-WIDE forms. That sibling is NOT a family member here: it is
// a legacy `GateDescriptor` and stays legacy under a refusal re-derived 2026-09-12 (its arm C reads the GIT
// INDEX, and no frozen resource kind serves a staged blob), so the loader would refuse a family string with
// one final member that is not its own id.
//
// LEGACY SHA: the conversion parent is `d23150315`; the frozen dispatcher the §4.6 differential
// replayed against is `02382639e` (named as such in the conversion commit `a33b2e339`'s own message:
// "legacy dispatcher (02382639e) and the final policy over the same bytes: 15 IDENTICAL, 1 classified").
// Recorded here because §5b.5 asks the HEADER for it and a hand read over this whole span found no hex
// at all — the shas lived only in the commit message and in `lib/reviewed-grants.ts`'s `why` strings,
// neither of which a reader of this module sees.
//
// POPULATION PORT, and it is a WIDENING recorded rather than a silent one. Legacy admitted
// `harnessGlobs ∩ scanRoot`: `packages/*/src/**`, `tooling/src/**`, `scripts/**`, `tests/**` in `.ts`/`.tsx`,
// minus the captured SillyTavern runtime. `@authored` now includes the shipped showcase/default-content
// roots that `harnessGlobs`' `packages/*/src/**` and the legacy `PACKAGE_SOURCE_RE` both matched, so the port
// is lossless without duplicate roots. Measured through the real reader over the real project on 2026-09-12: 7,484 paths admitted on
// BOTH sides with symmetric difference ZERO and a planted out-of-population control rejected by both. The
// census AT LANDING is 597 occurrences across 283 files in 65 `(rule, scope)` classes, every one licensed by
// exactly one grant row consumed exactly once. (It was 602 / 284 / 66 before this commit burned the five
// sites named below; 46 source classes and 46 source table rows matched 1:1, so ZERO ratifications were
// stale in either scope — re-derived, because a LINE-ANCHORED regex sweep reported one stale source rule and
// was WRONG: the reader has three carriers and the missing directive was a TRAILING one at
// `packages/ui/src/primitives/log-viewer/log-viewer.tsx:200`.)
//
// THE SCOPE AXIS IS THE OPERATION, NOT A POPULATION FENCE (#962). A test suppression is permanent for a
// DIFFERENT reason than a source one — the test's SUBJECT is the boundary, the wire or the codec the rule
// exists to keep out of product code — so one rule ruled in `source` is not thereby ruled in `tests`, and
// each scope takes its own grant row. `GovernedScope` keeps its home in `contract/suppressions.ts`; what
// died with the ratchet is its second job as the ADMISSION predicate, which the declared population now owns.
//
// THE AGGREGATION IS NOT THIS MODULE'S. `lib/reviewed-grant-findings.ts` is "the one place a reviewed-grant
// policy turns candidate occurrences into findings", and its law — exactly one finding per
// `(subject, operation)`, every site named in the message — is the law this policy needs. It anchored only
// on NODES, and a suppression directive is COMMENT TRIVIA with no node to report (`suppressionSites` walks
// raw comment ranges "without wrapping — or even synthesising — a single token", #967), so this conversion
// added the FILE-anchored door `reportReviewedGrantFileCandidates` beside the node one, over a single shared
// grouping. A hand-rolled grouper here would have been a private reader behind `defineGate` (§12.3).
//
// AND THE `subject` HERE IS A RULE CLASS, NOT A PATH — the one consumer that diverges from that module's
// file-subject convention, ruled 2026-09-12. "The snake_case key IS the wire protocol" is a claim about a
// biome rule repository-wide, not about any one file; keyed per file it would need 284 grant rows each
// carrying a count's worth of meaning, which is the per-file ratchet re-minted as grants and exactly what
// the gate-runtime exception-authority census says cannot be translated one-for-one.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `suppressions` descriptor at d2315031518b859f3355c931ac158c2e32951249, the parent of the conversion `a33b2e339`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,497 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 7,497
// and final `population` admits 7,497. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `docs/__cbbhr_out_control.ts` (virtual) rejected by both.
//
// THE WIDENING, 2026-09-23 (work item 0036, owner ruling outcome A). `@authored` is a union of NAMED ROOTS, and
// no root names the repo root's own files (`knip.ts`, `platform.d.ts`, the vitest/playwright/stryker configs),
// a package's files outside `src/` (`packages/ui/token-contract.ts`, `packages/client/vite.config.ts`), or
// `playwright/`. Those files held live directives that no grant licensed and no gate read, and the old
// population admitted them for no stated reason. The population is now every authored TypeScript file the gate
// corpus loads (`of: "all"`), and the corpus (`_shared/ts-workspace.ts#harnessGlobs`) was widened in the same
// change to load those files. `caught-failure-ownership` rejected `of: "all"` because its declared FENCE held only
// by the corpus's accident. This policy has no fence except the captured runtime. Its intent IS "whatever the
// repository authors", and the corpus is held to that claim by
// `tests/tooling/verify/contract/population.test.ts`: every tracked TypeScript file must be one the corpus loads.
// The non-TypeScript scripts were converted to TypeScript first (`scripts/{ts7,eslint,depcruise,
// vitest-supervised}.ts`, `scripts/probes/st-goldens/write-v2-png.ts`, `stryker{,.gate}.config.ts`). The JS files
// that remain are JS because their loader cannot load TypeScript, and each says why in its own header or its
// package's (`eslint.config.js`, `.dependency-cruiser.cjs`, the showcase QuickJS guest bundles). The policy
// source vocabulary is `.ts`/`.tsx` only (`contract/population.ts#LoadableExt`), so their directives remain
// outside this gate.
import { defineGate } from "../contract/policy.ts";
import type { GovernedScope } from "../contract/suppressions.ts";
import type { ReviewedGrantFileCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantFileCandidates } from "../lib/reviewed-grant-findings.ts";
import { suppressionSites } from "../lib/suppression-directive.ts";

/** The OPERATION axis, derived from the admitted path. Not an admission test — the declared population is
 *  the only thing that admits a file — but the licensed ACT: a suppression inside a test is a different
 *  decision from the same suppression in product source, so it takes its own grant row. */
function scopeOf(repoRelPath: string): GovernedScope {
  return repoRelPath.startsWith("tests/") ? "tests" : "source";
}

/** The SUBJECT when a directive names no rule — a bare `@ts-nocheck` names itself, but a spelling this
 *  grammar cannot parse yields `null`, and a reviewed-grant finding's subject must be nonempty or the whole
 *  policy is WITHHELD (`lib/gate-authority.ts:155`). An unclassifiable marker therefore reports under this
 *  subject and is ungrantable in practice, which is the conservative direction. */
const UNNAMED_RULE = "(no rule named)";

const MESSAGE =
  "a foreign-tool suppression directive (`biome-ignore`, `eslint-disable`, `@ts-expect-error`/`@ts-nocheck`) " +
  "names a lint/type rule this repository has not ruled on in this scope. A suppression is a decision about " +
  "the RULE, not about the line: either the rule is wrong about this class of code (a documented tool false " +
  "positive) or the code is deliberately this way and a stated invariant says so — and both of those are " +
  "reviewed grants, one per rule per scope. See the law in tooling/src/verify/gates/no-blanket-suppression.ts.";

const FIX =
  "delete the suppression by fixing the underlying diagnostic; or, if the rule is genuinely wrong about this " +
  "class of code or the code is deliberately this way, add ONE exact reviewed grant to " +
  '`tooling/src/verify/lib/reviewed-grants.ts` keyed `policyId: "suppressions"`, `subject: <the rule id ' +
  'verbatim>`, `operation: "source" | "tests"`, whose `why` states the ruling or names the tool false ' +
  "positive and whose `endsWhen` names what retires it. One row licenses that rule class in that scope " +
  "repository-wide; it goes STALE the day the last site under it disappears.";

/** The shared reporter's text bundle. NO `unreadableMessage` case can arise here — a directive either parses
 *  into a rule or falls to `UNNAMED_RULE`, and either way the subject is READ — so the third string states
 *  that plainly rather than pretending to an arm no fixture can reach (guide §6.3: a limit the runtime
 *  cannot express is written down, never faked into a row). */
const REPORT_TEXT = {
  message: MESSAGE,
  fix: FIX,
  unreadableMessage: `${MESSAGE} (UNREACHABLE: this policy's subject is the directive's own rule id, which is always readable — a spelling the grammar cannot parse falls to \`${UNNAMED_RULE}\` rather than to an unreadable identity.)`,
} as const;

export const gate = defineGate({
  id: "suppressions",
  family: "suppressions",
  authority: "reviewed-grant",
  severity: "error",
  // EVERY authored TypeScript file the gate corpus loads (work item 0036 — see the header's WIDENING note).
  // `notUnder` is the captured foreign SillyTavern runtime, which Orbweaver does not
  // author and therefore does not rule on — the authored generator BESIDE it stays governed.
  population: {
    of: "all",
    why: "a suppression is a foreign analyzer's permission wherever it sits, so a repo-root config, a package build file and a script are judged exactly like package source",
    notUnder: ["scripts/probes/st-goldens/sillytavern-runtime/**"],
  },
  analysis: "syntax",
  // A per-class verdict cannot compose over a subset: a scoped run seeing one file of a class would report
  // that class from one site, and — worse — grant liveness is a whole-population question, so a partial run
  // would stale every grant whose only live sites sat outside the selection.
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    // Invocation state allocated in `create`: every occurrence the walk saw, as grant candidates. The
    // grouping into ONE finding per `(rule, scope)` is the shared reporter's law, never this module's.
    const candidates: ReviewedGrantFileCandidate[] = [];
    return {
      visitFile: (sourceFile) => {
        const file = ctx.relativePath(sourceFile);
        const operation = scopeOf(file);
        for (const site of suppressionSites(sourceFile)) {
          // `note` carries the exact directive TOKEN into the site list, which is the only thing that tells a
          // range opener from its closer once two occurrences of one rule collapse into a single finding.
          candidates.push({ file, line: site.line, subject: site.rule ?? UNNAMED_RULE, operation, note: site.token });
        }
      },
      evaluate: () => {
        reportReviewedGrantFileCandidates(ctx.report, candidates, REPORT_TEXT);
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      grant: { subject: "lint/foo", operation: "source" },
      files: { "packages/kit/src/x.ts": "// biome-ignore lint/foo: reason\nexport const a = 1;\n" },
      expect: { count: 1, line: 1, messageIncludes: "Subject: lint/foo, operation: source, site(s): packages/kit/src/x.ts:1 (biome-ignore)." },
      why: "THE FOUNDING SHAPE, carried from the legacy descriptor: a `biome-ignore` comment marker under packages/*/src is a suppression. The `messageIncludes` is the CONVERSION's identity — the legacy row pinned only the token `biome-ignore`, which says nothing about which RULE CLASS the finding is now keyed on. `Subject:`/`operation:` ARE the grant identity central reconciliation matches on, so this row pins the exact pair a grant row must spell",
    },
    {
      mode: "source",
      files: { "packages/kit/src/y.ts": "// eslint-disable-next-line no-unused-vars\nexport const a = 1;\n" },
      expect: { count: 1, messageIncludes: "Subject: no-unused-vars, operation: source" },
      why: "an `eslint-disable-next-line` marker — one of the eslint-disable variants, counted, and its RULE is the bare eslint id rather than a biome path (carried from legacy, expectation strengthened to the rule)",
    },
    {
      mode: "source",
      files: { "packages/kit/src/z.ts": '// @ts-expect-error deliberate\nexport const a: number = "x";\n' },
      expect: { count: 1, messageIncludes: "Subject: @ts-expect-error, operation: source" },
      why: "a `@ts-expect-error` marker NAMES NO RULE, so the directive is its own subject — which is what makes it grantable at all (carried from legacy)",
    },
    {
      mode: "source",
      files: { "tooling/src/x.ts": "// biome-ignore lint/suspicious/noExplicitAny: fixture probe\nexport const a = 1;\n" },
      expect: { count: 1, messageIncludes: "Subject: lint/suspicious/noExplicitAny, operation: source" },
      why: "tooling/src is governed and is SOURCE scope, not tests — the operation axis keys on `tests/`, so the tool tree takes the source ruling (carried from legacy)",
    },
    {
      mode: "source",
      files: { "scripts/x.tsx": "// eslint-disable-next-line no-alert\nexport const a = 1;\n" },
      expect: { count: 1, messageIncludes: "Subject: no-alert, operation: source" },
      why: "scripts TSX is governed typed source (carried from legacy)",
    },
    {
      mode: "source",
      files: { "packages/kit/src/start.ts": "// biome-ignore-start lint/suspicious/noUnnecessaryConditions: live guard\nexport const a = 1;\n" },
      expect: { count: 1, messageIncludes: "site(s): packages/kit/src/start.ts:1 (biome-ignore-start)." },
      why: "a biome range-START directive is an exact suppression token, not a partial `biome-ignore` match — and the TOKEN survives into the message so a reader can tell a range from a line (carried from legacy)",
    },
    {
      mode: "source",
      files: { "packages/kit/src/end.ts": "// biome-ignore-end lint/suspicious/noUnnecessaryConditions: end live guard\nexport const a = 1;\n" },
      expect: { count: 1, messageIncludes: "site(s): packages/kit/src/end.ts:1 (biome-ignore-end)." },
      why: "a biome range-END directive likewise (carried from legacy)",
    },
    {
      mode: "source",
      files: {
        "scripts/probes/st-goldens/generate-goldens.ts": "// biome-ignore lint/style/useNamingConvention: upstream wire key\nexport const snake_case = 1;\n",
      },
      expect: { count: 1, messageIncludes: "Subject: lint/style/useNamingConvention, operation: source" },
      why: "the authored st-goldens generator stays governed despite its captured-runtime NEIGHBOUR — the population subtracts the runtime DIRECTORY, never the authored script beside it (carried from legacy; its twin `mustPass` row is the fence's other half)",
    },
    {
      mode: "source",
      files: { "knip.ts": "// biome-ignore lint/style/noDefaultExport: config loader\nexport const a = 1;\n" },
      expect: { count: 1, messageIncludes: "Subject: lint/style/noDefaultExport, operation: source, site(s): knip.ts:1 (biome-ignore)." },
      why: "work item 0036 — a REPO-ROOT authored file is governed. No named root claims the repo root, so the `@authored` population this policy used to declare skipped this file, and its live directive went unlicensed",
    },
    {
      mode: "source",
      files: { "packages/ui/token-contract.ts": "// biome-ignore lint/performance/noNamespaceImport: CJS interop\nexport const a = 1;\n" },
      expect: { count: 1, messageIncludes: "Subject: lint/performance/noNamespaceImport, operation: source" },
      why: "work item 0036 — a package file OUTSIDE `src/` is governed. The package roots name `packages/<name>/src/` only, so a build or verify module at the package root was judged by no suppression policy",
    },
    {
      mode: "source",
      files: { "tests/tooling/x.test.ts": "// biome-ignore lint/foo: reason\nexport const a = 1;\n" },
      expect: { count: 1, messageIncludes: "Subject: lint/foo, operation: tests" },
      why: "#962 — tests are GOVERNED, and this is the OPERATION AXIS's own row: the identical rule that reported `governed source` above reports `governed tests` here, which is what makes the two scopes separately grantable",
    },
    {
      mode: "source",
      files: { "packages/kit/src/nocheck.ts": "// @ts-nocheck\nexport const a: number = 1;\n" },
      expect: { count: 1, messageIncludes: "Subject: @ts-nocheck, operation: source" },
      why: "#962 — `@ts-nocheck` is the type-checker's FILE-WIDE suppression and counts as a directive naming itself (carried from legacy)",
    },
    {
      mode: "source",
      files: { "packages/kit/src/enable.ts": "/* eslint-disable foo */\nexport const a = 1;\n/* eslint-enable foo */\n" },
      expect: {
        count: 1,
        messageIncludes:
          "Subject: foo, operation: source, site(s): packages/kit/src/enable.ts:1 (eslint-disable), packages/kit/src/enable.ts:3 (eslint-enable).",
      },
      why: "THE AGGREGATION DELTA, and it is why this row's expectation changed. An eslint block range is still TWO markers — the legacy row pinned `count: 2` FINDINGS — but both name rule `foo` in one scope, so the conversion reports ONE finding whose message NAMES BOTH SITES. `count: 1` with BOTH coordinates and BOTH tokens in the text is what discriminates aggregation from a dropped marker: a real drop would carry one site",
    },
    {
      mode: "source",
      files: {
        "packages/kit/src/one.ts": "// biome-ignore lint/style/noNonNullAssertion: first\nexport const a = 1;\n",
        "packages/ui/src/two.ts": "// biome-ignore lint/style/noNonNullAssertion: second\nexport const b = 2;\n",
      },
      expect: { count: 1, messageIncludes: "site(s): packages/kit/src/one.ts:1 (biome-ignore), packages/ui/src/two.ts:1 (biome-ignore)." },
      why: "THE INVENTED ROW for the conversion's core new property — CROSS-FILE AGGREGATION. Two files, two packages, one rule, one scope, ONE finding, anchored at the first site in path order and enumerating both. This is the property the grant identity rests on: were it per occurrence, the class's grant would match two findings, license NOTHING and raise `over-broad-reviewed-grant`. Planted-break receipt in the family test",
    },
    {
      mode: "source",
      files: {
        "packages/kit/src/src-side.ts": "// biome-ignore lint/style/useNamingConvention: wire key\nexport const snake_case = 1;\n",
        "tests/kit/test-side.test.ts": "// biome-ignore lint/style/useNamingConvention: fixture wire key\nexport const other_key = 2;\n",
      },
      expect: { count: 2 },
      why: "THE SCOPE SPLIT, as a count: ONE rule suppressed in BOTH scopes is TWO findings, because `source` and `tests` are different operations and a ruling in one is not a ruling in the other (#962's whole premise). Cut `scopeOf` to a constant and this row collapses to ONE finding — that is its falsifier, and the planted-break receipt is in the family test",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/kit/src/string-literal.ts": 'const s = "biome-ignore lint/foo: not a real marker";\nexport const a = s;\n' },
      why: "THE MENTION FENCE, string half: a STRING LITERAL merely spelling `biome-ignore` is not a comment — `readDirectiveComment` matches at the comment OPENER only, over comment ranges only (carried from legacy)",
    },
    {
      mode: "source",
      files: {
        "tests/support/helper.ts": "// prose: a biome-ignore-all quotation mid-sentence is a MENTION, not a directive at the opener\nexport const t = 1;\n",
      },
      why: "THE MENTION FENCE, prose half, in the TESTS scope: a governed test file whose only spelling of a directive is mid-sentence has zero markers (carried from legacy)",
    },
    {
      mode: "source",
      files: {
        "tooling/src/fixture-string.ts":
          '// This fixture mentions biome-ignore lint/foo: as prose.\nexport const a = "// eslint-disable-next-line no-alert";\n',
      },
      why: "both halves of the mention fence in one file, which is the shape this gate's OWN module and its proof rows take — a gate that counted its own header would be unable to describe itself (carried from legacy)",
    },
    {
      mode: "source",
      files: {
        "packages/kit/src/keep.ts": "export const keep = 1;\n",
        "scripts/probes/st-goldens/sillytavern-runtime/vendor.tsx":
          "// biome-ignore lint/style/useNamingConvention: captured vendor source\nexport const snake_case = 1;\n",
      },
      why: "THE POPULATION FENCE: the generated foreign runtime capture is subtracted, so a real directive inside it is not judged — while the authored st-goldens script beside it flags (its `mustFlag` twin). The `keep.ts` ANCHOR is mandatory, not decoration: a fixture holding ONLY the out-of-population file admits zero paths and comes back a `[population]` TOOL ERROR rather than a pass, which would prove nothing",
    },
    {
      mode: "source",
      files: { "packages/kit/src/clean.ts": "export const a = 1;\n" },
      why: "a file with zero suppression markers — the null case, and the only mustPass that is silent for the trivial reason (carried from legacy)",
    },
  ],
});
