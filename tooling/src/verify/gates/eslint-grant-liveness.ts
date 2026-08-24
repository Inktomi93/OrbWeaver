// Gate: eslint-grant-liveness — a FILE-EXACT path in an `eslint.config.js` block's `files`/`ignores` is a
// PER-FILE GRANT (it aims a rule block at, or lifts one off, that ONE named file). When the file is deleted
// or moved the row goes SILENTLY dead: an over-grant nobody sees, and a future file recreated at that path
// inherits a rule posture nobody re-approved. biome-grant-liveness's shape (GATE-AUTHORING.md §4.4 mode B)
// on the ESLint config. THE HARD PART, and why this is its own gate: eslint.config.js is CODE, so rows hide
// behind named consts, const ARRAYS, and spreads — a reader that saw only bare StringLiterals would find 6
// of 84 values and print a clean zero over a registry it never read. Extraction runs through
// lib/config-static-read.ts, which resolves what it can prove and REFUSES LOUDLY (arm UNREADABLE) on every
// shape it cannot. Arms: DEAD · MISSING-CONFIG · UNPARSEABLE-CONFIG · UNREADABLE-SHAPE · NO-ROWS (the §4.6
// blindness tripwire) · the two-sided EXEMPT arms (shared, empty-but-armed at mint — every live row resolves).
// DECLARED LIMITS: glob rows (`packages/ui/src/**/*.{ts,tsx}`) are counted as declared skips; only `files`
// and `ignores` are judged (a rule OPTION naming a path is that rule's business, not a grant).
// COMMENT POSTURE: comment-SAFE — extraction is pure AST over node kinds, never a text match.
import type { ExemptionTable, Finding, GateDescriptor, GateScanDeclaration } from "../contract/gate.ts";
import { extractRows, readConfigSource } from "../lib/config-static-read.ts";
import type { GrantExemption, LivenessMessages } from "../lib/grant-liveness.ts";
import { isFileExact, livenessFindings } from "../lib/grant-liveness.ts";

const CONFIG_REL = "eslint.config.js";
const UNIT = "grant row";
const JUDGED_KEYS = ["files", "ignores"] as const;

/** §4.5 real-tree anchor in its rename-proof COUNT form: the real config derives 84 values across its
 *  blocks; a conformance mini-project plants a handful. Counted over ALL derived values, never over the
 *  exact ones, so it can guard the very arm that judges the exact/glob classifier. */
const REAL_CONFIG_MIN_CANDIDATES = 40;

/** Empty but ARMED at mint — every file-exact grant in eslint.config.js resolves today (6/6 measured), so
 *  nothing needs forgiving. The two-sided machinery is shared (lib/grant-liveness.ts) and is proven in both
 *  directions by the sibling gates' pins; a row added here inherits both arms automatically. */
const EXEMPT: ExemptionTable<GrantExemption> = {};

const MESSAGES: LivenessMessages = {
  dead:
    "a FILE-EXACT path in an `eslint.config.js` block's `files`/`ignores` names nothing on the tree — the " +
    "per-file grant it carries is DEAD. A grant whose subject was deleted or moved is an over-grant nobody can " +
    "see, and the next file created at that path silently inherits a rule posture nobody re-approved (the " +
    "loaded-gun class, tooling/src/verify/gates/GATE-AUTHORING.md §4.4 mode B). The finding token is the dead path.",
  staleExempt:
    "an eslint-grant-liveness EXEMPT row forgives a path eslint.config.js no longer carries — a standing " +
    "exemption for a row that is gone is a LOADED GUN. Delete the row from EXEMPT in " +
    "tooling/src/verify/gates/eslint-grant-liveness.ts.",
  deadCite:
    "an eslint-grant-liveness EXEMPT row's `cite` no longer resolves — the producer that justified the " +
    "exemption moved or was deleted. Re-derive the cite, or delete the row from EXEMPT in " +
    "tooling/src/verify/gates/eslint-grant-liveness.ts.",
};

const MSG_MISSING =
  "eslint.config.js is not at the repo root — this gate's whole subject is gone, so its verdict is unknowable " +
  "and a ✓ here would be a lie (tooling/src/verify/gates/GATE-AUTHORING.md §4.6). Re-point CONFIG_REL in " +
  "tooling/src/verify/gates/eslint-grant-liveness.ts, or delete the gate with the config.";

const MSG_UNPARSEABLE =
  "eslint.config.js did not parse. Fail LOUD, never fall back to a default: a silently-defaulted lint config " +
  "lints nothing this repo asked for, and every verdict downstream of it becomes a lie. See " +
  "tooling/src/verify/gates/eslint-grant-liveness.ts.";

const MSG_UNREADABLE =
  "a `files`/`ignores` value in eslint.config.js is a shape this gate CANNOT statically read (a call, a " +
  "conditional, a spread of something non-literal), so the rows behind it are unjudged and a ✓ would be a lie " +
  "about coverage this gate does not have. This is the fail-loud half of the CODE-config extractor: an " +
  "unreadable shape is 'I could not measure', never 'clean'. Either spell the value as a literal/const the " +
  "reader resolves (tooling/src/verify/lib/config-static-read.ts), or widen the reader deliberately. The " +
  "finding token names the offending syntax kind.";

const MSG_NO_ROWS =
  "eslint.config.js parsed but ZERO file-exact grant rows were derived from an anchor-sized value set — the " +
  "glob/exact classifier has rotted past every row, so this gate is BLIND and its ✓ means nothing " +
  "(tooling/src/verify/gates/GATE-AUTHORING.md §4.6). Re-derive the classifier in " +
  "tooling/src/verify/gates/eslint-grant-liveness.ts.";

interface Outcome {
  readonly findings: readonly Finding[];
  readonly declaration: GateScanDeclaration;
}

function fileFinding(message: string, token?: string): Finding {
  return token === undefined ? { file: CONFIG_REL, line: 0, column: 0, message } : { file: CONFIG_REL, line: 0, column: 0, token, message };
}

function blind(message: string): Outcome {
  return { findings: [fileFinding(message)], declaration: { unit: UNIT, candidates: 0, scanned: 0 } };
}

/** An eslint `files`/`ignores` entry is a MINIMATCH glob; one carrying no glob metacharacter names ONE file. */
function classifyGlob(value: string): string | undefined {
  return isFileExact(value) ? value : undefined;
}

function scanEslintGrantLiveness(root: string): Outcome {
  const read = readConfigSource(root, CONFIG_REL);
  if (read.kind === "missing") {
    return blind(MSG_MISSING);
  }
  if (read.kind === "unparseable") {
    return blind(`${MSG_UNPARSEABLE} (${read.detail})`);
  }
  const rows = extractRows({ sf: read.sf, rel: CONFIG_REL, text: read.text, keys: JUDGED_KEYS, classify: classifyGlob });
  const declaration: GateScanDeclaration = {
    unit: UNIT,
    candidates: rows.candidates,
    scanned: rows.exact.length,
    skipped: { glob: rows.skipped },
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
/** `count` distinct glob entries — filler that clears the anchor while deriving zero exact rows. */
function globFiller(count: number): string {
  return Array.from({ length: count }, (_, i) => `"packages/p${i}/**"`).join(", ");
}
function configJs(entries: string): string {
  return `export default [{ files: [${entries}], rules: {} }];\n`;
}
const LIVE_REL = "packages/ui/src/live.ts";
const LIVE_SOURCE = "export const live = 1;\n";

export const gate: GateDescriptor = {
  name: "eslint-grant-liveness",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  // The unit is a config VALUE, not a workspace source file — this gate subscribes to no node kinds, so it
  // admits no files and declares its own scan counts through ctx.scan (GATE-AUTHORING.md §1 scan health).
  scanRoot: () => false,
  message: MESSAGES.dead,
  fix:
    "delete the dead path from its `files`/`ignores` in eslint.config.js. If the file MOVED, re-point the row " +
    "and re-read the block's rule list — a grant follows a decision, not a filename. If the path is transient " +
    "by construction, add a row to EXEMPT in tooling/src/verify/gates/eslint-grant-liveness.ts with its `why` " +
    "+ END CONDITION and the `cite` that proves it.",
  run: (ctx) => {
    const outcome = scanEslintGrantLiveness(ctx.root);
    ctx.scan(outcome.declaration);
    for (const finding of outcome.findings) {
      ctx.report(finding);
    }
  },
  mustFlag: [
    {
      files: { [CONFIG_REL]: 'export default [{ ignores: ["packages/ui/src/gone.ts"] }];\n' },
      expect: { count: 1, token: "packages/ui/src/gone.ts", line: 1 },
      why: "the founding shape — a file-exact grant whose file is GONE (mode B: nothing ever visits it, so nothing examines the promise)",
    },
    {
      files: {
        [CONFIG_REL]: `const SRC = "packages/ui/src/**/*.ts";\nconst DEAD = "packages/ui/src/gone.ts";\nexport default [{ files: [SRC, DEAD, "${LIVE_REL}"] }];\n`,
        [LIVE_REL]: LIVE_SOURCE,
      },
      expect: { count: 1, token: "packages/ui/src/gone.ts" },
      why: "THE CODE-CONFIG CASE: the dead row is behind a named CONST, invisible to a bare-StringLiteral reader — the glob const and the live literal stay silent",
    },
    {
      files: {
        [CONFIG_REL]: `const A = ["packages/ui/src/gone.ts"];\nconst B = [...A, "packages/ui/src/**"];\nexport default [{ ignores: B }];\n`,
      },
      expect: { count: 1, token: "packages/ui/src/gone.ts" },
      why: "a SPREAD of a const array — the second shape a naive reader misses entirely; the flattener must see through it",
    },
    {
      files: { [CONFIG_REL]: "export default [{ files: [resolvePaths()] }];\n" },
      expect: { count: 1, messageIncludes: "CANNOT statically read" },
      why: "THE FAIL-LOUD REQUIREMENT: a call expression is unreadable, and an unreadable shape must REFUSE, never pass as a clean zero",
    },
    {
      files: { "not-eslint.config.js": "export default [];\n" },
      expect: { count: 1, messageIncludes: "not at the repo root" },
      why: "§4.6 blindness tripwire: the gate is keyed on an EXACT filename, so that name resolving to nothing must be RED",
    },
    {
      files: { [CONFIG_REL]: "export default [{ files: [ ;;; (((( }];\n" },
      expect: { count: 1, messageIncludes: "did not parse" },
      why: "a broken lint config must FAIL LOUD — a silent default-fallback would lint nothing this repo asked for",
    },
    {
      files: { [CONFIG_REL]: configJs(globFiller(REAL_CONFIG_MIN_CANDIDATES)) },
      expect: { count: 1, messageIncludes: "ZERO file-exact grant rows" },
      why: "zero derived rows on an anchor-sized value set is 'I could not measure', never 'clean' — the classifier-rot tripwire",
    },
  ],
  mustPass: [
    {
      files: { [CONFIG_REL]: `export default [{ ignores: ["${LIVE_REL}"] }];\n`, [LIVE_REL]: LIVE_SOURCE },
      why: "a file-exact grant whose file is on the tree — the sanctioned shape, silent",
    },
    {
      files: { [CONFIG_REL]: configJs(`"packages/**/*.{ts,tsx}", "**/__g_*", "tests/**/*.ct.tsx"`) },
      why: "DECLARED LIMIT — every glob spelling (`**`, a brace set, a `*` segment) is a pattern, never resolved as a path; the config stays UNDER the anchor so the NO-ROWS arm (which owns the anchor-sized zero) cannot fire here",
    },
    {
      files: {
        [CONFIG_REL]: `export default [{ files: ["${LIVE_REL}"], rules: { "no-restricted-imports": ["error", { paths: ["packages/ui/src/gone.ts"] }] } }];\n`,
        [LIVE_REL]: LIVE_SOURCE,
      },
      why: "DECLARED LIMIT — only `files`/`ignores` are grants; a path inside a RULE OPTION is that rule's business and must not be judged here",
    },
  ],
};
