// Real-corpus liveness arms (#2149) for the `population: { of: "none" }` policies — the resource-only ones,
// whose subject is a config, a stylesheet, a manifest or a tree listing read through the ResourceHost rather
// than the ts-morph project (0042's ninth chunk). DATA, collected by the one runner
// (`../real-corpus-liveness-family.suite.repo.int.test.ts`), which loads the structure run's own corpus once
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
import { gate as baseuiSurfaceManifest } from "../../../../../tooling/src/verify/gates/baseui-surface-manifest.ts";
import { gate as biomeGrantLiveness } from "../../../../../tooling/src/verify/gates/biome-grant-liveness.ts";
import { gate as biomeGrantLivenessHealth } from "../../../../../tooling/src/verify/gates/biome-grant-liveness-health.ts";
import { gate as clientPackageNoSideEffects } from "../../../../../tooling/src/verify/gates/client-package-no-side-effects.ts";
import { gate as commentedCode } from "../../../../../tooling/src/verify/gates/commented-code.ts";
import { gate as cssFamilyOwnershipHealth } from "../../../../../tooling/src/verify/gates/css-family-ownership-health.ts";
import { gate as cssSelectorHasAWriterHealth } from "../../../../../tooling/src/verify/gates/css-selector-has-a-writer-health.ts";
import { gate as dbStructureProducerHome } from "../../../../../tooling/src/verify/gates/db-structure-producer-home.ts";
import { gate as depcruiseGrantLiveness } from "../../../../../tooling/src/verify/gates/depcruise-grant-liveness.ts";
import { gate as depcruiseGrantLivenessHealth } from "../../../../../tooling/src/verify/gates/depcruise-grant-liveness-health.ts";
import { gate as devtoolsFrontendAssets } from "../../../../../tooling/src/verify/gates/devtools-frontend-assets.ts";
import { gate as eslintGrantLiveness } from "../../../../../tooling/src/verify/gates/eslint-grant-liveness.ts";
import { gate as featureOwnsDefinition } from "../../../../../tooling/src/verify/gates/feature-owns-definition.ts";
import { gate as featureStructure } from "../../../../../tooling/src/verify/gates/feature-structure.ts";
import { gate as ledgerSymbolLiveness } from "../../../../../tooling/src/verify/gates/ledger-symbol-liveness.ts";
import { gate as motionTokenPurity } from "../../../../../tooling/src/verify/gates/motion-token-purity.ts";
import { gate as noFormStateInUseeffect } from "../../../../../tooling/src/verify/gates/no-form-state-in-useeffect.ts";
import { gate as noNulBytesInSource } from "../../../../../tooling/src/verify/gates/no-nul-bytes-in-source.ts";
import { gate as noRawColorInCss } from "../../../../../tooling/src/verify/gates/no-raw-color-in-css.ts";
import { gate as overArtPlateArm } from "../../../../../tooling/src/verify/gates/over-art-plate-arm.ts";
import { gate as runnerConfigPathLiveness } from "../../../../../tooling/src/verify/gates/runner-config-path-liveness.ts";
import { gate as sanctionedCssHomes } from "../../../../../tooling/src/verify/gates/sanctioned-css-homes.ts";
import { gate as serverLayout } from "../../../../../tooling/src/verify/gates/server-layout.ts";
import { gate as suppressions } from "../../../../../tooling/src/verify/gates/suppressions.ts";
import { gate as surfaceInAContainerHealth } from "../../../../../tooling/src/verify/gates/surface-in-a-container-health.ts";
import { gate as testLayout } from "../../../../../tooling/src/verify/gates/test-layout.ts";
import { gate as tokensContract } from "../../../../../tooling/src/verify/gates/tokens-contract.ts";
import { gate as toolingRunnerConfigLiterals } from "../../../../../tooling/src/verify/gates/tooling-runner-config-literals.ts";
import { gate as tsconfigEntryLiveness } from "../../../../../tooling/src/verify/gates/tsconfig-entry-liveness.ts";
import { gate as tsconfigEntryLivenessHealth } from "../../../../../tooling/src/verify/gates/tsconfig-entry-liveness-health.ts";
import { gate as uiExportsMapComplete } from "../../../../../tooling/src/verify/gates/ui-exports-map-complete.ts";
import { gate as verifyRegistryParity } from "../../../../../tooling/src/verify/gates/verify-registry-parity.ts";
import type { RealCorpusLivenessArm, RealCorpusOverlay } from "../../../../support/real-corpus-liveness.ts";

const CLIENT_GLOBALS = "packages/client/src/styles/globals.css";
const DEPCRUISE = ".dependency-cruiser.cjs";
const PRODUCT_SHEETS = [
  "packages/ui/src/styles/theme.css",
  "packages/ui/src/styles/globals.css",
  "packages/ui/src/styles/tiers.css",
  CLIENT_GLOBALS,
  "packages/client/src/features/app-shell/surfaces/shell.css",
] as const;
const DEVTOOLS_ASSET = "tooling/src/snap/lib/devtools-frontend/assets/serve_rev/@33c2f401a9c8ddad2159eb0ab83aa244a5247361/application_tokens.css";
/** Thirty distinct glob includes: the size the biome tripwire treats as a real config. */
const BIOME_GLOBS = Array.from({ length: 30 }, (_, index) => `"packages/liveness${String(index)}/**"`).join(", ");
// Assembled so no suppression directive appears whole in this file.
const SUPPRESSION = ["biome", "-ignore"].join("");

function source(path: string, text: string): RealCorpusOverlay {
  return { kind: "resource", path, source: text };
}

function append(path: string, text: string): RealCorpusOverlay {
  return { kind: "resource", path, append: text };
}

function replace(path: string, search: string, replacement: string): RealCorpusOverlay {
  return { kind: "resource", path, replace: [search, replacement] };
}

export const RESOURCE_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: baseuiSurfaceManifest,
    // The ledger loses its `Meter` component, which the installed package still ships.
    overlays: [replace("tooling/src/verify/gates/baseui-surface.manifest.json", '"Meter": {', '"LivenessMeter": {')],
    messageIncludes: "absent from the manifest",
  },
  {
    policy: biomeGrantLivenessHealth,
    // An anchor-sized config (the tripwire judges one of at least 30 includes) from which the classifier
    // derives ZERO file-exact rows: every include is a glob.
    overlays: [source("biome.json", `{\n  "overrides": [{ "includes": [${BIOME_GLOBS}], "linter": { "rules": {} } }]\n}\n`)],
    messageIncludes: "ZERO file-exact grant rows",
  },
  {
    policy: biomeGrantLiveness,
    overlays: [
      replace("biome.json", '"overrides": [', '"overrides": [\n    { "includes": ["packages/client/src/liveness-gone.ts"], "linter": { "rules": {} } },'),
    ],
    messageIncludes: "packages/client/src/liveness-gone.ts",
  },
  {
    policy: clientPackageNoSideEffects,
    overlays: [replace("packages/client/package.json", '"name": "@orb/client",', '"name": "@orb/client",\n  "sideEffects": ["**/*.css"],')],
    messageIncludes: "declares `sideEffects`",
  },
  {
    policy: commentedCode,
    overlays: [{ kind: "add", path: "packages/ui/src/liveness-commented.ts", source: "// const dead = compute();\nexport const livenessCommented = 1;\n" }],
    messageIncludes: "commented-out code",
  },
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
    policy: dbStructureProducerHome,
    overlays: [
      source("packages/db/src/schema/livenessnowhere.ts", "export const livenessNowhere = 1;\n"),
      append("packages/db/src/schema/index.ts", 'export * from "./livenessnowhere.ts";\n'),
    ],
    messageIncludes: "no same-named producer domain",
  },
  {
    policy: depcruiseGrantLivenessHealth,
    overlays: [
      append(
        DEPCRUISE,
        '\nmodule.exports.forbidden.push({ name: "liveness-backref", severity: "error", from: { path: "^packages/liveness/([^/]+)/$1/" }, to: {} });\n',
      ),
    ],
    messageIncludes: "GROWTH",
  },
  {
    policy: depcruiseGrantLiveness,
    overlays: [
      append(
        DEPCRUISE,
        '\nmodule.exports.forbidden.push({ name: "liveness-dead", severity: "error", from: {}, to: { pathNot: "^packages/ui/src/liveness-gone\\\\.ts$" } });\n',
      ),
    ],
    messageIncludes: "liveness-gone",
  },
  {
    policy: devtoolsFrontendAssets,
    overlays: [source(DEVTOOLS_ASSET, "mutated liveness asset\n")],
    reportsAt: ["tooling/src/snap/lib/devtools-frontend/pin.json"],
    messageIncludes: "hash/size mismatch",
  },
  {
    policy: eslintGrantLiveness,
    overlays: [
      replace("eslint.config.js", "export default tseslint.config(\n", 'export default tseslint.config(\n  { files: ["packages/ui/src/liveness-gone.ts"] },\n'),
    ],
    messageIncludes: "files[0]",
  },
  {
    policy: featureOwnsDefinition,
    overlays: [source("packages/client/src/features/livenessorphan/lib/helper.ts", "export const livenessHelper = 1;\n")],
    reportsAt: ["packages/client/src/features/livenessorphan"],
    messageIncludes: "owns no registered definition",
  },
  {
    policy: featureStructure,
    overlays: [source("packages/server/src/domain/livenessbroken/index.ts", "export const livenessBroken = 1;\n")],
    reportsAt: ["packages/server/src/domain/livenessbroken"],
    messageIncludes: "missing template",
  },
  {
    policy: ledgerSymbolLiveness,
    overlays: [
      append(
        "docs/adr/0001-auth-seam-one-principal-construction-site.md",
        "\n- **D1** — `domain/chat/verbs/liveness-nonexistent-file.ts` is a liveness probe.\n",
      ),
    ],
    messageIncludes: "domain/chat/verbs/liveness-nonexistent-file.ts",
  },
  {
    policy: motionTokenPurity,
    overlays: [append(CLIENT_GLOBALS, "\n.liveness-motion {\n  transition: opacity 220ms ease-out;\n}\n")],
    messageIncludes: "raw motion value",
  },
  {
    policy: noFormStateInUseeffect,
    overlays: [
      { kind: "add", path: "packages/client/src/features/chat/components/liveness-form-effect.tsx", source: "useEffect(() => {}, [form.state.values]);\n" },
    ],
    messageIncludes: "form.state.values",
  },
  {
    policy: noNulBytesInSource,
    overlays: [source("packages/kit/src/liveness-nul.ts", 'export const livenessNul = "a\u0000b";\n')],
    messageIncludes: "NUL",
  },
  {
    policy: noRawColorInCss,
    overlays: [append(CLIENT_GLOBALS, "\n.liveness-color {\n  color: #ff0000;\n}\n")],
    messageIncludes: "Raw value: `#ff0000`",
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
    policy: runnerConfigPathLiveness,
    overlays: [
      replace(
        "vitest.config.ts",
        "include: withIgnored(REPOSITORY_TEST_GLOBS),",
        'include: withIgnored([...REPOSITORY_TEST_GLOBS, "tests/tooling/liveness-gone.int.test.ts"]),',
      ),
    ],
    // The dead path is the finding's TOKEN, not its message; the verdict is the dead-row message at the config.
    messageIncludes: "names nothing on the tree",
  },
  {
    policy: sanctionedCssHomes,
    overlays: [source("packages/client/src/features/chat/liveness.css", ".liveness { color: red; }\n")],
    messageIncludes: "outside the path-closed six-home",
  },
  {
    policy: serverLayout,
    overlays: [source("packages/server/src/liveness-stray.ts", "export const livenessStray = 1;\n")],
    messageIncludes: "illegal top-level entry",
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
    policy: surfaceInAContainerHealth,
    // The shell directory the occurrence policy exempts leaves the reader's view.
    overlays: [{ kind: "resource", path: "packages/client/src/features/app-shell", delete: true }],
    messageIncludes: "stale shell exemption",
  },
  {
    policy: testLayout,
    overlays: [source("tests/ui/primitives/liveness-example.test.tsx", "export const livenessExample = 1;\n")],
    messageIncludes: "unregistered test kind",
  },
  {
    policy: tokensContract,
    overlays: [
      replace(
        "packages/ui/src/tokens/tokens.json",
        '"$description": "The DTCG single-source design tokens',
        '"$descriptionLiveness": "The DTCG single-source design tokens',
      ),
    ],
    messageIncludes: "format.schema",
  },
  {
    policy: toolingRunnerConfigLiterals,
    overlays: [replace("vitest.config.ts", "testTimeout: budget(5000),", "testTimeout: 5000,")],
    messageIncludes: "Literal: `testTimeout: 5000`",
  },
  {
    policy: tsconfigEntryLivenessHealth,
    overlays: [source("tsconfig.json", '{\n  "include": [ \n}\n')],
    messageIncludes: "did not parse",
  },
  {
    policy: tsconfigEntryLiveness,
    overlays: [replace("tsconfig.json", '"exclude": [\n', '"exclude": [\n    "packages/client/src/liveness-gone.ts",\n')],
    messageIncludes: "packages/client/src/liveness-gone.ts",
  },
  {
    policy: uiExportsMapComplete,
    overlays: [source("packages/ui/src/primitives/liveness-hint/index.ts", "export const LivenessHint = 1;\n")],
    messageIncludes: "no entry at all",
  },
  {
    policy: verifyRegistryParity,
    overlays: [replace("package.json", '"scripts": {\n', '"scripts": {\n    "check:liveness": "true",\n')],
    messageIncludes: "check:liveness",
  },
];
