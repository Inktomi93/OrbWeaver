// Real-corpus liveness arms (#2149) for policies whose subject is the test tree itself. DATA, collected by
// the one runner (`./runner.ts`), which loads each isolated structure corpus once and runs every arm against it (docs/work/0043).

import type { RealCorpusLivenessArm } from "@orb/testkit/node/real-corpus-liveness.ts";
import { gate as ctConfigMirrorParity } from "../../../../../tooling/src/verify/gates/ct-config-mirror-parity.ts";
import { gate as ctPollHealth } from "../../../../../tooling/src/verify/gates/ct-poll-schedule-and-paint-health.ts";
import { gate as testsRawPackageReach } from "../../../../../tooling/src/verify/gates/tests-raw-package-reach.ts";

export const TESTS_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: ctPollHealth,
    // The population is exactly one named anchor file; the health arm derives its facts from that file, so
    // blanking it is the whole control.
    overlays: [{ kind: "neutralise", path: "tests/legacy/client/lib/motion-stats.ct.tsx", source: "export const neutralised = 1;\n" }],
    messageIncludes: "no freshly-minted poll schedule",
  },
  {
    policy: ctConfigMirrorParity,
    // The CT door hand-lists an empty settings registry, so every production section is missing from the test
    // composition — the membership difference the policy exists to report.
    overlays: [
      {
        kind: "neutralise",
        path: "tests/support/browser/ct-door.ts",
        source: 'export const configSections = createContributorRegistry("config-sections", []);\n',
      },
    ],
    messageIncludes: "config sections differences:",
  },
  {
    policy: testsRawPackageReach,
    // A new raw root-map reach: no central grant names this test file, so the baselined table cannot absorb it.
    overlays: [
      {
        kind: "add",
        path: "tests/server/liveness-raw.test.ts",
        source: 'export { sha256Hex } from "#server/primitives/content-hash/index.ts";\n',
      },
    ],
    messageIncludes: "This reaches packages/server/src/primitives/content-hash/index.ts.",
  },
];
