// Gate: suppressions (Core-Enforcement-Deferred-Dropped.md "suppressions" row; Spine-Testing.md §5
// house-suppression discipline) — counts down the four suppression-marker shapes under `packages/*/src`:
// `biome-ignore`/`biome-ignore-all`, every `eslint-disable` variant (bare/-next-line/-line), the two
// TypeScript suppression directives. Comment markers ONLY — a scan over ts-morph COMMENT RANGES (leading +
// trailing + the JSX comment-only-expression carrier, `suppressionSites`), never raw source text, so a
// string literal merely MENTIONING one of these tokens (gate/tooling fixture code) never counts. BASELINE RATCHET (the `no-test-fabrication` per-file
// shape): a committed `suppressions.baseline.json` maps repo-relative file → its budget; a file's live
// count exceeding its budget REDs the excess (newest suppressions surface first, by source order). BOTH
// WAYS: a baseline entry ABOVE the file's live count is a STALE-RED — the ratchet only tightens, it can
// never coast on a number the file no longer needs. Regenerate: `pnpm tsx scripts/check/gen-suppressions-baseline.ts`
// (rewrites the whole map from a live scan — run only on a sanctioned bulk shift, day-to-day the count
// only falls). Escape: none — a suppression IS the marker; the "escape" from this gate is deleting the
// suppression or bumping the baseline via a sanctioned regenerate.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

export const BASELINE_REL = "scripts/check/gates/suppressions.baseline.json";
const SRC_RE = /^packages\/[^/]+\/src\//u;
const SUPPRESSION_RE = /biome-ignore(?:-all)?|eslint-disable(?:-next-line|-line)?|@ts-expect-error|@ts-ignore/u;

/** True when this file is under `packages/<pkg>/src/` (bare repo-relative — scanRoot convention). */
export function isSrcFile(repoRelPath: string): boolean {
  return SRC_RE.test(repoRelPath);
}

/** Every suppression-marker comment in one source file, in source order (line, matched token).
 *  Three carriers, each de-duplicated by source position so one physical comment counts once:
 *  (1) LEADING comment ranges (the common `// biome-ignore …` / `// eslint-disable …` shape);
 *  (2) TRAILING comment ranges (a suppression trailing the statement it guards, e.g. a same-block
 *  `else if` arm's closing brace swallows what would otherwise be the next node's leading comment);
 *  (3) a comment-only JSX expression container (`{/* eslint-disable-next-line … *\/}`) — ts-morph folds
 *  that into the JsxExpression's own node text rather than exposing it via comment ranges at all. */
export function suppressionSites(sf: SourceFile): { line: number; token: string }[] {
  const sites: { line: number; token: string }[] = [];
  const seenLines = new Set<number>(); // dedupe by LINE: the same physical comment surfaces through more
  // than one carrier (e.g. a JSX comment-only expression is BOTH its own node text and a token's trailing
  // range at an adjacent position) — a suppression marker is one-per-line in practice, so line identity is
  // the robust dedupe key (position identity drifts across carriers for the exact same comment).
  const record = (pos: number, text: string): void => {
    const match = SUPPRESSION_RE.exec(text);
    if (match === null) {
      return;
    }
    const line = sf.getLineAndColumnAtPos(pos).line;
    if (seenLines.has(line)) {
      return;
    }
    seenLines.add(line);
    sites.push({ line, token: match[0] });
  };
  // getDescendants() (not forEachDescendant) — it includes token nodes (e.g. CloseBraceToken), which is
  // where a same-block trailing suppression (an `else if` arm's last statement) actually attaches its
  // comment range; forEachDescendant's traversal misses those token-only carriers.
  for (const node of sf.getDescendants()) {
    for (const range of node.getLeadingCommentRanges()) {
      record(range.getPos(), range.getText());
    }
    for (const range of node.getTrailingCommentRanges()) {
      record(range.getPos(), range.getText());
    }
    if (Node.isJsxExpression(node) && node.getExpression() === undefined) {
      record(node.getPos(), node.getText());
    }
  }
  sites.sort((a, b) => a.line - b.line);
  return sites;
}

/** The repo-relative path of a source file, or undefined if it isn't under a package's src dir. */
export function srcRel(root: string, absPath: string): string | undefined {
  const rel = absPath.startsWith(root) ? absPath.slice(root.length + 1) : absPath;
  return isSrcFile(rel) ? rel : undefined;
}

function loadBaseline(root: string): Record<string, number> {
  const path = join(root, BASELINE_REL);
  if (!existsSync(path)) {
    return {};
  }
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, number>;
}

const STALE_MESSAGE = (rel: string, baseline: number, live: number): string =>
  `stale suppressions.baseline.json entry — "${rel}" is budgeted ${baseline} but has only ${live} live ` +
  "suppression marker(s): regenerate the baseline (`pnpm tsx scripts/check/gen-suppressions-baseline.ts`) " +
  "to ratchet the floor down (Core-Enforcement-Deferred-Dropped.md, suppressions row).";
const EXCEED_MESSAGE = (token: string): string =>
  `suppression marker \`${token}\` exceeds this file's committed suppressions.baseline.json budget — ` +
  "delete the suppression (fix the underlying lint/type issue) or, if genuinely warranted, regenerate the " +
  "baseline via a sanctioned bulk shift (`pnpm tsx scripts/check/gen-suppressions-baseline.ts`); the ratchet " +
  "only shrinks day-to-day (Core-Enforcement-Deferred-Dropped.md, suppressions row).";

/** The exceed-budget + stale-baseline reconciliation shared by `run` and the residual unit test (via an
 *  injected baseline — the gate-conformance runner has no baseline.json on a synthetic tree). */
export function reconcileSuppressions(root: string, files: readonly SourceFile[], baseline: Record<string, number>): Violation[] {
  const violations: Violation[] = [];
  const liveCounts = new Map<string, number>();
  for (const sf of files) {
    const rel = srcRel(root, sf.getFilePath());
    if (rel === undefined) {
      continue;
    }
    const sites = suppressionSites(sf);
    liveCounts.set(rel, sites.length);
    const budget = baseline[rel] ?? 0;
    if (sites.length <= budget) {
      continue;
    }
    for (const site of sites.slice(budget)) {
      violations.push({ file: rel, line: site.line, message: EXCEED_MESSAGE(site.token) });
    }
  }
  // Both-ways: a baseline entry naming MORE than the file's live count is a stale floor — force it down.
  for (const [rel, budget] of Object.entries(baseline)) {
    const live = liveCounts.get(rel) ?? 0;
    if (budget > live) {
      violations.push({ file: rel, line: 0, message: STALE_MESSAGE(rel, budget, live) });
    }
  }
  return violations;
}

export const gate: GateDescriptor = {
  name: "suppressions",
  docRow: "Core-Enforcement-Deferred-Dropped.md (suppressions row) / Spine-Testing.md §5",
  status: "active",
  scopeSafety: "whole-project", // the baseline budget is a per-file whole-tree count, both-ways stale needs the full set
  message: EXCEED_MESSAGE("<marker>"),
  fix: "delete the suppression (fix the underlying issue), or regenerate suppressions.baseline.json via a sanctioned bulk shift (`pnpm tsx scripts/check/gen-suppressions-baseline.ts`).",
  scanRoot: (p) => isSrcFile(p),
  run: (ctx) => {
    const baseline = loadBaseline(ctx.root);
    for (const v of reconcileSuppressions(ctx.root, ctx.files, baseline)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message ?? "" });
    }
  },
  // NOTE: the BASELINE-BUDGET ratchet arms (a file AT its baseline passes; EXCEEDING REDs only the
  // excess; a STALE baseline entry REDs) need an INJECTED baseline (no baseline.json exists on the
  // in-memory example tree, so the conformance runner sees every file at budget 0) — un-expressible as
  // gate examples (the no-test-fabrication precedent). That coverage lives in
  // tests/tooling/suppressions.residual.test.ts (the baseline arithmetic, both directions) + the live
  // `pnpm check:structure` run (the real baseline.json). Only the pure DETECTION FLAG/PASS branches
  // (budget 0, no baseline file) port as examples below.
  mustFlag: [
    {
      files: "// biome-ignore lint/foo: reason\nexport const a = 1;\n",
      at: "packages/kit/src/x.ts",
      expect: { messageIncludes: "biome-ignore" },
      why: "a `biome-ignore` comment marker under packages/*/src with no baseline budget — a suppression",
    },
    {
      files: "// eslint-disable-next-line no-unused-vars\nexport const a = 1;\n",
      at: "packages/kit/src/y.ts",
      expect: { messageIncludes: "eslint-disable" },
      why: "an `eslint-disable-next-line` marker — one of the eslint-disable variants, counted",
    },
    {
      files: '// @ts-expect-error deliberate\nexport const a: number = "x";\n',
      at: "packages/kit/src/z.ts",
      expect: { messageIncludes: "@ts-expect-error" },
      why: "a `@ts-expect-error` marker under packages/*/src with no baseline budget — a suppression",
    },
  ],
  mustPass: [
    {
      files: 'const s = "biome-ignore lint/foo: not a real marker";\nexport const a = s;\n',
      at: "packages/kit/src/string-literal.ts",
      why: "a STRING LITERAL merely mentioning `biome-ignore` is not a comment — scans comment ranges only, passes",
    },
    {
      files: "// biome-ignore lint/foo: reason\nexport const a = 1;\n",
      at: "tests/tooling/x.test.ts",
      why: "scope: a suppression marker OUTSIDE packages/*/src is not gated here — passes",
    },
    {
      files: "export const a = 1;\n",
      at: "packages/kit/src/clean.ts",
      why: "a file with zero suppression markers, absent from the baseline (budget 0) — passes",
    },
  ],
};
