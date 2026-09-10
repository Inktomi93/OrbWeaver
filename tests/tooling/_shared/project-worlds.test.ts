// World intent stays independent of filesystem and compiler discovery.
import { BROWSER_PACKAGES, isNodeToolSource, isWorldHelperPath, predictedProgram, TEST_WORLD_PROGRAMS, worldOf } from "@orb/tooling/_shared/project-worlds";
import { TEST_KIND_DEFINITIONS } from "@orb/tooling/_shared/test-kinds";
import {
  AMBIENT_SCOPE_DEFINITIONS,
  ambientScopesForProgram,
  browserTestRootPatterns,
  nodeTestExclusionPatterns,
  programWorldOf,
} from "@orb/tooling/_shared/type-config-intent";
import { expect, test } from "../../support/tool-fixtures.ts";

test("worldOf: package src by PACKAGE_WORLDS, the test surface by directory then suffix, nothing else", () => {
  expect(worldOf("packages/kit/src/ids.ts")).toBe("iso");
  expect(worldOf("packages/server/src/app.ts")).toBe("node");
  expect(worldOf("packages/ui/src/primitives/button/button.tsx")).toBe("browser");
  expect(worldOf("packages/unknown/src/x.ts")).toBeUndefined();
  expect(worldOf("tooling/src/verify/cli.ts")).toBe("node");
  expect(worldOf("tests/support/node/route-trpc.ts")).toBe("node");
  expect(worldOf("tests/support/browser/pixel-contrast.ts")).toBe("browser");
  expect(worldOf("tests/client/data/x.test.ts")).toBe("node");
  expect(worldOf("tests/tooling/snap/ops/overflow.ct.tsx")).toBe("browser");
  expect(worldOf("tests/tooling/snap/cascade.suite.int.test.ts")).toBe("node");
  expect(worldOf("scripts/probes/st-goldens/generate-goldens.ts")).toBe("browser");
  expect(worldOf("scripts/dev/engines.ts")).toBe("node");
  expect(worldOf("playwright/index.tsx")).toBe("browser");
  expect(worldOf("knip.ts")).toBe("node");
  expect(worldOf("packages/client/vite.config.ts")).toBe("node");
  expect(worldOf("packages/ui/token-contract.ts")).toBe("node");
  expect(worldOf("tests/support/iso/values.ts")).toBe("iso");
  expect(worldOf("tests/support/node/misplaced.tsx")).toBe("node");
  expect(worldOf("tests/client/data/x.dom.test.ts")).toBe("browser");
  expect(worldOf("tests/client/data/x.dom.test-d.ts")).toBe("browser");
  expect(worldOf("tests/server/data/x.spec.ts")).toBe("browser");
  expect(worldOf("tests/server/data/x.test.tsx")).toBe("browser");
  expect(worldOf("tests/server/data/x.int.test.ts")).toBe("node");
  expect(worldOf("reset.d.ts")).toBeUndefined();
  expect([...BROWSER_PACKAGES].toSorted()).toEqual(["client", "ui"]);
});

test("primary compiler ownership follows package homes and the complete test-world map", () => {
  expect(predictedProgram("tests/ui/primitives/badge/badge.ct.tsx")).toBe(TEST_WORLD_PROGRAMS.browser);
  expect(predictedProgram("tests/server/foundation/env/index.test.ts")).toBe(TEST_WORLD_PROGRAMS.node);
  expect(predictedProgram("packages/ui/src/x.ts")).toBe("packages/ui/tsconfig.json");
  expect(predictedProgram("tests/support/iso/value.ts")).toBe("tsconfig.tests-iso.json");
  expect(predictedProgram("tests/support/iso/view.tsx")).toBe("tsconfig.tests-iso.json");
});

test("world helper population matches declared directories without prefix lookalikes", () => {
  expect(isWorldHelperPath("tests/support/iso/new.ts")).toBe(true);
  expect(isWorldHelperPath("tests/support/node")).toBe(true);
  expect(isWorldHelperPath("tests/support/browser/")).toBe(true);
  expect(isWorldHelperPath("tests/support/node-extra/value.ts")).toBe(false);
  expect(isWorldHelperPath("tests/support/chat/value.ts")).toBe(false);
});

test("node tool population is structural and excludes declarations and shipped package source", () => {
  expect(isNodeToolSource("knip.ts")).toBe(true);
  expect(isNodeToolSource("playwright-ct.config.ts")).toBe(true);
  expect(isNodeToolSource("packages/ui/token-contract.ts")).toBe(true);
  expect(isNodeToolSource("packages/client/vite.config.ts")).toBe(true);
  expect(isNodeToolSource("reset.d.ts")).toBe(false);
  expect(isNodeToolSource("packages/ui/src/index.ts")).toBe(false);
  expect(isNodeToolSource("tests/tooling/example.test.ts")).toBe(false);
});

test("ambient scope and browser-kind roots are explicit shared intent", () => {
  expect(AMBIENT_SCOPE_DEFINITIONS).toMatchObject({
    "reset.d.ts": "all-programs",
    "platform.d.ts": "all-programs",
    "aggregator-assets.d.ts": "graph-only",
    "packages/showcase-plugins/bundles/host-v1.d.ts": "graph-only",
  });
  const browserRoots = browserTestRootPatterns(TEST_KIND_DEFINITIONS);
  expect(browserRoots).toContain("tests/**/*.ct.tsx");
  expect(nodeTestExclusionPatterns(TEST_KIND_DEFINITIONS)).toEqual(browserRoots);
  expect(ambientScopesForProgram("tsconfig.json")).toContain("vitest-tests");
  expect(ambientScopesForProgram("tsconfig.tests-dom.json")).toContain("vitest-tests");
  expect(ambientScopesForProgram("tsconfig.tests-iso.json")).not.toContain("vitest-tests");
  expect(ambientScopesForProgram("packages/client/tsconfig.json")).not.toContain("vitest-tests");
});

test("program worlds are derived from registered package and test intent, never observed roots", () => {
  expect(programWorldOf("packages/kit/tsconfig.json")).toBe("iso");
  expect(programWorldOf("packages/server/tsconfig.json")).toBe("node");
  expect(programWorldOf("tsconfig.tests-dom.json")).toBe("browser");
  expect(programWorldOf("packages/fresh/tsconfig.json")).toBeUndefined();
  expect(programWorldOf("tsconfig.unknown.json")).toBeUndefined();
});
