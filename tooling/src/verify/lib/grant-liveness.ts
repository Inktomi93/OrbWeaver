// Shared core for the FILE-EXACT registry-liveness gates — biome-grant-liveness's siblings (#607). A
// registry (a lint/type config) that names a SPECIFIC FILE to grant a suppression, an override, an
// include/exclude, or a rule exemption has, per GATE-AUTHORING.md §4.4 mode (B), a row whose subject is
// never visited by anything — so when the file is deleted or moved the row goes SILENTLY dead: an
// over-grant nobody can see, and a future file recreated at that path inherits an exemption nobody
// re-approved (the loaded gun). Each sibling gate does its own registry-specific EXTRACTION and FAIL-LOUD
// (the configs are JSONC / JS / CJS, each read differently and each obliged to refuse rather than print a
// clean zero on a shape it cannot statically read); this module owns the parts that are IDENTICAL across
// them: the exact-vs-glob classifier, the DEAD-row arm, and the two-sided EXEMPT arms. It is a shared LIB,
// not a parallel framework: biome-grant-liveness is the reference implementation of the same shape.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExemptionTable, Finding } from "../contract/gate.ts";

/** Glob metacharacters the include/override syntaxes understand. A path carrying none of these is
 *  FILE-EXACT (mirrors biome-grant-liveness's own classifier so the four gates agree on the boundary). */
export const GLOB_META_RE = /[*?[\]{}]/u;

/** True iff `p` is a literal path (no glob metacharacters) — i.e. a grant on ONE named file. */
export function isFileExact(p: string): boolean {
  return !GLOB_META_RE.test(p);
}

/** A grant/exemption row a liveness gate deliberately does not fail on, but STILL polices two-sided
 *  (§4.4): a key the registry no longer carries is RED (a standing exemption for a gone row is a loaded
 *  gun), and a `cite` that stopped resolving is RED (the promise outlived its evidence). */
export interface GrantExemption {
  readonly why: string;
  /** The repo-relative producer/decision that justifies the exemption. Must resolve on the real tree. */
  readonly cite: string;
}

/** One classified file-exact row: the config FILE it was declared in (findings anchor there — a registry may
 *  span several config files, e.g. tsconfig.json + tsconfig.tests-dom.json), the literal path, and the
 *  1-based source line it sits on (0 when the line scan can't place it — the finding still stands, it just
 *  anchors file-level). */
export interface ExactRow {
  readonly file: string;
  readonly path: string;
  readonly line: number;
}

export interface LivenessMessages {
  /** DEAD file-exact grant (path resolves to nothing, not exempt). Carries the path as the finding token. */
  readonly dead: string;
  /** An EXEMPT row the registry no longer carries. */
  readonly staleExempt: string;
  /** An EXEMPT row whose cited producer no longer resolves. */
  readonly deadCite: string;
}

export interface LivenessInput {
  readonly root: string;
  readonly exact: readonly ExactRow[];
  readonly exempt: ExemptionTable<GrantExemption>;
  /** Which config file the GLOBAL exemption-table findings anchor at (a registry can span several config
   *  files, but its exemption table is one home). Normally the primary config, e.g. `biome.json`/`tsconfig.json`. */
  readonly exemptAnchorFile: string;
  /** The §4.5 real-tree anchor: only when TRUE (a genuine full-config read, never a conformance
   *  mini-project) do the exemption-table arms run, so a synthetic proof can't red the gate's own self-test. */
  readonly anchorOk: boolean;
  readonly messages: LivenessMessages;
}

/** The two-sided EXEMPT arms — runs only when the caller's real-tree anchor holds (`input.anchorOk`). */
function exemptionArms(input: LivenessInput, exactPaths: ReadonlySet<string>): Finding[] {
  const { root, exemptAnchorFile, exempt, messages } = input;
  const out: Finding[] = [];
  for (const [path, row] of Object.entries(exempt)) {
    if (!exactPaths.has(path)) {
      out.push({ file: exemptAnchorFile, line: 0, column: 0, token: path, message: messages.staleExempt });
      continue;
    }
    if (!existsSync(join(root, row.cite))) {
      out.push({ file: exemptAnchorFile, line: 0, column: 0, token: row.cite, message: messages.deadCite });
    }
  }
  return out;
}

/** DEAD-row + two-sided-EXEMPT findings for a set of already-extracted, already-classified file-exact rows.
 *  A row is dead when it is NOT exempt and its path resolves to nothing on the tree; the finding token is
 *  the dead path, anchored at its OWN config file + source line. The exemption table is judged GLOBALLY
 *  against the whole exact set (a row exact in ANY scanned config keeps its exemption live). */
export function livenessFindings(input: LivenessInput): Finding[] {
  const { root, exact, exempt, anchorOk, messages } = input;
  const exactPaths = new Set(exact.map((r) => r.path));
  const dead: Finding[] = exact
    .filter((r) => exempt[r.path] === undefined && !existsSync(join(root, r.path)))
    .map((r) => ({ file: r.file, line: r.line, column: 0, token: r.path, message: messages.dead }));
  return [...dead, ...(anchorOk ? exemptionArms(input, exactPaths) : [])];
}

/** A path→1-based-line resolver over raw config text, advancing a per-path cursor so a path that appears in
 *  TWO places reports two distinct lines. 0 when the literal isn't found. Mirrors biome-grant-liveness's
 *  `lineFinder` so all four gates anchor findings the same way. */
export function lineFinder(text: string): (path: string) => number {
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
