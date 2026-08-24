// Gate: biome-grant-liveness — a FILE-EXACT path in a `biome.json` override `includes` is a SUPPRESSION
// GRANT (it turns a lint rule off, or lifts a limit, for that ONE named file). When the file is deleted or
// moved the row goes SILENTLY dead: an over-grant nobody sees, and a future file recreated at that path
// inherits a suppression nobody re-approved. This is GATE-AUTHORING.md §4.4 mode (B) applied to the lint
// config itself — the row's subject is never visited, so nothing ever examines the promise. FIVE arms:
// DEAD (an exact grant path resolving to nothing), MISSING-CONFIG + UNPARSEABLE-CONFIG (fail LOUD — biome.json
// is STRICT JSON and a silent default-fallback would make every later verdict a lie), NO-ROWS (the §4.6
// blindness tripwire), and the two-sided exemption arms (a row the table forgives that biome.json no longer
// carries; an exemption whose cited producer moved). DECLARED LIMITS: glob rows (`packages/client/**`) are
// v1 out of scope and counted as a declared skip; the top-level `files.includes` IGNORE list is deliberately
// excluded (a preemptive ignore for a generated/transient path is legitimately allowed not to exist — only a
// GRANT is judged). COMMENT POSTURE: n/a — the scanned unit is strict JSON, which has no comment syntax.
// The TOTAL-EMPTY case (no `overrides` at all) is deliberately NOT the NO-ROWS arm — it derives zero units,
// so the harness's own SCANNED-ZERO alarm refuses the verdict (exit 2) without this gate guessing.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExemptionTable, Finding, GateDescriptor, GateScanDeclaration } from "../contract/gate.ts";

const CONFIG_REL = "biome.json";
const UNIT = "grant row";
/** Glob metacharacters biome's include syntax understands. A path carrying none of these is FILE-EXACT. */
const GLOB_META_RE = /[*?[\]{}]/u;
const NEGATION_PREFIX = "!";

/** §4.5 real-tree ANCHOR, in its rename-proof COUNT form (the `finding-overload-provenance` precedent): a
 *  real biome.json carries DOZENS of override include entries (68 at mint), a conformance mini-project plants
 *  a handful. Counted over ALL includes, never over the exact ones, so it can guard the very arm that judges
 *  the exact/glob classifier. Guards NO-ROWS and both exemption arms so none can red the gate's self-proof. */
const REAL_CONFIG_MIN_INCLUDES = 30;

/** The one transient grant subject + the producer that makes it transient. Both hard-coded, both paired with
 *  a tripwire per §3: the key with the STALE arm, the cite with the DEAD-CITE arm. */
const TRANSIENT_CATALOG_TMP = "docs/catalog/catalog.tmp.json";
const CATALOG_SERIALIZER = "tooling/src/doc-catalog/ops/tree.ts";

/** A grant row this gate deliberately does not judge. Two-sided (§4.4): a key biome.json no longer carries is
 *  RED, and a `cite` that stopped resolving is RED — a permanent exemption must not outlive its justification. */
interface GrantExemption {
  readonly why: string;
  /** The repo-relative producer that makes the path transient. Must resolve on the real tree. */
  readonly cite: string;
}

const EXEMPT: ExemptionTable<GrantExemption> = {
  [TRANSIENT_CATALOG_TMP]: {
    why:
      "not a dead grant — a WRITE-THEN-DELETE intermediate: stableJson() writes it, runs the biome binary over it, " +
      "and rm's it in a finally, so it is absent at rest by design while the files.maxSize grant must pre-exist the " +
      "write. Delete this row the day the catalog serializer stops formatting through a temp file.",
    cite: CATALOG_SERIALIZER,
  },
};

const MESSAGE =
  "a FILE-EXACT path in a `biome.json` override `includes` names nothing on the tree — the grant it carries is " +
  "DEAD. A suppression whose subject was deleted or moved is an over-grant nobody can see, and the next file " +
  "created at that path silently inherits a rule exemption nobody re-approved (the loaded-gun class, " +
  "tooling/src/verify/gates/GATE-AUTHORING.md §4.4 mode B). The finding token is the dead path.";

const FIX =
  "delete the dead path from its override's `includes` in biome.json. If the file MOVED, re-point the row at the " +
  "new path and re-read the override's rule list — a grant follows a decision, not a filename. If the path is " +
  "transient by construction (a write-then-delete intermediate), add a row to EXEMPT in " +
  "tooling/src/verify/gates/biome-grant-liveness.ts with its `why` + END CONDITION and the `cite` that proves it.";

const MSG_MISSING =
  "biome.json is not at the repo root — this gate's whole subject is gone, so its verdict is unknowable and a ✓ " +
  "here would be a lie (tooling/src/verify/gates/GATE-AUTHORING.md §4.6). Re-point CONFIG_REL in " +
  "tooling/src/verify/gates/biome-grant-liveness.ts, or delete the gate with the config.";

const MSG_UNPARSEABLE =
  "biome.json did not parse as STRICT JSON. Fail LOUD, never fall back to a default: a silently-defaulted lint " +
  "config lints nothing this repo asked for, and every gate verdict downstream of it becomes a lie. Fix the JSON " +
  "(biome.json is strict — no comments, no trailing commas). See tooling/src/verify/gates/biome-grant-liveness.ts.";

const MSG_NO_ROWS =
  "biome.json parsed but ZERO file-exact grant rows were derived from its overrides — either the overrides array " +
  "is gone or the glob/exact classifier has rotted past every row, so this gate is BLIND and its ✓ means nothing " +
  "(tooling/src/verify/gates/GATE-AUTHORING.md §4.6). Re-derive the classifier in " +
  "tooling/src/verify/gates/biome-grant-liveness.ts.";

const MSG_STALE_EXEMPT =
  "a biome-grant-liveness EXEMPT row forgives a grant path biome.json no longer carries — a standing exemption " +
  "for a row that is gone is a LOADED GUN (the next grant written at that path inherits it). Delete the row from " +
  "EXEMPT in tooling/src/verify/gates/biome-grant-liveness.ts. See tooling/src/verify/gates/GATE-AUTHORING.md §4.4.";

const MSG_DEAD_CITE =
  "a biome-grant-liveness EXEMPT row's `cite` no longer resolves — the producer that justified the exemption " +
  "moved or was deleted, so the promise has outlived its evidence. Re-derive the cite, or delete the row from " +
  "EXEMPT in tooling/src/verify/gates/biome-grant-liveness.ts. See tooling/src/verify/gates/GATE-AUTHORING.md §4.4.";

interface BiomeOverride {
  readonly includes?: readonly string[];
}

interface BiomeConfig {
  readonly overrides?: readonly BiomeOverride[];
}

type ConfigRead =
  | { readonly kind: "missing" }
  | { readonly kind: "unparseable"; readonly detail: string }
  | { readonly kind: "ok"; readonly config: BiomeConfig; readonly text: string };

function readConfig(root: string): ConfigRead {
  const abs = join(root, CONFIG_REL);
  if (!existsSync(abs)) {
    return { kind: "missing" };
  }
  const text = readFileSync(abs, "utf-8");
  try {
    return { kind: "ok", config: JSON.parse(text) as BiomeConfig, text };
  } catch (error) {
    return { kind: "unparseable", detail: error instanceof Error ? error.message : String(error) };
  }
}

/** A path→1-based-line resolver over the raw config text, advancing a per-path cursor so a path granted by
 *  TWO overrides reports two distinct lines rather than the same one twice. 0 when the literal isn't found
 *  (a formatting the line scan can't see — the finding still stands, it just anchors file-level). */
function lineFinder(text: string): (path: string) => number {
  const lines = text.split("\n");
  const cursor = new Map<string, number>();
  return (path) => {
    const quoted = `"${path}"`;
    const from = cursor.get(quoted) ?? 0;
    const at = lines.findIndex((line, index) => index >= from && line.includes(quoted));
    if (at < 0) {
      return 0;
    }
    cursor.set(quoted, at + 1);
    return at + 1;
  };
}

function fileFinding(message: string): Finding {
  return { file: CONFIG_REL, line: 0, column: 0, message };
}

interface Outcome {
  readonly findings: readonly Finding[];
  readonly declaration: GateScanDeclaration;
}

/** The two-sided arms on EXEMPT. The caller owns the real-tree anchor. */
function exemptionArms(root: string, exactRows: readonly string[]): readonly Finding[] {
  const carried = new Set(exactRows);
  const out: Finding[] = [];
  for (const [path, row] of Object.entries(EXEMPT)) {
    if (!carried.has(path)) {
      out.push({ file: CONFIG_REL, line: 0, column: 0, token: path, message: MSG_STALE_EXEMPT });
      continue;
    }
    if (!existsSync(join(root, row.cite))) {
      out.push({ file: CONFIG_REL, line: 0, column: 0, token: row.cite, message: MSG_DEAD_CITE });
    }
  }
  return out;
}

function scanBiomeGrantLiveness(root: string): Outcome {
  const read = readConfig(root);
  if (read.kind === "missing") {
    return { findings: [fileFinding(MSG_MISSING)], declaration: { unit: UNIT, candidates: 0, scanned: 0 } };
  }
  if (read.kind === "unparseable") {
    return { findings: [fileFinding(`${MSG_UNPARSEABLE} (${read.detail})`)], declaration: { unit: UNIT, candidates: 0, scanned: 0 } };
  }
  const includes = (read.config.overrides ?? []).flatMap((o) => o.includes ?? []);
  const negated = includes.filter((p) => p.startsWith(NEGATION_PREFIX));
  const positive = includes.filter((p) => !p.startsWith(NEGATION_PREFIX));
  const globs = positive.filter((p) => GLOB_META_RE.test(p));
  const exact = positive.filter((p) => !GLOB_META_RE.test(p));
  const declaration: GateScanDeclaration = {
    unit: UNIT,
    candidates: includes.length,
    scanned: exact.length,
    skipped: { glob: globs.length, negated: negated.length },
  };
  const isRealConfig = includes.length >= REAL_CONFIG_MIN_INCLUDES;
  if (exact.length === 0) {
    return { findings: isRealConfig ? [fileFinding(MSG_NO_ROWS)] : [], declaration };
  }
  const lineOf = lineFinder(read.text);
  const dead = exact
    .map((path) => ({ path, line: lineOf(path) }))
    .filter((row) => EXEMPT[row.path] === undefined && !existsSync(join(root, row.path)))
    .map((row) => ({ file: CONFIG_REL, line: row.line, column: 0, token: row.path }));
  return { findings: [...dead, ...(isRealConfig ? exemptionArms(root, exact) : [])], declaration };
}

// ── self-proof fixtures ───────────────────────────────────────────────────────────────────────────────
// The arms guarded by the real-tree anchor need a config BIG enough to clear it, so their fixtures are
// BUILT from the anchor constant rather than hand-typed: change the constant and the proofs follow.

/** `count` distinct glob entries — filler that clears the anchor while deriving zero exact rows. */
function globFiller(count: number): string {
  return Array.from({ length: count }, (_, i) => `"packages/p${i}/**"`).join(", ");
}

/** A minimal one-override config carrying exactly the given raw `includes` entries. */
function overridesJson(entries: string): string {
  return `{\n  "overrides": [{ "includes": [${entries}], "linter": { "rules": {} } }]\n}\n`;
}

const ANCHOR_FILLER = globFiller(REAL_CONFIG_MIN_INCLUDES - 1);
const LIVE_REL = "packages/client/src/live.ts";
const LIVE_SOURCE = "export const live = 1;\n";

export const gate: GateDescriptor = {
  name: "biome-grant-liveness",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  // The unit is a JSON config row, not a workspace source file — this gate subscribes to no node kinds, so
  // it admits no files and declares its own scan counts through ctx.scan (GATE-AUTHORING.md §1 scan health).
  scanRoot: () => false,
  message: MESSAGE,
  fix: FIX,
  run: (ctx) => {
    const outcome = scanBiomeGrantLiveness(ctx.root);
    ctx.scan(outcome.declaration);
    for (const finding of outcome.findings) {
      ctx.report(finding);
    }
  },
  mustFlag: [
    {
      files: {
        "biome.json": '{\n  "overrides": [\n    {\n      "includes": ["packages/client/src/gone.ts"],\n      "linter": { "rules": {} }\n    }\n  ]\n}\n',
      },
      expect: { count: 1, token: "packages/client/src/gone.ts", line: 4 },
      why: "the founding shape — a file-exact grant whose file is GONE (mode B: nothing ever visits it, so nothing ever examines the promise)",
    },
    {
      files: {
        "biome.json":
          '{\n  "overrides": [\n    {\n      "includes": ["packages/ui/**", "packages/client/src/live.ts", "packages/client/src/gone.ts"],\n      "linter": { "rules": {} }\n    }\n  ]\n}\n',
        "packages/client/src/live.ts": "export const live = 1;\n",
      },
      expect: { count: 1, token: "packages/client/src/gone.ts" },
      why: "the glob row and the live exact row are both silent; ONLY the dead exact row fires — the classifier is the load-bearing half",
    },
    {
      files: { "not-biome.json": "{}\n" },
      expect: { count: 1, messageIncludes: "not at the repo root" },
      why: "§4.6 blindness tripwire: the gate is keyed on an EXACT filename, so that name resolving to nothing must be RED, never a silent ✓",
    },
    {
      files: { "biome.json": '{\n  // strict JSON rejects this\n  "overrides": []\n}\n' },
      expect: { count: 1, messageIncludes: "did not parse as STRICT JSON" },
      why: "biome.json is strict JSON and a silent default-fallback on a parse failure is the known trap — the gate must FAIL LOUD instead",
    },
    {
      files: { "biome.json": overridesJson(globFiller(REAL_CONFIG_MIN_INCLUDES)) },
      expect: { count: 1, messageIncludes: "ZERO file-exact grant rows" },
      why: "zero derived rows on an anchor-sized config is 'I could not measure', never 'clean' — the classifier-rot tripwire",
    },
    {
      files: {
        "biome.json": overridesJson(`${ANCHOR_FILLER}, "${LIVE_REL}"`),
        [LIVE_REL]: LIVE_SOURCE,
      },
      expect: { count: 1, token: TRANSIENT_CATALOG_TMP, messageIncludes: "no longer carries" },
      why: "§4.4 two-sidedness: an EXEMPT row forgiving a grant biome.json does not carry is a loaded gun — it must RED, not sit silent",
    },
    {
      files: { "biome.json": overridesJson(`${ANCHOR_FILLER}, "${TRANSIENT_CATALOG_TMP}"`) },
      expect: { count: 1, token: CATALOG_SERIALIZER, messageIncludes: "`cite` no longer resolves" },
      why: "the §3 path-constant tripwire: the exemption's justification MOVED, so the promise outlived its evidence and must RED",
    },
  ],
  mustPass: [
    {
      files: {
        "biome.json": '{\n  "overrides": [\n    {\n      "includes": ["packages/client/src/live.ts"],\n      "linter": { "rules": {} }\n    }\n  ]\n}\n',
        "packages/client/src/live.ts": "export const live = 1;\n",
      },
      why: "a file-exact grant whose file is on the tree — the sanctioned shape, silent",
    },
    {
      files: {
        "biome.json": overridesJson(`${ANCHOR_FILLER}, "${TRANSIENT_CATALOG_TMP}"`),
        [CATALOG_SERIALIZER]: "export const serializer = 1;\n",
      },
      why: "the exemption HONOURED: an absent-by-design transient subject whose cited producer still resolves is silent on all three arms",
    },
    {
      files: {
        "biome.json":
          '{\n  "overrides": [\n    {\n      "includes": ["packages/client/**", "**/*.config.ts", "playwright*.config.ts", "tests/{a,b}/x.ts"],\n      "linter": { "rules": {} }\n    }\n  ]\n}\n',
      },
      why: "DECLARED LIMIT — every glob spelling (`**`, a `*` segment, a prefix star, brace expansion) is v1 out of scope and must never be resolved as a path",
    },
    {
      files: {
        "biome.json":
          '{\n  "overrides": [\n    {\n      "includes": ["!packages/client/src/gone.ts", "packages/client/src/live.ts"],\n      "linter": { "rules": {} }\n    }\n  ]\n}\n',
        "packages/client/src/live.ts": "export const live = 1;\n",
      },
      why: "DECLARED LIMIT — a NEGATED entry inside an override excludes rather than grants, so its subject is legitimately allowed not to exist",
    },
  ],
};
