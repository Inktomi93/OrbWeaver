// Gate: tsconfig-entry-liveness — a FILE-EXACT path in a `tsconfig*.json` `include`/`exclude` (a literal file
// or dir, not a glob) names ONE specific tree node. When that node is deleted or moved the entry goes SILENTLY
// dead — a dead exclude is stale dead-weight, a dead include silently drops the coverage it was carrying, and
// (the tests-dom program) a moved DOM-coupled escapee stops being libbed at all. This is biome-grant-liveness's
// shape (GATE-AUTHORING.md §4.4 mode B) turned on the TYPE configs, which feed the unified native typecheck
// list. Arms: DEAD (an exact entry resolving to nothing), MISSING-CONFIG + UNPARSEABLE-CONFIG (fail LOUD — a
// silently-defaulted tsconfig would let a downstream typecheck lie), NO-ROWS (the §4.6 GLOBAL blindness
// tripwire: an anchor-sized set deriving zero exact entries means the glob/exact classifier rotted), and the
// two-sided EXEMPT arms. DECLARED LIMITS: glob rows (`packages/*/src`, `**/*.tsx`, `${configDir}/...`) are
// declared skips; a dead INCLUDE may be a deliberate not-yet-created path, so both include and exclude entries
// PATTERN LIVENESS (#973): the glob entries are judged too. A glob is LIVE when node's own
// `path.matchesGlob` puts at least one TRACKED file inside it — after the entry is resolved against ITS
// OWN CONFIG'S DIRECTORY, which is the trap this family exists around (`../../tests/client/**/*.tsx` in
// packages/client/tsconfig.json is `tests/client/**/*.tsx` at the root, and expanding it against the wrong
// root is a silent false verdict either way). Zero members = a program including nothing, or an exclude
// carrying dead weight. Two families cannot be judged: `${configDir}` entries (TypeScript expands them per
// INHERITING config, so the entry has no single root to expand against — budgeted, not guessed) and the
// by-design rows in RATIFIED below.
// route through the same two-sided EXEMPT table (not a hard fail). COMMENT POSTURE: n/a — parsed as JSONC via
// the TypeScript config reader, so comments are structurally out of scope.
// CONVERSION BLOCKED ON A SHARED READER, NOT ON A CAPABILITY (2026-09-11, #1930). Guide §11.4 once named a
// `jsonc` ResourceHost kind for this gate; it was never built and is now RULED OUT with its reason
// (`docs/design/gate-runtime-standardization.md` §12.4), because this module is the corpus's ONLY JSONC parse
// (`readTsconfig` below) and a kind serving one gate is that gate's private reader wearing a contract's
// clothes. What this gate actually needs is per-config RAW `include`/`exclude` entries — UNFOLDED and
// UNEXPANDED, resolved against each config's OWN directory, which is the trap this family exists around — and
// the world program's shared compiler reader already owns the config grammar (`lib/policy-program-membership.ts`
// `parseConfig`, which keeps exactly that `raw` object beside the folded `ParsedCommandLine`, #1351). So the
// conversion route is exposing that raw half through the shared reader. Until then: legacy, and fully armed.
// REFUSAL RE-DERIVED AND RE-DATED 2026-09-12 (#2013) — a refusal is a SNAPSHOT, and nothing re-opens one
// when its blocker lands, so here is what was measured today rather than inherited:
//   · the one-consumer measurement HOLDS: `ts.parseConfigFileTextToJson` / `ts.readConfigFile` across
//     `tooling/src/verify/gates/**` is this module's `foldConfig` and nothing else (the only other `jsonc`
//     mentions in the gate corpus are extension lists in `no-nul-bytes-in-source.ts` and
//     `no-blanket-suppression.ts`). A `jsonc` kind would still serve one gate. §12.4's ruling stands.
//   · the shared-READER exposure is still UNBUILT, and it is not a one-line change. `parseConfig`
//     (`lib/policy-program-membership.ts`) does keep the unfolded `raw` config object beside the folded
//     `ParsedCommandLine`, but `ParsedConfig` is module-private and nothing it publishes carries raw
//     `include`/`exclude`. Exposing it is THREE coupled decisions, not one: (a) a new public shape on the
//     #1351 compiler reader — a world-program surface this program does not own; (b) LINE identity, which
//     `readConfigFile` structurally drops (it returns a value, not an AST), and every finding this gate
//     emits is anchored at its entry's own line, so the exposure must carry positions or the gate loses its
//     anchor; (c) the tsconfig ROSTER, which this module discovers by `readdirSync` and which would have to
//     become declared data. So this is its own lane with #1351's reader as its coupled site, and the
//     decision it needs is a READER design ruling, not a capability.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { ts } from "ts-morph";
import type { ExemptionTable, Finding, GateDescriptor, GateScanDeclaration } from "../contract/gate.ts";
import type { ExactRow, GrantExemption, LivenessMessages, PatternLivenessMessages, PatternRow } from "../lib/grant-liveness.ts";
import {
  globMatcher,
  irreducibleBudgetFindings,
  isFileExact,
  lineFinder,
  livenessFindings,
  memberSources,
  patternLivenessFindings,
} from "../lib/grant-liveness.ts";

const PRIMARY_REL = "tsconfig.json";
const UNIT = "tsconfig entry";
/** A `${configDir}`-style template token is not a literal path — TypeScript expands it per-package, so it is
 *  a glob, not a file-exact entry. (The `{`/`}` already make `isFileExact` false; this names the intent.) */
const TEMPLATE_RE = /\$\{/u;
/** A tsconfig config filename: `tsconfig.json`, `tsconfig.base.json`, `tsconfig.tests-dom.json`, … */
const TSCONFIG_NAME_RE = /^tsconfig(\..+)?\.json$/u;

/** §4.5 real-tree anchor, in the rename-proof COUNT form: the real tsconfig set carries dozens of
 *  include/exclude entries; a conformance mini-project plants a handful. Guards NO-ROWS + both exemption arms. */
const REAL_CONFIG_MIN_CANDIDATES = 30;

/** The one legitimately-absent exact entry + the doc that makes it so. Both hard-coded, both tripwire-paired
 *  (§3): the key with the STALE arm, the cite with the DEAD-CITE arm. */
const ST_GOLDENS_RUNTIME = "scripts/probes/st-goldens/sillytavern-runtime";
const ST_GOLDENS_README = "scripts/probes/st-goldens/README.md";

const EXEMPT: ExemptionTable<GrantExemption> = {
  [ST_GOLDENS_RUNTIME]: {
    why:
      "not a dead entry — a GITIGNORED captured SillyTavern install that is absent on a clean checkout by " +
      "design; the root aggregator EXCLUDES it so its four root .d.ts files (which declare ST's browser " +
      "globals into our global scope) never join the program. Delete this row the day scripts/probes/st-goldens " +
      "stops shipping a gitignored runtime subtree.",
    cite: ST_GOLDENS_README,
  },
};

/** The committed count of `${configDir}` entries — irreducible because TypeScript expands the token per
 *  INHERITING config, so the entry denotes a different path in each extender and has no single member set.
 *  Two-sided: growth adds unreviewed authority, an uncommitted shrink leaves a budget nobody can trust. */
const CONFIG_DIR_BUDGET = 0;

/** The §4.5 real-tree anchor for the BUDGET arm: this gate's own module, which no planted fixture root carries. */
const GATE_SELF = "tooling/src/verify/gates/tsconfig-entry-liveness.ts";
/** The BUDGET arm's own real-tree anchor — a fact about the REAL config set, so it is judged only where
 *  the enforcement ledger lives. A planted fixture carries its own rows and would (correctly for itself,
 *  wrongly for this repo) disagree with a committed budget it knows nothing about. */
const BUDGET_ANCHOR = "docs/architecture/core/Core-Enforcement-Active-Gates.md";

const GATE_FIXTURE_LAW = "tooling/src/verify/gates/GATE-AUTHORING.md";
const TYPE_CONFIG_LAW = "docs/architecture/core/Core-Tooling-Law.md";

/** Glob entries whose members are absent from the tracked corpus BY DESIGN, each with its END CONDITION.
 *  Keyed by the entry AS AUTHORED (the same spelling the config carries), two-sided on both halves. */
const RATIFIED: ExemptionTable<GrantExemption> = {
  "scripts/**/*.cts": {
    why:
      "the Node root declares every authored TypeScript dialect before its first scripts .cts file. Delete " +
      "this row when the first scripts/**/*.cts source lands and pattern liveness reports it stale.",
    cite: TYPE_CONFIG_LAW,
  },
  "scripts/**/*.mts": {
    why:
      "the Node root declares every authored TypeScript dialect before its first scripts .mts file. Delete " +
      "this row when the first scripts/**/*.mts source lands and pattern liveness reports it stale.",
    cite: TYPE_CONFIG_LAW,
  },
  "scripts/**/*.tsx": {
    why:
      "the browser root declares TSX scripts before its first member so a future authored file cannot be " +
      "silently unowned. Delete this row when the first scripts/**/*.tsx source lands and pattern liveness reports it stale.",
    cite: TYPE_CONFIG_LAW,
  },
  "tests/**/*.cts": {
    why:
      "the Node root declares every authored TypeScript dialect before its first tests .cts file. Delete " +
      "this row when the first tests/**/*.cts source lands and pattern liveness reports it stale.",
    cite: TYPE_CONFIG_LAW,
  },
  "tests/support/iso/**/*": {
    why:
      "the explicit ISO-helper root exists before its first helper by design; reset.d.ts + platform.d.ts keep " +
      "the compiler leaf measurable meanwhile. Delete this row when the first tests/support/iso source lands " +
      "and pattern liveness reports the exemption stale.",
    cite: TYPE_CONFIG_LAW,
  },
  "**/node_modules": {
    why:
      "INSTALLED DEPENDENCIES: node_modules is gitignored, so it is absent from the tracked corpus by " +
      "design and present only after an install — judging it either way makes the verdict depend on " +
      "machine state. Delete this row the day the type programs stop needing to exclude installed packages.",
    cite: ".gitignore",
  },
  "**/__g_*": {
    why:
      "the reserved throwaway-fixture sentinel: check-gates.int materialises `__g_*` files at real-tree " +
      "paths for milliseconds and reaps them, so the subject is ABSENT from every tracked source by " +
      "construction — an exclude that must PRE-EXIST the fixture it excludes. Delete this row the day the " +
      "`__g_` sentinel is retired.",
    cite: GATE_FIXTURE_LAW,
  },
  "**/__g_*/**": {
    why:
      "the directory half of the `__g_` sentinel exclude — same construction, same END CONDITION (delete " +
      "with its sibling the day the sentinel is retired).",
    cite: GATE_FIXTURE_LAW,
  },
};

const PATTERN_MESSAGES: PatternLivenessMessages = {
  deadPattern:
    "a GLOB `include`/`exclude` entry in a tsconfig matches NO tracked file, after resolving it against its " +
    "OWN config's directory. A dead include silently drops the coverage it was carrying (a whole program " +
    "checking nothing); a dead exclude is stale weight that the next file created under it inherits " +
    "(tooling/src/verify/gates/GATE-AUTHORING.md §4.4 mode B). Re-point the entry, delete it, or — if its " +
    "members are absent by design (a gitignored tree, the `__g_` fixture sentinel) — add a RATIFIED row in " +
    "tooling/src/verify/gates/tsconfig-entry-liveness.ts with its `why` + END CONDITION and a resolving " +
    "`cite`. The finding token is the entry as authored.",
  staleRatified:
    "a tsconfig-entry-liveness RATIFIED row forgives a glob entry no scanned tsconfig carries — a standing " +
    "allowance for a row that is gone is a LOADED GUN. Delete the row from RATIFIED in " +
    "tooling/src/verify/gates/tsconfig-entry-liveness.ts.",
  deadCite:
    "a tsconfig-entry-liveness RATIFIED row's `cite` no longer resolves — the decision that justified the " +
    "allowance moved or was deleted. Re-derive the cite, or delete the row from RATIFIED in " +
    "tooling/src/verify/gates/tsconfig-entry-liveness.ts.",
  budgetMoved:
    "the count of `${configDir}` tsconfig entries is {actual}, but the committed budget is {budget}. " +
    "TypeScript expands that token per INHERITING config, so the entry has no single root to expand " +
    "against and no member set a static reader can test — the budget is what keeps that population from " +
    "growing silently. GROWTH: justify the new entry or spell it as a real path. SHRINK: commit it, by " +
    "lowering CONFIG_DIR_BUDGET in tooling/src/verify/gates/tsconfig-entry-liveness.ts.",
};

const MSG_CORPUS_BLIND =
  "the tracked-file corpus came back EMPTY on a real-sized tsconfig set — `git ls-files` failed or this is " +
  "not a work tree, so every glob-liveness verdict below is vacuous and a ✓ would be a lie " +
  "(tooling/src/verify/gates/GATE-AUTHORING.md §4.6). See tooling/src/verify/lib/grant-liveness.ts.";

const MESSAGES: LivenessMessages = {
  dead:
    "a FILE-EXACT `include`/`exclude` entry in a tsconfig names nothing on the tree — the entry is DEAD. A dead " +
    "exclude is stale dead-weight; a dead include silently drops the coverage it carried (and, for tsconfig.tests-dom.json, " +
    "stops libbing a DOM-coupled escapee). The finding token is the dead path. See tooling/src/verify/gates/GATE-AUTHORING.md §4.4 mode B.",
  staleExempt:
    "a tsconfig-entry-liveness EXEMPT row forgives a path no scanned tsconfig carries — a standing exemption for a " +
    "row that is gone is a LOADED GUN. Delete the row from EXEMPT in tooling/src/verify/gates/tsconfig-entry-liveness.ts.",
  deadCite:
    "a tsconfig-entry-liveness EXEMPT row's `cite` no longer resolves — the doc that justified the exemption moved " +
    "or was deleted. Re-derive the cite, or delete the row from EXEMPT in tooling/src/verify/gates/tsconfig-entry-liveness.ts.",
};

const MSG_MISSING =
  "tsconfig.json is not at the repo root — this gate's primary subject (the native compiler program set) is gone, " +
  "so its verdict is unknowable and a ✓ here would be a lie (tooling/src/verify/gates/GATE-AUTHORING.md §4.6). Re-point " +
  "PRIMARY_REL in tooling/src/verify/gates/tsconfig-entry-liveness.ts, or delete the gate with the config.";

const MSG_UNPARSEABLE =
  "a tsconfig*.json did not parse as JSONC. Fail LOUD, never fall back to a default: a silently-defaulted type " +
  "config typechecks nothing this repo asked for. Fix the JSON. See tooling/src/verify/gates/tsconfig-entry-liveness.ts.";

const MSG_NO_ROWS =
  "the tsconfig set parsed but ZERO file-exact include/exclude entries were derived from an anchor-sized candidate " +
  "set — the glob/exact classifier has rotted past every row, so this gate is BLIND and its ✓ means nothing " +
  "(tooling/src/verify/gates/GATE-AUTHORING.md §4.6). Re-derive the classifier in tooling/src/verify/gates/tsconfig-entry-liveness.ts.";

/** Discover the tsconfig files this gate judges: every `tsconfig*.json` at the repo root, each
 *  per-package `tsconfig.json`, and tooling's. Bounded on purpose (never walks node_modules or sibling
 *  worktrees) and existence-guarded so a conformance temp root with only a planted config works. */
function discoverConfigs(root: string): readonly string[] {
  const out: string[] = [];
  for (const f of readdirSync(root)) {
    if (TSCONFIG_NAME_RE.test(f)) {
      out.push(f);
    }
  }
  const pkgsDir = join(root, "packages");
  if (existsSync(pkgsDir)) {
    for (const entry of readdirSync(pkgsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(pkgsDir, entry.name, "tsconfig.json"))) {
        out.push(`packages/${entry.name}/tsconfig.json`);
      }
    }
  }
  if (existsSync(join(root, "tooling", "tsconfig.json"))) {
    out.push("tooling/tsconfig.json");
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function toStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

interface Accumulated {
  readonly exact: readonly ExactRow[];
  readonly candidates: number;
  readonly globs: readonly PatternRow[];
  /** `${configDir}` entries — irreducible, counted against CONFIG_DIR_BUDGET. */
  readonly templates: number;
  readonly unparseable: readonly Finding[];
}

/** Parse one tsconfig, classify its include+exclude entries, and fold them into the accumulator. */
function foldConfig(root: string, rel: string, acc: Accumulated): Accumulated {
  const text = readFileSync(join(root, rel), "utf-8");
  const parsed = ts.parseConfigFileTextToJson(rel, text);
  if (parsed.error !== undefined || parsed.config === undefined) {
    return { ...acc, unparseable: [...acc.unparseable, { file: rel, line: 0, column: 0, message: MSG_UNPARSEABLE }] };
  }
  const config = parsed.config as { include?: unknown; exclude?: unknown };
  const entries = [...toStringArray(config.include), ...toStringArray(config.exclude)];
  const lineOf = lineFinder(text);
  const configDir = dirname(rel);
  const exact: ExactRow[] = [];
  const globs: PatternRow[] = [];
  let templates = 0;
  for (const entry of entries) {
    if (TEMPLATE_RE.test(entry)) {
      templates += 1;
    } else if (!isFileExact(entry)) {
      // Resolve the glob against ITS OWN config's directory before matching — the entry is authored
      // relative to the config, and expanding it against the repo root is the silent-wrong-answer trap
      // BOTH ways (packages/client/tsconfig.json's `../../tests/client/**/*.tsx` is `tests/client/**/*.tsx`
      // at the root; the naive concatenation leaves a `..` segment that matches nothing at all).
      const rooted = relative(root, join(root, configDir, entry));
      globs.push({ file: rel, pattern: entry, line: lineOf(entry), matches: globMatcher(rooted) });
    } else if (isFileExact(entry) && !TEMPLATE_RE.test(entry)) {
      // tsconfig include/exclude paths are relative to the CONFIG FILE's directory, not the repo root —
      // resolve to a repo-relative path so existsSync + the EXEMPT table + the finding token all agree
      // (`tooling/tsconfig.json`'s `src` is `tooling/src`; its `../reset.d.ts` is repo-root `reset.d.ts`).
      const resolved = relative(root, join(root, configDir, entry));
      exact.push({ file: rel, path: resolved, line: lineOf(entry) });
    }
  }
  return {
    exact: [...acc.exact, ...exact],
    candidates: acc.candidates + entries.length,
    globs: [...acc.globs, ...globs],
    templates: acc.templates + templates,
    unparseable: acc.unparseable,
  };
}

interface Outcome {
  readonly findings: readonly Finding[];
  readonly declaration: GateScanDeclaration;
  /** The glob half's disposition, folded into the gate's scan declaration by `run`. */
  readonly patterns?: { readonly live: number; readonly ratified: number; readonly irreducible: number };
}

function scanTsconfigEntryLiveness(root: string): Outcome {
  if (!existsSync(join(root, PRIMARY_REL))) {
    return { findings: [{ file: PRIMARY_REL, line: 0, column: 0, message: MSG_MISSING }], declaration: { unit: UNIT, candidates: 0, scanned: 0 } };
  }
  let acc: Accumulated = { exact: [], candidates: 0, globs: [], templates: 0, unparseable: [] };
  for (const rel of discoverConfigs(root)) {
    acc = foldConfig(root, rel, acc);
  }
  const declaration: GateScanDeclaration = {
    unit: UNIT,
    candidates: acc.candidates,
    scanned: acc.exact.length,
    skipped: { glob: acc.globs.length + acc.templates },
  };
  if (acc.unparseable.length > 0) {
    return { findings: acc.unparseable, declaration };
  }
  const anchorOk = acc.candidates >= REAL_CONFIG_MIN_CANDIDATES;
  if (acc.exact.length === 0) {
    return { findings: anchorOk ? [{ file: PRIMARY_REL, line: 0, column: 0, message: MSG_NO_ROWS }] : [], declaration };
  }
  const exactFindings = livenessFindings({ root, exact: acc.exact, exempt: EXEMPT, exemptAnchorFile: PRIMARY_REL, anchorOk, messages: MESSAGES });
  // The PATTERN half runs only in a scope that carries this gate's OWN module (the §4.5 real-tree anchor
  // shape). A conformance mini-project and the file-exact fixtures have no work tree to derive a corpus
  // from, and their handful of rows are not the real population — judging them would red every proof.
  if (!(anchorOk && existsSync(join(root, GATE_SELF)))) {
    return { findings: exactFindings, declaration };
  }
  const sources = memberSources(root);
  if (sources.repoPaths.length === 0) {
    return { findings: [...exactFindings, { file: PRIMARY_REL, line: 0, column: 0, message: MSG_CORPUS_BLIND }], declaration };
  }
  const outcome = patternLivenessFindings({
    root,
    rows: acc.globs,
    sources,
    ratified: RATIFIED,
    ratifiedAnchorFile: PRIMARY_REL,
    anchorOk,
    messages: PATTERN_MESSAGES,
  });
  // The BUDGET is a fact about the REAL config set, guarded by a real-tree ANCHOR per §4.5 — a planted
  // anchor-sized fixture carries its own entries, and judging its `${configDir}` count against this repo's
  // committed budget would red every proof that ever plants one.
  const budget = existsSync(join(root, BUDGET_ANCHOR))
    ? irreducibleBudgetFindings(PRIMARY_REL, acc.templates, CONFIG_DIR_BUDGET, PATTERN_MESSAGES.budgetMoved)
    : [];
  return {
    findings: [...exactFindings, ...outcome.findings, ...budget],
    declaration,
    patterns: { live: outcome.live, ratified: outcome.ratified, irreducible: acc.templates },
  };
}

// ── self-proof fixtures ───────────────────────────────────────────────────────────────────────────────
/** `count` distinct glob entries — filler that clears the anchor while deriving zero exact rows. */
function globFiller(count: number): readonly string[] {
  return Array.from({ length: count }, (_, i) => `"packages/p${i}/**"`);
}
/** A one-config tsconfig carrying exactly the given raw `include` entries (already JSON-quoted). */
function includeJson(entries: readonly string[]): string {
  return `{\n  "include": [${entries.join(", ")}]\n}\n`;
}
const ANCHOR_FILLER = globFiller(REAL_CONFIG_MIN_CANDIDATES - 1);
const LIVE_REL = "packages/client/src/live.ts";
const LIVE_SOURCE = "export const live = 1;\n";
// A literal `${configDir}` template token, assembled so biome doesn't read it as a real placeholder. It is
// belt-and-braces over GLOB_META (the `{`/`}` already classify it a glob) — proving the TEMPLATE_RE skip too.
const CONFIG_DIR_TOKEN = ["$", "{configDir}/src"].join("");

export const gate: GateDescriptor = {
  name: "tsconfig-entry-liveness",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  // The unit is a JSONC config entry, not a workspace source file — this gate subscribes to no node kinds, so
  // it admits no files and declares its own scan counts through ctx.scan (GATE-AUTHORING.md §1 scan health).
  scanRoot: () => false,
  message: MESSAGES.dead,
  fix:
    "delete the dead path from its tsconfig `include`/`exclude`. If the file MOVED, re-point the entry. If it is " +
    "a deliberate not-yet-created path (or a gitignored/transient subtree), add a row to EXEMPT in " +
    "tooling/src/verify/gates/tsconfig-entry-liveness.ts with its `why` + END CONDITION and a resolving `cite`.",
  run: (ctx) => {
    const outcome = scanTsconfigEntryLiveness(ctx.root);
    ctx.scan(
      outcome.patterns === undefined
        ? outcome.declaration
        : {
            ...outcome.declaration,
            skipped: {
              "glob-live": outcome.patterns.live,
              "glob-ratified": outcome.patterns.ratified,
              "glob-irreducible-configdir": outcome.patterns.irreducible,
            },
          },
    );
    for (const finding of outcome.findings) {
      ctx.report(finding);
    }
  },
  mustFlag: [
    {
      files: { "tsconfig.json": '{\n  "exclude": ["packages/client/src/gone.ts"]\n}\n' },
      expect: { count: 1, token: "packages/client/src/gone.ts", line: 2 },
      why: "the founding shape — a file-exact EXCLUDE whose file is GONE (mode B: nothing ever visits it, so nothing examines the promise)",
    },
    {
      files: {
        "tsconfig.json": '{\n  "include": ["packages/*/src", "packages/client/src/live.ts", "packages/client/src/gone.ts"]\n}\n',
        [LIVE_REL]: LIVE_SOURCE,
      },
      expect: { count: 1, token: "packages/client/src/gone.ts" },
      why: "the glob row and the live exact row are both silent; ONLY the dead exact row fires — the classifier is the load-bearing half",
    },
    {
      files: { "not-tsconfig.json": "{}\n" },
      expect: { count: 1, messageIncludes: "not at the repo root" },
      why: "§4.6 blindness tripwire: the gate is keyed on the EXACT primary filename, so that name resolving to nothing must be RED",
    },
    {
      files: { "tsconfig.json": '{\n  "include": [ \n}\n' },
      expect: { count: 1, messageIncludes: "did not parse as JSONC" },
      why: "a malformed tsconfig must FAIL LOUD, never fall back to a default that would typecheck a program nobody declared",
    },
    {
      files: { "tsconfig.json": includeJson(globFiller(REAL_CONFIG_MIN_CANDIDATES)) },
      expect: { count: 1, messageIncludes: "ZERO file-exact" },
      why: "zero derived rows on an anchor-sized candidate set is 'I could not measure', never 'clean' — the classifier-rot tripwire",
    },
    {
      files: { "tsconfig.json": includeJson([...ANCHOR_FILLER, `"${LIVE_REL}"`]), [LIVE_REL]: LIVE_SOURCE },
      expect: { count: 1, token: ST_GOLDENS_RUNTIME, messageIncludes: "no scanned tsconfig carries" },
      why: "§4.4 two-sidedness: an EXEMPT row forgiving a path the tsconfig set does not carry is a loaded gun — it must RED",
    },
    {
      files: { "tsconfig.json": includeJson([...ANCHOR_FILLER, `"${ST_GOLDENS_RUNTIME}"`]) },
      expect: { count: 1, token: ST_GOLDENS_README, messageIncludes: "`cite` no longer resolves" },
      why: "the §3 path-constant tripwire: the exemption's justification MOVED, so the promise outlived its evidence and must RED",
    },
  ],
  mustPass: [
    {
      files: { [PRIMARY_REL]: JSON.stringify({ include: ["packages/definitely-not-here/**/*.ts"] }) },
      why: "DECLARED LIMIT — the PATTERN half is scoped to a root carrying this gate's own module (the §4.5 real-tree anchor shape): a mini-project has no git work tree to derive the `git ls-files` corpus from, so a glob with no members here is SILENT. The pattern arms are proven instead by the permanent pin under tests/tooling/verify/gates/, which plants a real throwaway repo (#973).",
    },
    {
      files: { "tsconfig.json": '{\n  "exclude": ["packages/client/src/live.ts"]\n}\n', [LIVE_REL]: LIVE_SOURCE },
      why: "a file-exact exclude whose file is on the tree — the sanctioned shape, silent",
    },
    {
      files: { "tsconfig.json": includeJson([`"packages/*/src"`, `"${CONFIG_DIR_TOKEN}"`, `"tests/**/*.tsx"`]) },
      why: "DECLARED LIMIT — every glob + configDir-template spelling is a declared skip; a small config also stays under the anchor so NO-ROWS never fires",
    },
    {
      files: { "tsconfig.json": includeJson([...ANCHOR_FILLER, `"${ST_GOLDENS_RUNTIME}"`]), [ST_GOLDENS_README]: "# st goldens\n" },
      why: "the exemption HONOURED: an absent-by-design entry whose cited doc still resolves is silent on all three arms",
    },
  ],
};
