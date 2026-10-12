// Policy: test-layout (docs/law/Core-0-Architecture-and-Structure.md §5) — where a test lives. A test carries a
// registered kind suffix; `.spec.ts` lives only under `tests/e2e`; a module-kind test sits in a directory that mirrors
// a source directory (`tests/<pkg>/<dir>/` ↔ `packages/<pkg>/src/<dir>/`, `tests/tooling/<tool>/<dir>/` ↔
// `tooling/src/<tool>/<dir>/`) and is named for its behaviour. Suites sit anywhere in their package tree. Whether a
// test reaches its subject is `test-reach`. Family `mirror-index`: the directory facts come from that resource.
import { PACKAGE_NAMES } from "../../floor/compiler/project-worlds.ts";
import type { TestFilenameClassification } from "../../floor/testing/test-kinds.ts";
import { classifyTestFilename, looksLikeTestFilename, TEST_KIND_SUFFIXES } from "../../floor/testing/test-kinds.ts";
import { defineGate } from "../contract/policy.ts";
import type { MirrorIndex } from "../contract/resource-mirror.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const PKGS: ReadonlySet<string> = new Set(PACKAGE_NAMES);
/** `tooling/<dir>/<file>` — anything shorter is a flat tests/tooling file (the exempt non-mirror tier). */
const MIRROR_MIN_SEGS = 3;

const MESSAGE =
  "a test under tests/ has the wrong home — a module test lives in the directory it mirrors under packages/<pkg>/src, and native .spec.ts belongs only under tests/e2e. See docs/law/Core-0-Architecture-and-Structure.md §5.";

interface Finding {
  readonly file: string;
  readonly message: string;
}

/** Join the path segments of a mirror directory, skipping the empty segment a flat test gives. */
function mirrorPath(segments: readonly string[]): string {
  return segments.filter((segment) => segment.length > 0).join("/");
}

/** The tooling arm (`Core-Tooling-Law.md` §4.7): `tests/tooling/<tool>/<dir>/` mirrors `tooling/src/<tool>/<dir>/`, but
 *  only for a tool that exists under `tooling/src/`; flat files and dirs with no tool twin are the exempt tier. */
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
  const dir = `${tooling.sourceRoot}/${segs.slice(1, -1).join("/")}`;
  if (tooling.sourceDirectories.has(dir)) {
    return;
  }
  return {
    file: `tests/${rel}`,
    message: `mirror miss — no source directory ${dir} (a tooling test lives in its tool's mirrored directory — docs/law/Core-Tooling-Law.md §4.7)`,
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
  // support/ and e2e/ mirror nothing; the native e2e kind is checked first so it cannot hide elsewhere.
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
  // A suite asserts one property across many modules, so it mirrors no single directory.
  if (classification.definition.mirror === "suite") {
    return;
  }
  const dir = mirrorPath(["packages", pkg, "src", ...segs.slice(1, -1)]);
  if (packages.sourceDirectories.has(dir)) {
    return;
  }
  return {
    file: `tests/${rel}`,
    message: `mirror miss — no source directory ${dir} (a module test lives in the directory it mirrors — docs/law/Core-0-Architecture-and-Structure.md §5)`,
  };
}

export const gate = defineGate({
  id: "test-layout",
  application: "resources",
  family: "mirror-index",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "the test corpus and both source spaces are closed mirror-index membership facts; this policy reads no source file" },
  analysis: "resource",
  // Selected-files so a staged commit that adds a mirrorless test is judged at the hook. Each row is judged
  // alone against the COMPLETE mirror indexes (resources are never narrowed, policy-effective-population.ts
  // rule 1), so the verdict composes over any subset; entire-population here deferred every staged run.
  execution: "selected-files",
  facts: [],
  resources: [
    { kind: "mirror-index", id: "package-test" },
    { kind: "mirror-index", id: "tooling-test" },
  ],
  message: MESSAGE,
  fix: "move the test into the source directory it mirrors (name it for the behaviour it proves), or place a native e2e .spec.ts under tests/e2e; support and tooling retain their documented exemptions.",
  create: (ctx) => ({
    evaluate: () => {
      const packages = readyResourceValue(ctx.resources.mirrorIndex("package-test"));
      const tooling = readyResourceValue(ctx.resources.mirrorIndex("tooling-test"));
      const prefix = `${packages.testRoot}/`;
      for (const testPath of [...packages.testFiles].filter(ctx.includesSubject)) {
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
      why: "a test in a directory with no source twin (`packages/server/src/domain` is absent) — a mirror miss (§5)",
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
        "packages/server/src/domain/chat/verbs/send.ts": "export const send = 1;\n",
        "tests/server/domain/chat/verbs/send/sending.int.test.ts": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: "no source directory packages/server/src/domain/chat/verbs/send" },
      why: "THE DIRECTORY RULE'S NEAR MISS: a test directory named after a source FILE is not a mirrored directory. The rule asks `sourceDirectories`, so a file of that name cannot satisfy it",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/primitives/example.tsx": "export const example = 1;\n",
        "tests/ui/primitives/example.ct.tsx": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/deep/ghost.test.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: "no source directory tooling/src/snapx/deep" },
      why: "THE `sourceDirectories` NARROWING'S OTHER HALF: the §4.7 arm keys its live/dead decision on the TOP tool dir (`snapx`, which exists) and then asks about the NESTED directory — so a test nested under a live tool dir in a directory the tool lacks is judged, not waved through",
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
        "packages/server/src/domain/real.ts": "export const s = 1;\n",
        "tests/server/domain/real-rows-survive-a-restart.int.test.ts": "export const x = 1;\n",
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/snapx/ghost-free-snapshots.test.ts": "export const x = 1;\n",
      },
      why: "THE FILE MIRROR ENDS: a test named for its behaviour in a mirrored directory passes in both arms though no source file carries its name. Restoring a per-file existence check reds this row",
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
        "tests/tooling/flat-config.test.ts": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      why: "a FLAT tests/tooling file (root-config / research-zone subject) — the exempt non-mirror tier, passes. WHAT HOLDS IT IS THE PAIR, not `MIRROR_MIN_SEGS` alone (#2134, measured): cutting the arity test alone leaves this row GREEN, because a flat member's `segs[1]` is a FILE basename and `sourceDirectories` holds directory paths, so the dir fence acquits it anyway. The JOINT cut reds this row and the research-zone row together",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/primitives/example.tsx": "export const example = 1;\n",
        "tests/support/node/tool-fixtures.ts": "export const x = 1;\n",
        "tests/e2e/helpers/login.ts": "export const x = 1;\n",
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      why: "THE SUPPORT/E2E EXEMPTION: a non-test helper in either non-mirror tree is silent. It is a distinct claim from `mustFlag[1]`, which proves the exemption does NOT reach a test-SHAPED name in the same tree",
    },
  ],
});
