// Policy: test-layout (docs/law/Core-0-Architecture-and-Structure.md §5 / docs/law/Spine-Testing.md) — the central
// test mirror. Every test under `tests/` must prefix-swap to a real source file:
// `tests/<pkg>/<path>.<kind>` ↔ `packages/<pkg>/src/<path>.<ext>`, and `tests/tooling/<dir>/<path>.<kind>`
// ↔ `tooling/src/<dir>/<path>.ts` (`Core-Tooling-Law.md` §4.7). Suite kinds are cross-cutting and
// mirror-exempt; `.spec.ts` is e2e-only; `tests/{support,e2e}` and flat `tests/tooling` files are exempt.
//
// FAMILY `mirror-index` — the SHARED SUBJECT READER is `ops/resource-mirror.ts` `loadMirrorIndex`, reached
// through the `mirrorIndex` host door (`contract/resource-host.ts`). Its siblings are `test-presence`,
// `test-presence-inference` and `test-presence-client`; `contract/resource-mirror.ts` names this family as
// the kind's
// reason for existing and enumerates their `existsSync` sites by `file:line`. The four keep separate
// policy ids because they judge different SPACES (the test corpus · server/contracts source · client/ui
// source · inference source) with different rules; what they share — and what makes them one family — is the membership
// reader, not a theme.
//
// THIS POLICY WIRES THE `mirror-index` KIND. Until this conversion the kind was SHIPPED with ZERO gate
// consumers (`docs/reviews/gate-runtime/v-world-gates-2026-09-12.md` D-7), so it had never been exercised
// through a policy declaration on a real tree. The mirror RULE stays here: the prefix swap, the kind
// suffixes, the exemption classes and the §4.7 tooling arm are policy classifiers, which
// `docs/reviews/gate-runtime/resource-gate-access-patterns.md:107` reserves for the gate.
//
// POPULATION PORT — legacy at 6b1d01be0 (the parent of the conversion commit aecbc6c6c), where the module was a
// `GateDescriptor` with `scopeSafety: "whole-project"` and `fsBacked: true`. The legacy corpus was the
// LITERAL predicate `readdirSync(join(root, "tests"), { recursive: true, withFileTypes: true })` filtered to
// `entry.isFile()`, and its three source questions were `existsSync` on
// `packages/<pkg>/src/<sub>/<base><ext>` · `.../<base>/index<ext>` · `tooling/src/<toolDir>` ·
// `tooling/src/<sub>/<base>.ts` · `.../<base>/index.ts`. The final expression is
// `mirrorIndex("package-test").testFiles` for the walk (`testRoot` is `tests`), `.sourceFiles` for the two
// package source questions, and `mirrorIndex("tooling-test").sourceDirectories` / `.sourceFiles` for the
// §4.7 arm. `population: { of: "none" }` is the TS-dispatch declaration: this policy reads no source file
// at all, only membership. Three deliberate deltas:
//   (1) The four NON-AUTHORED directory names (`node_modules`, `.git`, `dist`, `.cache`) are invisible to
//       the authored reader (`ops/resource-reader.ts`) and were walked by `readdirSync`. A vendored
//       `tests/**/node_modules` would have been judged as authored tests; it no longer is.
//   (2) A symlink anywhere on the walked path makes the tree `unresolved` — a REFUSAL — where the legacy
//       listing reported the link by name. That is the `authored-path`/`authored-tree` identity rule, not
//       a narrowing of this policy.
//   (3) Findings anchor at `line: 1, column: 1` rather than the legacy synthetic `line: 0, column: 0`. A
//       zero is not a source coordinate; the file identity is the whole verdict either way.
// Nothing else moved: the arms, their order, their messages and their exemptions are byte-identical.
//
// AUTHORITY `hard`, and the legacy gate had no waiver door either — it declared no `ExemptionTable`, no
// baseline, no marker grammar and no private parser, and the live `@orb-gate-ignore test-layout` census is
// ZERO (measured with a planted positive control). Every finding is FILE-anchored on a path with no node
// and therefore no position token, so under this contract no ordinary door exists BY CONSTRUCTION (guide
// §3's second class): `hard` is the honest declaration, not a downgrade.
//
// WHERE A BROKEN RESOURCE REFUSES — not here, and this is the capability the conversion BUYS. The legacy
// arms answered every mirror question with `existsSync`, which cannot tell "the test tree has no member
// here" from "the test tree is not there at all" — and the second read as a clean corpus, which is why
// the legacy descriptor needed no blindness tripwire and had none. `loadMirrorIndex` refuses a family
// whose bounded space holds zero files (`ops/resource-mirror.ts`), `resolveResourceDeclarations` THROWS at
// the POPULATION phase, and the owner is withheld before `create` runs (guide §3's acquisition-refusal rule). So this
// module owns no not-ready branch: it reads through `readyResourceValue`, whose throw asserts that
// refusal. Every reachable refusal and the complete run's receipt pair are pinned through `runPolicyPass`
// in `tests/tooling/verify/gates/mirror-index-family.suite.test.ts`, because no proof row can express a refusal
// (guide §6.3).
//
// DECLARED LIMITS: the exemption classes themselves, each of which carries the row that holds it —
// `mustPass[0]` (e2e home), `[5]` (suite kind), `[7]` (flat tooling tier), and the §4.1 cut rows — plus ONE
// clause that no fixture can make decisive:
//
// `MIRROR_MIN_SEGS` IS MUTUALLY REDUNDANT WITH THE `sourceDirectories` FENCE, AND THE LIMIT IS DECLARED
// RATHER THAN FAKED (#2134, §4.1's fourth outcome; measured 2026-09-12 — cut alone: every row green · cut
// with the dir fence: `mustPass[7]` and `[10]` both red). It CANNOT be the deciding fence on any tree a
// fixture can build: a flat `tests/tooling/<x>` member's `segs[1]` is a FILE basename, `sourceDirectories`
// holds DIRECTORY paths, and the §4.7 arm only judges a member whose basename classifies as a registered
// test kind — so the dir fence would have to match a `tooling/src/` directory literally named `<x>.test.ts`.
// The clause is kept rather than deleted because it is an ARITY guard, not an exemption row that can rot:
// without it that impossible tree builds the mirror question `tooling/src//<base>.ts` (the empty `sub`
// segment), which is what the joint cut prints. `mustPass[10]` carries the joint-cut receipt.
//
// §4.6 DIFFERENTIAL — RECORDED 2026-09-13 (#2273). The conversion commit `aecbc6c6c` landed a population
// and refusal receipt and NO findings comparison, and §4.6 (#2000) stopped accepting silence as compliance;
// this is the record it owes, with each of the three axes named rather than "the differential".
//   · FINDINGS. FINAL side driven through `runPolicyPass` over the real workspace at `5045a6a68`: 57
//     findings, every one the §4.7 tooling arm ("mirror miss — no source for …"). LEGACY side: 53, measured
//     by cb-v-wave-8c on `50e31c534`, where the final side also read 53 — the pair MATCHES on that tree. The
//     +4 since is not a catch delta: each member is a test file that landed after, and every one of them
//     belonged to the class #2142 parked. THAT CLASS IS NOW EMPTY (#2388, 2026-09-18) — `c6ae36152` renamed
//     the whole `tests/tooling/verify/gates/**` family/wave corpus onto the registered `.suite.*` kinds, which
//     `mirror: "suite"` exempts by declaration in both arms, so the real tree reads 0 findings here. The park
//     and its three pins retired together per the park's own clause; the record is in
//     `tests/tooling/verify/gates/mirror-index-family.suite.test.ts`'s closing block.
//   · POPULATION. `population: { of: "none" }` both sides in effect — the legacy descriptor walked `tests`
//     itself and the final policy declares it. Resource members on the real tree: `package-test` 6525,
//     `tooling-test` 2228, `unresolved` 0 on both, which is the membership the legacy `readdirSync` built
//     per invocation.
//   · TOOL ERRORS. 0 on the final side, owner `success`; the legacy descriptor could not produce one (its
//     `existsSync` reads had no refusal), which is the capability delta this conversion bought and the
//     reason the refusal pins exist at all.
//   · ANCHOR MOVE (§4.6 category 6, the one this family owes a RECEIPT for rather than a bucket): legacy
//     reported at synthetic `line: 0`, the final policy at `1:1`. A moved anchor can orphan or re-bind a
//     positioned waiver — here it can bind NOTHING: the live `@orb-gate-ignore test-layout` census is ZERO,
//     re-measured 2026-09-13 with a planted positive control (the plant was found, the corpus holds no
//     other hit), and every finding is FILE-anchored with no position token.
//
// DECLARED CAPABILITY LIMIT — THIS POLICY PROVES A TEST'S NAME RESOLVES, NEVER THAT THE FILE IS ITS SUBJECT
// (#2264). The §4.7 arm asks whether the mirror target EXISTS. So a module SPLIT (not deleted) whose test is
// re-pointed at the new half while keeping its old name leaves the mirror resolving over a relationship
// that has become a lie, and this gate stays green — measured live for a whole release on
// `tests/tooling/_shared/artifacts*`. The limit is DECLARED rather than fixed here because the fix is a new
// capability plus a corpus, not a clause: closing it means comparing a test's IMPORT SET against its mirror
// target, and the cheap form of that predicate is REFUTED by measurement (2026-09-13, probe over all 2952
// files under `tests/`): of the 2441 tests whose mirror target resolves, **1460 never name it in their own
// import text** and **1024 still do not reach it after following re-exports two hops through the barrels**,
// because the house idiom is `@orb/<pkg>/<subpath>` — the package's public door, not the module. A
// text-level "the target appears among the imports" arm would therefore accuse ~42% of the test corpus on
// day one, which is a test-mirror revamp (the one #2142's park waited for; that park closed by RENAME
// instead — see the §4.6 record above — so this limit outlived it and is still open), not a gate fix. The
// row that would DIE under a name-only gate IS constructible and should be the capability's first
// `mustFlag`: `tooling/src/_shared/{artifacts,artifact-naming}.ts` both present, plus a
// `tests/tooling/_shared/artifacts.test.ts` importing ONLY `artifact-naming.ts` — name-only says PASS,
// subject-aware says FLAG. Until then the cheap interim is procedural: after a decomposition, read the
// mirrored test's IMPORTS rather than trusting that its name resolves.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `test-layout` descriptor at 6b1d01be054c113c68595540f3a6a28c9f7d1744, the parent of the conversion `aecbc6c6c`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,487 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), the legacy harness — no
// `scanRoot` — dispatched 7,487, and the final `population` admits 0; the subject is the declared `mirror-index`.
// legacy − final = all 7,487 harness candidates — dispatched to the legacy `run`, which read none of them (its
// subject came off disk through `readdirSync(tests, { recursive: true })` plus `existsSync` mirror questions);
// retired with that read. final − legacy = ∅. Controls: the legacy side is non-empty and the final side is empty by
// declaration, so equality cannot pass vacuously; outside `docs/__cbbhr_out_control.ts` rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.
import { PACKAGE_NAMES } from "../../_shared/project-worlds.ts";
import type { TestFilenameClassification } from "../../_shared/test-kinds.ts";
import { classifyTestFilename, looksLikeTestFilename, TEST_KIND_SUFFIXES } from "../../_shared/test-kinds.ts";
import { defineGate } from "../contract/policy.ts";
import type { MirrorIndex } from "../contract/resource-mirror.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const PKGS: ReadonlySet<string> = new Set(PACKAGE_NAMES);
/** `tooling/<dir>/<file>` — anything shorter is a flat tests/tooling file (the exempt non-mirror tier). */
const MIRROR_MIN_SEGS = 3;

const MESSAGE =
  "a test under tests/ has the wrong home — module tests prefix-swap to packages/<pkg>/src/<path>, while native .spec.ts belongs only under tests/e2e. See docs/law/Core-0-Architecture-and-Structure.md §5.";

interface Finding {
  readonly file: string;
  readonly message: string;
}

/** Join the path segments the mirror question is built from, skipping the empty `sub` a flat test gives. */
function mirrorPath(segments: readonly string[]): string {
  return segments.filter((segment) => segment.length > 0).join("/");
}

interface SrcLoc {
  readonly pkg: string;
  readonly sub: string;
  readonly base: string;
  readonly ext: string;
}

/** THE NARROWING that makes a mirror a mirror: an exact member, or that member's DIRECTORY INDEX. Cutting
 *  the `dirIndex` half kills `mustPass[8]`; cutting the exact-file half kills `mustPass[4]`. */
function srcExistsFor(sources: ReadonlySet<string>, loc: SrcLoc): boolean {
  const file = mirrorPath(["packages", loc.pkg, "src", loc.sub, `${loc.base}${loc.ext}`]);
  const dirIndex = mirrorPath(["packages", loc.pkg, "src", loc.sub, loc.base, `index${loc.ext}`]);
  return sources.has(file) || sources.has(dirIndex);
}

/** The §4.7 tooling arm: `tests/tooling/<dir>/<path>.<kind>` ↔ `tooling/src/<dir>/<path>.ts` (file or
 *  dir-index), suite kinds exempt — but ONLY for dirs that exist under `tooling/src/`. */
function toolingViolationFor(
  tooling: MirrorIndex,
  rel: string,
  segs: readonly string[],
  classification: TestFilenameClassification | undefined,
): Finding | undefined {
  const toolDir = segs[1];
  if (toolDir === undefined || segs.length < MIRROR_MIN_SEGS) {
    return;
  }
  if (!tooling.sourceDirectories.has(`${tooling.sourceRoot}/${toolDir}`)) {
    return; // no src twin — a root-config / research-zone test dir
  }
  if (classification === undefined || classification.definition.mirror === "suite") {
    return;
  }
  const base = classification.sourceBasename;
  const sub = segs.slice(1, -1).join("/");
  const file = `${tooling.sourceRoot}/${sub}/${base}.ts`;
  const dirIndex = `${tooling.sourceRoot}/${sub}/${base}/index.ts`;
  if (tooling.sourceFiles.has(file) || tooling.sourceFiles.has(dirIndex)) {
    return;
  }
  return {
    file: `tests/${rel}`,
    message: `mirror miss — no source for ${tooling.sourceRoot}/${sub}/${base}.ts (a tooling test prefix-swaps to its tool's module — docs/law/Core-Tooling-Law.md §4.7)`,
  };
}

/** Judge ONE test-space member. `rel` is the path under `tests/`; `name` is its basename. */
function violationFor(packages: MirrorIndex, tooling: MirrorIndex, rel: string, name: string): Finding | undefined {
  const segs = rel.split("/");
  const pkg = segs[0];
  const classification = classifyTestFilename(name);
  if (classification === undefined && looksLikeTestFilename(name)) {
    return { file: `tests/${rel}`, message: `unregistered test kind — use a registered suffix: ${TEST_KIND_SUFFIXES.join(", ")} (Spine-Testing.md)` };
  }
  // Non-mirror trees: support/ (fixtures), e2e/ (full-stack Playwright); native e2e is checked first.
  // tooling/ is CONDITIONAL since the @orb/tooling tree exists (Core-Tooling-Law.md §4.7):
  // tests/tooling/<dir>/ MIRRORS tooling/src/<dir>/ when that src dir exists; flat files + dirs with no src
  // twin stay exempt (they test root configs, the guard, and research-zone scripts).
  if (classification?.definition.mirror === "e2e-only" && pkg !== "e2e") {
    return { file: `tests/${rel}`, message: "wrong test home — .spec.ts is the native e2e kind and must live under tests/e2e/" };
  }
  if (pkg === "support" || pkg === "e2e") {
    return;
  }
  if (pkg === "tooling") {
    return toolingViolationFor(tooling, rel, segs, classification);
  }
  if (classification === undefined) {
    return;
  }
  if (pkg === undefined || !PKGS.has(pkg)) {
    return {
      file: `tests/${rel}`,
      message: `test outside a package mirror — expected tests/{${PACKAGE_NAMES.join(",")}}/… or tests/{support,e2e,tooling}/`,
    };
  }
  // (A `.parity.test.ts` KIND sat here until 2026-08-22 — the neo differential oracle, mirror-exempt because
  // it validated a cross-repo SURFACE rather than one source module. It went out with the oracle, #428.)
  //
  // Cross-cutting PROPERTY suites (`.suite.test.ts` / `.suite.int.test.ts`) validate a behaviour that spans
  // MANY source modules — a security-containment matrix, a cross-writer drift-equality — not one module, so
  // they are exempt from the 1:1 source-mirror (they still sit under a valid package tree, the pkg check
  // above). The named containment suite (agent-principal-design/07 §4) + the stats domain's cross-writer
  // economics drift invariant #3 are the first; the seat wave's seated containment re-run extends the former.
  // `.suite.ct.tsx` is the BROWSER-lane twin: a cross-cutting Playwright-CT property suite that asserts
  // one behaviour across MANY primitives (the D62 touch-target floor over the whole interactive set) — it
  // mirrors no single primitive, same exemption rationale as the node `.suite.*` twins.
  if (classification.definition.mirror === "suite") {
    return;
  }
  const base = classification.sourceBasename;
  const sub = segs.slice(1, -1).join("/");
  // The registry owns source compatibility: browser-subject .ts tests can also target .tsx components.
  const exts = classification.definition.sourceExtensions;
  if (exts.some((ext) => srcExistsFor(packages.sourceFiles, { pkg, sub, base, ext }))) {
    return;
  }
  return {
    file: `tests/${rel}`,
    message: `mirror miss — no source for packages/${pkg}/src/${mirrorPath([sub, base])}{${exts.join(",")}} (test path must prefix-swap)`,
  };
}

export const gate = defineGate({
  id: "test-layout",
  family: "mirror-index",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "the test corpus and both source spaces are closed mirror-index membership facts; this policy reads no source file" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [
    { kind: "mirror-index", id: "package-test" },
    { kind: "mirror-index", id: "tooling-test" },
  ],
  message: MESSAGE,
  fix: "place the test at its package source mirror, or place a native e2e .spec.ts under tests/e2e; support and tooling retain their documented exemptions.",
  create: (ctx) => ({
    evaluate: () => {
      const packages = readyResourceValue(ctx.resources.mirrorIndex("package-test"));
      const tooling = readyResourceValue(ctx.resources.mirrorIndex("tooling-test"));
      const prefix = `${packages.testRoot}/`;
      for (const testPath of packages.testFiles) {
        const rel = testPath.slice(prefix.length);
        const name = rel.slice(rel.lastIndexOf("/") + 1);
        const finding = violationFor(packages, tooling, rel, name);
        if (finding !== undefined) {
          ctx.report.file(finding.file, { line: 1, column: 1, message: finding.message });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "packages/ui/src/primitives/example.tsx": "export const example = 1;\n",
        "tests/ui/primitives/example.test.tsx": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: "unregistered test kind" },
      why: "the unused JSX unit kind has no runner; use .ct.tsx for browser execution or .dom.test.ts for a browser-subject Node test",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/primitives/example.tsx": "export const example = 1;\n",
        "tests/support/shape.ct-d.ts": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: "unregistered test kind" },
      why: "an unsupported type-test spelling cannot hide in a mirror-exempt helper tree — the kind check precedes every exemption",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/primitives/example.tsx": "export const example = 1;\n",
        "tests/server/domain/orphan.test.ts": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: "mirror miss" },
      why: "a test with no packages/server/src/domain/orphan.ts source — a mirror miss (§5)",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/primitives/example.tsx": "export const example = 1;\n",
        "tests/fresh/index.test.ts": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: "test outside a package mirror" },
      why: "an unknown package test cannot become owned merely because it sits under tests/",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/journey.ts": "export const s = 1;\n",
        "tests/server/domain/journey.spec.ts": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: "wrong test home" },
      why: "a native e2e .spec.ts outside tests/e2e — the kind is wrong-home rather than a source mirror, and it fires even though the mirror source EXISTS",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/primitives/example.tsx": "export const example = 1;\n",
        "tests/ui/primitives/example.ct.tsx": "export const x = 1;\n",
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/snapx/ghost.test.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: "tooling/src/snapx/ghost.ts" },
      why: "a tooling test whose tool DIR exists but whose module does not — the §4.7 tooling mirror bites",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/primitives/example.tsx": "export const example = 1;\n",
        "tests/ui/primitives/example.ct.tsx": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/deep/ghost.test.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: "tooling/src/snapx/deep/ghost.ts" },
      why: "THE `sourceDirectories` NARROWING'S OTHER HALF: the §4.7 arm keys its live/dead decision on the TOP tool dir (`snapx`, which exists) and then asks about the NESTED module path — so a test nested under a live tool dir is judged, not waved through. Cutting the `sourceDirectories` membership test makes this row's sibling `mustPass[7]` red instead",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/ui/src/primitives/example.tsx": "export const example = 1;\n",
        "tests/e2e/journey.spec.ts": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      why: "a native e2e .spec.ts in tests/e2e — its one valid non-mirror home, passes",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/domain/view.tsx": "export const s = 1;\n",
        "tests/client/domain/view.dom.test.ts": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      why: "a DOM runtime test may mirror a .tsx source even though the test file itself is .ts",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/domain/types.tsx": "export const s = 1;\n",
        "tests/client/domain/types.dom.test-d.ts": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      why: "a DOM type test may mirror a .tsx source while remaining distinct from the node .test-d.ts kind",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/domain/component.tsx": "export const component = 1;\n",
        "packages/client/src/domain/hook.ts": "export const hook = 1;\n",
        "tests/client/domain/component.ct.tsx": "export const x = 1;\n",
        "tests/client/domain/hook.ct.tsx": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      why: "component tests preserve the existing rule that they may mirror either a .tsx component or a .ts hook module",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/real.ts": "export const s = 1;\n",
        "tests/server/domain/real.test.ts": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      why: "a test whose path prefix-swaps to a real source module — a valid mirror, passes",
    },
    {
      mode: "resource",
      files: {
        "packages/showcase-plugins/src/index.ts": "export const s = 1;\n",
        "tests/showcase-plugins/index.test.ts": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      why: "the standalone showcase workspace still participates in generic source-test mirroring",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/primitives/example.tsx": "export const example = 1;\n",
        "tests/server/security/containment.suite.int.test.ts": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      why: "a cross-cutting .suite.int.test.ts under a valid pkg with NO single-source mirror — the property-suite exemption, passes",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/primitives/example.tsx": "export const example = 1;\n",
        "tests/ui/primitives/example.ct.tsx": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/ghosttool/ghost.test.ts": "export const x = 1;\n",
      },
      why: "THE `sourceDirectories` NARROWING: a tests/tooling/<dir>/ whose tool dir does NOT exist under tooling/src is the exempt research-zone tier and stays silent. Replacing the membership test with `true` makes this row RED — it is the row that dies without the fence, and `mustFlag[6]` is its live-dir twin",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/primitives/example.tsx": "export const example = 1;\n",
        "tests/ui/primitives/example.ct.tsx": "export const x = 1;\n",
        "tooling/src/snapx/reader/index.ts": "export {};\n",
        "tests/tooling/snapx/reader.test.ts": "export const x = 1;\n",
      },
      why: "THE DIR-INDEX HALF of the tooling mirror: a tool module published as `<name>/index.ts` satisfies the swap. Cutting the `dirIndex` clause reds exactly this row",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/domain/view/index.ts": "export const s = 1;\n",
        "tests/client/domain/view.test.ts": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      why: "THE DIR-INDEX HALF of the PACKAGE mirror — the row that dies when `srcExistsFor`'s `dirIndex` member is cut, the twin of the tooling row above",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/primitives/example.tsx": "export const example = 1;\n",
        "tests/tooling/flat-config.test.ts": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      why: "a FLAT tests/tooling file (root-config / research-zone subject) — the exempt non-mirror tier, passes. WHAT HOLDS IT IS THE PAIR, not `MIRROR_MIN_SEGS` alone (#2134, measured): cutting the arity test alone leaves this row GREEN, because a flat member's `segs[1]` is a FILE basename and `sourceDirectories` holds directory paths, so the dir fence acquits it anyway. The JOINT cut reds this row and `mustPass[7]` together, and the finding it then produces — `no source for tooling/src//flat-config.ts` — is the malformed mirror question the arity test exists to prevent",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/primitives/example.tsx": "export const example = 1;\n",
        "tests/support/tool-fixtures.ts": "export const x = 1;\n",
        "tests/e2e/helpers/login.ts": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      why: "THE SUPPORT/E2E EXEMPTION: a non-test helper in either non-mirror tree is silent. It is a distinct claim from `mustFlag[1]`, which proves the exemption does NOT reach a test-SHAPED name in the same tree",
    },
  ],
});
