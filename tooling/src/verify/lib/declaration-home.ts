// The TOTAL answer to "where is this declaration declared?", for a declaration reached by RESOLUTION.
//
// `ctx.relativePath` is PARTIAL: `lib/policy-pass-context.ts:211-217` THROWS `source file is outside the
// effective population` for any file the pass did not deliver. That is safe for a node a policy VISITED —
// those ARE the population by construction — and unsafe for anything reached through the binding resolver
// (`canonical.sourceFile`, `symbol.declaration.getSourceFile()`, a cross-module const spread), because an
// imported `.d.ts` is in the ts-morph Project and in NO policy's population. It killed a converted exemplar
// for an entire run: `freeze-provenance-write-pairing` asked it about every named import in `@packages`, the
// first `import { useQuery } from "@tanstack/react-query"` resolved into a node_modules `.d.ts`, and the
// policy reported NOTHING on every real-tree run while sitting at 0 conformance failures (2026-09-11,
// guide §12.3). Whether a resolution escapes is a property of what the SUBJECT imports, never of the policy,
// so every such site is one import away from going dark.
//
// AND THE IMPORT DOES NOT HAVE TO BE A VENDOR ONE. Measured 2026-09-12
// (`docs/reviews/gate-runtime/v-audit-wave2-2026-09-12.md` D1): an ordinary `packages/ui/src/…` const imported
// into a `@client` definition reproduces the throw in all four registry-definition policies, and a same-named
// exported tuple anywhere in `@client` reproduces it in `warning-code-coverage` — no `.d.ts`, no
// `node_modules`, one hop out of the population. The phase differs too (`[evaluate]` there, `[visit]` in the
// exemplar that died), so the tell is the ARGUMENT, never the hook.
//
// This module owns no Project, no walk, no cache and no filesystem access: it reads one source file's own
// path and re-expresses it in the repo-relative vocabulary every policy already speaks.
//
// WHY NOT `ctx.files` MEMBERSHIP as the test instead: `lib/policy-pass.ts:316` intersects the declared
// population with a scoped run's requested paths, so a membership test reads silently CLEAN under every
// `--scope`/`--changed` run — a false clean, strictly worse than the loud throw it would replace.
//
// WHY NOT the bare `sourceFile.getFilePath()` house spelling (`lib/id-brand.ts:88`, `lib/sealed-origin.ts:27`):
// that one is total and correct where the question is answered by a path SUFFIX. It is not enough where the
// answer is SHOWN in a finding or fed to a repo-relative path-shape reader — an absolute path is the
// conformance runtime's sequence-numbered virtual root (`ops/policy-conformance.ts:65`), so it is neither
// legible nor deterministic. This reader gives those callers the same repo-relative string they would have
// got from `ctx.relativePath`, and gives it for foreign declarations too.
import type { SourceFile } from "ts-morph";
import type { GateFactContext } from "../contract/fact.ts";

const normalize = (path: string): string => path.replaceAll("\\", "/");

/** The run's root, derived EXACTLY from one delivered file: its absolute path minus its repo-relative path.
 *  The pass refuses an empty population before `create`, so the first file is present on every live run;
 *  the `undefined` arm is the honest answer for a context that somehow has none, never a guess. */
function runRoot(context: GateFactContext): string | undefined {
  const first = context.files[0];
  if (first === undefined) {
    return;
  }
  const absolute = normalize(first.getFilePath());
  const relative = context.relativePath(first);
  return absolute.endsWith(`/${relative}`) ? absolute.slice(0, absolute.length - relative.length - 1) : undefined;
}

/** The repo-relative home of ANY source file in the pass's Project, delivered or not.
 *
 *  A file outside the run root — which no `@orb` layout produces, since `node_modules/` lives under it —
 *  keeps its normalized absolute path rather than being reported as absent: §12.3's rule is that a reader
 *  never returns absence for something it could not express. */
export function declarationHome(context: GateFactContext, sourceFile: SourceFile): string {
  const absolute = normalize(sourceFile.getFilePath());
  const root = runRoot(context);
  return root !== undefined && absolute.startsWith(`${root}/`) ? absolute.slice(root.length + 1) : absolute;
}
