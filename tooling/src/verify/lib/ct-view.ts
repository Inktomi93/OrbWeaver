// The CT (Playwright component-test) view — the ONE deliberately-open edge of the verification surface
// (UNIFIED-VERIFICATION-DESIGN.md §3.4, owner-ratified 2026-07-17). Scoped CT is UNDER-selecting BY DESIGN:
// the mirror map (base case) + a SMALL table of DECLARED blast-radius sweeps (the classes that make
// mirror-only a lying green). This is honest ONLY because a scoped green is never the coverage verdict —
// the push bar (`tests:node` running the WHOLE `pnpm test:ct --retries=2`) is. Split out of lib/selection.ts
// at the @orb/tooling P6 move (size cap §4.3); the triggers and the mirror map are unchanged.
import { classifyTestFilename } from "../../_shared/test-kinds.ts";
import type { CtView } from "../contract/selection.ts";
import { existsRel, ROOT } from "./repo-paths.ts";

// A changed ui/client src file → its test-layout mirror (packages/<pkg>/src/<path>.<ext> ↔ tests/<pkg>/
// <path>). Group 1 = pkg (ui|client), group 2 = the sub-path (sans extension). The suffix-swap is the
// same prefix-swap mirror the test-layout gate enforces (AGENTS.md "Test layout").
const CT_MIRROR_SRC_RE = /^packages\/(ui|client)\/src\/(.+)\.(?:ts|tsx)$/u;
// A changed tests/**/*.ct.tsx selects ITSELF — but a `.suite.ct.tsx` (a cross-cutting property suite that
// mirrors no single module, Spine-Testing §1) is NOT mirror-selected; it rides sweeps only.
const CT_TEST_PREFIX_RE = /^tests\/(?:ui|client)\//u;

/** A blast-radius sweep trigger: a changed path matching `test` escalates from mirror-selection to running
 *  every `.ct.tsx` under the `dirs` — because a change to this path class throws in tests the mirror map
 *  can't reach (a lying mirror-only green). Each row carries its incident class. Kept SMALL and honest. */
interface SweepTrigger {
  readonly test: (rel: string) => boolean;
  readonly dirs: readonly string[];
  readonly why: string;
}

const PREFIX =
  (p: string) =>
  (rel: string): boolean =>
    rel.startsWith(p);

const CT_SWEEP_TRIGGERS: readonly SweepTrigger[] = [
  // ui skin/token/lib fragments surface in computed-style assertions EVERYWHERE (the light-dark()/31-assertion
  // incident class) — a token or shared-lib edit can flip a color/spacing assertion in any mounted component.
  {
    test: PREFIX("packages/ui/src/tokens/"),
    dirs: ["tests/ui", "tests/client"],
    why: "token change → computed-style assertions everywhere (light-dark()/31-assertion class)",
  },
  { test: PREFIX("packages/ui/src/styles/"), dirs: ["tests/ui", "tests/client"], why: "skin-fragment change → computed-style assertions everywhere" },
  { test: PREFIX("packages/ui/src/lib/"), dirs: ["tests/ui", "tests/client"], why: "shared ui lib change → any mounted component" },
  // a client registry/provider/factory throws in EVERY story (the section-registry incident class).
  { test: PREFIX("packages/client/src/state/"), dirs: ["tests/client"], why: "client state/registry/provider change → every story (section-registry class)" },
  { test: PREFIX("packages/client/src/data/"), dirs: ["tests/client"], why: "client data-layer change → every story" },
  { test: PREFIX("packages/client/src/forms/"), dirs: ["tests/client"], why: "client forms factory change → every story" },
  { test: PREFIX("packages/client/src/lib/"), dirs: ["tests/client"], why: "shared client lib change → every story" },
  // the CT harness itself (providers/route-stubs, the mount html/tsx, the config) → both trees.
  { test: PREFIX("tests/support/"), dirs: ["tests/ui", "tests/client"], why: "CT harness (providers/route-stubs) change → both trees" },
  { test: PREFIX("playwright/"), dirs: ["tests/ui", "tests/client"], why: "CT mount html/tsx change → both trees" },
  { test: (rel) => rel === "playwright-ct.config.ts", dirs: ["tests/ui", "tests/client"], why: "CT config change → both trees" },
  // SHARED GROUP CORES inside ui: a module consumed by N sibling primitives sweeps its group's mirror dir;
  // a self-contained primitive dir stays mirror-only. Derived from the packages/ui/src tree:
  //   • charts/chart/** — the frame/axis core every chart (bar-list/heatmap/histogram/…) consumes.
  //   • markdown/** internals (policy/shiki-plugin/math) — shared by the markdown seal's rendering.
  { test: PREFIX("packages/ui/src/charts/chart/"), dirs: ["tests/ui/charts"], why: "chart core consumed by every chart primitive → sweep the charts group" },
  { test: PREFIX("packages/ui/src/markdown/"), dirs: ["tests/ui/markdown"], why: "markdown internals shared by the markdown seal → sweep the markdown group" },
];

/** The mirror `.ct.tsx` a single changed path contributes, or undefined (no CT contribution). A changed
 *  `tests/<pkg>/…​.ct.tsx` selects ITSELF (never a `.suite.ct.tsx` — it mirrors no single module); a
 *  ui/client src file selects its test-layout mirror IFF that mirror exists on disk (no mirror, no
 *  contribution). */
function ctMirrorFor(rel: string, root: string): string | undefined {
  if (CT_TEST_PREFIX_RE.test(rel)) {
    const testKind = classifyTestFilename(rel);
    if (testKind?.definition.family === "component") {
      return testKind.definition.mirror === "module" && existsRel(rel, root) ? rel : undefined;
    }
  }
  const m = CT_MIRROR_SRC_RE.exec(rel);
  if (m === null) {
    return;
  }
  const mirror = `tests/${m[1]}/${m[2]}.ct.tsx`;
  return existsRel(mirror, root) ? mirror : undefined;
}

/** The CT view for a changed set: the mirror files (base case) UNION the declared blast-radius sweeps. A
 *  sweep, if ANY trigger fires, SUPERSEDES the file list (a dir arg runs its whole subtree — a superset of
 *  the individual mirrors, and it also picks up the `.suite.ct.tsx` cross-cutting suites). */
export function ctView(paths: readonly string[], root: string = ROOT): CtView {
  const sweepDirs = new Set<string>();
  const files = new Set<string>();
  for (const rel of paths) {
    for (const trig of CT_SWEEP_TRIGGERS) {
      if (trig.test(rel)) {
        for (const d of trig.dirs) {
          sweepDirs.add(d);
        }
      }
    }
    const mirror = ctMirrorFor(rel, root);
    if (mirror !== undefined) {
      files.add(mirror);
    }
  }
  if (sweepDirs.size > 0) {
    return { mode: "sweep", targets: [...sweepDirs] };
  }
  return files.size > 0 ? { mode: "files", targets: [...files] } : { mode: "skip", targets: [] };
}
