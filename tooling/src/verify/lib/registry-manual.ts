// The MANUAL-tier registry rows (UNIFIED-VERIFICATION-DESIGN.md §3.6) — stages a run never auto-includes:
// the CANDIDATE lenses whose output is evidence rather than a verdict, the credit-spending live e2e, the
// exploratory mutation report, the coverage report, and the niced scoped-node invocation wrapper. Each
// carries the `manualReason` `verify --list` prints. Split out of lib/registry.ts at the @orb/tooling P6
// move (size cap §4.3); lib/registry.ts concatenates this ordered tail after the runnable stages.
import type { StageDef } from "../contract/stage.ts";
import { asViolations, ownScheme } from "./exit-classifiers.ts";

export const MANUAL_ONLY_STAGES: readonly StageDef[] = [
  {
    name: "tests:ratchets",
    group: "tests",
    tiers: ["manual"],
    argv: ["pnpm", "test:ratchets"],
    classify: asViolations,
    manualReason:
      "the ORCHESTRATOR's train-gate command (#667): the sub-minute vitest-tier ratchet aggregate `pnpm check`/`check:structure` structurally cannot see. Run by hand after each merge train, not part of the changed/push/full flow — `pnpm test` (push) already runs its member suites, so an auto tier here would double-run them.",
  },
  {
    // THE EXPLICIT PRODUCT-TEST COMPOSITE. `pnpm test` still runs the vitest projects AND the CT suite in
    // one command when that combined behavioral check is needed during development. What changed in #1848
    // is that `pnpm verify` runs its two HALVES as separate stages (`tests:node` + `browser:ct`), so
    // each gets its own profile-derived hang ceiling: the composite's ~10-minute vitest half and its
    // ~40-minute CT half shared one 45-minute ceiling, and the sum blew through it on a QUIET box. This row
    // keeps the composite a NAMED stage (verify-registry-parity arm 1 requires it) and keeps it out of
    // every tier, which is what stops the suites running twice per push.
    name: "tests:product-composite",
    group: "tests",
    tiers: ["manual"],
    argv: ["pnpm", "test"],
    classify: asViolations,
    manualReason:
      "the explicit product-test composite (`pnpm test` = the vitest projects && `pnpm test:ct --retries=2`), available when the combined behavioral check is needed during development. `pnpm verify` runs its halves as `tests:node` + `browser:ct` so each carries its own hang ceiling derived from tooling/concurrency-profile.json (#1848); a tier row here would run both suites a second time",
  },
  {
    name: "tests:scoped",
    group: "tests",
    tiers: ["manual"],
    argv: ["pnpm", "test:scoped"],
    classify: asViolations,
    manualReason:
      "supervised scoped node invocation: direct test paths must exist (3) and collect tests (2). --related takes existing source files before runner flags; zero runtime dependents is reported explicitly. Use verify --scope for folder expansion",
  },
  {
    name: "structure:ledger-claims",
    group: "structure",
    // THE BARRIER CHECK ON COMMIT-MESSAGE LEDGER CLAIMS (#2195), and `manual` BY NATURE rather than by
    // cost: its subject is a COMMIT RANGE the operator states, and every constructible default was measured
    // and refused (2026-09-13, lane cb-x-verify-lib-fixes; the op's own header carries the receipts).
    // `origin/main..HEAD` reds forever on immutable history — a commit in that range owes ledger ids that
    // exist as no row — which is a stage with no green door; `merge-base(main,HEAD)..HEAD` is EMPTY on
    // main's checkout and, under one-commit-per-lane, empty on a lane too. So the range is REQUIRED and a
    // missing `--since` is misuse (3). The row exists so the check is discoverable in `verify --list` and
    // reachable by `verify-registry-parity` arm 1, exactly like the other argument-taking manual doors —
    // NOT so a tier runs it. The orchestrator runs it over a merge train's range at the barrier.
    tiers: ["manual"],
    argv: ["pnpm", "check:ledger-claims"],
    classify: ownScheme,
    manualReason:
      "the BARRIER check on `flipped ledger rows:` / `ledger rows OWED:` commit claims (#2195, playbook §5) — takes an operator-stated `--since <rev> [--until <rev>]`, so there is no argument-free whole-tree form: a defaulted base is either a permanent red on history or an empty range that measures nothing",
  },
  {
    name: "browser:e2e-live",
    group: "browser",
    tiers: ["manual"],
    argv: ["pnpm", "e2e:live"],
    classify: asViolations,
    manualReason: "costs model credits (E2E_LIVE=1, a real model round-trip)",
  },
  {
    name: "quality:mutation-report",
    group: "quality",
    tiers: ["manual"],
    argv: ["pnpm", "test:mutation"],
    classify: asViolations,
    manualReason: "exploratory Stryker report (break:null) — minutes-long, report-only",
  },
  {
    name: "quality:mutation-arid",
    group: "quality",
    tiers: ["manual"],
    argv: ["pnpm", "mutation:arid"],
    classify: ownScheme,
    manualReason:
      "post-report denominator census — requires an existing Stryker JSON report path at invocation time; its ignored-by-reason delta is recalibration evidence, so there is no argument-free whole-tree form",
  },
  {
    name: "quality:respell",
    group: "quality",
    // A CANDIDATE lens, so it is `manual` BY NATURE and not by cost: it reports domain `contract/` shapes
    // structurally identical to an @orb/contracts shape, which is EVIDENCE of a re-spell, never proof (two
    // shapes may agree today and be free to diverge tomorrow). Gating a commit on that would train agents to
    // rename a field to dodge it — worse than the rot. The syntactic half IS enforced, at the
    // `contract-derives-not-respells` gate; this row keeps the judgment half discoverable in `verify --list`
    // (and reachable by the parity gate) rather than living only in a lens verb nobody remembers.
    tiers: ["manual"],
    argv: ["pnpm", "check:respell"],
    classify: asViolations,
    manualReason: "CANDIDATE lens (`pnpm ast respell <domain>`) — structural identity is evidence, not proof; verify each hit before acting, never gate on it",
  },
  {
    name: "quality:swallowed",
    group: "quality",
    // The other CANDIDATE lens, `manual` for the same reason as quality:respell — it names exports whose only
    // liveness is a whole-module `import * as` (db's `drizzle(client, { schema })` swallows the entire schema
    // barrel), which is EVIDENCE of rot, never proof: the swallowing API may itself read the member (drizzle
    // does read a `relations()` config it is handed). Gating on it would train agents to delete load-bearing
    // config. The row exists so the audit is discoverable in `verify --list` instead of living only in a lens
    // verb nobody remembers. Its `@swallowed-ok:` markers ARE two-sided (a stale one exits 1) — that half is
    // self-enforcing whenever the lens is run.
    tiers: ["manual"],
    argv: ["pnpm", "check:swallowed"],
    classify: asViolations,
    manualReason:
      "CANDIDATE lens (`pnpm ast swallowed <scope>`) — namespace-only liveness is evidence, not proof; a hit may be load-bearing through the swallowing API, so verify before deleting",
  },
  {
    name: "quality:typeonly",
    group: "quality",
    // The third CANDIDATE lens, `manual` for the same reason as quality:respell / quality:swallowed — it
    // names VALUE exports (functions, consts, classes) whose EVERY reference is a TYPE position: `import
    // type`, `typeof X`, an annotation, an `implements` clause. That is EVIDENCE of runtime-dead code kept
    // alive structurally, never proof: a `satisfies`-anchor tuple whose only job is to be the source of a
    // derived union (packages/db's CONSTRAINT_KINDS) is exactly this shape and exactly correct. Gating on it
    // would train agents to delete the axis tuples the exhaustiveness dispatch is built from. The row exists
    // so the audit is discoverable in `verify --list` instead of living only in a lens verb nobody remembers.
    // Its `@typeonly-ok:` markers ARE two-sided (a stale one exits 1) — that half is self-enforcing whenever
    // the lens is run. Also the SLOWEST lens in the file (one reference resolution per value export).
    tiers: ["manual"],
    argv: ["pnpm", "check:typeonly"],
    classify: asViolations,
    manualReason:
      "CANDIDATE lens (`pnpm ast typeonly-alive <scope>`) — type-position-only liveness is evidence, not proof; a hit is often a deliberate conformance seam, so verify before deleting",
  },
  {
    name: "quality:columns",
    group: "quality",
    // The fourth CANDIDATE lens, `manual` for the same reason as respell/swallowed/typeonly PLUS a second one
    // this row must state plainly: its two halves have DIFFERENT confidence. Reads are the union of a
    // language-service pass and a row-shape pass; writes are purely STRUCTURAL, because drizzle's
    // `$inferInsert`/`$inferSelect` are mapped types whose properties carry zero declarations — nothing to
    // resolve. So a table with a whole-row writer (`db.insert(t).values(row)`) marks EVERY column `write?`,
    // and a `raw?` annotation means only that the column's SQL name appears in some raw `sql` template (v1
    // cannot attribute an alias-qualified raw query to a table). A WRITE-only hit is the RV-11 class worth a
    // human's time; it is never proof. Gating on it would train agents to delete audit timestamps. The row
    // exists so the audit is discoverable in `verify --list` rather than living only in a lens verb nobody
    // remembers. Its `@column-ok:` markers ARE two-sided (a stale one exits 1) — self-enforcing when run.
    tiers: ["manual"],
    argv: ["pnpm", "check:columns"],
    classify: asViolations,
    manualReason:
      "CANDIDATE lens (`pnpm ast columns <table>`) — reads are resolved two ways but writes are structural-only (drizzle's inferred row types are mapped types with no declarations), so an opaque whole-row writer makes the write half UNKNOWN; verify each hit before deleting a column",
  },
  {
    name: "quality:regkeys",
    group: "quality",
    // INFORMATIONAL, not merely manual (owner ruling 2026-08-03) — the distinction matters and is the whole
    // reason this row reads differently from the four lenses above. Those are CANDIDATE lenses: evidence a
    // human converts to a verdict. This one is a HEURISTIC: it reports registry ROWS whose key literal is
    // spelled at no dispatch site, and registry dispatch is legitimately dynamic (a key from the DB, a URL
    // segment, a template literal, an `Object.keys(REG)` iteration). False positives are EXPECTED and
    // structural, not a defect to tune away — `TOKENS` alone contributes ~138 of them because its keys are
    // consumed by CSS-variable generation, and that is CORRECT behavior for the lens. It therefore ships with
    // no exemption marker, no stale arm, and no non-zero exit on findings: there is nothing to keep two-sided
    // when the tool never claims a verdict. It must NEVER be promoted to a gating tier.
    tiers: ["manual"],
    argv: ["pnpm", "check:regkeys"],
    classify: asViolations,
    manualReason:
      "HEURISTIC + INFORMATIONAL (`pnpm ast regkeys <registry>`) — never gates, has no exemption marker by design; dynamic dispatch makes live rows look dead, so every line needs its call sites read before anyone acts",
  },
  {
    name: "quality:chains",
    group: "quality",
    // The fifth CANDIDATE lens, `manual` for the same reason as respell/swallowed/typeonly/columns PLUS one
    // that is specific to a FIXPOINT and makes gating actively dangerous here: this lens does not evaluate
    // declarations independently, it propagates. A single consumption edge the substrate cannot see — a
    // registry row dispatched from a DB-sourced key, a `Trpc[…]` proxy read, a template-literal module id —
    // does not cost one false positive, it kills that declaration AND everything reachable only through it.
    // One blind spot, a whole false subtree. Gating on that would train agents to delete live code in bulk,
    // which is strictly worse than the rot the lens exists to find.
    //
    // It also, uniquely, has NO exemption marker of its own — deliberately, and the absence is the design
    // (owner-ratified 2026-08-03). Every chain terminates at an UNCONSUMED HEAD, which is an `orphans`
    // candidate already governed two-sided by the push-tier `deps:orphan-ratchet` and its `/** @public
    // <reason> */` tag. This lens READS that same tag (through the ratchet's own predicate, one home in
    // tooling/src/ast) as an alive root, so tagging or wiring or deleting the head resolves every
    // link below it by construction. A per-link `@chain-ok:` would let somebody exempt a middle link while
    // its head stayed dead — an exemption stating nothing true, which is the one thing an exemption may
    // never be. FIX AT THE HEAD is the whole grammar.
    tiers: ["manual"],
    argv: ["pnpm", "check:chains"],
    classify: asViolations,
    manualReason:
      "CANDIDATE lens (`pnpm ast chains <scope>`) — a FIXPOINT: one consumption edge the substrate cannot see kills a whole subtree in the report, so verify the call sites before acting, and fix at the chain's HEAD (wire/delete/`@public` it), never per link",
  },
  {
    name: "mutation:probe",
    group: "tests",
    tiers: ["manual"],
    argv: ["pnpm", "mutation:probe"],
    classify: asViolations,
    manualReason:
      "adjudicates a Stryker report's Survived/NoCoverage rows by PLANTING each mutant — takes a report path + a source path, so it has no whole-tree form; the report itself is the on-demand input",
  },
  {
    name: "structure:delta",
    group: "structure",
    // MANUAL BY INPUT, not by cost or by confidence — the `quality:mutation-arid` / `mutation:probe` shape:
    // it needs an EXISTING prior slot at invocation time, and a clean checkout has none, so an automatic tier
    // row would turn every `pnpm check` on a fresh tree into an exit-2 ("no usable PRIOR slot"). That refusal
    // is correct and is the whole point of the instrument — "there is nothing to compare against" is never
    // "nothing changed" — which is exactly why it must not be wired where it would fire by construction.
    //
    // It is NOT on verify-registry-parity's NON_STAGE_ALLOWLIST, and the distinction is real: `check:show` is
    // allowlisted as a read-only INSPECTOR, while this stage returns a VERDICT (exit 1 on a per-policy
    // regression). A row here keeps it discoverable in `verify --list` instead of living only in a script
    // nobody remembers — which is the failure mode #2110 was filed for.
    tiers: ["manual"],
    argv: ["pnpm", "check:structure-delta"],
    classify: asViolations,
    manualReason:
      "per-policy diff of two published structure slots (#2110) — needs a PRIOR slot from the same checkout, so it has no argument-free form on a clean tree; run it after a merge train's structure run, when `check:structure`'s own exit code is red by construction and cannot show a NEW per-policy red",
  },
  {
    name: "tests:coverage",
    group: "tests",
    tiers: ["manual"],
    argv: ["pnpm", "test:coverage"],
    classify: asViolations,
    manualReason: "coverage REPORT only — no thresholds gate (vitest.config.ts)",
  },
];
