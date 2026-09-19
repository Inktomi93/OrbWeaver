// PATH TRIGGERS FOR THE WHOLE-ONLY STATIC STAGES (#2277) — "a commit touching X owes check Y", as DATA.
//
// THE MECHANISM ALREADY EXISTED, IMPLEMENTED ONCE AND GENERALISED NOWHERE. `docs:catalog` carried a lone
// `DOC_CATALOG_PATH_RE` in the registry and a bespoke `scopedArgv` reading "if the changed selection
// contains a matching path, run the WHOLE command; otherwise skip". Every other whole-only static stage had
// no `scopedArgv` at all, so a scoped tier deferred it UNCONDITIONALLY — which is why #2266
// (`check:agents` red on main through several folds) and the `lint:eslint` tsdoc reds were both invisible:
// the #1584 hook bypass suppresses the commit-tier run, and nothing else keyed those stages to the paths
// that break them.
//
// SO `pnpm verify --changed` BECOMES THE MECHANICAL CONTROL the bypass removed. A lane's owed checks are
// GENERATED from its own diff instead of recalled, and a commit touching none of the trigger paths pays
// nothing (the ten stages the #2269 enumeration priced cost 101 SECONDS in total, so the saving was never
// the point — being ASKED at all is).
//
// ── THE TWO PROPERTIES THAT MAKE THIS SAFE, AND THEY ARE NOT NEGOTIABLE ──────────────────────────────
//
// 1. A TRIGGERED RUN IS THE **WHOLE** COMMAND, NEVER A NARROWED FILESET. Every stage here declined a
//    `scopedArgv` for a stated reason in its own registry row — "a census derived from a scoped fileset is
//    a census of a different tree, and would report every row it did not walk as stale"; "a coverage
//    verdict derived from a partial schema would call every unwalked column unclassified"; "a scoped
//    fileset would report every grant it did not probe as dead". EVERY ONE OF THOSE RULINGS SURVIVES
//    INTACT, because the trigger changes WHEN the stage runs and never WHAT it reads. The house idiom
//    applies exactly: the ruling survives — its INPUT changed.
//
// 2. A REGEX IN THIS TABLE IS A **COMPLETE OVER-APPROXIMATION** OF ITS STAGE'S INPUTS. The untriggered arm
//    is `skip-empty`, which the summary renders as "skipped (no files in scope)" — an affirmative claim
//    that the stage was NOT OWED, not merely that this scope could not run it. That claim is only honest
//    if nothing outside the pattern can change the stage's verdict. So the bar for a row here is: name the
//    stage's SUBJECT from its own registry header, and write a pattern that cannot miss it. When no such
//    pattern exists the row is `null` WITH ITS REASON and the stage keeps deferring — which is the
//    pre-#2277 behaviour and is strictly better than a trigger that under-selects, because an
//    under-selecting trigger converts "I did not run" into "I was not needed" and that is a false clean.
//
// THE TABLE IS EXHAUSTIVE OVER THE WHOLE-ONLY STATIC STAGES, null rows included. A stage omitted from it
// entirely would be indistinguishable from one nobody considered, which is the accounting gap the #2269
// enumeration was built to close.
//
// ONE THING THE CONSUMER OWES, because the vehicle is `verify --changed` and that run PUBLISHES a `latest`
// pointer: **READ THE SLOT THE RUN PRINTED, never `reports/verify.json`.** Concurrent runs do NOT void each
// other's verdicts — each writes inside its own `reports/runs/verify/<slot>/` and publishes the pointer
// atomically at completion (constitution §4, #1029) — so what races is the POINTER, and the hazard is a
// reader who takes the alias and assumes it is theirs. The standing "a lane does not run the front door"
// rule is about WHOLE-TREE runs (`check:structure`, `pnpm check`, the `.repo.int` planters, which also
// MUTATE the tree); it is stricter than the design for a scoped run, and this is the one home saying so
// (orchestrator ruling, 2026-09-13).
import type { ScopedArgv, StageDef, Tier } from "../contract/stage.ts";

/** One stage's trigger: the paths that can change its verdict, or `null` with the reason none can be
 *  written. `why` is load-bearing on BOTH arms — it is the evidence a future reader re-derives against. */
export interface StageTrigger {
  readonly paths: RegExp | null;
  readonly why: string;
}

/**
 * EVERY STAGE THAT RUNS ITS WHOLE COMMAND OR NOT AT ALL, with its trigger or its stated absence. That is
 * the twelve whole-only static rows plus `docs:catalog`, whose lone hand-rolled version of this mechanism
 * moved in here so the accounting has ONE home. Repo-relative,
 * forward-slashed paths — the same shape `Selection.paths` carries.
 *
 * Each `why` names the SUBJECT from the stage's own registry header, because that header is where the
 * stage already said what it reads; a trigger derived from anything else is a second opinion about the
 * same question and the two would drift.
 */
export const WHOLE_COMMAND_PATH_TRIGGERS: Readonly<Record<string, StageTrigger>> = {
  "docs:catalog": {
    paths: /^(?:docs\/.*\.md|docs\/catalog\/.*|tooling\/src\/doc-catalog\/.*)$/u,
    why: "THE ORIGINAL, moved here verbatim from `registry.ts`'s lone `DOC_CATALOG_PATH_RE`: one edited document can invalidate its content-hash receipt or the corpus ratchet, and the catalog tool itself defines the receipt.",
  },
  "lint:hook-syntax": {
    paths: /^\.claude\/hooks\//u,
    why: "its subject is literally `.claude/hooks/*.mjs` — the glob its own argv spells. Nothing else can change the verdict.",
  },
  "structure:agent-config": {
    paths: /^(?:AGENTS\.md|\.claude\/(?:agents|rules|skills)\/|\.codex\/agents\/|\.agents\/skills\/)/u,
    why: "agent-sync reads exactly six coordinates (lib/paths.ts): AGENTS.md, .claude/{agents,rules,skills}/, .codex/agents/, .agents/skills/. #2266 is this row's reason for existing — it sat red on main through several folds.",
  },
  "structure:drizzle-kit": {
    paths: /^packages\/db\/(?:src\/migrations\/|drizzle\.config\.ts$)/u,
    why: "`drizzle-kit check` reads the MIGRATIONS dir and its config, not the schema — the journal/snapshot chain is the whole subject (its sibling structure:db-baseline owns the orthogonal schema half).",
  },
  "structure:db-baseline": {
    paths: /^packages\/db\/src\//u,
    why: "the committed squashed baseline vs what the live `@orb/db/schema` generates — both sides live under packages/db/src.",
  },
  "structure:asset-refs": {
    paths: /^(?:packages\/db\/src\/|packages\/server\/src\/domain\/assets\/)/u,
    why: "every live FK→`assets.id` column (the db schema) against the ONE classification registry in domain/assets/persistence/asset-refs.ts. Both sides, nothing else.",
  },
  "structure:policy-conformance": {
    paths: /^tooling\/src\/verify\/(?:gates\/|contract\/policy|lib\/policy-)/u,
    why: "every final defineGate policy's own mustFlag/mustPass rows through the production dispatcher — the gate modules plus the policy contract and dispatcher they run on.",
  },
  "tests:execution-membership": {
    paths: /^(?:tests\/|vitest\.config\.ts$|playwright[^/]*\.config\.ts$|playwright\/)/u,
    why: "every tests/** runner-suffixed file against the union of vitest's and both playwright configs' own --list views. A file enters or leaves that set only by a tests/ path change or a runner-config change.",
  },
  "tests:instrument-affected": {
    paths: /^(?:tooling\/src\/|tests\/tooling\/)/u,
    why: "its subject is the instruments a branch CHANGED and the specs those reach — `tooling/src/**` on the one side, `tests/tooling/**` on the other. Nothing outside those two trees can move the selection or the verdict, and the stage's own derivation narrows further from there (a `tooling/src` change that reaches no spec is a finding, not a skip).",
  },
  "types:ownership": {
    paths: /(?:\.(?:ts|tsx|mts|cts)$|tsconfig[^/]*\.json$)/u,
    why: "every authored TS root, ambient and imported closure against its declared compiler owner. Broad ON PURPOSE and still not the identity: a docs-only, JSON-only or asset-only commit cannot move a compiler program's membership.",
  },

  // ── the identity-triggered rows. No narrower path set completely over-approximates their inputs, so a
  // non-empty changed selection runs the whole command. This is deliberate admission, not scoped analysis. ──
  "types:testd": {
    paths: /./u,
    why: "a `.test-d.ts` asserts against the TYPES of arbitrary source, so no narrower path set is complete. The identity trigger deliberately runs the whole assertion lane for every non-empty changed selection.",
  },
  "config:biome-rule-liveness": {
    paths: /./u,
    why: "the subject is biome.json's GRANT TABLE plus every path those grants name — and whether a granted rule still FIRES depends on the content of the granted file. The identity trigger is the only complete changed-path approximation, and still runs the whole command.",
  },
  "ledgers:fresh": {
    paths: /./u,
    why: "the caught-failure census is LINE-COUPLED and derived from a whole-repo ts-morph walk, so any source edit can re-stale a row; the doc ledgers add authored documents. The identity trigger is intentionally complete and runs the whole reconciler.",
  },
  // Knip remains declined: it is materially different from the three cheap identity-triggered rows above.
  "deps:knip": {
    paths: null,
    why: "reachability over the WHOLE import graph — deleting the last importer of a file makes an unrelated module orphaned, so the trigger is every source file plus every manifest. Complete means the identity.",
  },
};

/** Is `stage` one this table narrows? A stage that already HAS a `scopedArgv` is never touched: it owns a
 *  real scoped derivation, and layering a path trigger over it would silently replace a narrowed run with a
 *  whole one. */
function triggerFor(stage: StageDef): RegExp | undefined {
  return stage.scopedArgv === undefined ? (WHOLE_COMMAND_PATH_TRIGGERS[stage.name]?.paths ?? undefined) : undefined;
}

const CHANGED: Tier = "changed";

/** The registry with its path triggers applied — the ONE place the table becomes behaviour.
 *
 *  A triggered stage gains the `changed` tier and a `scopedArgv` that returns its OWN WHOLE `argv` when the
 *  selection matches and `skip-empty` when it does not. It is a DECORATION of the authored rows rather than
 *  a field on each row because the trigger table is one concept with one home: spelling twelve regexes
 *  inline would put the accounting (which stages are covered, which are declined and why) in twelve places,
 *  which is how the lone `DOC_CATALOG_PATH_RE` stayed lone. */
export function applyPathTriggers(stages: readonly StageDef[]): readonly StageDef[] {
  const missing = stages.filter(
    (stage) => stage.tiers.includes("static") && stage.scopedArgv === undefined && !Object.hasOwn(WHOLE_COMMAND_PATH_TRIGGERS, stage.name),
  );
  if (missing.length > 0) {
    throw new Error(`whole-only static stage is absent from WHOLE_COMMAND_PATH_TRIGGERS: ${missing.map((stage) => stage.name).join(", ")}`);
  }
  return stages.map((stage) => {
    const paths = triggerFor(stage);
    if (paths === undefined) {
      return stage;
    }
    const scopedArgv = (sel: { readonly paths: readonly string[] }): ScopedArgv => (sel.paths.some((path) => paths.test(path)) ? stage.argv : "skip-empty");
    return { ...stage, tiers: stage.tiers.includes(CHANGED) ? stage.tiers : [CHANGED, ...stage.tiers], scopedArgv };
  });
}
