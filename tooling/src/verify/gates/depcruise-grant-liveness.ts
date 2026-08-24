// Gate: depcruise-grant-liveness — a FILE-EXACT path in a `.dependency-cruiser.cjs` rule's `path`/`pathNot`
// names ONE file: a `pathNot` is an EXEMPTION (this one file may cross the boundary), a `path` is the rule's
// own subject. Either way, when that file is deleted or moved the row goes SILENTLY dead — an exemption
// nobody can see, or a rule aimed at nothing — and the next file created at that path inherits an import-law
// posture nobody re-approved. biome-grant-liveness's shape (GATE-AUTHORING.md §4.4 mode B) on the import-law
// config. TWO hard parts, and why this is its own gate: (1) the values are CODE — 13 of 181 are bare
// literals, the rest are consts and TEMPLATE literals built from consts — so extraction runs through
// lib/config-static-read.ts, which resolves what it can prove and REFUSES LOUDLY on what it cannot; (2) the
// values are REGEX SOURCE, not globs, so a path is only recognised when the pattern is FULLY ANCHORED
// (`^…$`) and carries no surviving metacharacter after unescaping `\.`/`\/`. That classifier is deliberately
// CONSERVATIVE in the direction that matters: these lists are load-bearing import law, so an ambiguous
// pattern becomes a declared SKIP, never a RED. Arms: DEAD · MISSING-CONFIG · UNPARSEABLE-CONFIG ·
// UNREADABLE-SHAPE · NO-ROWS (the §4.6 blindness tripwire) · the two-sided EXEMPT arms (shared,
// empty-but-armed at mint — every live row resolves).
// COMMENT POSTURE: comment-SAFE — extraction is pure AST over node kinds, never a text match.
import type { ExemptionTable, Finding, GateDescriptor, GateScanDeclaration } from "../contract/gate.ts";
import { extractRows, readConfigSource } from "../lib/config-static-read.ts";
import type { GrantExemption, LivenessMessages } from "../lib/grant-liveness.ts";
import { livenessFindings } from "../lib/grant-liveness.ts";

const CONFIG_REL = ".dependency-cruiser.cjs";
const UNIT = "grant row";
const JUDGED_KEYS = ["path", "pathNot"] as const;

/** Regex metacharacters that make a pattern a CLASS of paths rather than one file. A pattern still carrying
 *  any of these after anchor-stripping and `\.`/`\/` unescaping is a declared skip, never a judged row. */
const REGEX_META_RE = /[|()[\]{}*+?^$\\]/u;

/** §4.5 real-tree anchor in its rename-proof COUNT form: the real config derives 181 values across its
 *  rules; a conformance mini-project plants a handful. Counted over ALL derived values, never over the exact
 *  ones, so it can guard the very arm that judges the regex/literal classifier. */
const REAL_CONFIG_MIN_CANDIDATES = 80;

/** Empty but ARMED at mint — every file-exact row in .dependency-cruiser.cjs resolves today (13/13
 *  measured), so nothing needs forgiving. The two-sided machinery is shared (lib/grant-liveness.ts) and is
 *  proven in both directions by the sibling gates' pins; a row added here inherits both arms automatically. */
const EXEMPT: ExemptionTable<GrantExemption> = {};

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
  ".dependency-cruiser.cjs did not parse. Fail LOUD, never fall back to a default: a silently-defaulted " +
  "import-law config enforces NO boundary at all, and the cake would be unguarded while every run reported " +
  "green. See tooling/src/verify/gates/depcruise-grant-liveness.ts.";

const MSG_UNREADABLE =
  "a `path`/`pathNot` value in .dependency-cruiser.cjs is a shape this gate CANNOT statically read (a call, a " +
  "conditional, a template span that is not a resolvable const), so the rows behind it are unjudged and a ✓ " +
  "would be a lie about coverage this gate does not have. This is the fail-loud half of the CODE-config " +
  "extractor: an unreadable shape is 'I could not measure', never 'clean'. Either spell the value as a " +
  "literal/const the reader resolves (tooling/src/verify/lib/config-static-read.ts), or widen the reader " +
  "deliberately. The finding token names the offending syntax kind.";

const MSG_NO_ROWS =
  ".dependency-cruiser.cjs parsed but ZERO file-exact rows were derived from an anchor-sized value set — the " +
  "regex/literal classifier has rotted past every row, so this gate is BLIND and its ✓ means nothing " +
  "(tooling/src/verify/gates/GATE-AUTHORING.md §4.6). Re-derive the classifier in " +
  "tooling/src/verify/gates/depcruise-grant-liveness.ts.";

interface Outcome {
  readonly findings: readonly Finding[];
  readonly declaration: GateScanDeclaration;
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
  const read = readConfigSource(root, CONFIG_REL);
  if (read.kind === "missing") {
    return blind(MSG_MISSING);
  }
  if (read.kind === "unparseable") {
    return blind(`${MSG_UNPARSEABLE} (${read.detail})`);
  }
  const rows = extractRows({ sf: read.sf, rel: CONFIG_REL, text: read.text, keys: JUDGED_KEYS, classify: classifyRegex });
  const declaration: GateScanDeclaration = {
    unit: UNIT,
    candidates: rows.candidates,
    scanned: rows.exact.length,
    skipped: { pattern: rows.skipped },
  };
  if (rows.unresolved.length > 0) {
    const findings = rows.unresolved.map((u) => ({ file: CONFIG_REL, line: u.line, column: 0, token: u.kind, message: MSG_UNREADABLE }));
    return { findings, declaration };
  }
  const anchorOk = rows.candidates >= REAL_CONFIG_MIN_CANDIDATES;
  if (rows.exact.length === 0) {
    return { findings: anchorOk ? [fileFinding(MSG_NO_ROWS)] : [], declaration };
  }
  const findings = livenessFindings({ root, exact: rows.exact, exempt: EXEMPT, exemptAnchorFile: CONFIG_REL, anchorOk, messages: MESSAGES });
  return { findings, declaration };
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
    ctx.scan(outcome.declaration);
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
      why: "THE CODE-CONFIG CASE: both rows are TEMPLATE literals built from a const (the corpus's dominant shape, 112 of them) — only the dead one fires, and the bare prefix const stays a skip",
    },
    {
      files: { [CONFIG_REL]: 'module.exports = { forbidden: [{ name: "r", from: { path: buildPath() }, to: {} }] };\n' },
      expect: { count: 1, messageIncludes: "CANNOT statically read" },
      why: "THE FAIL-LOUD REQUIREMENT: a call expression is unreadable, and an unreadable shape must REFUSE, never pass as a clean zero over load-bearing import law",
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
