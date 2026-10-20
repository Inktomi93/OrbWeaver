// Real-corpus liveness arms (#2149) for the `population: { of: "none" }` policies — the resource-only ones,
// whose subject is a config, a stylesheet, a manifest or a tree listing read through the ResourceHost rather
// than the ts-morph project (0042's ninth chunk). DATA, collected by the one runner
// (`./runner.ts`), which loads each isolated structure corpus once
// and runs every arm against it (docs/work/0043).
//
// EVERY PLANT RIDES THE READER'S OWN OVERLAY (`kind: "resource"`): `append` adds a tail to the real file,
// `replace` makes one exact edit of it (the search text must occur once, or the arm throws), `source` supplies
// a new file, and `delete` takes a directory out of the reader's view. The overlay never touches disk, and
// the production reader refuses to overlay a non-authored tree (`node_modules`), which is why no arm plants
// into an installed package.
//
// Text-reading policies here also read THIS file, so a planted token that would be a finding in it (a
// suppression directive) is assembled from parts.

import type { RealCorpusLivenessArm, RealCorpusOverlay } from "@orb/testkit/node/real-corpus-liveness.ts";
import { gate as cssFamilyOwnershipHealth } from "../../../../../tooling/src/verify/gates/css-family-ownership-health.ts";
import { gate as cssSelectorHasAWriterHealth } from "../../../../../tooling/src/verify/gates/css-selector-has-a-writer-health.ts";
import { gate as overArtPlateArm } from "../../../../../tooling/src/verify/gates/over-art-plate-arm.ts";
import { gate as suppressions } from "../../../../../tooling/src/verify/gates/suppressions.ts";
import { gate as testLayout } from "../../../../../tooling/src/verify/gates/test-layout.ts";

const CLIENT_GLOBALS = "packages/client/src/styles/globals.css";
const PRODUCT_SHEETS = [
  "packages/ui/src/styles/theme.css",
  "packages/ui/src/styles/globals.css",
  "packages/ui/src/styles/tiers.css",
  CLIENT_GLOBALS,
  "packages/client/src/features/app-shell/surfaces/shell.css",
] as const;
// Assembled so no suppression directive appears whole in this file.
const SUPPRESSION = ["biome", "-ignore"].join("");

function source(path: string, text: string): RealCorpusOverlay {
  return { kind: "resource", path, source: text };
}

function append(path: string, text: string): RealCorpusOverlay {
  return { kind: "resource", path, append: text };
}

export const RESOURCE_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: cssFamilyOwnershipHealth,
    // One of the six homes reads as an empty sheet.
    overlays: [source("packages/client/src/features/app-shell/surfaces/shell.css", "/* a sheet the parser reads as empty */\n")],
    messageIncludes: "ZERO declaration census",
  },
  {
    policy: cssSelectorHasAWriterHealth,
    // Every product sheet loses every hook selector, so the census learns nothing.
    overlays: [
      source(PRODUCT_SHEETS[0], ":root {\n  --liveness-probe: 0;\n}\n"),
      ...PRODUCT_SHEETS.slice(1).map((path) => source(path, ":root {\n  --liveness-probe: 0;\n}\n")),
    ],
    messageIncludes: "learned ZERO authored hooks",
  },
  {
    policy: overArtPlateArm,
    overlays: [
      append(
        CLIENT_GLOBALS,
        '\nhtml[data-blur-composer] [data-slot="composer"] .liveness-plate {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent);\n}\n',
      ),
    ],
    messageIncludes: "light-dark()",
  },
  {
    policy: suppressions,
    // A suppression of a rule the repository has never ruled on, in a new kit module.
    overlays: [
      {
        kind: "add",
        path: "packages/kit/src/liveness-suppress.ts",
        source: `// ${SUPPRESSION} lint/suspicious/noLivenessProbe: reason\nexport const livenessSuppressed = 1;\n`,
      },
    ],
    messageIncludes: "lint/suspicious/noLivenessProbe",
  },
  {
    policy: testLayout,
    overlays: [source("tests/ui/primitives/liveness-example.test.tsx", "export const livenessExample = 1;\n")],
    messageIncludes: "unregistered test kind",
  },
];
