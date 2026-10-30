// The Node-test and browser-mount reach rules read each test's own imports and judge the few files a test may enter
// through reachable rules. Each row plants a tree, runs the production config over it, and names the rule and file
// that refuse it. A refusal row lists every attribution the config may use, because the reach is reported on the
// file that starts the chain.
import { dirname, join, relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { runNicedSync } from "@orb/tooling/floor/process/proc";

// Each row loads the production config, which parses the Node compiler's whole test population before it cruises.
const CRUISE_TIMEOUT_MS = 60_000;
const NODE_TEST = "tests/tooling/native-testkit-rows-boundary.test.ts";
const NODE_HELPER = "tests/support/node/helpers.ts";
const NODE_SERVER = "tests/support/node/server.ts";
const NODE_FEATURE_HELPER = "tests/server/domain/chat/engine/engine-physical.ts";
const ISO_DOOR = "tests/support/iso/index.ts";
const ISO_HELPER = "tests/support/iso/probe.ts";
const BROWSER_DOOR = "tests/support/browser/index.ts";
const BROWSER_PROBE = "tests/support/browser/probe.ts";
const MODES = "tests/e2e/support/modes.ts";
const SDK_STAND_IN = "tests/server/domain/chat/engine/engine-sdk-physical.mjs";
const MOUNT = "tests/client/probe-stories.tsx";
const TRAIL_HELPER = "tests/client/features/app-shell/surfaces/trail-projection.ts";
const SERVER_FILE = "packages/server/src/probe.ts";
const CLIENT_FILE = "packages/client/src/probe.ts";
const OWNED_RULES = [
  "node-tests-no-browser-helpers",
  "node-test-side-no-browser-helpers",
  "node-tests-closed-test-side-imports",
  "browser-mounts-no-node-or-server",
  "browser-mount-entries-no-node-or-server",
  "browser-mounts-closed-imports",
  "browser-packages-src-closed",
  "not-to-test",
  "test-helper-world-direction",
] as const;

type Planted = Readonly<Record<string, readonly string[]>>;

interface Row {
  readonly name: string;
  readonly files: Planted;
  // Any one pair refuses the row; an empty list means no owned rule may fire.
  readonly refusedBy: readonly (readonly [rule: (typeof OWNED_RULES)[number], source: string])[];
}

// A sibling path needs its `./`, or the resolver reads it as a package name.
function relativeSpecifier(from: string, to: string): string {
  const path = relative(dirname(from), to);
  return path.startsWith(".") ? path : `./${path}`;
}

test.for<Row>([
  // What the old reachable rules refused, through every kind of file a test can enter.
  {
    name: "a Node test importing a browser helper directly",
    files: { [NODE_TEST]: [BROWSER_PROBE] },
    refusedBy: [["node-tests-no-browser-helpers", NODE_TEST]],
  },
  {
    name: "a Node test reaching a browser helper through a testkit node helper",
    files: { [NODE_TEST]: [NODE_HELPER], [NODE_HELPER]: [BROWSER_PROBE] },
    refusedBy: [
      ["node-tests-no-browser-helpers", NODE_TEST],
      ["node-tests-no-browser-helpers", NODE_HELPER],
    ],
  },
  {
    name: "a Node test reaching a browser helper through a testkit iso helper",
    files: { [NODE_TEST]: [ISO_DOOR], [ISO_DOOR]: [BROWSER_PROBE] },
    refusedBy: [
      ["node-tests-no-browser-helpers", NODE_TEST],
      ["node-test-side-no-browser-helpers", ISO_DOOR],
    ],
  },
  {
    name: "a Node test reaching a browser helper through a feature test helper",
    files: { [NODE_TEST]: [NODE_FEATURE_HELPER], [NODE_FEATURE_HELPER]: [BROWSER_PROBE] },
    refusedBy: [
      ["node-tests-no-browser-helpers", NODE_TEST],
      ["node-tests-no-browser-helpers", NODE_FEATURE_HELPER],
    ],
  },
  {
    name: "a Node test reaching a browser helper through the e2e mode file",
    files: { [NODE_TEST]: [MODES], [MODES]: [BROWSER_PROBE] },
    refusedBy: [
      ["node-tests-no-browser-helpers", NODE_TEST],
      ["node-test-side-no-browser-helpers", MODES],
    ],
  },
  {
    name: "a Node test reaching a browser helper through an SDK stand-in",
    files: { [NODE_TEST]: [SDK_STAND_IN], [SDK_STAND_IN]: [BROWSER_PROBE] },
    refusedBy: [
      ["node-tests-no-browser-helpers", NODE_TEST],
      ["node-test-side-no-browser-helpers", SDK_STAND_IN],
    ],
  },
  {
    name: "a testkit iso helper importing a Node helper",
    files: { [ISO_HELPER]: [NODE_HELPER] },
    refusedBy: [["test-helper-world-direction", ISO_HELPER]],
  },
  {
    name: "a testkit iso helper reaching a Node helper through another iso file",
    files: { [ISO_DOOR]: [ISO_HELPER], [ISO_HELPER]: [NODE_HELPER] },
    refusedBy: [
      ["test-helper-world-direction", ISO_HELPER],
      ["test-helper-world-direction", ISO_DOOR],
      ["browser-mount-entries-no-node-or-server", ISO_DOOR],
    ],
  },
  {
    name: "a testkit Node helper importing a browser helper",
    files: { [NODE_HELPER]: [BROWSER_PROBE] },
    refusedBy: [["test-helper-world-direction", NODE_HELPER]],
  },
  {
    name: "a testkit iso helper reaching a browser helper through another iso file",
    files: { [ISO_DOOR]: [ISO_HELPER], [ISO_HELPER]: [BROWSER_PROBE] },
    refusedBy: [
      ["test-helper-world-direction", ISO_HELPER],
      ["node-test-side-no-browser-helpers", ISO_DOOR],
    ],
  },
  {
    name: "a browser mount importing server runtime directly",
    files: { [MOUNT]: [SERVER_FILE] },
    refusedBy: [["browser-mounts-no-node-or-server", MOUNT]],
  },
  {
    name: "a browser mount reaching server runtime through a testkit file",
    files: { [MOUNT]: [BROWSER_DOOR], [BROWSER_DOOR]: [SERVER_FILE] },
    refusedBy: [
      ["browser-mounts-no-node-or-server", MOUNT],
      ["browser-mount-entries-no-node-or-server", BROWSER_DOOR],
    ],
  },
  {
    name: "a browser mount reaching a Node builtin through a testkit iso helper",
    files: { [MOUNT]: [ISO_DOOR], [ISO_DOOR]: ["node:fs"] },
    refusedBy: [
      ["browser-mounts-no-node-or-server", MOUNT],
      ["browser-mount-entries-no-node-or-server", ISO_DOOR],
    ],
  },
  {
    name: "a browser mount reaching Node support through a listed story helper",
    files: { [MOUNT]: [TRAIL_HELPER], [TRAIL_HELPER]: [NODE_SERVER] },
    refusedBy: [
      ["browser-mounts-no-node-or-server", MOUNT],
      ["browser-mount-entries-no-node-or-server", TRAIL_HELPER],
    ],
  },
  {
    name: "a browser mount reaching server runtime through browser package source and its root file",
    files: { [MOUNT]: [CLIENT_FILE], [CLIENT_FILE]: ["packages/client/owner-css-surface.ts"], "packages/client/owner-css-surface.ts": [SERVER_FILE] },
    refusedBy: [
      ["browser-mounts-no-node-or-server", MOUNT],
      ["browser-mount-entries-no-node-or-server", "packages/client/owner-css-surface.ts"],
    ],
  },
  // The premises the split relies on, each refused where it breaks.
  {
    name: "a package root file importing test code",
    files: { "packages/kit/probe.ts": [NODE_HELPER] },
    refusedBy: [["not-to-test", "packages/kit/probe.ts"]],
  },
  {
    name: "a root config importing test code",
    files: { "vitest.config.ts": [NODE_HELPER] },
    refusedBy: [["not-to-test", "vitest.config.ts"]],
  },
  {
    name: "a Node test importing a test file outside the Node program",
    files: { [NODE_TEST]: ["tests/e2e/support/probe.ts"] },
    refusedBy: [["node-tests-closed-test-side-imports", NODE_TEST]],
  },
  {
    name: "a Node test importing a root file no suite lists",
    files: { [NODE_TEST]: ["probe.config.ts"] },
    refusedBy: [["node-tests-closed-test-side-imports", NODE_TEST]],
  },
  {
    name: "a browser mount importing a browser-support file no mount lists",
    files: { [MOUNT]: ["tests/support/browser/spec.ts"] },
    refusedBy: [["browser-mounts-closed-imports", MOUNT]],
  },
  {
    name: "a browser mount importing a package outside the browser packages",
    files: { [MOUNT]: ["packages/db/src/probe.ts"] },
    refusedBy: [["browser-mounts-closed-imports", MOUNT]],
  },
  {
    name: "browser package source importing a file of its package outside src",
    files: { [CLIENT_FILE]: ["packages/client/vite.config.ts"] },
    refusedBy: [["browser-packages-src-closed", CLIENT_FILE]],
  },
  // What each rule must keep admitting.
  {
    name: "a Node test importing the Node world, the iso world, the listed test-side files and a listed root file",
    files: { [NODE_TEST]: [NODE_HELPER, ISO_DOOR, MODES, SDK_STAND_IN, "vitest.config.ts", SERVER_FILE] },
    refusedBy: [],
  },
  {
    name: "a browser mount importing the listed browser support, a listed helper, the iso world and browser package source",
    files: { [MOUNT]: [BROWSER_DOOR, TRAIL_HELPER, ISO_DOOR, CLIENT_FILE], [CLIENT_FILE]: ["packages/client/browser-targets.ts"] },
    refusedBy: [],
  },
] as const)("the native test reach boundary judges $name", { timeout: CRUISE_TIMEOUT_MS }, async (row, { plantedTree, repoRoot }) => {
  const sources = Object.keys(row.files);
  const specifier = (source: string, target: string): string => (target.startsWith("node:") ? target : relativeSpecifier(source, target));
  const targets = [...new Set(Object.values(row.files).flat())].filter((target) => !(target in row.files || target.startsWith("node:")));
  const root = await plantedTree({
    ...Object.fromEntries(targets.map((target) => [target, "export const probe = 1;"])),
    ...Object.fromEntries(
      sources.map((source) => [
        source,
        [...(row.files[source] ?? []).map((target) => `import ${JSON.stringify(specifier(source, target))};`), "export {};"].join("\n"),
      ]),
    ),
  });
  const result = runNicedSync(
    join(repoRoot, "node_modules/.bin/depcruise"),
    [...sources, "--config", join(repoRoot, ".dependency-cruiser.ts"), "--output-type", "err-long"],
    {
      cwd: root,
    },
  );
  const output = result.stdout + result.stderr;
  expect(result.errorCode, output).toBeUndefined();
  const refusals = OWNED_RULES.flatMap((rule) => sources.filter((source) => output.includes(`${rule}: ${source}`)).map((source) => [rule, source] as const));
  const expected = row.refusedBy.length === 0 ? [] : refusals.filter(([rule, source]) => row.refusedBy.some(([r, s]) => r === rule && s === source));
  expect(refusals.length === 0, output).toBe(row.refusedBy.length === 0);
  expect(expected.length > 0, output).toBe(row.refusedBy.length > 0);
});
