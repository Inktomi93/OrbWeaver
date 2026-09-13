// Gate: ui-exports-map-complete (ui-package-design.md). The live @orb/ui module tree and package exports
// must agree in both directions. ResourceHost supplies both sources; the policy derives modules from the
// tree rather than maintaining a family list. The resource-policy contract this module is the worked
// example of — what a closed-ResourceHost policy owes, and why it owns no not-ready branch — is
// docs/design/resource-policy-contract.md.
// FAMILY: singleton. The subject is one package's manifest-versus-tree agreement; no second policy reads
// the `@orb/ui` exports map, and the shared reader this module does use is the declaration-consumption
// reader `readyResourceValue` (`lib/resource-declaration.ts`), not a family identity reader.
// POPULATION PORT: an INTENTIONAL CORRECTION, legacy at eb5fc2fab (the parent of 05e595f33). The legacy
// descriptor `readdirSync`-walked `packages/ui/src` two levels deep and `existsSync`-checked each exports
// target joined under `packages/ui`. The final declares `authored-tree:packages` plus
// `package-metadata:ui` — `packages`, NOT `ui-source`, because the real manifest exports a file OUTSIDE
// `src` (`"./token-contract": "./token-contract.ts"`) and the dead-target arm would false-RED it under the
// narrower id; `packages` is the smallest CLOSED id that keeps A3 honest (the vocabulary is frozen, guide
// §12.4). Four deltas, each deliberate: (1) the legacy A4 "reader learned nothing" arm is RETIRED and split
// into its two halves — a manifest with NO `exports` key resolves to `{}` and is a VERDICT (one A1 per
// derived module, `mustFlag[5]`); a missing/malformed manifest or a non-string-map `exports` block is a
// population-phase REFUSAL, pinned through `runPolicyPass` in resource-layout-wave-1.test.ts; (2) the legacy
// `existsSync(join(root, "packages/ui", target))` accepted any spelling that happened to resolve (`../kit/…`
// escaped the package), while the final requires a package-relative `./` specifier (`mustFlag[4]`) — a
// tightening; (3) non-authored directory names (`node_modules`, `dist`, `.git`, `.cache`) under `src` were
// visible to the legacy walk and are invisible to the authored reader — none is a module; (4) a symlink
// anywhere under `packages/` makes the tree `unresolved` (a refusal) where the legacy walk silently skipped
// a symlinked directory and `existsSync` followed a symlinked target.
// THE READY-EMPTY NORMALIZATION GENERALISES — a contract note, not this module's quirk: the package-metadata
// provider's `stringMap(undefined)` returns `{}` for EVERY optional map key (`scripts`, `dependencies`,
// `devDependencies`, `peerDependencies`, `optionalDependencies`, `exports`; `ops/resource-config.ts`), so
// every `packageMetadata` consumer inherits "absent key reads as an authored empty map" and must pin what
// its arm does with an empty map (`verify-registry-parity` reads `scripts` the same way). Only a key that
// is PRESENT and not a string map refuses.
// WHERE A BROKEN RESOURCE REFUSES — not here. A declared resource that is missing/empty/unresolved/
// malformed makes `resolveResourceDeclarations` (`lib/resource-declaration.ts`) THROW during the
// POPULATION phase, and the receipt phase withholds every consumer, both before `create`/`evaluate` run
// (guide §3's acquisition-refusal rule). So this module owns no not-ready branch: reading through `readyResourceValue`
// turns a broken resource into a loud tool error. An in-module `if (fact.status !== "ready") return;`
// would be unreachable code that teaches the next resource conversion to answer a broken resource with a
// silent return. Consequence for the roster: there is no reportable BLINDNESS arm here — an unreadable
// exports block is a tool error, never a finding.
// DECLARED LIMITS, each with the row that holds it: a leaf dir that is neither module nor family (`styles/`,
// published by FILE) owns no entry (`mustPass[1]`); a module's own subdirectories are internals
// (`mustPass[2]`); the absent-`exports`-key verdict cannot be told from an authored empty map — that is the
// provider's normalization above, not this policy's (`mustFlag[5]`). UNFALSIFIABLE fences are named at
// their function rather than pinned by a row that would not discriminate (guide §6.1's structurally-unfalsifiable classification).
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `ui-exports-map-complete` descriptor at eb5fc2fabcf0251deaf3a1921762fd0ff9b13a69, the parent of the conversion
// `05e595f33` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,047 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), the legacy harness
// — no `scanRoot` — dispatched 7,047, and the final `population` admits 0; the subject is the declared
// `authored-tree:packages` + `package-metadata:ui`. legacy − final = all 7,047 harness candidates — dispatched to the
// legacy `run`, which read none of them (its subject came off disk through a two-level `readdirSync` of
// `packages/ui/src` plus `existsSync` exports targets); retired with that read. final − legacy = ∅. Controls: the
// legacy side is non-empty and the final side is empty by declaration, so equality cannot pass vacuously; outside
// `docs/__cbbhr_out_control.ts` rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.

import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { ResourceTreeEntry } from "../contract/resource.ts";
import type { PackageStringMap } from "../contract/resource-config.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const UI_PACKAGE = "packages/ui";
const UI_SOURCE = `${UI_PACKAGE}/src`;
const UI_MANIFEST = `${UI_PACKAGE}/package.json`;
const INDEX = "index.ts";
const MESSAGE =
  "the @orb/ui exports map does not match the module tree (core/ui-package-design.md) — every module needs its exact export, every family member needs index.ts, and every export target must exist.";

interface ModuleDir {
  readonly key: string;
  readonly target: string;
  readonly indexPath: string;
  readonly directoryPath: string;
  readonly hasIndex: boolean;
}

/** The direct child DIRECTORIES of `parent`. Two fences survive, both measured by the §4.1 cut:
 *  `kind === "directory"` is enforced at the FAMILY-CHILD position by `mustPass[1]` (a file inside a family
 *  dir — `styles/globals.css` — must not become a "module" with no front door) and is UNFALSIFIABLE at the
 *  depth-1 position — documented, not faked, and the constructions that were ATTEMPTED (guide §6.1: name
 *  them) are these. A depth-1 FILE admitted by an unfenced walk yields `top = "x.ts"`, whose `topIndex`
 *  (`packages/ui/src/x.ts/index.ts`) cannot be a tree entry while `packages/ui/src/x.ts` is a file, and
 *  whose `childDirectories` set is empty because no path can start with `packages/ui/src/x.ts/` — so the
 *  loop body runs zero times and the output is byte-identical with and without the fence. The inverse
 *  construction, a real DIRECTORY at depth 1 named like a file, is what `mustFlag[6]` builds one level
 *  DOWN; it does not discriminate here, because a directory is admitted by the fenced walk too.
 *  `!path.includes("/")` is enforced by seven rows. A former `path.length > 0` companion was
 *  DELETED: an entry equal to `parent` itself fails the `startsWith(prefix)` test, so the remainder is never
 *  empty, and cutting it killed no row — the tell for a fence that reads like a guarantee and enforces nothing. */
function childDirectories(entries: readonly ResourceTreeEntry[], parent: string): readonly string[] {
  const prefix = `${parent}/`;
  return entries
    .filter((entry) => entry.kind === "directory" && entry.path.startsWith(prefix))
    .map((entry) => entry.path.slice(prefix.length))
    .filter((path) => !path.includes("/"))
    .toSorted();
}

/** Every directory the exports map is REQUIRED to name, derived from the tree's own two-level shape. The
 *  `kind === "file"` filter on the index set is a real fence, pinned by `mustFlag[6]`: a DIRECTORY named
 *  `index.ts` is constructible under `mode: "resource"` (`packages/ui/src/primitives/index.ts/x.ts`), and
 *  with the filter cut that directory satisfies `files.has(topIndex)`, so the family is silently promoted to
 *  a MODULE with a directory for a front door and the "has no index.ts" finding vanishes. Recorded
 *  UNFALSIFIABLE until 2026-09-12 on the argument that it "would matter only for a DIRECTORY named
 *  index.ts" — the construction was never attempted, and every existing row reached this line through a
 *  fixture helper that plants only real files, so the clean cut measured the FIXTURES, not the fence
 *  (guide §6.1). */
function modules(entries: readonly ResourceTreeEntry[]): readonly ModuleDir[] {
  const files = new Set(entries.filter((entry) => entry.kind === "file").map((entry) => entry.path));
  const out: ModuleDir[] = [];
  for (const top of childDirectories(entries, UI_SOURCE)) {
    const topDirectory = `${UI_SOURCE}/${top}`;
    const topIndex = `${topDirectory}/${INDEX}`;
    if (files.has(topIndex)) {
      out.push({ key: `./${top}`, target: `./src/${top}/${INDEX}`, indexPath: topIndex, directoryPath: topDirectory, hasIndex: true });
      continue;
    }
    for (const child of childDirectories(entries, topDirectory)) {
      const directoryPath = `${topDirectory}/${child}`;
      const indexPath = `${directoryPath}/${INDEX}`;
      out.push({ key: `./${child}`, target: `./src/${top}/${child}/${INDEX}`, indexPath, directoryPath, hasIndex: files.has(indexPath) });
    }
  }
  return out;
}

/** An exports target is a PACKAGE-RELATIVE specifier; anything else names nothing this package can
 *  resolve and is dead by construction. The `./` test is what makes the slice below meaningful rather
 *  than arbitrary — without it a target whose third character onward happens to spell a live path
 *  (`~/src/primitives/button/index.ts`) would resolve to a real file and pass, which `mustFlag[4]` now
 *  pins. The former `&& target.length > 2` companion was deleted: `"./"` slices to `""` and yields
 *  `packages/ui/`, which is not a tree path either way, so no fixture could ever tell the two apart. */
function targetPath(target: string): string | undefined {
  return target.startsWith("./") ? `${UI_PACKAGE}/${target.slice(2)}` : undefined;
}

function reportModuleProblems(ctx: GatePolicyContext, entries: readonly ResourceTreeEntry[], exports: PackageStringMap): void {
  for (const module of modules(entries)) {
    if (!module.hasIndex) {
      ctx.report.file(module.directoryPath, {
        line: 1,
        column: 1,
        message: `${module.directoryPath} has no ${INDEX}; it has no exportable front door (core/ui-package-design.md).`,
      });
      continue;
    }
    if (exports[module.key] !== module.target) {
      const spelled = exports[module.key];
      const detail = spelled === undefined ? "no entry at all" : `${JSON.stringify(spelled)}, not ${JSON.stringify(module.target)}`;
      ctx.report.file(module.indexPath, {
        line: 1,
        column: 1,
        message: `${UI_MANIFEST} exports has ${detail} for ${JSON.stringify(module.key)} (core/ui-package-design.md).`,
      });
    }
  }
}

/** A3, two causes with two MESSAGES: a specifier that is not package-relative resolves to nothing this
 *  package owns, and a package-relative target whose file is gone. One report call carried both until the
 *  transplant test showed `mustFlag[3]`'s "does not exist" matched `mustFlag[4]` too — a shared message
 *  cannot discriminate two causes, so the causes were split rather than the row weakened. */
function reportDeadTargets(ctx: GatePolicyContext, entries: readonly ResourceTreeEntry[], exports: PackageStringMap): void {
  const paths = new Set(entries.map((entry) => entry.path));
  for (const [key, target] of Object.entries(exports)) {
    const path = targetPath(target);
    if (path === undefined) {
      ctx.report.file(UI_MANIFEST, {
        line: 1,
        column: 1,
        message: `exports entry ${JSON.stringify(key)} points at ${JSON.stringify(target)}, which is not a package-relative "./" specifier and resolves to nothing this package owns (core/ui-package-design.md).`,
      });
      continue;
    }
    if (!paths.has(path)) {
      ctx.report.file(UI_MANIFEST, {
        line: 1,
        column: 1,
        message: `exports entry ${JSON.stringify(key)} points at ${JSON.stringify(target)}, which does not exist (core/ui-package-design.md).`,
      });
    }
  }
}

export const gate = defineGate({
  id: "ui-exports-map-complete",
  family: "ui-exports-map-complete",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "the UI tree and package exports are closed ResourceHost facts" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [
    { kind: "authored-tree", id: "packages" },
    { kind: "package-metadata", id: "ui" },
  ],
  message: MESSAGE,
  fix: 'add the exact "./<name>": "./src/<family>/<name>/index.ts" export, add the missing index.ts, or delete the dead export.',
  create: (ctx) => ({
    evaluate: () => {
      const entries = readyResourceValue(ctx.resources.authoredTree("packages"));
      const exports = readyResourceValue(ctx.resources.packageMetadata("ui")).exports;
      reportModuleProblems(ctx, entries, exports);
      reportDeadTargets(ctx, entries, exports);
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "packages/ui/package.json": '{"name":"@orb/ui","private":true,"exports":{"./button":"./src/primitives/button/index.ts"}}',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
        "packages/ui/src/primitives/hint-trigger/index.ts": "export const HintTrigger = 1;\n",
      },
      expect: { count: 1, messageIncludes: "no entry at all" },
      why: "a complete module absent from the exports map is unimportable",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/package.json":
          '{"name":"@orb/ui","private":true,"exports":{"./button":"./src/primitives/button/index.ts","./badge":"./src/primitives/button/index.ts"}}',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
        "packages/ui/src/primitives/badge/index.ts": "export const Badge = 1;\n",
      },
      // The discriminator names BOTH halves of the wrong-target message — what the manifest spells and
      // what the tree requires. A bare "not" matched the DEAD-TARGET arm too (its message reads "which
      // does not exist"), so this row proved nothing its sibling `mustFlag[3]` did not already prove.
      expect: { count: 1, messageIncludes: 'exports has "./src/primitives/button/index.ts", not "./src/primitives/badge/index.ts"' },
      why: "an export entry pointing at another module is present but wrong",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/package.json": '{"name":"@orb/ui","private":true,"exports":{"./button":"./src/primitives/button/index.ts"}}',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
        "packages/ui/src/charts/meter/meter.tsx": "export const Meter = 1;\n",
      },
      expect: { count: 1, messageIncludes: "has no index.ts" },
      why: "a family member without an index has no exportable front door",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/package.json":
          '{"name":"@orb/ui","private":true,"exports":{"./button":"./src/primitives/button/index.ts","./ghost":"./src/primitives/ghost/index.ts"}}',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
      },
      expect: { count: 1, messageIncludes: "does not exist" },
      why: "an export target that vanished is stale",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/package.json":
          '{"name":"@orb/ui","private":true,"exports":{"./button":"./src/primitives/button/index.ts","./tilde":"~/src/primitives/button/index.ts"}}',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
      },
      // The MINIMAL falsifier for the package-relative test in `targetPath`. This target's tail spells a
      // path that really exists, so dropping the `./` test resolves it to the live button module and the
      // row goes green — which is how the fence earns its §4.1 cut (WRONG-DIRECTION class: the row the cut
      // turns GREEN, not one asserting a bogus input is reported). A target that merely fails to exist
      // cannot prove it: both the fenced and the unfenced spelling report that one. The discriminator is
      // the cause's own message, so transplanting `mustFlag[3]`'s "does not exist" here REDS this row.
      expect: { count: 1, messageIncludes: 'is not a package-relative "./" specifier' },
      why: "an export target that is not a package-relative ./ specifier resolves to nothing this package owns",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/package.json": '{"name":"@orb/ui","private":true}',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
        "packages/ui/src/primitives/badge/index.ts": "export const Badge = 1;\n",
      },
      // The READY half of the retired legacy A4 "reader learned nothing" arm. A manifest with no `exports`
      // key at all resolves to `{}` (`ops/resource-config.ts`, `stringMap(undefined)`), which is a VERDICT,
      // not a refusal: every derived module is sealed out and the finding says so per module. The count is
      // what carries this row — it shares `mustFlag[0]`'s arm and message, and differs in CAUSE (no map,
      // rather than one missing entry) and in cardinality. The other half of A4 — a missing/malformed
      // manifest or an `exports` block that is not a string map — is a population-phase REFUSAL, which no
      // proof row can express; it is pinned through `runPolicyPass` in resource-layout-wave-1.test.ts.
      expect: { count: 2, messageIncludes: "no entry at all" },
      why: "a manifest with no exports key seals every module out — one A1 finding per derived module, never a silent zero",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/package.json": '{"name":"@orb/ui","private":true,"exports":{}}',
        "packages/ui/src/primitives/index.ts/x.ts": "export const x = 1;\n",
      },
      // The falsifier for `modules`' `kind === "file"` index fence, which was recorded UNFALSIFIABLE on the
      // argument that it "would matter only for a DIRECTORY named index.ts" — a `mode: "resource"` fixture
      // writes a real tree, so it can create exactly that. FENCED (today): the directory is not in `files`,
      // `primitives` stays a FAMILY, and its one child — the directory `index.ts` — is a module with no
      // front door. CUT (`entries.filter(kind === "file")` → `entries.map`): the directory satisfies
      // `files.has(topIndex)`, `primitives` is promoted to a MODULE whose export target is a DIRECTORY, and
      // the finding becomes "no entry at all". Same COUNT either way, so the message is what discriminates.
      expect: { count: 1, messageIncludes: "has no index.ts" },
      why: "a DIRECTORY named index.ts is not a front door — the index set is files only, or a family is silently promoted to a module whose export target cannot be imported",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/ui/package.json":
          '{"name":"@orb/ui","private":true,"exports":{"./button":"./src/primitives/button/index.ts","./meter":"./src/charts/meter/index.ts","./lib":"./src/lib/index.ts"}}',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
        "packages/ui/src/charts/meter/index.ts": "export const Meter = 1;\n",
        "packages/ui/src/lib/index.ts": "export const cn = 1;\n",
      },
      why: "family members and top-level modules each have the exact derived export",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/package.json":
          '{"name":"@orb/ui","private":true,"exports":{"./button":"./src/primitives/button/index.ts","./styles/globals.css":"./src/styles/globals.css"}}',
        "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n",
        "packages/ui/src/styles/globals.css": ":root { --x: 1; }\n",
      },
      why: "a leaf CSS directory owns no module export while its explicit file export stays valid",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/package.json": '{"name":"@orb/ui","private":true,"exports":{"./tokens":"./src/tokens/index.ts"}}',
        "packages/ui/src/tokens/index.ts": "export const tokens = {};\n",
        "packages/ui/src/tokens/generated/palette.ts": "export const palette = {};\n",
      },
      why: "a top-level module may contain internal subdirectories without exporting each one",
    },
  ],
});
