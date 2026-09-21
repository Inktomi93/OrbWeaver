// The `pnpm ast` AUDIT EPILOGUE's proof (tooling/src/ast/lib/ledger.ts — "THE SCAN LEDGER"). Driven through the
// REAL CLI entry point — a spawned `node tooling/src/ast/cli.ts …` over the REAL tree — because the whole
// property under test is "what the corpus/scope resolution actually did", and an in-memory project would
// re-implement precisely the thing that can lie.
//
// The defect this pins (Codex repository audit, 2026-08-13): `no results` and `the search never happened`
// printed the SAME line, so a lens could read clean while blind. The two rows are a matched pair and each
// is the other's control:
//   • ZERO WITH PROOF — a real empty answer: `scanned>0`, `matches=0`, `status=complete`, exit 0.
//   • ZERO WITHOUT SCAN — a scope/`--in` that admits no file: `scanned=0`, `status=error`,
//     `SCOPE ENTERED NOTHING`, exit 2 (the exit-2 tool-error discipline `resolveScope` already had).
// A green here is meaningful only because the SAME assertion shape separates them.
//
// Two more invariants a pipeline depends on: the epilogue is STDERR-only (stdout stays byte-compatible —
// `pnpm ast apisurface … > file` must keep producing the same file), and `--json` gains `meta` ADDITIVELY
// beside the untouched `label`/`total`/`shown`/`hits` keys.
//
// SLOW BY CONSTRUCTION: every row pays one real ts-morph workspace load (~11s). All rows use SYNTACTIC
// verbs (the `harness-globs` arm) — the typed arm would triple it for no extra coverage of THIS seam.
import { fileURLToPath } from "node:url";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget, spawnNodeWithBudget } from "../_load-budget.ts";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const AST_CLI = fileURLToPath(new URL("../../../tooling/src/ast/cli.ts", import.meta.url));
const SPAWN_TIMEOUT_MS = scaledBudget(120_000);
/** TYPED whole-workspace rows exceed the default spawn cap. A world-aware `columns --all` completed in
 *  372s, while `rot ui` completed in 253s; separate budgets preserve that measured distinction. */
const HEAVY_TIMEOUT_MS = scaledBudget(300_000);
const COLUMNS_TIMEOUT_MS = scaledBudget(480_000);

interface AstRun {
  stdout: string;
  stderr: string;
  status: number | null;
  epilogue: Record<string, string>;
}

const EPILOGUE_LANGS_TS_RE = /\bts:\d+/u;
const EPILOGUE_LANGS_TSX_RE = /\btsx:\d+/u;
const EPILOGUE_STATUS_OK_RE = /^(complete|partial)$/u;
const COLUMNS_ALL_SWEPT_RE = /columns --all: swept \d+ table\(s\), \d+ carrying a finding\./u;
const REGKEYS_ALL_SWEPT_RE = /regkeys --all: swept \d+ registry\/registries, \d+ carrying a finding\./u;

/** The epilogue's fields, parsed. Its sub-values are deliberately space-free (`langs=ts:12,tsx:3`), which
 *  is what lets a reader — and this parser — split the line on whitespace. */
function parseEpilogue(stderr: string): Record<string, string> {
  const line = stderr.split("\n").find((l) => l.startsWith("[ast] verb="));
  if (line === undefined) {
    return {};
  }
  const fields: Record<string, string> = {};
  for (const token of line.slice("[ast] ".length).split(" ")) {
    const cut = token.indexOf("=");
    if (cut > 0) {
      fields[token.slice(0, cut)] = token.slice(cut + 1);
    }
  }
  return fields;
}

function runAst(argv: readonly string[], baseTimeoutMs: number = SPAWN_TIMEOUT_MS): AstRun {
  // The TYPED whole-workspace verbs — `columns --all` above all — load the full type graph AND row-shape
  // scan every table; past ~86 tables (#273's `image_index_skips` landing) the sweep's peak exceeds node's
  // default old-space ceiling and aborts (SIGABRT → status null). This child inherits the workspace's
  // `nodeOptions` heap floor from the pnpm-launched test process; do not pin a smaller second ceiling here.
  //
  // THROUGH THE LOAD BUDGET (#606), not a raw spawnSync: a child killed by its own wall clock returns
  // `stdout: null → ""` and `status: null`, which is byte-identical to "the lens printed nothing" — the
  // exact misread this suite exists to prevent one level down. Measured on a full `verify --push`: the
  // zero-match row false-red as `expected '' to be 'RESULT …'` under contention. `spawnNodeWithBudget`
  // scales the budget with the box and THROWS a self-identifying ORB-LOAD-KILL instead, so a contention
  // kill is legible as exit-2 class rather than read as an assertion failure.
  const budgetMs = scaledBudget(baseTimeoutMs);
  const res = spawnNodeWithBudget([AST_CLI, ...argv], REPO_ROOT, budgetMs, `pnpm ast ${argv.join(" ")}`);
  return { stdout: res.stdout, stderr: res.stderr, status: res.status, epilogue: parseEpilogue(res.stderr) };
}

test(
  "a zero-match run PROVES it scanned — scanned>0, matches=0, status=complete",
  () => {
    // `packages/kit/src/index.ts` is a one-line placeholder barrel: a REAL empty answer, not a missed one.
    const run = runAst(["exports", "packages/kit/src/index.ts"]);
    expect(run.stdout).toBe("RESULT ast exports packages/kit/src/index.ts: no results\n");
    expect(run.status).toBe(0);
    expect(Number(run.epilogue["scanned"])).toBeGreaterThan(0);
    expect(run.epilogue["matches"]).toBe("0");
    expect(run.epilogue["status"]).toBe("complete");
    // langs names the LANGUAGE(S) actually walked — the TS/TSX undercount tell.
    expect(run.epilogue["langs"]).toMatch(EPILOGUE_LANGS_TS_RE);
    expect(run.epilogue["scope"]).toContain("path:packages/kit/src/index.ts");
    expect(run.epilogue["scope"]).toContain("corpus:harness-globs");
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "a zero-match NAME lookup on the syntactic corpus carries the corpus caveat — a symbol in unscanned scripts/** must not read as absent",
  () => {
    // `callers` scans harness-globs (packages src + tests + tooling/src/verify/gates): a function that lives
    // ONLY in e.g. scripts/github/ zero-matches here while being fully alive. The bare "no results" line
    // read as a clean answer once (a file-local `gh()` helper); the caveat is the fix. Path-scoped verbs
    // (the `exports` case above) stay bare — their argument names a file that WAS scanned.
    const run = runAst(["callers", "thisSymbolExistsNowhereAtAll"]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("no results — NOTE: the syntactic corpus excludes scripts/**");
    expect(run.epilogue["matches"]).toBe("0");
    expect(run.epilogue["status"]).toBe("complete");
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "a matching run reports its matches, and the epilogue never touches stdout",
  () => {
    const run = runAst(["exports", "packages/kit/src/ids"]);
    expect(run.status).toBe(0);
    expect(Number(run.epilogue["matches"])).toBeGreaterThan(0);
    expect(run.epilogue["status"]).toMatch(EPILOGUE_STATUS_OK_RE);
    // Byte-compatibility for pipelines: `pnpm ast … > file` keeps producing exactly what it used to.
    expect(run.stdout).not.toContain("[ast]");
    expect(run.stdout).toContain("RESULT ast exports packages/kit/src/ids:");
    expect(run.stderr).toContain("[ast] verb=exports");
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "an --in filter that admits no file is a TOOL ERROR, not a clean zero",
  () => {
    // `scripts/dev/**` is real on disk and absent from the SYNTACTIC corpus (harness-globs loads only
    // tooling/src/verify/gates) — the exact shape that used to print `no results` from a search of nothing.
    const run = runAst(["ident", "REPO_ROOT", "--in", "scripts/dev"]);
    expect(run.epilogue["scanned"]).toBe("0");
    expect(run.epilogue["status"]).toBe("error");
    expect(run.stderr).toContain("SCOPE ENTERED NOTHING");
    expect(run.status).toBe(2);
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "a positional path scope that admits no file exits 2 the same way",
  () => {
    const run = runAst(["exports", "packages/no-such-package/src"]);
    expect(run.epilogue["scanned"]).toBe("0");
    expect(run.epilogue["skipped"]).not.toBe("0");
    expect(run.epilogue["status"]).toBe("error");
    expect(run.status).toBe(2);
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "--json carries the same audit fields as `meta`, beside the untouched result shape",
  () => {
    // `--max` above the hit count so nothing is capped — this row pins the COMPLETE status too.
    const run = runAst(["exports", "packages/kit/src/ids", "--json", "--max", "500"]);
    expect(run.status).toBe(0);
    const parsed = JSON.parse(run.stdout) as {
      label: string;
      total: number;
      shown: number;
      hits: unknown[];
      meta: {
        verb: string;
        scope: string;
        langs: Record<string, number>;
        scanned: number;
        skipped: number;
        skippedBy: Record<string, number>;
        matches: number;
        status: string;
      };
    };
    // the pre-existing shape, unmoved
    expect(parsed.label).toContain("exports packages/kit/src/ids");
    expect(parsed.total).toBeGreaterThan(0);
    expect(parsed.hits.length).toBe(parsed.shown);
    // the additive audit block, agreeing with the stderr epilogue's own numbers
    expect(parsed.meta.verb).toBe("exports");
    expect(parsed.meta.scanned).toBeGreaterThan(0);
    expect(parsed.meta.matches).toBe(parsed.total);
    expect(parsed.meta.status).toBe("complete");
    expect(parsed.meta.langs["ts"]).toBeGreaterThan(0);
    expect(Object.keys(parsed.meta.skippedBy).sort()).toEqual(["declaration-file", "out-of-filter", "out-of-scope", "test-file"]);
    expect(String(parsed.meta.scanned)).toBe(run.epilogue["scanned"]);
  },
  SPAWN_TIMEOUT_MS,
);

// ── literal: the wide-syntactic-corpus string-literal search ────────────────────────────────────────
// The planted positive control is a real value-changing coupled-fixture case: `chatDeleted` is a wire
// event-type literal pinned in `packages/contracts/src/chat/bus.ts` AND in `tests/**` fixtures — exactly
// the sweep `literal` exists for. The corpus is the TYPED file set WITHOUT the type graph (fast).

test(
  "literal finds a real coupled fixture across packages/ AND tests/, and never inside an identifier or comment",
  () => {
    const run = runAst(["literal", "chatDeleted"]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("string-literal");
    // A hit under tests/ is the whole point — the syntactic corpus (harness-globs) would still see tests/,
    // but the point here is the corpus is WIDE (scripts/** too) and carries NO type graph.
    expect(run.stdout).toContain("tests/");
    expect(run.epilogue["scope"]).toContain("corpus:search-globs-no-types");
    expect(Number(run.epilogue["matches"])).toBeGreaterThan(0);
  },
  SPAWN_TIMEOUT_MS,
);

// Built via concatenation, deliberately: `literal` matches on STRING-LITERAL TEXT, so writing the query as
// one literal in THIS file would make it self-match (this file lives in the wide corpus `literal` scans).
const ABSENT_LITERAL = ["nowhere", "AtAll", "9f3a1c"].join("_");

test(
  "literal on a value that appears NOWHERE is a real empty answer, not a missed scan",
  () => {
    const run = runAst(["literal", ABSENT_LITERAL]);
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(`RESULT ast literal ${ABSENT_LITERAL}: no results\n`);
    expect(Number(run.epilogue["scanned"])).toBeGreaterThan(0);
    expect(run.epilogue["matches"]).toBe("0");
    expect(run.epilogue["status"]).toBe("complete");
  },
  SPAWN_TIMEOUT_MS,
);

// ── dead: the CLI-level "no declaration found" path (the arm the in-memory unit suite cannot drive —
// it needs the workspace's own barrel resolution, so it is pinned once here at real-tree cost). ──────

test(
  "dead on a name with no declaration anywhere reports it plainly, and still closes the epilogue",
  () => {
    const run = runAst(["dead", "thisSymbolExistsNowhereAtAllZzz"]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("no declaration found");
    expect(run.epilogue["verb"]).toBe("dead");
    expect(run.epilogue["status"]).toBe("complete");
  },
  SPAWN_TIMEOUT_MS,
);

// ── --all: columns/regkeys per-table/per-registry sectioning ────────────────────────────────────────
// `regkeys` is syntactic (cheap); `columns` is TYPED (the one typed-verb exception in this file — its
// `--all` breakdown is CLI-only, unreachable from the in-memory unit suite since `cmdColumns` is private).

test(
  "columns --all sweeps every table and receipts the count, without changing the class-summary totals",
  () => {
    const run = runAst(["columns", "--all", "--max", "3"], COLUMNS_TIMEOUT_MS);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(COLUMNS_ALL_SWEPT_RE);
    // Every table gets a line, healthy or not — at least one recognizable real table shows up.
    expect(run.stdout).toContain("rpg_games (rpgGames):");
  },
  COLUMNS_TIMEOUT_MS,
);

test(
  "regkeys --all sweeps every registry and receipts the count, at the cheap syntactic load",
  () => {
    const run = runAst(["regkeys", "--all", "--max", "3"]);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(REGKEYS_ALL_SWEPT_RE);
    expect(run.epilogue["scope"]).toContain("corpus:harness-globs");
  },
  SPAWN_TIMEOUT_MS,
);

// ── the two live blind-spot repros, pinned on the REAL TREE (2026-08-14) ────────────────────────────────
// `rot ui` is the TYPED arm (loads the full ui-package type graph) — the slowest row in this file, so it
// runs on HEAVY_TIMEOUT_MS. Its test budget used to be 180s while its SPAWN was still capped at 120s: the
// child died first and the row failed on `status: null`, which looks like a lens defect and is not one.

test(
  "rot ui no longer flags CodeEditor test-only — its lazy `.then((m) => m.CodeEditor)` consumers now count",
  () => {
    // Live repro (regex-editor-fields.tsx, theme-editor.tsx): `lazy(() =>
    // import("@orb/ui/code-editor").then((m) => ({ default: m.CodeEditor })))`. `resolveModule` only
    // follows relative specifiers, so this package-aliased dynamic import never reached `markModuleAlive`
    // before the fix — `dead CodeEditor` (language-service `findReferences`) already saw the real
    // consumers; `rot ui` did not.
    const run = runAst(["rot", "ui"], HEAVY_TIMEOUT_MS);
    expect(run.status).toBe(0);
    expect(run.stdout).not.toContain("CodeEditor");
    expect(run.epilogue["status"]).toMatch(EPILOGUE_STATUS_OK_RE);
  },
  HEAVY_TIMEOUT_MS,
);

// ── #452: the jsx verb + ARGV HYGIENE (the silent false-clean class) ────────────────────────────────
// The live report: `pnpm ast jsx --name Button` printed `matches=0 status=complete` at scanned=5433
// while the tree holds 242 files with a real `<Button>`. The LENS was innocent — `--name` was read as
// the positional NAME (a component literally called "--name"), and `Button` fell through parseFlags'
// silent unknown-token drop. Two arms, so a repeat of either shape is RED:
//   • the lens matches BOTH JSX element kinds (paired + self-closing) — the positive controls below;
//   • a flag-shaped positional and an unknown flag REFUSE (exit 3, EXIT.misuse) instead of searching.

test(
  "jsx matches PAIRED elements — the positive control the false-clean report needed (#452)",
  () => {
    // `Button` is the reported query. immersive-card.tsx carries a real `<Button …>…</Button>` pair
    // (JsxOpeningElement), so a zero here means the lens went blind, not that the tree is empty.
    const run = runAst(["jsx", "Button", "--files"]);
    expect(run.status).toBe(0);
    expect(Number(run.epilogue["matches"])).toBeGreaterThan(0);
    expect(run.stdout).toContain("packages/ui/src/content/immersive-card/immersive-card.tsx");
    // The TS≠TSX trap made visible: a JSX lens that scanned no .tsx is not a verdict.
    expect(run.epilogue["langs"]).toMatch(EPILOGUE_LANGS_TSX_RE);
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "jsx matches SELF-CLOSING elements too — the arm a JsxOpeningElement-only sweep would miss (#452)",
  () => {
    // `Skeleton` has ZERO `</Skeleton>` closing tags anywhere on the tree (verified by literal sweep),
    // so every one of its usages is a JsxSelfClosingElement: this row FAILS outright if that kind is
    // dropped, where a `Button` row would still look healthy on its paired sites alone.
    const run = runAst(["jsx", "Skeleton", "--files"]);
    expect(run.status).toBe(0);
    expect(Number(run.epilogue["matches"])).toBeGreaterThan(0);
    expect(run.stdout).toContain("packages/ui/src/stream/shimmer.tsx");
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "a flag-shaped positional REFUSES (exit 3) instead of searching for a component named --name (#452)",
  () => {
    const run = runAst(["jsx", "--name", "Button"]);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain("ARG ERROR");
    expect(run.stderr).toContain("POSITIONALLY");
    // The refusal names the repair, so the next reader does not re-derive it.
    expect(run.stderr).toContain("pnpm ast jsx Button");
    // …and it never pretends to have answered. (stdout DOES carry the usage block — which itself quotes
    // the phrase "no results" — so the assertion is on the ANSWER line and the epilogue, not that word.)
    expect(run.stdout).not.toContain("RESULT ast jsx");
    expect(run.stderr).not.toContain("matches=0");
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "an unknown flag REFUSES instead of being silently dropped (#452)",
  () => {
    // The other half of the same defect: `Button` was swallowed by parseFlags without a word. A typo'd
    // flag must never degrade a run into a quiet wrong answer.
    const run = runAst(["jsx", "Button", "--fles"]);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain("ARG ERROR");
    expect(run.stderr).toContain("--fles");
    expect(run.stdout).not.toContain("RESULT ast jsx");
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "the known flags still parse — the refusal arm cannot have eaten the vocabulary (#452)",
  () => {
    const run = runAst(["jsx", "Skeleton", "--in", "packages/ui/src", "--max", "5", "--json"]);
    expect(run.status).toBe(0);
    const parsed = JSON.parse(run.stdout) as { total: number; hits: { file: string }[] };
    expect(parsed.total).toBeGreaterThan(0);
    expect(parsed.hits.every((h) => h.file.includes("packages/ui/src"))).toBe(true);
  },
  SPAWN_TIMEOUT_MS,
);

// ── #1507: a value flag may not EAT the next flag ───────────────────────────────────────────────────
// Same family as #452 above, one layer in: `--in`/`--max` took `rest[i + 1]` unconditionally, so
// `--in --json` filtered the results against the literal path fragment "--json" — zero hits, no warning,
// and the `--json` the caller asked for silently un-set. A filter that matches nothing prints exactly
// like a clean answer.
test(
  "a value flag followed by ANOTHER FLAG refuses instead of filtering against '--json' (#1507 red-first)",
  () => {
    const run = runAst(["jsx", "Skeleton", "--in", "--json"]);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain("ARG ERROR");
    expect(run.stderr).toContain("--in");
    expect(run.stderr).toContain("--json");
    // It never pretends to have answered — the whole point is that the zero was indistinguishable.
    expect(run.stdout).not.toContain("RESULT ast jsx");
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "a value flag as the LAST argument refuses rather than defaulting silently (#1507)",
  () => {
    const run = runAst(["jsx", "Skeleton", "--in"]);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain("--in needs a value");
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "--max with a non-number refuses instead of quietly using the default cap (#1507)",
  () => {
    // `Number("abc") || DEFAULT_MAX` reported a run truncated at 60 as though the caller had asked for it.
    const run = runAst(["jsx", "Skeleton", "--max", "abc"]);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain("--max needs a positive number");
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "a depcruise pass-through that BROKE exits 2 (tool error), not 1 (#1507)",
  () => {
    // `(` makes dependency-cruiser refuse the pattern outright ("will probably run very slowly — cowardly
    // refusing to run") — a fast, deterministic broken walk with no graph behind it. Two things were
    // wrong: the op only noticed a nonzero exit when stdout was EMPTY (a half-written graph plus an error
    // printed as the answer, exit 0), and the code it set was 1 — a VERDICT — for a run that never
    // completed. With `--output-type text` depcruise's own reporter hardcodes exit 0, so a nonzero here
    // can only ever be a break: exit-2 class.
    const run = runAst(["flow", "("]);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("did NOT complete");
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "regkeys MOTION_BUDGETS no longer flags the same-file dot-access rows",
  () => {
    // Live repro (packages/client/src/lib/motion-flaggers.ts): `MOTION_BUDGETS.frameGapMs` /
    // `.cssScanIntervalMs` / `.spaceScanCap`, all read from functions defined LATER in the SAME file the
    // table is declared in — `dispatchSitesOf` unconditionally excludes the registry's own file, so this
    // was invisible to the lens before the qualified-access fix.
    const run = runAst(["regkeys", "MOTION_BUDGETS"]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("RESULT ast regkeys MOTION_BUDGETS: no results");
    expect(run.epilogue["matches"]).toBe("0");
  },
  SPAWN_TIMEOUT_MS,
);
