// Gate: depcruise-grant-liveness — a FILE-EXACT path in a `.dependency-cruiser.cjs` rule's `path`/`pathNot`
// names ONE file: a `pathNot` is an EXEMPTION (this one file may cross the boundary), a `path` is the rule's
// own subject. Either way, when that file is deleted or moved the row goes SILENTLY dead — an exemption
// nobody can see, or a rule aimed at nothing — and the next file created at that path inherits an import-law
// posture nobody re-approved. biome-grant-liveness's shape (GATE-AUTHORING.md §4.4 mode B) on the import-law
// config. TWO hard parts, and why this is its own gate: (1) the values are CODE, so observation runs the
// executable config through dependency-cruiser's public loader behind the config-snapshot process boundary;
// imported, called, spread and template-derived selectors retain their runtime values. Liveness judges the
// repository-authored root config only: `extends` package rules have a vendor lifecycle and member sources
// this repo does not own; the public loader still proves that the complete effective chain loads. (2) the
// values are REGEX SOURCE, not globs, so a path is only recognised when the pattern is FULLY ANCHORED
// (`^…$`) and carries no surviving metacharacter after unescaping `\.`/`\/`. That classifier is deliberately
// CONSERVATIVE in the direction that matters: these lists are load-bearing import law, so an ambiguous
// pattern becomes a declared SKIP, never a RED. Arms: DEAD · MISSING-CONFIG · UNPARSEABLE-CONFIG ·
// UNREADABLE-SHAPE · NO-ROWS (the §4.6 blindness tripwire) · the two-sided EXEMPT arms (shared,
// empty-but-armed at mint — every live row resolves).
// PATTERN LIVENESS (#973): the rows the file-exact classifier skips are no longer invisible. A pattern
// is LIVE when it matches at least one member of a FINITE tracked source — the `git ls-files` corpus, or
// the declared-dependency module paths (dep-cruiser matches MODULE paths, so `node_modules/echarts/` is
// live exactly while some package.json still declares echarts). Zero members in either = the same
// loaded-gun class one level up: import law aimed at nothing, or an exemption for a class that no longer
// exists. Two families cannot be judged and are RATIFIED with reasons + a no-growth budget: a `$1`
// BACKREFERENCE (its member set is bound by the paired rule's capture at cruise time, not by the tree) and
// the two by-design rows below.
// COMMENT POSTURE: comment-SAFE — observation reads runtime config values, never source text.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DepcruiseConfigSnapshotField, DepcruiseSelectorSnapshot } from "../contract/config-snapshot.ts";
import type { ExemptionTable, Finding, GateDescriptor, GateScanDeclaration } from "../contract/gate.ts";
import { readConfigSnapshot } from "../lib/config-snapshot.ts";
import type { ExactRow, GrantExemption, LivenessMessages, PatternLivenessMessages, PatternRow } from "../lib/grant-liveness.ts";
import { irreducibleBudgetFindings, livenessFindings, memberSources, patternLivenessFindings } from "../lib/grant-liveness.ts";

const CONFIG_REL = ".dependency-cruiser.cjs";
const UNIT = "grant row";
/** Regex metacharacters that make a pattern a CLASS of paths rather than one file. A pattern still carrying
 *  any of these after anchor-stripping and `\.`/`\/` unescaping is a declared skip, never a judged row. */
const REGEX_META_RE = /[|()[\]{}*+?^$\\]/u;

/** §4.5 real-tree anchor in its rename-proof COUNT form: the real config derives far more values across its
 *  rules; a conformance mini-project plants a handful. Counted over ALL derived values, never over the exact
 *  ones, so it can guard the very arm that judges the regex/literal classifier. */
const REAL_CONFIG_MIN_CANDIDATES = 80;

/** Empty but ARMED at mint — every file-exact row in .dependency-cruiser.cjs resolves today, so nothing
 *  needs forgiving. The two-sided machinery is shared (lib/grant-liveness.ts) and is
 *  proven in both directions by the sibling gates' pins; a row added here inherits both arms automatically. */
const EXEMPT: ExemptionTable<GrantExemption> = {};

/** A `$1`/`$2` capture BACKREFERENCE: dep-cruiser binds it from the paired `path`'s capture at cruise time,
 *  so the pattern denotes a different set per matched file and has no member set of its own to test. */
const BACKREF_RE = /\$\d/u;
/** The committed count of irreducible backreference rows. Two-sided: growth adds unreviewed authority, and
 *  an uncommitted shrink leaves a budget nobody can trust (#973 — never a silent counter). */
// The helper-world rule adds one paired capture to permit same-world edges while refusing upward ones.
// dependency-cruiser-worlds.int.test.ts proves that distinction, including transitive and type-only edges.
const BACKREF_BUDGET = 16;

/** The §4.5 real-tree anchor for the BUDGET arm: this gate's own module, which no planted fixture root
 *  carries. Paired with a tripwire by construction — if it stops resolving the gate cannot run at all. */
const GATE_SELF = "tooling/src/verify/gates/depcruise-grant-liveness.ts";
/** The BUDGET arm's own real-tree anchor — a fact about the REAL config set, so it is judged only where
 *  the enforcement ledger lives. A planted fixture carries its own rows and would (correctly for itself,
 *  wrongly for this repo) disagree with a committed budget it knows nothing about. */
const BUDGET_ANCHOR = "docs/architecture/core/Core-Enforcement-Active-Gates.md";

const GUEST_WORKER = "packages/client/src/features/plugin/lib/ui-guest/ui-guest.worker.ts";
const GATE_FIXTURE_LAW = "tooling/src/verify/gates/GATE-AUTHORING.md";

/** Patterns whose liveness is NOT decidable from any tracked source — each with the exact reason, the
 *  owning decision, and an END CONDITION. Two-sided: a row .dependency-cruiser.cjs no longer carries is
 *  RED, and a cite that stopped resolving is RED. */
const RATIFIED: ExemptionTable<GrantExemption> = {
  "(^|/)__g_": {
    why:
      "the reserved throwaway-fixture sentinel: check-gates.int materialises `__g_*` files at real-tree " +
      "paths for milliseconds and reaps them, so the subject is ABSENT from every tracked source by " +
      "construction — a member test would RED a correct config, and an FS test would depend on whether a " +
      "suite happened to be mid-run. Delete this row the day the `__g_` sentinel is retired.",
    cite: GATE_FIXTURE_LAW,
  },
  "^packages/[^/]+/dist/": {
    why:
      "BUILD OUTPUT: `dist/` is gitignored, so it is absent from the tracked corpus by design and present " +
      "only after a build — judging it either way makes the verdict depend on machine state. Delete this " +
      "row the day the packages stop emitting dist/.",
    cite: ".gitignore",
  },
  "^@jitl/quickjs-ng-wasmfile-release-sync/wasm\\?url$": {
    why:
      "a vite ASSET QUERY specifier (`?url`), not a module path and not a repo file: its member set is what " +
      "the bundler emits at build time, which no static tree read can enumerate (dep-cruiser matches it " +
      "only as an unresolvable-import exemption). The cite is the one importer that makes it live — the " +
      "row dies with it.",
    cite: GUEST_WORKER,
  },
};

const PATTERN_MESSAGES: PatternLivenessMessages = {
  deadPattern:
    "a PATTERN in .dependency-cruiser.cjs matches NOTHING this repo carries — no tracked file and no " +
    "declared dependency is inside it. Import law aimed at an empty set enforces nothing, and a `pathNot` " +
    "over an empty set is an exemption nobody can see being over-broad (the loaded-gun class one level up " +
    "from a dead file-exact row, tooling/src/verify/gates/GATE-AUTHORING.md §4.4 mode B). Re-point the " +
    "pattern at the tier/package it means, delete the rule, or — if its members genuinely cannot be " +
    "enumerated from the tree — add a RATIFIED row in " +
    "tooling/src/verify/gates/depcruise-grant-liveness.ts with its `why` + END CONDITION and a resolving " +
    "`cite`. The finding token is the pattern.",
  staleRatified:
    "a depcruise-grant-liveness RATIFIED row forgives a pattern .dependency-cruiser.cjs no longer carries — " +
    "a standing allowance for a row that is gone is a LOADED GUN. Delete the row from RATIFIED in " +
    "tooling/src/verify/gates/depcruise-grant-liveness.ts.",
  deadCite:
    "a depcruise-grant-liveness RATIFIED row's `cite` no longer resolves — the decision that justified the " +
    "allowance moved or was deleted. Re-derive the cite, or delete the row from RATIFIED in " +
    "tooling/src/verify/gates/depcruise-grant-liveness.ts.",
  budgetMoved:
    "the count of IRREDUCIBLE `$1`-backreference patterns in .dependency-cruiser.cjs is {actual}, but the " +
    "committed budget is {budget}. These are the rows whose member set dep-cruiser binds from the paired " +
    "rule's capture at cruise time, so no static reader can test them — the budget is what keeps that " +
    "population from growing silently. GROWTH: justify the new pair or express it without a capture. " +
    "SHRINK: commit it, by lowering BACKREF_BUDGET in " +
    "tooling/src/verify/gates/depcruise-grant-liveness.ts.",
};

const MSG_CORPUS_BLIND =
  "the tracked-file corpus came back EMPTY on a real-sized .dependency-cruiser.cjs — `git ls-files` failed " +
  "or this is not a work tree, so every pattern-liveness verdict below is vacuous and a ✓ would be a lie " +
  "(tooling/src/verify/gates/GATE-AUTHORING.md §4.6). See tooling/src/verify/lib/grant-liveness.ts.";

const MESSAGES: LivenessMessages = {
  dead:
    "a FILE-EXACT `path`/`pathNot` in .dependency-cruiser.cjs names nothing on the tree — the import-law row " +
    "it carries is DEAD. A `pathNot` exemption whose subject was deleted is an over-grant nobody can see (and " +
    "the next file created at that path silently inherits it); a `path` subject that resolves to nothing is a " +
    "rule aimed at no file at all. See tooling/src/verify/gates/GATE-AUTHORING.md §4.4 mode B. The finding " +
    "token is the dead path.",
  staleExempt:
    "a depcruise-grant-liveness EXEMPT row forgives a path .dependency-cruiser.cjs no longer carries — a " +
    "standing exemption for a row that is gone is a LOADED GUN. Delete the row from EXEMPT in " +
    "tooling/src/verify/gates/depcruise-grant-liveness.ts.",
  deadCite:
    "a depcruise-grant-liveness EXEMPT row's `cite` no longer resolves — the producer that justified the " +
    "exemption moved or was deleted. Re-derive the cite, or delete the row from EXEMPT in " +
    "tooling/src/verify/gates/depcruise-grant-liveness.ts.",
};

const MSG_MISSING =
  ".dependency-cruiser.cjs is not at the repo root — this gate's whole subject is gone, so its verdict is " +
  "unknowable and a ✓ here would be a lie (tooling/src/verify/gates/GATE-AUTHORING.md §4.6). Re-point " +
  "CONFIG_REL in tooling/src/verify/gates/depcruise-grant-liveness.ts, or delete the gate with the config.";

const MSG_UNPARSEABLE =
  ".dependency-cruiser.cjs did not load through dependency-cruiser's public config API. Fail LOUD, never " +
  "fall back to a default: a missing import, thrown config function, malformed selector or syntax error makes " +
  "the effective import law unknowable. See tooling/src/verify/gates/depcruise-grant-liveness.ts.";

const MSG_UNREADABLE =
  "dependency-cruiser's native config snapshot was unreadable, so one or more effective `path`/`pathNot` " +
  "values are unjudged and a ✓ would be a lie. Imported and computed selectors are supported by executing " +
  "the trusted repository config through the public loader; an unreadable snapshot is 'I could not measure', " +
  "never 'clean'.";

const MSG_NO_ROWS =
  ".dependency-cruiser.cjs parsed but ZERO file-exact rows were derived from an anchor-sized value set — the " +
  "regex/literal classifier has rotted past every row, so this gate is BLIND and its ✓ means nothing " +
  "(tooling/src/verify/gates/GATE-AUTHORING.md §4.6). Re-derive the classifier in " +
  "tooling/src/verify/gates/depcruise-grant-liveness.ts.";

interface Outcome {
  readonly findings: readonly Finding[];
  readonly declaration: GateScanDeclaration;
  /** The pattern half's disposition, folded into the gate's scan declaration by `run`. */
  readonly patterns?: { readonly live: number; readonly ratified: number; readonly irreducible: number };
}

interface NativeGrantRow extends ExactRow {
  readonly owner: string;
  readonly field: DepcruiseConfigSnapshotField;
  readonly position: number;
}

/** A dep-cruiser pattern is REGEX SOURCE matched against a module path. An unparseable source is treated as
 *  matching nothing, which makes it DEAD and therefore loud — dep-cruiser would reject it too. */
function regexMatcher(source: string): (member: string) => boolean {
  let re: RegExp;
  // @orb-gate-ignore caught-failure-ownership(empty:catch): an unparseable pattern matches nothing, so it
  // surfaces through the DEAD arm with its own diagnostic rather than aborting the pass. Ends if this gate
  // grows a distinct "malformed pattern" arm.
  try {
    re = new RegExp(source, "u");
  } catch {
    return () => false;
  }
  return (member) => re.test(member);
}

function fileFinding(message: string): Finding {
  return { file: CONFIG_REL, line: 0, column: 0, message };
}

function blind(message: string): Outcome {
  return { findings: [fileFinding(message)], declaration: { unit: UNIT, candidates: 0, scanned: 0 } };
}

/** A dep-cruiser `path` is REGEX SOURCE. It names ONE file only when it is fully anchored and, after
 *  unescaping the two escapes this corpus uses (`\.` and `\/`), carries no surviving metacharacter. Anything
 *  else — a prefix (`^packages/server/`), an alternation, a character class, a capture — is a CLASS of paths
 *  and becomes a declared skip. Conservative BY DESIGN: a false RED here would block every lane's floor. */
export function classifyRegex(value: string): string | undefined {
  const anchored = value.startsWith("^") && value.endsWith("$");
  const body = anchored ? value.slice(1, -1).replaceAll("\\.", ".").replaceAll("\\/", "/") : "";
  return body !== "" && !REGEX_META_RE.test(body) ? body : undefined;
}

function scanDepcruiseGrantLiveness(root: string): Outcome {
  if (!existsSync(join(root, CONFIG_REL))) {
    return blind(MSG_MISSING);
  }
  const native = readConfigSnapshot(root, "depcruise", CONFIG_REL);
  if (native.kind === "unreadable") {
    return blind(`${MSG_UNPARSEABLE} ${MSG_UNREADABLE} Native loader detail: ${native.detail}`);
  }
  const exact: NativeGrantRow[] = [];
  const skippedRows: DepcruiseSelectorSnapshot[] = [];
  for (const selector of native.snapshot.selectors) {
    const path = classifyRegex(selector.value);
    if (path === undefined) {
      skippedRows.push(selector);
    } else {
      exact.push({ file: CONFIG_REL, path, line: 0, owner: selector.owner, field: selector.field, position: selector.position });
    }
  }
  const declaration: GateScanDeclaration = {
    unit: UNIT,
    candidates: native.snapshot.selectors.length,
    scanned: exact.length,
    skipped: { pattern: skippedRows.length },
  };
  const anchorOk = native.snapshot.selectors.length >= REAL_CONFIG_MIN_CANDIDATES;
  if (exact.length === 0) {
    return { findings: anchorOk ? [fileFinding(MSG_NO_ROWS)] : [], declaration };
  }
  const rawExactFindings = livenessFindings({ root, exact, exempt: EXEMPT, exemptAnchorFile: CONFIG_REL, anchorOk, messages: MESSAGES });
  const exactFindings = rawExactFindings.map((finding) => {
    if (finding.message !== MESSAGES.dead) {
      return finding;
    }
    const row = exact.find((candidate) => candidate.path === finding.token);
    return row === undefined ? finding : { ...finding, message: `${MESSAGES.dead} Native selector: ${row.owner}.${row.field}[${String(row.position)}].` };
  });
  // The PATTERN half runs only in a scope that carries this gate's OWN module (the §4.5 real-tree anchor
  // shape). A conformance mini-project and the file-exact fixtures have no work tree to derive a corpus
  // from, and their handful of rows are not the real population — judging them would red every proof.
  if (!(anchorOk && existsSync(join(root, GATE_SELF)))) {
    return { findings: exactFindings, declaration };
  }
  const backrefs = skippedRows.filter((row) => BACKREF_RE.test(row.value));
  const judgeable = skippedRows.filter((row) => !BACKREF_RE.test(row.value));
  const sources = memberSources(root);
  if (sources.repoPaths.length === 0) {
    return { findings: [...exactFindings, fileFinding(MSG_CORPUS_BLIND)], declaration, patterns: { live: 0, ratified: 0, irreducible: backrefs.length } };
  }
  const patternRows: readonly PatternRow[] = judgeable.map((row) => ({
    file: CONFIG_REL,
    pattern: row.value,
    line: 0,
    matches: regexMatcher(row.value),
  }));
  const outcome = patternLivenessFindings({
    root,
    rows: patternRows,
    sources,
    ratified: RATIFIED,
    ratifiedAnchorFile: CONFIG_REL,
    anchorOk,
    messages: PATTERN_MESSAGES,
  });
  const budget = existsSync(join(root, BUDGET_ANCHOR))
    ? irreducibleBudgetFindings(CONFIG_REL, backrefs.length, BACKREF_BUDGET, PATTERN_MESSAGES.budgetMoved)
    : [];
  return {
    findings: [...exactFindings, ...outcome.findings, ...budget],
    declaration,
    patterns: { live: outcome.live, ratified: outcome.ratified, irreducible: backrefs.length },
  };
}

// ── self-proof fixtures ───────────────────────────────────────────────────────────────────────────────
/** `count` distinct PREFIX patterns — filler that clears the anchor while deriving zero exact rows (a
 *  start-anchored prefix is a class of paths, so the classifier must skip every one of them). */
function prefixFiller(count: number): string {
  return Array.from({ length: count }, (_, i) => `"^packages/p${i}/"`).join(", ");
}
function configCjs(entries: string): string {
  return `module.exports = { forbidden: [{ name: "r", from: { path: [${entries}] }, to: {} }] };\n`;
}
const LIVE_REL = "packages/ui/src/live.ts";
const LIVE_SOURCE = "export const live = 1;\n";
const DEAD_RE = String.raw`"^packages/ui/src/gone\.ts$"`;
const LIVE_RE = String.raw`"^packages/ui/src/live\.ts$"`;

export const gate: GateDescriptor = {
  name: "depcruise-grant-liveness",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  // The unit is a config VALUE, not a workspace source file — this gate subscribes to no node kinds, so it
  // admits no files and declares its own scan counts through ctx.scan (GATE-AUTHORING.md §1 scan health).
  scanRoot: () => false,
  message: MESSAGES.dead,
  fix:
    "delete the dead path from its `path`/`pathNot` in .dependency-cruiser.cjs. If the file MOVED, re-point " +
    "the row and re-read the rule — an import-law exemption follows a decision, not a filename. If the path " +
    "is transient by construction, add a row to EXEMPT in " +
    "tooling/src/verify/gates/depcruise-grant-liveness.ts with its `why` + END CONDITION and a resolving `cite`.",
  run: (ctx) => {
    const outcome = scanDepcruiseGrantLiveness(ctx.root);
    ctx.scan(
      outcome.patterns === undefined
        ? outcome.declaration
        : {
            ...outcome.declaration,
            skipped: {
              "pattern-live": outcome.patterns.live,
              "pattern-ratified": outcome.patterns.ratified,
              "pattern-irreducible-backref": outcome.patterns.irreducible,
            },
          },
    );
    for (const finding of outcome.findings) {
      ctx.report(finding);
    }
  },
  mustFlag: [
    {
      files: { [CONFIG_REL]: `module.exports = { forbidden: [{ name: "r", from: {}, to: { pathNot: ${DEAD_RE} } }] };\n` },
      expect: { count: 1, token: "packages/ui/src/gone.ts" },
      why: "the founding shape — a file-exact `pathNot` EXEMPTION whose file is GONE (mode B: nothing visits it, so nothing examines the promise)",
    },
    {
      files: {
        [CONFIG_REL]: `const UI = "^packages/ui/src/";\nmodule.exports = { forbidden: [{ name: "r", from: { path: UI }, to: { pathNot: [\`\${UI}live\\\\.ts$\`, \`\${UI}gone\\\\.ts$\`] } }] };\n`,
        [LIVE_REL]: LIVE_SOURCE,
      },
      expect: { count: 1, token: "packages/ui/src/gone.ts" },
      why: "THE CODE-CONFIG CASE: both rows are TEMPLATE literals built from a const — dependency-cruiser's native loader observes the effective values, only the dead one fires, and the bare prefix const stays a skip",
    },
    {
      files: { [CONFIG_REL]: 'module.exports = { forbidden: [{ name: "r", from: { path: buildPath() }, to: {} }] };\n' },
      expect: { count: 1, messageIncludes: "did not load through dependency-cruiser's public config API" },
      why: "THE FAIL-LOUD REQUIREMENT: a config call that throws must REFUSE, never pass as a clean zero over load-bearing import law",
    },
    {
      files: { "not-dependency-cruiser.cjs": "module.exports = {};\n" },
      expect: { count: 1, messageIncludes: "not at the repo root" },
      why: "§4.6 blindness tripwire: the gate is keyed on an EXACT filename, so that name resolving to nothing must be RED",
    },
    {
      files: { [CONFIG_REL]: "module.exports = { forbidden: [ ;;; (((( };\n" },
      expect: { count: 1, messageIncludes: "did not parse" },
      why: "a broken import-law config must FAIL LOUD — a silent default-fallback would leave the package cake unguarded while every run reported green",
    },
    {
      files: { [CONFIG_REL]: configCjs(prefixFiller(REAL_CONFIG_MIN_CANDIDATES)) },
      expect: { count: 1, messageIncludes: "ZERO file-exact rows" },
      why: "zero derived rows on an anchor-sized value set is 'I could not measure', never 'clean' — the classifier-rot tripwire",
    },
  ],
  mustPass: [
    {
      files: {
        [CONFIG_REL]: `module.exports = { extends: "./base.cjs", forbidden: [{ name: "root", from: {}, to: { pathNot: ${LIVE_RE} } }] };\n`,
        "base.cjs": `module.exports = { forbidden: [{ name: "base", from: {}, to: { pathNot: ${DEAD_RE} } }] };\n`,
        [LIVE_REL]: LIVE_SOURCE,
      },
      why: "DECLARED LIMIT — liveness judges selectors authored by the repository root config, while dependency-cruiser's public loader still loads and validates the complete `extends` chain; inherited package rules have a separate vendor lifecycle and member corpus",
    },
    {
      files: { [CONFIG_REL]: 'module.exports = { forbidden: [{ name: "r", from: { path: "^packages/definitely-not-here/" }, to: {} }] };\n' },
      why: "DECLARED LIMIT — the PATTERN half is scoped to a root carrying this gate's own module (the §4.5 real-tree anchor shape): a mini-project has no git work tree to derive the `git ls-files` corpus from, so a glob with no members here is SILENT. The pattern arms are proven instead by the permanent pin under tests/tooling/verify/gates/, which plants a real throwaway repo (#973).",
    },
    {
      files: {
        [CONFIG_REL]: `module.exports = { forbidden: [{ name: "r", from: {}, to: { pathNot: ${LIVE_RE} } }] };\n`,
        [LIVE_REL]: LIVE_SOURCE,
      },
      why: "a file-exact exemption whose file is on the tree — the sanctioned shape, silent",
    },
    {
      files: {
        [CONFIG_REL]: configCjs(
          String.raw`"^packages/server/", "^packages/ui/src/(a|b)/", "^packages/client/src/features/[^/]+/.+", "node_modules/(echarts|cmdk)/", "\.(test|spec)\.tsx?$"`,
        ),
      },
      why: "DECLARED LIMIT — a prefix, an alternation, a character class, a bare node_modules fragment and an END-anchored-only suffix are all CLASSES of paths; none may be resolved as a file (the conservative direction: import law must never false-RED)",
    },
  ],
};
