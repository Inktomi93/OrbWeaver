// Gate: tsconfig-entry-liveness — a FILE-EXACT path in a `tsconfig*.json` `include`/`exclude` (a literal file
// or dir, not a glob) names ONE specific tree node. When that node is deleted or moved the entry goes SILENTLY
// dead — a dead exclude is stale dead-weight, a dead include silently drops the coverage it was carrying, and
// (the tests-dom program) a moved DOM-coupled escapee stops being libbed at all. This is biome-grant-liveness's
// shape (GATE-AUTHORING.md §4.4 mode B) turned on the TYPE configs, which feed the ts7/types:graph program
// list. Arms: DEAD (an exact entry resolving to nothing), MISSING-CONFIG + UNPARSEABLE-CONFIG (fail LOUD — a
// silently-defaulted tsconfig would let a downstream typecheck lie), NO-ROWS (the §4.6 GLOBAL blindness
// tripwire: an anchor-sized set deriving zero exact entries means the glob/exact classifier rotted), and the
// two-sided EXEMPT arms. DECLARED LIMITS: glob rows (`packages/*/src`, `**/*.tsx`, `${configDir}/...`) are
// declared skips; a dead INCLUDE may be a deliberate not-yet-created path, so both include and exclude entries
// route through the same two-sided EXEMPT table (not a hard fail). COMMENT POSTURE: n/a — parsed as JSONC via
// the TypeScript config reader, so comments are structurally out of scope.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { ts } from "ts-morph";
import type { ExemptionTable, Finding, GateDescriptor, GateScanDeclaration } from "../contract/gate.ts";
import type { ExactRow, GrantExemption, LivenessMessages } from "../lib/grant-liveness.ts";
import { isFileExact, lineFinder, livenessFindings } from "../lib/grant-liveness.ts";

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
  "tsconfig.json is not at the repo root — this gate's primary subject (the ts7/types:graph program list) is gone, " +
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
  readonly globs: number;
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
  let globs = 0;
  for (const entry of entries) {
    if (isFileExact(entry) && !TEMPLATE_RE.test(entry)) {
      // tsconfig include/exclude paths are relative to the CONFIG FILE's directory, not the repo root —
      // resolve to a repo-relative path so existsSync + the EXEMPT table + the finding token all agree
      // (`tooling/tsconfig.json`'s `src` is `tooling/src`; its `../reset.d.ts` is repo-root `reset.d.ts`).
      const resolved = relative(root, join(root, configDir, entry));
      exact.push({ file: rel, path: resolved, line: lineOf(entry) });
    } else {
      globs += 1;
    }
  }
  return {
    exact: [...acc.exact, ...exact],
    candidates: acc.candidates + entries.length,
    globs: acc.globs + globs,
    unparseable: acc.unparseable,
  };
}

interface Outcome {
  readonly findings: readonly Finding[];
  readonly declaration: GateScanDeclaration;
}

function scanTsconfigEntryLiveness(root: string): Outcome {
  if (!existsSync(join(root, PRIMARY_REL))) {
    return { findings: [{ file: PRIMARY_REL, line: 0, column: 0, message: MSG_MISSING }], declaration: { unit: UNIT, candidates: 0, scanned: 0 } };
  }
  let acc: Accumulated = { exact: [], candidates: 0, globs: 0, unparseable: [] };
  for (const rel of discoverConfigs(root)) {
    acc = foldConfig(root, rel, acc);
  }
  const declaration: GateScanDeclaration = {
    unit: UNIT,
    candidates: acc.candidates,
    scanned: acc.exact.length,
    skipped: { glob: acc.globs },
  };
  if (acc.unparseable.length > 0) {
    return { findings: acc.unparseable, declaration };
  }
  const anchorOk = acc.candidates >= REAL_CONFIG_MIN_CANDIDATES;
  if (acc.exact.length === 0) {
    return { findings: anchorOk ? [{ file: PRIMARY_REL, line: 0, column: 0, message: MSG_NO_ROWS }] : [], declaration };
  }
  const findings = livenessFindings({ root, exact: acc.exact, exempt: EXEMPT, exemptAnchorFile: PRIMARY_REL, anchorOk, messages: MESSAGES });
  return { findings, declaration };
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
    ctx.scan(outcome.declaration);
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
