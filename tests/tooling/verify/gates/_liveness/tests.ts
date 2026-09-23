// Real-corpus liveness arms (#2149) for policies whose subject is the test tree itself. DATA, collected by
// the one runner (`../real-corpus-liveness-family.suite.repo.int.test.ts`), which loads the structure run's
// own corpus once and runs every arm against it (docs/work/0043).
import { gate as ctConfigMirrorParity } from "../../../../../tooling/src/verify/gates/ct-config-mirror-parity.ts";
import { gate as ctPollHealth } from "../../../../../tooling/src/verify/gates/ct-poll-schedule-and-paint-health.ts";
import type { RealCorpusLivenessArm } from "../../../../support/real-corpus-liveness.ts";

export const TESTS_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: ctPollHealth,
    // The population is exactly one named anchor file; the health arm derives its facts from that file, so
    // blanking it is the whole control.
    overlays: [{ kind: "neutralise", path: "tests/client/lib/motion-stats.ct.tsx", source: "export const neutralised = 1;\n" }],
    messageIncludes: "no freshly-minted poll schedule",
  },
  {
    policy: ctConfigMirrorParity,
    // The CT mirror's settings registry drops its whole contributor list, so every production section is
    // missing from the test composition — the multiset difference the policy exists to report.
    overlays: [
      {
        kind: "neutralise",
        path: "tests/support/browser/ct-data-providers.tsx",
        source: 'const realSettingsSections = createContributorRegistry("config-sections", []);\n',
      },
    ],
    messageIncludes: "Section differences:",
  },
];
