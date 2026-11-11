import { builtinModules } from "node:module";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { DependencyType, IConfiguration, IForbiddenRuleType } from "dependency-cruiser";
import ts from "typescript";
import clientPackage from "./packages/client/package.json" with { type: "json" };
import contractsPackage from "./packages/contracts/package.json" with { type: "json" };
import dbPackage from "./packages/db/package.json" with { type: "json" };
import inferencePackage from "./packages/inference/package.json" with { type: "json" };
import kitPackage from "./packages/kit/package.json" with { type: "json" };
import serverPackage from "./packages/server/package.json" with { type: "json" };
import uiPackage from "./packages/ui/package.json" with { type: "json" };
import { CONFIRMED_ACTION_MINT_HOMES } from "./tooling/src/eslint/ui-feature-policy.ts";
import { BROWSER_TEST_SUFFIXES, TEST_KIND_DEFINITIONS, TEST_KIND_SUFFIXES } from "./tooling/src/floor/testing/test-kinds.ts";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const nodeTestProgram = ts.getParsedCommandLineOfConfigFile(
  fileURLToPath(new URL("./tsconfig.node.json", import.meta.url)),
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic): never => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  },
);
if (nodeTestProgram === undefined) {
  throw new Error("Cannot read the Node compiler's test population");
}
if (nodeTestProgram.errors.length > 0) {
  throw new Error(nodeTestProgram.errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n"));
}
const nodeTestRoots = nodeTestProgram.fileNames
  .map((file) => relative(ROOT, file).split(sep).join("/"))
  .filter((file) => /^(?:tests|scripts)\/.*\.(?:ts|mts|cts)$/u.test(file));
if (nodeTestRoots.length === 0) {
  throw new Error("The Node compiler has no test or script roots");
}

const ENTRY_SOURCE = "^packages/server/src/entry/";
// The entry files that own the physical database (Tier-5 invariant 1). Every other entry file, boot steps included,
// takes the inert `DatabaseHandle`, and the domain door it calls opens the query context inside its own persistence.
const ENTRY_DRIVERS = {
  "index.ts": "the process entry point imports the lifecycle",
  "lifecycle.ts": "opens, migrates, optimizes and closes the physical database",
  "boot/index.ts": "the boot barrel the lifecycle reads re-exports the drivers below",
  "boot/migrate.ts": "runs the migrations, backups and integrity check, and resolves the migrations folder through node:module",
  "boot/migrate-data-layout.ts": "opens, snapshots and detaches the legacy database while the data layout moves",
} as const satisfies Readonly<Record<string, string>>;
const ENTRY_DRIVER_PATTERN = `${ENTRY_SOURCE}(?:${Object.keys(ENTRY_DRIVERS)
  .map((path) => RegExp.escape(path))
  .join("|")})$`;
// The only importers of the boot grant door, each with the reason it may mint cross-owner authority (D335).
const BOOT_GRANT_IMPORTERS = {
  "^packages/server/src/entry/lifecycle\\.ts$": "mints the grant once and hands it to the cross-owner boot steps",
  "^tooling/src/seed/": "seed tools run the same boot steps against the database they build",
  "^tests/support/": "the testkit boots whole servers through the boot steps and hands suites the grant through `bootGrantFor`",
} as const satisfies Readonly<Record<string, string>>;
// The only server, db and inference importers of `node:module`, each with the reason; both call `.resolve` only.
const MODULE_LOADER_RESOLVERS = {
  "^packages/server/src/entry/boot/migrate\\.ts$":
    "physical boot resolves the migrations folder; import.meta.resolve is unsupported under the vitest module runner",
  "^packages/inference/src/backends/agent-sdk/executable\\.ts$": "resolves the agent SDK package's executable path; it loads nothing",
} as const satisfies Readonly<Record<string, string>>;
const GROUPING_DIRS = {
  server: ["entry", "transport", "domain", "infra", "foundation", "primitives"],
  // Each `contract/` file is its own module, as each ui `lib/` file is: the package's internal type home is its files,
  // and the barrel stays the deliberate subset the package root forwards.
  inference: ["backends", "contract"],
  client: ["features"],
  ui: ["*"],
  db: [],
  contracts: [],
  kit: [],
};
const KIT = "^packages/kit/src/";
const CONTRACTS = "^packages/contracts/src/";
const DB = "^packages/db/src/";
const CLIENT = "^packages/client/src/";
const UI = "^packages/ui/src/";
const SRV = "^packages/server/src/";
// D117: the one cross-domain import, the workloads door every contributing domain types its WorkloadContribution from.
const D117_WORKLOADS_DOOR = `${SRV}domain/workloads/index\\.ts$`;
const CLIENT_TRPC = `${CLIENT}data/trpc\\.ts$`;
const SERVER_ROOT = "^packages/server/dist/router-types/packages/server/src/index\\.d\\.ts$";
const INFERENCE = "^packages/inference/src/";
const TEST_FILES = `(?:${TEST_KIND_SUFFIXES.map((suffix) => suffix.replaceAll(".", "\\.")).join("|")})$`;
const TEST_BROWSER_SUPPORT = "^tests/support/browser/";
// Tests and their helpers: the importers the test-side door rules judge.
const TEST_TREES = "^tests/";
const DOMAIN_TYPE_CONTRACT = "^tests/server/domain/([^/]+)/.*\\.test-d\\.ts$";
const BROWSER_MOUNT_PATHS = ["^playwright/", "^(tests|scripts)/(?!support/(iso|node)/).*\\.tsx$"];
const BROWSER_TEST_PATHS = [TEST_BROWSER_SUPPORT, ...BROWSER_MOUNT_PATHS];
const BROWSER_TEST_FILES = `(?:${BROWSER_TEST_SUFFIXES.map((suffix) => suffix.replaceAll(".", "\\.")).join("|")})$`;
// Native roots include helpers while preserving the compiler's DOM, E2E and browser-support exclusions.
const NODE_TEST_PATHS = `^(?:${nodeTestRoots.map((file) => RegExp.escape(file)).join("|")})$`;
// The whole-tree reachable rules over thousands of test files cost minutes, so each one is split into a direct rule over
// the test files and a reachable rule over the few files a test can enter that the direct rule does not read. The split
// holds only while a test enters nothing outside the sets below, so a closed-imports rule refuses every other entry.
const TEST_SIDE_TREES = "^(?:tests|scripts|playwright)/";
const ROOT_FILE = "^[^/]+$";
const TEST_ISO_WORLD = "^tests/support/iso/";
// Test-side files outside the Node program and the testkit that Node-world files import: each is judged by a reachable rule.
const NODE_TEST_SIDE_FILES = {
  "^tests/e2e/support/modes\\.ts$": "scripts/corpus-fixture.ts loads the e2e project cells to size and select its matrix",
  "^tests/server/domain/chat/engine/(?:core|engine|stats)-sdk-physical\\.mjs$":
    "plain-JS stand-ins for the SDK executable that engine suites spawn and import for their model names",
} as const satisfies Readonly<Record<string, string>>;
// Root files a Node suite loads to exercise or read them; `not-to-test` bars each from importing test code.
const ROOT_FILES_TESTS_LOAD = {
  "^\\.dependency-cruiser\\.ts$": "boundary suites cruise this config",
  "^eslint\\.config\\.ts$": "lint-rule suites run this config",
  "^knip\\.ts$": "tooling suites read the entry map",
  "^package\\.json$": "suites read the workspace manifest",
  "^stylelint\\.config\\.ts$": "stylelint suites run this config",
  "^vitest\\.config\\.ts$": "runner suites read the projects",
  "^vitest\\.stryker\\.config\\.ts$": "the mutation overlay suite classifies the projects",
} as const satisfies Readonly<Record<string, string>>;
// Browser-support files a mount imports; a mount may not enter any other test-side file.
const MOUNT_SUPPORT_FILES = {
  "^tests/support/browser/(?:index|ct-door|ct-runtime|ct-isolation)\\.ts$": "the browser testkit door and the CT mount runtime it forwards",
  "^tests/support/browser/(?:ct-data-providers|ct-isolated-subject)\\.tsx$": "the section and isolated-subject mounts stories render through",
  "^tests/support/browser/ct-user-bus\\.tsx$": "the socket and user bus the app root wires, which bus stories mount around their subject",
} as const satisfies Readonly<Record<string, string>>;
// Feature test helpers a story imports; each stays free of Node imports so the story can load it.
const MOUNT_HELPER_FILES = {
  "^tests/client/features/app-shell/surfaces/trail-projection\\.ts$": "values the trail projection story and its spec share",
  "^tests/client/features/app-shell/surfaces/ramp-surfaces\\.ts$":
    "the shell surfaces the ramp elevation fills, which the ramp badge story portals into and its spec reads",
  "^tests/client/features/app-shell/_surface-stories\\.tsx$": "the production shell story the ramp badge story wraps with its badges",
  "^tests/client/components/page-template-cases\\.ts$": "the seed and density matrix the page-template stories mount and their spec reads",
  "^tests/client/components/_described-menu-item-labels\\.ts$": "the command labels the described-menu story authors and its spec presses",
  "^tests/client/lib/use-focus-on-mount-names\\.ts$": "the control and surface names the arrival-focus stories author and their spec reads",
  "^tests/client/features/auth/components/pending-join-fixtures\\.ts$": "the pending-join story's parsed fixtures",
  "^tests/ui/content/theme-scope/contrast-cases\\.ts$": "the tone-mark accents the tone-mark story renders and its spec judges",
  "^tests/ui/primitives/virtual-list/virtual-list-cases\\.ts$": "the long-list row count the virtual-list stories mount and their spec passes",
} as const satisfies Readonly<Record<string, string>>;
// The only files of a browser package outside `src/` that its `src/` imports; each is judged by a reachable rule.
const BROWSER_PACKAGE_ROOT_FILES = {
  "^packages/client/owner-css-surface\\.ts$": "the generated owner CSS surface the theme field reads",
  "^packages/client/browser-targets\\.ts$": "the browser target list the polyfill entry reads",
} as const satisfies Readonly<Record<string, string>>;
const NODE_TEST_SIDE_PATHS = Object.keys(NODE_TEST_SIDE_FILES);
const ROOT_FILE_PATHS = Object.keys(ROOT_FILES_TESTS_LOAD);
const MOUNT_ENTRY_PATHS = [...Object.keys(MOUNT_SUPPORT_FILES), ...Object.keys(MOUNT_HELPER_FILES)];
const BROWSER_PACKAGE_SRC = "^packages/(?:client|ui|kit|contracts)/src/";
const NODE_BUILTINS = `^(?:node:)?(?:${builtinModules.map((name) => RegExp.escape(name)).join("|")})$`;
const CLIENT_CSS_ENTRY = `${CLIENT}styles/index\\.ts$`;
const CLIENT_SHELL_CSS = `${CLIENT}features/app-shell/surfaces/shell\\.css$`;
const FIXED_SLOTS = "(contract|verbs|persistence|substrate)";
function moduleShapes(pkg: keyof typeof GROUPING_DIRS): { own: string[]; internal: string[] } {
  const root = `packages/${pkg}/src/`;
  const grouping: readonly string[] = GROUPING_DIRS[pkg];
  if (grouping.includes("*")) {
    return { own: [`${root}[^/]+/[^/]+`, `${root}[^/]+`], internal: [`${root}[^/]+/[^/]+/`] };
  }
  if (grouping.length === 0) {
    return { own: [`${root}[^/]+`], internal: [`${root}[^/]+/`] };
  }
  const tier = `(?:${grouping.join("|")})`;
  return {
    own: [`${root}${tier}/[^/]+`, `${root}(?!${tier}/)[^/]+`],
    internal: [`${root}${tier}/[^/]+/`, `${root}(?!${tier}/)[^/]+/`],
  };
}
const SUBPATH_MODULES = (["client", "ui", "server", "db", "contracts", "kit", "inference"] as const).map(moduleShapes);
const SUBPATH_IMPORTER = `^(${SUBPATH_MODULES.flatMap(({ own }) => own).join("|")})(?:/|$)`;
const SUBPATH_INTERNALS = `^(?:${SUBPATH_MODULES.flatMap(({ internal }) => internal).join("|")})`;
// Exact leaf imports avoid barrels that widen Worker or DOM-free compiler graphs.
const SUBPATH_LEAF_IMPORTERS = [
  // The observability barrel reaches DB; the permission-model broker cannot probe environment files.
  "packages/server/src/infra/network/contract/egress.ts",
  "packages/server/src/infra/network/egress.ts",
  "packages/server/src/infra/plugin-host/contract/port.ts",
  "packages/server/src/infra/plugin-host/membrane.ts",
  "packages/server/src/infra/plugin-host/port.ts",
  "packages/server/src/infra/plugin-host/process-permission.ts",
  // The model Worker graph stays index-free to bound per-model parse cost.
  "packages/inference/src/backends/http/timers.ts",
  "packages/inference/src/backends/local-light/model-cache.ts",
  "packages/inference/src/backends/local-light/model-worker.ts",
  "packages/inference/src/backends/local-light/st-head.ts",
  "packages/inference/src/backends/local-light/text-windows.ts",
  "packages/inference/src/backends/local-light/worker-cache.ts",
  // The shared client barrel reaches React and DOM modules unavailable in these programs.
  "packages/client/src/features/plugin/lib/ui-guest/ui-guest-realm.ts",
  "packages/client/src/features/plugin/lib/ui-guest/ui-guest.worker.ts",
  "packages/client/src/features/chat/lib/message-render-context.ts",
  "packages/client/src/features/credentials/lib/connection-editor-model.ts",
  "packages/client/src/features/credentials/lib/connections-model.ts",
  "packages/ui/src/primitives/icons/orb-web.ts",
  // The lib barrel deliberately omits these development-only leaves.
  "packages/client/src/features/app-shell/lib/bug-report-capture.ts",
  "packages/client/src/features/chat/components/message-row.tsx",
  "packages/client/src/dev/agent-handles/index.ts",
  "packages/client/src/dev/agent-nav/index.ts",
  "packages/client/src/dev/agent-nav/panel-request.ts",
  "packages/client/src/dev/agent-nav/resolve-config-target.ts",
  "packages/client/src/dev/agent-nav/resolve-context-tab.ts",
  "packages/client/src/dev/agent-plugin/index.ts",
  "packages/client/src/dev/agent-plugin/ui.ts",
  "packages/client/src/dev/agent-rpg/index.ts",
  "packages/client/src/dev/agent-seed/index.ts",
  "packages/client/src/dev/agent-seed/retry-attempt.ts",
  // The components barrel omits the ConfirmedAction mint, so only its homes reach it (orb/confirmed-action-mint).
  ...Object.keys(CONFIRMED_ACTION_MINT_HOMES),
].map((path) => `^${path.replaceAll(".", "\\.")}$`);

// The packages kit, contracts, db, inference and client may import; a test tree of the package runs production only from the same set. Server, default-content and showcase-plugins keep their rows below.
const CAKE = {
  kit: "^packages/kit/",
  contracts: "^packages/(contracts|kit)/",
  db: "^packages/(db|contracts|kit)/",
  inference: "^packages/(inference|contracts|kit)/",
  client: "^packages/(client|contracts|kit|ui)/",
} as const;

const PACKAGE_DIRECTION = [
  { name: "kit-purity", from: "^packages/kit/", allowed: CAKE.kit },
  { name: "contracts-cake", from: "^packages/contracts/", allowed: CAKE.contracts },
  { name: "db-cake", from: "^packages/db/", allowed: CAKE.db },
  { name: "inference-cake", from: "^packages/inference/", allowed: CAKE.inference },
  { name: "default-content-cake", from: "^packages/default-content/", allowed: "^packages/(default-content|kit)/" },
  { name: "showcase-plugins-cake", from: "^packages/showcase-plugins/", allowed: "^packages/(showcase-plugins|kit|contracts)/" },
  { name: "server-cake", from: "^packages/server/", allowed: "^packages/(server|contracts|db|default-content|inference|kit|showcase-plugins)/" },
  { name: "plugin-sdk-cake", from: "^packages/plugin-sdk/", allowed: "^packages/plugin-sdk/" },
  { name: "plugin-toolchain-cake", from: "^packages/plugin-toolchain/", allowed: "^packages/plugin-toolchain/" },
  { name: "ui-cake", from: "^packages/ui/", allowed: "^packages/(ui|kit)/" },
].map(({ name, from, allowed }): IForbiddenRuleType => ({ name, severity: "error", from: { path: from }, to: { path: "^packages/", pathNot: allowed } }));

const LAYER_DIRECTION = [
  {
    name: "ui-lib-tokens-floor",
    from: "^packages/ui/src/(lib|tokens)/",
    to: "^packages/ui/src/(primitives|layout|charts|markdown|stream|content|code-editor|diff|fuzzy-search)/",
  },
  {
    name: "ui-primitives-below-groups",
    from: "^packages/ui/src/primitives/",
    to: "^packages/ui/src/(layout|charts|markdown|stream|content|code-editor|diff|fuzzy-search)/",
  },
  { name: "client-lib-floor", from: "^packages/client/src/lib/", to: "^packages/client/src/(state|data|forms|features|routes)/" },
  { name: "client-state-below-data", from: "^packages/client/src/state/", to: "^packages/client/src/(data|forms|features|routes)/" },
  { name: "client-data-direction", from: "^packages/client/src/data/", to: "^packages/client/src/(forms|components|features|routes)/" },
  {
    name: "client-forms-direction",
    from: "^packages/client/src/forms/",
    to: "^packages/client/src/(data|components|features|routes)/",
    allowTypeOnly: true,
    comment: "Forms receive save operations by injection; features bind mutations at composition.",
  },
  { name: "client-features-below-routes", from: "^packages/client/src/features/", to: ["^packages/client/src/routes/", "^packages/client/src/main\\.tsx$"] },
  {
    name: "client-components-tier",
    from: "^packages/client/src/components/",
    to: ["^packages/client/src/features/", "^packages/client/src/routes/", "^packages/client/src/main\\.tsx$"],
  },
  { name: "client-lib-below-components", from: "^packages/client/src/lib/", to: "^packages/client/src/components/" },
  { name: "client-state-below-components", from: "^packages/client/src/state/", to: "^packages/client/src/components/" },
  { name: "foundation-reaches-up-to-nothing", from: "^packages/server/src/foundation/", to: "^packages/server/src/(entry|transport|domain|infra)/" },
  { name: "infra-below-domain", from: "^packages/server/src/infra/", to: "^packages/server/src/(entry|transport|domain)/" },
  { name: "domain-below-drivers", from: "^packages/server/src/domain/", to: "^packages/server/src/(entry|transport)/" },
  { name: "transport-below-entry", from: "^packages/server/src/transport/", to: "^packages/server/src/entry/" },
  {
    name: "server-primitives-reaches-up-to-nothing",
    from: "^packages/server/src/primitives/",
    to: "^packages/server/src/(entry|transport|domain|infra|foundation)/",
  },
].map(
  ({ name, from, to, allowTypeOnly, comment }): IForbiddenRuleType => ({
    name,
    severity: "error",
    ...(comment === undefined ? {} : { comment }),
    from: { path: from },
    to: { path: to, ...(allowTypeOnly ? { dependencyTypesNot: ["type-only"] } : {}) },
  }),
);

const UI_SATELLITE_OWNERS = [
  { name: "charts", libraries: "echarts|echarts-for-react", owners: ["charts/"] },
  { name: "virtual", libraries: "@tanstack/react-virtual|@tanstack/virtual-core", owners: ["primitives/(virtual-list|message-list|media-grid)/"] },
  { name: "code-editor", libraries: "codemirror|@codemirror", owners: ["code-editor/"] },
  { name: "markdown", libraries: "streamdown|remark|remark-gfm|remark-math|strip-markdown|shiki|@shikijs", owners: ["markdown/"] },
  { name: "command", libraries: "cmdk", owners: ["primitives/command/"] },
  { name: "sortable", libraries: "@dnd-kit", owners: ["primitives/sortable/"] },
  { name: "diff", libraries: "diff", owners: ["diff/"] },
  { name: "icons", libraries: "lucide-react", owners: ["primitives/icons/"] },
  { name: "search", libraries: "minisearch", owners: ["primitives/macro-textarea/", "fuzzy-search/"] },
].map(
  ({ name, libraries, owners }): IForbiddenRuleType => ({
    name: `ui-satellite-seals-${name}`,
    severity: "error",
    from: { path: UI, pathNot: owners.map((owner) => `${UI}${owner}`) },
    to: { path: `node_modules/(${libraries})/` },
  }),
);

// The files the Playwright runner and its workers load: every config, the global setups outside tests/e2e, and every
// tests/e2e file that is not a vitest suite. Playwright starts each webServer over the runner's environment.
const PLAYWRIGHT_RUNNER_FILES = [
  "^playwright[^/]*\\.config\\.ts$",
  "^tooling/src/floor/testing/(?:run-temp-root-setup|working-tree-guard)\\.ts$",
  "^tests/e2e/",
];
const E2E_VITEST_SUITES = `(?:${TEST_KIND_DEFINITIONS.filter(({ family }) => family !== "e2e")
  .map(({ suffix }) => suffix.replaceAll(".", "\\."))
  .join("|")})$`;
// Child processes the env suites spawn to load the server env module itself, each in a process of its own.
const TESTKIT_ENV_LOADER_CHILDREN = ["^tests/support/node/host-env-child\\.ts$", "^tests/support/node/env-file-child\\.ts$"];
// The rows door and the tier behind it.
const ROWS_TIER = "^tests/support/node/factories/rows(\\.ts$|/)";
// The only testkit files that may import ROWS_TIER; each line says why its rows cannot come from a verb.
const ROWS_IMPORTERS = [
  "^tests/support/node/factories/rows(\\.ts$|/)", // the tier composes its own captures and twins
  "\\.test(-d)?\\.ts$", // testkit self-tests prove a seed or capture stored what it claims
  // Corpus publication producers: the fixture CT and snap consumers replay is a snapshot of the rows each producer's
  // production pass left, so each calls a rows-tier capture or twin; corpus-actors.ts holds their door seeds and is not here.
  "^tests/support/node/corpus\\.ts$", // also the capsule's pre-boot idle check on a copied private db
  "^tests/support/node/corpus-seed\\.ts$",
  "^tests/support/node/corpus-chat-lifecycle\\.ts$",
  "^tests/support/node/corpus-connection\\.ts$",
  "^tests/support/node/corpus-databank\\.ts$",
  "^tests/support/node/corpus-image-variants\\.ts$",
  "^tests/support/node/corpus-imagery\\.ts$",
  "^tests/support/node/corpus-knowledge\\.ts$",
  "^tests/support/node/corpus-knowledge-images\\.ts$",
  "^tests/support/node/corpus-knowledge-variants\\.ts$",
  "^tests/support/node/corpus-library-views\\.ts$",
  "^tests/support/node/corpus-notifications\\.ts$",
  "^tests/support/node/corpus-oidc\\.ts$",
  "^tests/support/node/corpus-plugin\\.ts$",
  "^tests/support/node/corpus-plugin-host\\.ts$",
  "^tests/support/node/corpus-plugin-http\\.ts$",
  "^tests/support/node/corpus-plugin-outputs\\.ts$",
  "^tests/support/node/corpus-refinery\\.ts$",
  "^tests/support/node/corpus-rpg\\.ts$",
  "^tests/support/node/corpus-rpg-members\\.ts$",
  "^tests/support/node/corpus-rpg-provider\\.ts$",
  "^tests/support/node/corpus-rpg-recursion\\.ts$",
  "^tests/support/node/corpus-rpg-rounds\\.ts$",
  "^tests/support/node/corpus-rpg-schedules\\.ts$",
  "^tests/support/node/corpus-sdk-sessions\\.ts$",
  "^tests/support/node/corpus-search\\.ts$",
  "^tests/support/node/corpus-stats-settings\\.ts$",
];

// A server suite's directory names its subject: tests/server/<tier>/<name>/ tests that module, and a file directly
// under tests/server/<tier>/ (every entry suite included) tests that tier. Its runtime reach to any other module goes
// through the composed root; a type-only import of another door stays legal for a suite. Primitives are the server's pure floor, the Node twin of @orb/kit, so every suite may call them.
const SERVER_TEST_TIERS = "(?:entry|transport|domain|infra|foundation|primitives)";
const SERVER_TEST_OWN_MODULE = `^tests/server/((?!entry/)${SERVER_TEST_TIERS})/([^/]+)/`;
const SERVER_TEST_OWN_TIER = `^tests/server/(entry(?=/)|${SERVER_TEST_TIERS}(?=/[^/]+$))/`;
const SERVER_TEST_PRIMITIVES = `${SRV}primitives/`;
// The file each subpath of a package's exports map names; a types-only conditional entry is no source door.
function exportedDoors(pkg: string, exports: Readonly<Record<string, unknown>>): string[] {
  return Object.values(exports)
    .filter((target) => typeof target === "string")
    .map((target) => `^${RegExp.escape(target.replace(/^\.\//u, `packages/${pkg}/`))}$`);
}
// Every server door: a module's index.ts, and each subpath the package's exports map declares.
const SERVER_DOORS = [`${SRV}[^/]+/[^/]+/index\\.ts$`, ...exportedDoors("server", serverPackage.exports)];
// The production files a suite may import directly for a Spine-Testing §9 import: a constant, limit, id, error class
// or pure rule that production executes. A door forwards only what production consumes through it, so `pnpm knip:prod`
// fails a door forward whose only importers are tests; the suite reads the symbol from its owning file here instead.
// One entry per owning file, naming its symbols. The compile-time registries knip.ts trusts are read here too.
// A suite of another module still needs its reach line below.
const TEST_CONSTANT_HOMES = {
  "packages/client/src/data/query-state-copy.ts": "QUERY_WAITING_LINE and queryFailedLabel: the words of a read with no data",
  "packages/server/src/entry/http/security-headers.ts": "OWN_POLICY_ROUTES: the own-policy route registration, one suite case per member",
  "packages/server/src/entry/http/plugin-frame.ts": "PLUGIN_FRAME_CSP and PLUGIN_FRAME_ASSET_CSP: the policies the plugin frame routes write",
  "packages/server/src/entry/http/card-frame.ts": "CARD_FRAME_FLOOR_CSP: the policy the card frame serves a document with no character under",
  "packages/server/src/domain/character/contract/errors.ts": "CharacterNotFoundError: the refusal class greeting suites assert",
  "packages/server/src/transport/trpc/fault-copy.ts": "UNCLASSIFIED_FAULT_MESSAGE: the words the error formatter sends for every unclassified throw",
  "packages/server/src/domain/imagery/substrate/size.ts": "SIZE_PRESETS: the dimensions a size preset puts on the provider request",
  "packages/server/src/domain/chat/contract/errors.ts": "CHAT_OP_CODES and ChatNotFoundError: the refusal codes and class chat suites assert",
  "packages/server/src/domain/admin/contract/errors.ts": "ADMIN_OP_CODES: the refusal codes admin and sessions suites assert",
  "packages/server/src/domain/credentials/contract/errors.ts": "CREDENTIALS_OP_CODES: the refusal codes credentials suites assert",
  "packages/server/src/domain/settings/contract/errors.ts": "SETTINGS_OP_CODES: the refusal codes settings suites assert",
  "packages/client/src/features/credentials/lib/connections-copy.ts": "ADD_CONNECTION_NAME: the add-connection button's name",
  "packages/client/src/features/character/lib/greeting-copy.ts":
    "the greeting strip's control names: the add and remove buttons and the numbered greeting label",
  "packages/server/src/foundation/data-layout/contract.ts": "the data-layout slot key constants: the env keys that override one slot each",
  "packages/server/src/domain/chat/contract/metadata.ts": "TOOL_RECURSE_LIMIT_DEFAULT: the default the corpus writes back",
  "packages/server/src/domain/chat/persistence/participants-read.ts": "loadPresentRole: the production role read the authority suite compares against",
  "packages/server/src/domain/search/substrate/instructions.ts":
    "SCOPE_INSTRUCTIONS: the per-scope retrieval and rerank instructions the image search suite reads the request prefix against",
  "packages/server/src/domain/search/persistence/nearest.ts":
    "nearestCharacters: the D20 owner predicate, reached with no generation because every door passes one and a generation already hashes its owner",
  "packages/server/src/domain/import/substrate/appearance.ts":
    "stAppearancePatch and ST_POWER_USER_KEY: the pure ST power_user mapping and the settings.json key it reads",
  "packages/server/src/entry/boot/disclaimer.ts": "BOOT_DISCLAIMER_TOPICS: the topic order the disclaimer block follows",
  "packages/server/src/infra/network/contract/egress.ts": "SSRF_BLOCKED: the mark every connect-time firewall refusal opens with",
  "packages/server/src/entry/boot/migrate-data-layout.ts": "DataLayoutRefusal: the refusal class and reason the layout migration suite asserts",
  "packages/server/src/domain/refinery/substrate/stage-resolution.ts":
    "REFINERY_RESPONSE_FORMATS: the wire schema names the scripted peer answers each refinery stage under",
  "packages/server/src/domain/plugin/contract/errors.ts": "PluginNotFoundError: the refusal class plugin seed cases assert",
  "packages/server/src/domain/plugin/substrate/plugin-macros.ts": "pluginMacroName: the token rule for a plugin's registered macro",
  "packages/server/src/domain/plugin/substrate/snippet-gate.ts": "SNIPPET_CONCURRENCY_PER_USER: the admission ceiling a release case must exceed",
  "packages/server/src/domain/chat/substrate/reaction-note.ts":
    "reactionNote: the attribution note a reaction writes, which a frame override must collide with",
  "packages/server/src/domain/discovery/substrate/hub-math.ts":
    "computeGroupHubs and HUB_YIELD_WORK_BUDGET: the hub math whose yield budget and cancellation the suite holds it to",
  "packages/server/src/domain/discovery/themes/name-prompt.ts": "THEME_NAME_KEYWORDS_LEAD: the lead the scripted provider recognises a naming request by",
  "packages/server/src/domain/rpg/contract/op-codes.ts": "RPG_OP_CODES: the refusal codes rpg suites assert",
  "packages/server/src/domain/preset/constants.ts":
    "SYSTEM_DEFAULT_PRESET_ID, SYSTEM_DEFAULT_PRESET_KIND and SYSTEM_DEFAULT_PRESET_NAME: the system preset's identity",
  "packages/server/src/domain/settings/constants.ts": "RETIRED_SEED_THEME_IDS, THEME_HEARTH_ID and THEME_MOCHA_ID: the seeded theme ids",
  "packages/server/src/domain/settings/substrate/seed-themes.ts": "SEED_THEMES: the seeded theme table",
  "packages/server/src/domain/settings/verbs/upstream-probes.ts": "UPSTREAM_ANSWER_TTL_MS: the probe answer lifetime",
  "packages/server/src/foundation/observability/tracing.ts": "getTraceByRequestId: the trace ring read the span suites assert through",
  "packages/server/src/primitives/serde/databank/index.ts": "DATABANK_SCHEMA_KIND: the sibling envelope kind a chat bundle refuses as foreign",
  "packages/server/src/infra/plugin-host/budgets.ts": "PLUGIN_ASSET_MAX_BYTES: the fetched-asset byte cap the image-cap suite sends one byte past",
  "packages/server/src/infra/plugin-host/process-argv.ts": "formatPluginBrokerArguments: the watchdog's broker launch the permission-drop suite repeats",
  "packages/server/src/infra/plugin-host/process-channel.ts":
    "parsePluginIpcMessage: the envelope parser the permission-drop suite reads a real broker through",
  "packages/server/src/infra/plugin-host/process-permission.ts":
    "pluginBrokerExecArgv: the production flags the permission-drop suite starts a real broker under",
  "packages/server/src/infra/plugin-host/process-protocol.ts":
    "parseBrokerParentMessage, parseMessageLine and serializeMessage: the frame codec the permission-drop suite speaks as the watchdog",
  "packages/server/src/infra/plugin-host/sandbox.ts": "Sandbox: the sandbox class its unit suite constructs",
  "packages/server/src/infra/relay/quick-tunnel.ts": "RELAY_STOP_GRACE_MS: the relay's stop grace",
  "packages/server/src/infra/upstream-update/adapter.ts": "parseLatestRelease and parseMainHead: the pure release and head parsers",
  "packages/server/src/entry/compose/portability.ts":
    "LIFECYCLE_DOORS, NON_PORTABLE_CANON and PORTABLE_CANON_TABLES: the D329 portability registries their suites check",
  "packages/server/src/entry/contract/portability.ts": "NON_PORTABLE_CLASSES and the registry value shapes: the D329 portability vocabulary",
  "packages/contracts/src/chat/bus.ts": "CHAT_WARNING_CODES and PROVIDER_ADJUSTMENT_KINDS: the warning vocabularies",
  "packages/contracts/src/chat/content-classes.ts": "CONTENT_CLASS_POLICY: the content-class projection table",
  "packages/contracts/src/chat/impersonation.ts": "impersonateStreamDeltaSchema: the impersonation delta parser",
  "packages/contracts/src/import/persona-collision.ts": "PERSONA_COLLISION_CHOICES: the collision choice vocabulary",
  "packages/contracts/src/refinery/core.ts": "SCORE_MIN and SCORE_MAX: the score scale a custom score schema must keep",
  "packages/contracts/src/plugin/ui-host.ts": "PLUGIN_UI_CHAT_MESSAGES_LIMIT_MAX: the message read cap",
  "packages/contracts/src/plugin/view.ts": "PLUGIN_FANOUT_SKIP_REASONS: the fan-out skip vocabulary",
  "packages/contracts/src/prose-slot/index.ts": "proseOverrideFromLegacy: the legacy text lift",
  "packages/contracts/src/rpg/actor.ts":
    "rpgActorIdentitySchema, rpgActorVolatileSchema, rpgInventoryItemSchema and rpgRelationshipSchema: the actor part parsers",
  "packages/contracts/src/rpg/structured-round.ts": "RPG_STATE_CHANGES_FIELD: the structured round's state field",
  "packages/contracts/src/rpg/trace.ts": "rpgTraceEventSchema: the trace event parser",
  "packages/contracts/src/rpg/tracker.ts": "rpgTrackerValueSchema: the tracker value parser",
  "packages/contracts/src/workloads/admission.ts": "WORKLOAD_UNFUNDED: the unfunded refusal code",
  "packages/db/src/query/check-list.ts": "checkList: the SQL literal-list formatter",
  "packages/inference/src/contract/errors.ts": "PROVIDER_ERROR_KINDS: the provider error vocabulary",
  "packages/inference/src/backends/wire/cache-control.ts":
    "ANTHROPIC_PROVIDER_NAME: the provider name an OpenRouter Claude request is pinned to, which no inference door forwards",
  "packages/inference/src/backends/http/provider-log.ts": "EMBED_CLAMPED_EVENT: the log event both embed backends emit when they shorten an input",
  "packages/ui/src/content/immersive-card/control-labels.ts": "IMMERSIVE_CARD_LABELS: the card header's control names",
  "packages/ui/src/lib/reduced-motion-now.ts":
    "resolveReducedMotion and APP_REDUCED_MOTION_ATTRIBUTE: the JS rule the CSS reduced-motion floor must agree with",
  "packages/client/src/data/import-tree-plan.ts": "planTreeImport: the folder import planner",
  "packages/client/src/features/workloads/lib/workloads-model.ts":
    "WORKLOAD_KIND_LABELS, ASSET_KIND_ITEMS, UNRESOLVED_OWNER_HANDLE and toProgressView: the job and asset kind names the pickers print, the owner name a row shows before its handle loads and the pure progress label rule",
  "packages/client/src/features/workloads/lib/portability-model.ts":
    "IMPORT_CONFIRM_NAMES, IMPORT_NOTHING_FOUND_NOTE and summarizeCardImport: the import review's control names, its empty-folder note and the pure summary rule",
  "packages/client/src/features/databank/lib/scrape-form-model.ts": "SCRAPE_FAILURE: the one failure line the add-document form and its toast both say",
  "packages/client/src/data/import-tree-served.ts": "planServedTreeImport: the served-tree import planner",
  "packages/client/src/features/chat/lib/chat-context-tab-labels.ts":
    "CHAT_CONTEXT_TAB_LABELS and CHAT_CONTEXT_TABLIST_NAME: production context tab names used by navigation assertions",
  "packages/client/src/features/chat/lib/composer-menu-names.ts": "COMPOSER_CLEAR_INPUT_NAME and its siblings: the composer menu item names",
  "packages/client/src/features/chat/lib/chat-options-names.ts": "CHAT_DELETE_NAME and its siblings: the room options menu item names",
  "packages/client/src/lib/context-toggle-label.ts": "contextToggleLabel: the detail toggle's name in both states",
  "packages/client/src/lib/context-pane-names.ts":
    "the side panes' names, edge controls and exits the shell prints, which the walk opens and dismisses a pane by",
  "packages/client/src/lib/rail-names.ts": "PRIMARY_NAV_NAME and YOU_TAB_LABEL: the rail navigation's name and its You tab",
  "packages/client/src/lib/overflow-names.ts":
    "TRAIL_OVERFLOW_LABEL and BAND_OVERFLOW_LABEL: the More triggers an action folds into when its row runs out of room, which the walk presses it through",
  "packages/client/src/lib/row-menu-names.ts": "ROW_RENAME_NAME and its siblings: the library row menu items and the delete confirm title",
  "packages/client/src/lib/search-empty-names.ts": "NO_MATCHES_TITLE and CLEAR_SEARCH_NAME: the words a searched-empty list prints",
  "packages/client/src/features/imagery/lib/imagine-names.ts":
    "IMAGINE_MODE_NAME and its siblings: the imagine options' field names and the imagery dialogs' titles and edit door",
  "packages/client/src/features/chat/lib/appearance-avatars-model.ts":
    "APPEARANCE_AVATARS_SUBCATEGORY: the Avatars section's model, whose setting names its pane and its test both read",
  "packages/client/src/features/chat/lib/appearance-message-details-model.ts":
    "APPEARANCE_MESSAGE_DETAILS_SUBCATEGORY: the Message details section's model, whose setting names its pane and its test both read",
  "packages/client/src/features/chat/lib/appearance-message-style-model.ts":
    "APPEARANCE_MESSAGE_STYLE_SUBCATEGORY: the Message style section's model, whose setting names its pane and its test both read",
  "packages/client/src/features/app-shell/lib/appearance-effects-model.ts":
    "APPEARANCE_EFFECTS_SUBCATEGORY: the Effects section's model, whose setting names its pane and its test both read",
  "packages/client/src/features/auth/lib/reauth-names.ts": "REAUTH_MODAL_TITLE: the re-auth prompt's title, which its landing test names the dialog by",
  "packages/client/src/features/plugin/lib/plugin-command-copy.ts":
    "PLUGIN_ACTIONS_NAME and its siblings: the composer's plugin command menu, argument dialog and undo names",
  "packages/client/src/features/workloads/lib/import-library-names.ts": "IMPORT_FOLDER_NAME: the import section's folder door",
  "packages/ui/src/primitives/selection-bar/selection-bar-names.ts": "SELECTION_CLEAR_NAME and selectionCountLabel: the selection bar's names",
  "packages/ui/src/primitives/color-field/color-field-names.ts":
    "COLOR_HEX_FIELD_NAME and colorPickerName: the colour field's hex box and picker names, which the Look walk records the popup by",
  "packages/client/src/lib/clipboard-names.ts": "COPIED_TO_CLIPBOARD_NOTICE: the notice a copy raises, which the chat walk's copy step waits on",
  "packages/client/src/features/character/lib/character-actions.ts":
    "CHARACTER_ACTIONS: the character verb registry whose labels the row menu, context kebab and bulk bar print",
  "packages/ui/src/primitives/toast/toast-names.ts": "TOAST_CLOSE_NAME and its siblings: the names a toast prints",
  "packages/client/src/lib/view-transition-names.ts": "SHELL_SWAP_DEADLINE_PROPERTY: the grid property a swap spec stretches to hold the old frame",
  "packages/client/src/forms/editor/autosave-status-names.ts": "AUTOSAVE_SAVED_TEXT and its siblings: the words the shared autosave readout prints",
  "packages/client/src/forms/entity-form-base.ts": "DEFAULT_DEBOUNCE_MS: the autosave debounce a held-window case waits past to see a second write",
  "packages/client/src/features/character/lib/character-names.ts":
    "CHARACTER_SEARCH_NAME and its siblings: the accessible names the Characters library, editor and dialogs print",
  "packages/client/src/features/character/lib/character-refusal-notice.ts":
    "characterRefusalCopy: the copy a coded character refusal raises, which a notice case reads its expected toast from",
  "packages/client/src/features/chat/lib/warning-notice.ts":
    "warningNotice: the notice each chat warning code raises, which a notice case reads its expected toast from",
  "packages/client/src/features/config/lib/config-copy.ts": "CONFIG_SECTION_LABEL: the settings section labels",
  "packages/client/src/lib/dialog-verbs.ts": "DIALOG_VERBS: the exit and commit words every dialog prints, which the surface walk drivers locate controls by",
  "packages/client/src/routes/route-pending-names.ts":
    "ROUTE_PENDING_NAME: the router's pending mark, which a slow-guard case reads to prove the window is open",
  "packages/client/src/components/shared-control-names.ts":
    "TAG_NAME_FIELD_NAME and its siblings: the names of controls a shared component mounts for several features",
  "packages/client/src/features/chat/lib/transcript-copy.ts":
    "CHAT_PRINT_COVERAGE and the history pager's status line: the transcript copy a print or pager case reads",
  "packages/client/src/features/chat/lib/chat-surface-names.ts":
    "CHAT_CLEAR_SEARCH_NAME and its siblings: the chat list, composer, gallery, injection and members names",
  "packages/client/src/features/chat/lib/chat-attach-names.ts":
    "CHAT_ATTACH_BOOK_NAME and its siblings: the This-chat tab's attach doors, pickers, empty states and refusals",
  "packages/client/src/features/chat/lib/chat-settings-names.ts":
    "CHAT_ADD_INJECTION_NAME and its siblings: the This-chat tab's injection, override, prose and group form names",
  "packages/client/src/features/chat/lib/members-names.ts":
    "CHAT_INVITE_PEOPLE_NAME and its siblings: the Members panel, row menu, card viewer and join dialog names",
  "packages/client/src/features/chat/lib/command-palette-names.ts": "COMMAND_MODAL_TITLE and COMMAND_PALETTE_NAME: the command modal's title and input",
  "packages/client/src/features/chat/lib/message-action-names.ts":
    "MESSAGE_EDIT_NAME and its siblings: the transcript row's action, tool call and wire viewer names",
  "packages/client/src/features/config/lib/config-control-names.ts": "CONFIG_THEME_NAME_FIELD_NAME and its siblings: the theme builder control names",
  "packages/client/src/features/world-info/lib/world-info-names.ts": "WORLD_INFO_NEW_BOOK_NAME and its siblings: the books library and entry editor names",
  "packages/client/src/features/regex/lib/regex-names.ts": "REGEX_FIND_PATTERN_NAME and its siblings: the regex editor, tester and pipeline names",
  "packages/client/src/features/databank/lib/databank-names.ts": "DATABANK_SEARCH_NAME and its siblings: the library, Home tile, add dialog and landing names",
  "packages/client/src/features/databank/lib/databank-upload-copy.ts":
    "DOCUMENT_UPLOAD_FAILURE: the add dialog's sentence for each refusal code of an uploaded file",
  "packages/client/src/features/config/lib/theme-import-copy.ts":
    "themeImportLeftoverTitle and its siblings: the Looks section's note for the settings an imported theme left behind",
  "packages/client/src/features/app-shell/lib/appearance-sizing-model.ts":
    "APPEARANCE_SIZING_SUBCATEGORY: the labels and keys of the Sizing section's settings, which the Looks note names by the same labels",
  "packages/client/src/features/preset/lib/preset-names.ts": "PRESET_DELETE_SECTION_TITLE: the section delete confirmation's title",
  "packages/client/src/features/roster-preset/lib/roster-names.ts": "ROSTER_SAVED_NAME and ROSTER_ALL_NAME: the saved-rosters modal and Home tile names",
  "packages/client/src/features/discovery/lib/corpus-control-names.ts":
    "CORPUS_SEARCH_TARGET_NAME and its siblings: the Corpus list, browse, gem shelf and model-route list names",
  "packages/client/src/features/config/lib/theme-row-names.ts": "themeActionsName: the name of a Looks theme row's actions menu",
  "packages/client/src/features/workloads/lib/import-folder-copy.ts":
    "IMPORT_FOLDER_WRONG_FOLDER: the sentence the SillyTavern folder import prints when the folder is not a user folder",
  "packages/client/src/lib/card-import-copy.ts":
    "CARD_IMPORT_REFUSED_ONE and its siblings: the refusal sentence the character import dialog and the backup import both say for a picture that is not a card",
  "packages/client/src/lib/use-focus-on-mount.ts":
    "PRESS_RENDER_WINDOW_MS: how long after a press a surface may still arrive from the body on that press's account",
  "packages/client/src/features/refinery/lib/refinery-section-label.ts": "REFINERY_LIST_TITLE: the name the Refinery list pane's focus target announces",
  "packages/client/src/features/refinery/lib/refinery-names.ts":
    "REFINERY_VERSIONS_NAME, refineryCompareToggleName and REFINERY_VERSION_LOADING_TEXT: the context pane's version history names",
  "packages/client/src/features/refinery/lib/verdict.ts": "verdictWordOf: the display word the analyze verdict banner paints",
  "packages/client/src/features/plugin/lib/extensions-copy.ts": "EXTENSIONS_GONE_TITLE: the vanished page's title",
  "packages/client/src/features/plugin/lib/plugin-copy.ts":
    "approveLabel, enablePluginLabel, showInChatSwitchName, CHAT_PANEL_HIDE_LABEL and CHAT_PANEL_UNDO_LABEL: production action and switch names required by the no-copied-label contract",
  "packages/client/src/features/automation/lib/rule-copy.ts": "ruleEnabledSwitchName: the per-rule enable switch name",
  "packages/client/src/features/workloads/lib/workloads-schedule-model.ts": "scheduleEnabledSwitchName: the per-schedule enable switch name",
  "packages/client/src/features/preset/lib/assembly-model.ts": "sectionEnabledSwitchName: the per-section enable switch name on a rack row and in its drill-in",
  "packages/client/src/features/chat/lib/regex-section-model.ts":
    "regexScriptEverywhereSwitchName and regexTierAllowedSwitchName: the regex script and tier switch names",
  "packages/client/src/features/user-admin/lib/admin-model.ts":
    "userEnabledFieldName and adminSaveName: the per-account enabled switch and the admin override row Save names",
  "packages/client/src/features/user-admin/lib/system-tuning-nav.ts": "SYSTEM_TUNING_SUBCATEGORY: the System tuning section label its admin Save names",
  "packages/client/src/lib/background-jobs.ts": "BACKGROUND_JOB_LOGS: the log line a background job writes in place of a toast",
  "packages/client/src/features/persona/lib/persona-copy.ts":
    "PERSONA_NAME_REQUIRED, CLEAR_PIN_NAME, nowDefaultNotice and their siblings: the persona editor's field and footer names, its blank-name error, the clear-pin action and the crown-moved notice",
  "packages/client/src/features/plugin/lib/plugin-model-copy.ts":
    "PLUGIN_MODEL_HEADING: the production model disclosure name used by plugin presentation assertions",
  "packages/client/src/features/plugin/lib/plugin-panel-copy.ts":
    "CHAT_PLUGINS_* and its siblings: panel navigation, empty-state, placement, dialog title and page kicker names",
  "packages/client/src/features/stats/lib/leaderboard-row-attr.ts":
    "LEADERBOARD_ROW_ATTR: the attribute a leaderboard row wears, which the corpus workbench e2e addresses rows by",
  "packages/client/src/features/tag/lib/tag-list-name.ts": "TAG_LIST_NAME and TAG_FILTER_NAME: the Labels finder's list and filter names",
  "packages/client/src/features/stats/lib/analytics-names.ts": "ANALYTICS_SEARCH_NAME: the Insights leaderboard list's search name",
  "packages/client/src/features/stats/lib/analytics-copy.ts":
    "APPROX_DATES_MARK and APPROX_DATES_NOTE: the mark and note Insights prints for approximate message dates",
  "packages/client/src/lib/app-ready-attribute.ts": "APP_READY_ATTR: the readiness attribute the boot veil exits on",
  "packages/client/src/lib/flank-names.ts":
    "SIDECAR_PANELS_LABEL and SIDECAR_PANELS_NOUN: the names the sidecar column, its edge control and its sheet print, which the room journey locates them by",
  "packages/client/src/state/create-persisted-store.ts": "createPersistedStore: the persisted-store factory a type contract reads",
  "packages/client/src/state/durable-local-keys.ts":
    "APPEARANCE_BOOT_HINT_NAME and APPEARANCE_BOOT_HINT_VERSION: the key and version the boot hint persists under",
  "packages/client/src/compose/contributors.ts": "chromeWidgets: the shipped chrome widget registry",
  "packages/client/src/compose/home-tiles.ts": "homeTiles: the shipped home tile registry",
} as const satisfies Readonly<Record<string, string>>;
const TEST_CONSTANT_HOME_PATHS = Object.keys(TEST_CONSTANT_HOMES).map((path) => `^${RegExp.escape(path)}$`);
// The suites that import a production constant or verb from another module's door (Spine-Testing §9 imports constants
// from their home): each line names what it imports and why the suite needs it. No wire carries any of them.
const SERVER_TEST_REACHES = {
  // A rule's image size must reach the provider as the preset's dimensions, which imagery owns.
  "tests/server/domain/automation/engine/dispatch.int.test.ts": {
    "domain/imagery": "SIZE_PRESETS: the dimensions a size preset puts on the provider request",
  },
  // A search that fails for an unrelated reason answers the wire with the fixed fault sentence, which the transport owns.
  "tests/server/domain/search/verbs/space-binding-lookup.int.test.ts": {
    "transport/trpc": "UNCLASSIFIED_FAULT_MESSAGE: the words the error formatter sends for every unclassified throw",
  },
  // A host who hands the seat off mid-invocation meets chat's host gate, and the guest sees that gate's error class.
  "tests/server/domain/plugin/substrate/guest-room-reads.suite.int.test.ts": {
    "domain/chat": "ChatOperationError: the refusal the host gate raises for a handed-off installer",
  },
  // A staged upload's life ends at a boot, and the boot sweep removes the zip extractor's directories by their name.
  "tests/server/domain/import/persistence/import-staging-lifetime.int.test.ts": {
    "entry/boot": "reclaimLocksOnBoot: the boot step the sweep runs in",
    "infra/storage": "ZIP_STAGING_PREFIX: the name an extraction directory carries",
  },
  // Each cross-owner boot verb must refuse a plain handle cast to the boot grant before a row moves (D335).
  "tests/server/entry/boot/persistence/forged-boot-grant.int.test.ts": {
    "domain/automation": "migratePluginToolWireNames: a cross-owner boot verb",
    "domain/character": "backfillPluginProvenance: a cross-owner boot verb",
    "domain/chat":
      "hasRedeemableInvite, migrateHandoffOfferVocab, migratePluginToolWireNames, reclaimChatLocksOnBoot and repairStaleJoinSeq: cross-owner boot verbs",
    "domain/credentials": "hasSealedCredentials: a cross-owner boot verb",
    "domain/plugin": "listEnabledAcrossOwners and readInstalledPluginSlugs: cross-owner boot verbs",
    "domain/preset": "migrateProseSlotVocab: a cross-owner boot verb",
    "domain/sessions": "createListSeedAccountIds and createSettleSessionSecret: cross-owner boot verbs",
    "domain/settings": "ensureSeedThemes and healLegacyBackgroundPins: cross-owner boot verbs",
    "domain/stats": "reconcileOwnersMissingTimeline: a cross-owner boot verb",
    "domain/workloads": "reclaimInFlightOnBoot: a cross-owner boot verb",
  },
  "tests/server/domain/sessions/persistence/users.int.test.ts": {
    "domain/admin": "ADMIN_OP_CODES: the refusals of the admin SSO link claim, which binds a sessions-owned row",
  },
  "tests/server/domain/sessions/role-policy-config.int.test.ts": {
    "domain/admin": "ADMIN_OP_CODES: the handle refusal the admin create verb raises under the sessions role policy",
  },
  "tests/server/domain/assets/persistence/materialization-boundaries.int.test.ts": {
    "domain/chat": "CHAT_OP_CODES: the refusal the settings background materialization raises through the chat-owned code table",
  },
  "tests/server/domain/settings/persistence/seed-ledger-tags.int.test.ts": {
    "domain/character": "DEFAULT_CHARACTER_CARDS: the authored tag list is the expected set the seeded card's tag rows must equal",
  },
  "tests/server/entry/boot/boot-secrets.int.test.ts": {
    "foundation/data-layout": "SECRET_FILE_NAMES: the suite plants and removes the boot secret files by their production names",
  },
  "tests/server/entry/boot/disclaimer.test.ts": {
    "foundation/env":
      "resolveBindPosture, resolveOwnerFallbackPeers and the posture inputs: no testkit door resolves a bind or owner-peer posture, and the block takes those resolved values",
  },
  "tests/server/entry/boot/persistence/migrate-data-layout.int.test.ts": {
    "foundation/data-layout":
      "DATA_LAYOUT_DIRS, LEGACY_ENTRIES and DB_FILE_NAME: the legacy names, their targets and the layout directories exist only in this module, and no testkit door supplies them",
  },
  "tests/server/foundation/env/record/floor-defaults.test.ts": {
    "foundation/data-layout":
      "resolveDataLayout and LEGACY_ENTRIES: the record's slots are compared with an independent resolution, which no testkit door offers, and a keyed legacy entry exists only in the table",
  },
  // The CSRF suite walks the tRPC mount at a real mutation of the production router.
  "tests/server/entry/http/csrf-route-coverage.int.test.ts": {
    "transport/trpc": "appRouter: the production router whose first input-parsing mutation the suite walks",
  },
  "tests/server/entry/http/production-debug-posture.int.test.ts": {
    "foundation/env": "DEBUG_TOKEN_ENV: the secret env key the posture suite sets, which no testkit door names",
  },
  "tests/server/entry/lifecycle.int.test.ts": {
    "infra/network": "SHUTDOWN_MESSAGES: the stage lines a real shutdown logs, which the stack drain verdict reads too",
  },
  "tests/server/entry/boot/identity-ownership.int.test.ts": {
    "foundation/data-layout": "SECRET_FILE_NAMES: the suite plants the boot secret files by their production names",
  },
  "tests/server/entry/boot/secret-boot-process.int.test.ts": {
    "foundation/data-layout":
      "DATA_LAYOUT_DIRS, SECRET_FILE_NAMES and DATABASE_URL_KEY: the suite plants the session keyfile and the database key by their production names",
    "foundation/env": "APP_SECRET_ENV_KEYS: the boot scrub's own list, which the suite plants and then looks for in a child's env",
  },
  "tests/server/foundation/env/host-env-allowlist.int.test.ts": {
    "foundation/data-layout": "SESSION_SECRET_ENV: the suite plants the session secret in the host env by its production name",
  },
  "tests/server/foundation/env/record/secret-file.int.test.ts": {
    "foundation/data-layout": "DATABASE_URL_KEY: the suite plants the database key by its production name",
  },
  "tests/server/foundation/observability/bug-report-diagnostics.test.ts": {
    "foundation/data-layout": "DATABASE_URL_KEY: the suite sets the database key by its production name",
  },
  "tests/server/entry/compose/share-acme.int.test.ts": {
    "foundation/data-layout": "IP_CERTIFICATE_FILE_NAMES: the suite reads and corrupts the stored certificate files by their production names",
  },
  "tests/server/entry/compose/share-graph.int.test.ts": {
    "infra/relay": "RELAY_STOP_GRACE_MS: the suite advances the scheduler by exactly the relay's own stop grace",
  },
  "tests/server/entry/compose/scoped-timers.int.test.ts": {
    "domain/plugin": "pluginMacroName: no wire lists a plugin's registered macros, so the suite names the token by the plugin domain's own rule",
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, string>>>>;

// From the first dot of the last segment, so `.int.test.ts` goes whole: generated rule names read the bare suite.
function withoutExtension(path: string): string {
  const name = path.lastIndexOf("/") + 1;
  const dot = path.indexOf(".", name);
  return dot === -1 ? path : path.slice(0, dot);
}

function serverTestMirrorRules(): IForbiddenRuleType[] {
  const reachers = Object.keys(SERVER_TEST_REACHES).map((path) => `^${RegExp.escape(path)}$`);
  const mirror = (name: string, comment: string, from: string, own: string): IForbiddenRuleType[] => [
    {
      name,
      comment,
      severity: "error",
      from: { path: from, pathNot: reachers },
      to: { path: SRV, pathNot: [own, SERVER_TEST_PRIMITIVES], dependencyTypesNot: ["type-only", "type-import"] },
    },
    // A listed suite gets its own copy of the rule with its mirror spelled out and its named modules added. Each copy
    // needs its own name: `extends` merges forbidden rules by name, so a second rule of one name replaces the first.
    ...Object.entries(SERVER_TEST_REACHES).flatMap(([path, modules]): IForbiddenRuleType[] => {
      const groups = new RegExp(from, "u").exec(path);
      if (groups === null) {
        return [];
      }
      const mirrored = own.replaceAll(/\$(\d)/gu, (_, index: string) => RegExp.escape(groups[Number(index)] ?? ""));
      return [
        {
          name: `${name}-listed-${withoutExtension(path.replace(/^tests\/server\//u, "")).replaceAll("/", "-")}`,
          comment,
          severity: "error",
          from: { path: `^${RegExp.escape(path)}$` },
          to: {
            path: SRV,
            pathNot: [mirrored, SERVER_TEST_PRIMITIVES, ...Object.keys(modules).map((module) => `${SRV}${RegExp.escape(module)}/`)],
            dependencyTypesNot: ["type-only", "type-import"],
          },
        },
      ];
    }),
  ];
  return [
    ...mirror(
      "tests-server-mirror-own-module",
      "A suite under tests/server/<tier>/<name>/ runs only its own module and the primitives; other production reaches it through the composed root.",
      SERVER_TEST_OWN_MODULE,
      `${SRV}$1/$2/`,
    ),
    ...mirror(
      "tests-server-mirror-own-tier",
      "An entry suite, or a suite directly under its tier, runs only that tier and the primitives.",
      SERVER_TEST_OWN_TIER,
      `${SRV}$1/`,
    ),
    {
      name: "tests-server-front-doors-only",
      comment: "A server suite enters a module through its door.",
      severity: "error",
      from: { path: "^tests/server/", pathNot: "\\.test-d\\.ts$" },
      to: { path: `${SRV}(?!domain/)`, pathNot: [...SERVER_DOORS, ...TEST_CONSTANT_HOME_PATHS] },
    },
    {
      name: "tests-server-type-contracts-own-internals",
      comment: "A .test-d.ts type contract may name its own module's internal types; every other module enters through its door.",
      severity: "error",
      from: { path: `${SERVER_TEST_OWN_MODULE}.*\\.test-d\\.ts$` },
      to: { path: `${SRV}(?!domain/)`, pathNot: [...SERVER_DOORS, `${SRV}$1/$2/`] },
    },
    {
      name: "tests-server-type-contracts-tier-doors",
      comment: "An entry or tier-level .test-d.ts type contract names only door types; no internal file of any module.",
      severity: "error",
      from: { path: `${SERVER_TEST_OWN_TIER}.*\\.test-d\\.ts$` },
      to: { path: `${SRV}(?!domain/)`, pathNot: [...SERVER_DOORS, ...TEST_CONSTANT_HOME_PATHS] },
    },
  ];
}

// A suite under tests/<pkg>/ runs production only from its package's cake (CAKE), and enters every package through
// a subpath its exports map declares. Kit, contracts, db and inference mirror their package as one module: the exports
// map is the door. A client suite under tests/client/features/<name>/, its stories included, runs only its own
// feature's door and the client's other exported doors; a client tier suite runs no feature door. Another feature
// reaches a story through the registries `@orb/testkit/browser` composes. A type-only import of any door stays legal.
const SOURCE = "^packages/[^/]+/src/";
const PACKAGE_DOORS = [
  ...exportedDoors("client", clientPackage.exports),
  ...exportedDoors("contracts", contractsPackage.exports),
  ...exportedDoors("db", dbPackage.exports),
  ...exportedDoors("inference", inferencePackage.exports),
  ...exportedDoors("kit", kitPackage.exports),
  ...exportedDoors("server", serverPackage.exports),
  ...exportedDoors("ui", uiPackage.exports),
];
const TEST_TYPE_CONTRACT = "\\.test-d\\.ts$";
const RUNTIME_ONLY: DependencyType[] = ["type-only", "type-import"];
// The suites that run a file no door of their cake admits, each line naming the file and why. A feature-private pure
// model stays off its door because a door forwards only what production consumes through it (`pnpm knip:prod`).
const PACKAGE_TEST_REACHES = {
  "tests/contracts/chat/content-policy.contract.test.ts": {
    "packages/contracts/src/chat/content-blocks.ts":
      "messageContentBlockSchema: the case parses stored blocks through the schema the send verb reads, which no production caller imports through the chat door",
  },
  "tests/db/schema/chat-freeze-provenance.repo.int.test.ts": {
    "packages/server/src/entry/boot/index.ts":
      "runBootMigrations: the case proves boot backs up the pre-migration file before the provenance rebuild, and only the persistence tier may seed that schema",
  },
  "tests/db/client/traced-client-spans.int.test.ts": {
    "packages/server/src/foundation/observability/index.ts":
      "wrapLibSqlClient: the client wrapper createDb takes, proven through native close; the raw queries it traces are persistence-tier reads",
    "packages/server/src/foundation/observability/tracing.ts": "getTraceByRequestId: the trace ring read that shows the wrapped client's spans",
  },
  "tests/client/features/auth/components/pending-join-fixtures.ts": {
    "packages/contracts/src/chat/roster.ts":
      "JOIN_UNAVAILABLE_CODE and ACCOUNT_EXISTS_CODE: the refusal codes the pending-join story answers with, which no contracts door forwards",
  },
  "tests/client/features/character/lib/facet-fill.dom.test.ts": {
    "packages/client/src/features/character/lib/character-card-facets.ts": "facetFillState and CHARACTER_CARD_FACET_IDS: the feature-private facet model",
    "packages/client/src/features/character/lib/character-card-form-model.ts": "DEFAULT_CHARACTER_CARD_FORM: the empty form the facet model reads",
  },
  "tests/client/features/credentials/lib/include-body-overrides.dom.test.ts": {
    "packages/client/src/features/credentials/lib/connection-editor-model.ts":
      "parseIncludeBody and INCLUDE_BODY_SHAPE_REASON: the feature-private overrides reader and the refusal it shows",
  },
  "tests/client/lib/bug-report-bundle.dom.test.ts": {
    "packages/client/src/lib/bug-report-bundle.ts":
      "sliceMotionEvidence: the motion slices the dev bug-report capture builds, whose only caller is that capture and which no door forwards",
  },
  "tests/client/features/character/components/_tag-row-stories.tsx": {
    "packages/client/src/features/character/components/character-tags-row.tsx":
      "CharacterTagsRow: the editor's tag row, which no door forwards and only the hero band renders",
  },
  "tests/client/features/discovery/surfaces/_duplicate-chats-stories.tsx": {
    "packages/client/src/features/discovery/components/corpus-duplicate-rows.tsx":
      "CorpusDuplicateChats: the Similarity tab's room-pair list, which only the tab renders and no door forwards; the case deletes a pair it does not read",
  },
  "tests/client/features/character/components/_context-band-stories.tsx": {
    "packages/client/src/features/character/components/character-context-band.tsx":
      "CharacterContextBand: the character section's context band, which only the section's context slot renders and no door forwards",
  },
  "tests/client/features/refinery/components/_versions-stories.tsx": {
    "packages/client/src/features/refinery/components/context-tabs.tsx":
      "VersionsTab: the refinery Versions tab, which only the section's tab body renders and no door forwards",
  },
  "tests/client/features/chat/components/_chat-reads-boundary-stories.tsx": {
    "packages/client/src/features/chat/components/variant-wire-viewer.tsx":
      "VariantWireViewer: the wire dialog, which only the message row opens behind a host-only trigger and no door forwards",
    "packages/client/src/features/chat/components/chat-list-character-filter.tsx":
      "ChatListFacesStrip: the chat list's faces strip, which only the list header renders and no door forwards",
  },
  "tests/client/features/chat/components/_talkativeness-name-stories.tsx": {
    "packages/client/src/features/chat/components/talkativeness-popover.tsx":
      "TalkativenessPopover: the chip and popover a Members row renders, which only the row's menu opens and no door forwards",
    "packages/client/src/features/chat/lib/member-rows.ts": "MemberCharacterRow: the seat view the popover takes, which no door forwards",
  },
  "tests/client/lib/platform-polyfills.test.ts": {
    "packages/client/src/lib/platform-polyfills.ts": "the polyfill entry main.tsx imports for its side effect; it exports nothing for a door to forward",
    "packages/client/src/lib/platform-shims.ts": "regExpEscape and isError: the shims the entry installs, compared with the builtins",
  },
  "tests/client/features/app-shell/lib/command-shortcut-label.test.ts": {
    "packages/client/src/features/app-shell/lib/command-shortcut-label.ts": "commandShortcutLabel: the feature-private platform key hint",
  },
  "tests/client/features/app-shell/components/appearance-sizing-preferences.ct.tsx": {
    "packages/client/src/features/app-shell/lib/appearance-select-items.ts": "OS_PREFERENCE_ITEMS: the mode words the section's segments print",
    "packages/client/src/features/app-shell/lib/appearance-sizing-model.ts":
      "APPEARANCE_SIZING_SUBCATEGORY: the labels and keys the section's three OS preference rows read",
  },
  "tests/client/features/config/lib/appearance-setting-place.dom.test.ts": {
    "packages/client/src/features/config/lib/appearance-setting-place.ts":
      "appearanceSettingPlace: the lookup the Looks note names and places each Appearance setting by, walked over every key a theme import can name",
  },
  "tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx": {
    "packages/client/src/features/app-shell/lib/command-shortcut-label.ts":
      "commandShortcutLabel: the platform key hint the command chip's name and description spell",
    "packages/client/src/lib/chat-rename-names.ts":
      "renameChatButtonIdentity: the head of the rename button's name, which only this module's own builder uses in production and no door forwards",
  },
  "tests/client/routes/_route-pending-stories.tsx": {
    "packages/client/src/routes/route-pending.tsx": "RoutePending: the router's pending component, which only the router renders and no door forwards",
  },
  "tests/client/features/app-shell/surfaces/_shell-handover-stories.tsx": {
    "packages/client/src/routes/route-pending.tsx":
      "RoutePending: the mark a pending route paints in the shell's place, outside the shell's reduced-motion carrier",
  },
  "tests/client/features/chat/lib/empty-send-and-duration.test.ts": {
    "packages/client/src/features/chat/lib/continue-on-empty.ts": "resolveEmptySendAction: the feature-private empty-send dispatch",
    "packages/client/src/features/chat/lib/gen-duration.ts": "durationLabel and genDurationLabel: the feature-private duration formatting",
  },
  "tests/client/features/chat/components/chat-style-skins.ct.tsx": {
    "packages/client/src/lib/row-qualifiers.ts": "viewImageActionName: the portrait viewer opener accessible name",
    "packages/client/src/features/chat/lib/message-action-names.ts": "MESSAGE_EDIT_NAME: the row edit action and editor accessible name",
    "packages/client/src/features/chat/lib/message-row-variants.ts": "MESSAGE_ROW_SKINS: the skin rows each chat style's measured paint is held to",
  },
  "tests/client/features/chat/lib/composer-send-keys.test.ts": {
    "packages/client/src/features/chat/lib/composer-send-keys.ts":
      "shouldSendOnEnter: the feature-private Enter and chord dispatch the composer's keydown path reads",
  },
  "tests/client/features/chat/lib/move-neighbours.test.ts": {
    "packages/client/src/features/chat/lib/move-neighbours.ts": "moveNeighboursAt and moveReasons: the pure edge and generating gates the move arrows read",
  },
  "tests/client/features/chat/components/platform-pinned-band-height.suite.ct.tsx": {
    "packages/client/src/features/chat/lib/message-row-variants.ts": "MESSAGE_ROW_SKINS: the styles whose pinned band height the suite holds",
  },
  "tests/client/features/chat/components/platform-centred-column-width.suite.ct.tsx": {
    "packages/client/src/features/chat/lib/message-row-variants.ts": "MESSAGE_ROW_SKINS: the centred styles whose column width the suite holds",
  },
  "tests/client/features/chat/components/platform-art-fallback-initial.suite.ct.tsx": {
    "packages/client/src/features/chat/lib/message-row-variants.ts": "MESSAGE_ROW_SKINS: the art styles whose fallback initial the suite holds",
  },
  "tests/client/features/chat/components/platform-immersive-card-width.suite.ct.tsx": {
    "packages/client/src/features/chat/lib/message-row-variants.ts": "MESSAGE_ROW_SKINS: the immersive styles whose card width and fill the suite holds",
  },
  "tests/client/features/chat/components/platform-moonlit-card-shape.suite.ct.tsx": {
    "packages/client/src/features/chat/lib/message-row-variants.ts":
      "MESSAGE_ROW_SKINS: the styles that name their speaker and the skins that carry a header rule",
  },
  "tests/client/features/chat/components/message-avatar-reach.ct.tsx": {
    "packages/client/src/features/chat/lib/message-row-variants.ts": "MESSAGE_ROW_SKINS: the styles that paint an avatar, whose touch reach the suite holds",
  },
  "tests/client/features/chat/components/_context-divider-stories.tsx": {
    "packages/client/src/features/chat/components/message-row-divider.tsx":
      "renderContextBoundaryDivider: the divider label's own composition, which only the message row renders and no door forwards",
  },
  "tests/client/features/chat/lib/_chat-track-stories.tsx": {
    "packages/client/src/features/chat/lib/chat-track.tsx": "Track: the room's track carrier, which only the chat feature renders and no door forwards",
  },
  "tests/client/features/chat/components/_chat-header-title-stories.tsx": {
    "packages/client/src/features/chat/components/chat-header-title.tsx":
      "ChatHeaderTitle: the topbar's rename button, which only the chat header renders and no door forwards",
  },
  "tests/client/features/chat/components/_member-card-viewer-stories.tsx": {
    "packages/client/src/features/chat/components/member-card-viewer.tsx":
      "MemberCardViewer: the Members tab's card dialog, which only the committed-members tab renders and no door forwards",
  },
  "tests/client/features/chat/components/_add-member-popover-stories.tsx": {
    "packages/client/src/features/chat/components/add-member-popover.tsx":
      "AddMemberPopover: the Members tab's Add a character door, which only the roster tab renders and no door forwards",
  },
  "tests/client/features/rpg/components/_npc-card-stories.tsx": {
    "packages/client/src/features/rpg/components/tracker-blocks/npc-card-slots.tsx":
      "NpcCard: the present-character card, which only the scene panel's cast list renders and no door forwards",
  },
  "tests/client/features/character/components/_shelf-face-name-stories.tsx": {
    "packages/client/src/features/character/components/character-shelf.tsx":
      "CharacterShelf and ShelfFace: the landing's face buttons, which only the library landing renders and no door forwards",
  },
  "tests/client/features/chat/components/_flank-column-stories.tsx": {
    "packages/client/src/features/chat/components/room-flank.tsx":
      "FlankColumn: the room's plugin column and its sheet stamps, which only the room renders and no door forwards",
    "packages/client/src/features/chat/hooks/use-flank-presentation.ts": "FlankPresentation: the type of the presentation state the column renders",
  },
  "tests/client/features/preset/components/_macro-text-stories.tsx": {
    "packages/client/src/features/preset/components/macro-text.tsx":
      "MacroText: the preset surface's one template printer, which its two readouts import and no door forwards",
  },
  "tests/client/features/chat/components/chat-forks-and-duplicate.ct.tsx": {
    "packages/client/src/features/chat/lib/message-action-names.ts":
      "MESSAGE_ACTIONS_MENU_NAME and MESSAGE_DUPLICATE_NAME: the row menu trigger and the duplicate item the suite addresses",
  },
  "tests/client/features/chat/components/saved-replies-retry.ct.tsx": {
    "packages/client/src/features/chat/lib/message-action-names.ts": "MESSAGE_ACTIONS_MENU_NAME: the row menu trigger that opens the saved-replies door",
  },
  "tests/client/features/chat/components/_chat-forks-stories.tsx": {
    "packages/client/src/features/chat/components/settings-context-tab.tsx":
      "CommittedSettingsTab: the This-chat tab body, which only the chats section renders and no door forwards",
  },
  "tests/client/features/chat/components/message-reattribute-voice.ct.tsx": {
    "packages/client/src/features/chat/lib/message-action-names.ts": "the row menu trigger, both reattribute doors and the disabled reason the suite addresses",
  },
  "tests/client/features/chat/components/message-reasoning-and-move.ct.tsx": {
    "packages/client/src/features/chat/lib/message-action-names.ts": "the reasoning and move action names and refusal copy the suite addresses",
  },
  "tests/client/features/chat/components/platform-appearance-chat-style-picker.suite.ct.tsx": {
    "packages/client/src/features/chat/lib/message-row-variants.ts": "MESSAGE_ROW_SKINS: the production identity policy the picker diagram must represent",
  },
  "tests/client/features/chat/components/appearance-message-style-section.ct.tsx": {
    "packages/client/src/features/chat/lib/message-row-variants.ts": "MESSAGE_ROW_SKINS: the skin rows each chat style's diagram anatomy must represent",
    "packages/client/src/features/chat/lib/appearance-select-items.ts": "CHAT_STYLE_ITEMS: the label and gloss each picker cell prints",
    "packages/client/src/features/chat/lib/appearance-message-style-model.ts":
      "APPEARANCE_MESSAGE_STYLE_SUBCATEGORY: the section heading and the labels of its two switches",
  },
  "tests/client/features/workloads/components/platform-schedule-dialog-dismissal.suite.ct.tsx": {
    "packages/client/src/features/workloads/lib/workloads-schedule-model.ts":
      "SCHEDULE_CADENCE_LABELS: the production cadence names used to edit and reopen schedules",
  },
  "tests/client/features/refinery/components/platform-action-groups.suite.ct.tsx": {
    "packages/client/src/features/refinery/lib/reason-copy.ts": "DROP_REASON_COPY: production queue refusal text used by rendered action-group assertions",
  },
  "tests/client/features/discovery/lib/corpus-duplicate-groups.test.ts": {
    "packages/client/src/features/discovery/lib/corpus-duplicate-groups.ts": "groupIdenticalArt: the feature-private duplicate grouping",
  },
  "tests/client/features/discovery/lib/corpus-readiness-passes.int.test.ts": {
    "packages/client/src/features/discovery/lib/corpus-readiness-passes.ts":
      "enqueueReadinessPass and isReadinessRun: the feature-private per-pass doors the suite sends through the production start verb",
    "packages/client/src/features/discovery/lib/corpus-analysis-state.ts": "CORPUS_READINESS_STAGE_IDS: the rail's rows, one door each",
  },
  "tests/client/features/discovery/components/corpus-readiness-rail.ct.tsx": {
    "packages/client/src/features/discovery/lib/corpus-readiness-passes.ts":
      "READINESS_PASSES: the prerequisite, door and confirm words each readiness row prints",
  },
  "tests/client/features/discovery/lib/corpus-vocabulary.test.ts": {
    "packages/client/src/features/discovery/lib/corpus-vocabulary.ts": "distilledCensus: the feature-private census phrasing both Corpus bands print",
  },
  "tests/client/features/preset/lib/template-addresses.test.ts": {
    "packages/client/src/features/preset/lib/template-rows.ts": "templateGroups, templateRowById and templateStoredText: the feature-private template model",
  },
  "tests/client/features/config/lib/theme-css-warnings.test.ts": {
    "packages/client/src/features/config/lib/theme-css-warnings.ts":
      "themeCssHookWarnings: the feature-private stale-hook check over a planted surface and rename table",
    "packages/client/src/owner-css/renames.ts": "OWNER_CSS_RENAMES: the production rows the retired-attribute warning reads",
  },
  "tests/client/owner-css/rewrite.test.ts": {
    "packages/client/src/owner-css/rewrite.ts": "rewriteRenamedHooks: the rename rewrite over a planted table and the production one",
    "packages/client/src/owner-css/renames.ts": "OWNER_CSS_RENAMES: the production rows the retired-property rewrite reads",
  },
  "tests/client/owner-css-surface.repo.int.test.ts": {
    "packages/client/src/lib/appearance-carrier-manifest.ts": "APPEARANCE_CHANNEL_ROWS: the channel roster the generated surface must cover",
    "packages/client/src/owner-css/renames.ts": "OWNER_CSS_RENAMES: the production table the surface test reconciles against the generated surface",
  },
  "tests/client/lib/appearance-carrier-manifest.test.ts": {
    "packages/client/src/lib/appearance-carrier-manifest.ts":
      "the carrier manifest tables the suite reconciles; the lib door forwards only the owner keys production reads",
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, string>>>>;

interface MirrorRule {
  readonly name: string;
  readonly comment: string;
  readonly from: string;
  readonly fromNot?: string;
  readonly to: string;
  readonly toNot: readonly string[];
  readonly runtime: boolean;
}

function mirrorRule({ name, comment, from, fromNot, to, toNot, runtime }: MirrorRule, exempt: readonly string[] = []): IForbiddenRuleType {
  return {
    name,
    comment,
    severity: "error",
    from: { path: from, pathNot: [...(fromNot === undefined ? [] : [fromNot]), ...exempt] },
    to: { path: to, pathNot: [...toNot], ...(runtime ? { dependencyTypesNot: RUNTIME_ONLY } : {}) },
  };
}

// The rule for every suite of the tree but the listed ones, then one copy per listed suite with its named files
// admitted. Each copy needs its own name: `extends` merges forbidden rules by name, so a second rule of one name
// replaces the first.
function withListedCopies(pkg: string, rule: MirrorRule): IForbiddenRuleType[] {
  const listed = Object.entries(PACKAGE_TEST_REACHES).filter(([path]) => path.startsWith(`tests/${pkg}/`));
  return [
    mirrorRule(
      rule,
      listed.map(([path]) => `^${RegExp.escape(path)}$`),
    ),
    ...listed.map(([path, files]) =>
      mirrorRule({
        name: `${rule.name}-listed-${withoutExtension(path.replace(/^tests\/[^/]+\//u, "")).replaceAll("/", "-")}`,
        comment: rule.comment,
        from: `^${RegExp.escape(path)}$`,
        to: rule.to,
        toNot: [...rule.toNot, ...Object.keys(files).map((file) => `^${RegExp.escape(file)}$`)],
        runtime: rule.runtime,
      }),
    ),
  ];
}

function packageTestMirrorRules([pkg, packageCake]: readonly [string, string]): IForbiddenRuleType[] {
  const tree = `^tests/${pkg}/`;
  // The credential firewall (providers-public-surface-only) already holds every inference internal behind its door.
  const typeContracts = pkg !== "inference";
  return [
    ...withListedCopies(pkg, {
      name: `tests-${pkg}-mirror-cake`,
      comment: `A ${pkg} suite runs production only from the packages ${pkg} may import; other production reaches it through a testkit door.`,
      from: tree,
      to: SOURCE,
      toNot: [packageCake],
      runtime: true,
    }),
    ...withListedCopies(pkg, {
      name: `tests-${pkg}-front-doors-only`,
      comment: `A ${pkg} suite enters every package through a subpath its exports map declares.`,
      from: tree,
      ...(typeContracts ? { fromNot: TEST_TYPE_CONTRACT } : {}),
      to: SOURCE,
      toNot: [...PACKAGE_DOORS, ...TEST_CONSTANT_HOME_PATHS],
      runtime: false,
    }),
    ...(typeContracts && pkg !== "client"
      ? [
          mirrorRule({
            name: `tests-${pkg}-type-contracts-own-internals`,
            comment: `A ${pkg} type contract may name its own package's internal types; every other package enters through its door.`,
            from: `${tree}.*${TEST_TYPE_CONTRACT}`,
            to: SOURCE,
            toNot: [...PACKAGE_DOORS, `^packages/${pkg}/src/`],
            runtime: false,
          }),
        ]
      : []),
    ...(pkg === "client"
      ? [
          mirrorRule({
            name: "tests-client-mirror-own-feature",
            comment: "A feature suite or story runs only its own feature's door; another feature reaches it through the composed registries.",
            from: "^tests/client/features/([^/]+)/",
            to: `${CLIENT}features/`,
            toNot: [`${CLIENT}features/$1/`, ...TEST_CONSTANT_HOME_PATHS],
            runtime: true,
          }),
          mirrorRule({
            name: "tests-client-mirror-own-tier",
            comment: "A suite of a client tier below the features runs no feature door.",
            from: "^tests/client/(?!features/)[^/]+/",
            to: `${CLIENT}features/`,
            toNot: TEST_CONSTANT_HOME_PATHS,
            runtime: true,
          }),
          mirrorRule({
            name: "tests-client-tiers-no-feature-tests",
            comment:
              "A suite of a client tier below the features imports no feature's test files; a helper two worlds share goes through a tests/support door.",
            from: "^tests/client/(?!features/)[^/]+/",
            to: "^tests/client/features/",
            toNot: [],
            runtime: false,
          }),
          mirrorRule({
            name: "tests-client-features-own-test-helpers",
            comment: "A feature suite imports only its own feature's test files; a helper two features share goes through a tests/support door.",
            from: "^tests/client/features/([^/]+)/",
            to: "^tests/client/features/",
            toNot: ["^tests/client/features/$1/"],
            runtime: false,
          }),
          mirrorRule({
            name: "tests-client-type-contracts-own-internals",
            comment: "A type contract under a feature or tier directory may name that directory's internal types; every other module enters through its door.",
            from: `^tests/client/(features/[^/]+|(?!features/)[^/]+)/.*${TEST_TYPE_CONTRACT}`,
            to: SOURCE,
            toNot: [...PACKAGE_DOORS, `${CLIENT}$1/`],
            runtime: false,
          }),
          mirrorRule({
            name: "tests-client-type-contracts-tier-doors",
            comment: "A type contract directly under tests/client/ or tests/client/features/ names only door types.",
            from: `^tests/client/(?:features/)?[^/]+${TEST_TYPE_CONTRACT}`,
            to: SOURCE,
            toNot: PACKAGE_DOORS,
            runtime: false,
          }),
        ]
      : []),
  ];
}

const TEST_WORLDS = [
  {
    name: "testkit-corpus-playback-mint",
    comment: "Only admission, root capture and private playback lookup may execute the nominal playback authority.",
    severity: "error",
    from: {
      pathNot: ["^tests/support/iso/corpus-admission\\.ts$", "^tests/support/node/corpus-capture\\.ts$", "^tests/support/iso/corpus-read-responder\\.ts$"],
    },
    to: { path: "^tests/support/iso/corpus-playback\\.ts$", dependencyTypesNot: ["type-only", "type-import"] },
  },
  {
    name: "testkit-corpus-admission-owner",
    comment: "Raw corpus hydration is private to the ISO parser and Node fixture owner, not a suite-facing trust factory.",
    severity: "error",
    from: { pathNot: ["^tests/support/iso/corpus\\.ts$", "^tests/support/node/corpus\\.ts$"] },
    to: { path: "^tests/support/iso/corpus-admission\\.ts$", dependencyTypesNot: ["type-only", "type-import"] },
  },
  {
    name: "client-persisted-store-implementation",
    comment: "Persistence names enter through the typed factory (D321).",
    severity: "error",
    from: { pathNot: "^packages/client/src/state/create-persisted-store\\.ts$" },
    to: { path: "^packages/client/src/state/persisted-store-implementation\\.ts$" },
  },
  {
    name: "client-persisted-draft-implementation",
    comment: "Draft names enter through the typed factory (D321).",
    severity: "error",
    from: { pathNot: "^packages/client/src/state/create-entity-draft-store\\.ts$" },
    to: { path: "^packages/client/src/state/entity-draft-store-implementation\\.ts$" },
  },
  {
    name: "browser-tests-no-server-runtime",
    severity: "error",
    from: { path: BROWSER_TEST_PATHS, pathNot: BROWSER_TEST_FILES },
    to: { path: "^packages/server/", dependencyTypesNot: ["type-only"] },
  },
  {
    name: "node-tests-no-browser-helpers",
    comment:
      "This Node-rooted helper imports browser declarations. Keep root/server preparation here; move DOM/evaluate helpers to the existing browser/spec owner and call both from the CT spec. A Node test that reaches browser declarations through a testkit or listed test-side file is reported on that file by node-test-side-no-browser-helpers, not on the test.",
    severity: "error",
    from: { path: NODE_TEST_PATHS },
    to: { path: [TEST_BROWSER_SUPPORT, ...BROWSER_MOUNT_PATHS] },
  },
  {
    name: "node-test-side-no-browser-helpers",
    comment:
      "The reach half of node-tests-no-browser-helpers: the iso testkit world and the listed test-side files a Node test may import cannot reach browser declarations through any chain. The violation is reported on the file that starts the chain, not on the test that imports it.",
    severity: "error",
    from: { path: [TEST_ISO_WORLD, ...NODE_TEST_SIDE_PATHS] },
    to: { path: [TEST_BROWSER_SUPPORT, ...BROWSER_MOUNT_PATHS], reachable: true },
  },
  {
    name: "node-tests-closed-test-side-imports",
    comment:
      "The split of node-tests-no-browser-helpers reads each Node-world file's own imports only, so a Node-world file imports test-side and root files from the Node program, the iso testkit world, the browser rules' own targets, NODE_TEST_SIDE_FILES and ROOT_FILES_TESTS_LOAD alone. List a new file there with its reason, or reach it through a testkit door.",
    severity: "error",
    from: { path: NODE_TEST_PATHS },
    to: {
      path: [TEST_SIDE_TREES, ROOT_FILE],
      pathNot: [NODE_TEST_PATHS, TEST_ISO_WORLD, TEST_BROWSER_SUPPORT, ...BROWSER_MOUNT_PATHS, ...NODE_TEST_SIDE_PATHS, ...ROOT_FILE_PATHS],
      dependencyTypesNot: ["core"],
    },
  },
  {
    name: "browser-mounts-no-node-or-server",
    comment:
      "Type edges and wrappers also bring compiler dependencies into the browser program. A mount that reaches Node or server code through a listed browser-support or helper file is reported on that file by browser-mount-entries-no-node-or-server, not on the mount.",
    severity: "error",
    from: { path: BROWSER_MOUNT_PATHS, pathNot: BROWSER_TEST_FILES },
    to: { path: ["^tests/support/node/", NODE_BUILTINS, SRV] },
  },
  {
    name: "browser-mount-entries-no-node-or-server",
    comment:
      "The reach half of browser-mounts-no-node-or-server: the iso testkit world, the browser-support files and helpers a mount may import, and the browser packages' own root files cannot reach Node or server code through any chain. The violation is reported on the file that starts the chain, not on the mount that imports it.",
    severity: "error",
    from: { path: [TEST_ISO_WORLD, ...MOUNT_ENTRY_PATHS, ...Object.keys(BROWSER_PACKAGE_ROOT_FILES)] },
    to: { path: ["^tests/support/node/", NODE_BUILTINS, SRV], reachable: true },
  },
  {
    name: "browser-mounts-closed-imports",
    comment:
      "The split of browser-mounts-no-node-or-server reads each mount's own imports only, so a mount imports the iso testkit world, the source of the browser packages (client, ui, kit, contracts), MOUNT_SUPPORT_FILES and MOUNT_HELPER_FILES alone. List a new file there with its reason; Node and server targets stay with the rule above.",
    severity: "error",
    from: { path: BROWSER_MOUNT_PATHS, pathNot: BROWSER_TEST_FILES },
    to: {
      path: [TEST_SIDE_TREES, ROOT_FILE, "^packages/", "^tooling/"],
      pathNot: [TEST_ISO_WORLD, "^tests/support/node/", SRV, BROWSER_PACKAGE_SRC, ...MOUNT_ENTRY_PATHS],
      dependencyTypesNot: ["core"],
    },
  },
  {
    name: "browser-packages-src-closed",
    comment:
      "A mount's reach into the browser packages is judged by their direct rules (the cake, node-builtin and server rules), which hold only while their source imports no other file of its package than BROWSER_PACKAGE_ROOT_FILES.",
    severity: "error",
    from: { path: BROWSER_PACKAGE_SRC },
    to: { path: "^packages/(?:client|ui|kit|contracts)/(?!src/)", pathNot: Object.keys(BROWSER_PACKAGE_ROOT_FILES) },
  },
  {
    name: "test-helper-world-direction",
    comment:
      "A testkit file imports only its own world or a lower one. The reach is judged by browser-mount-entries-no-node-or-server (iso to Node support), node-test-side-no-browser-helpers (iso to browser support) and node-tests-no-browser-helpers (Node support is a Node-world file), so a chain is reported on the file that starts it.",
    severity: "error",
    from: { path: "^tests/support/(iso|node)/" },
    to: { path: "^tests/support/(node|browser)/", pathNot: "^tests/support/$1/" },
  },
  {
    name: "testkit-app-router-bridge",
    comment: "The server root exports only AppRouter; test helpers cannot execute the type bridge.",
    severity: "error",
    from: { path: "^tests/support/" },
    to: { path: SERVER_ROOT, dependencyTypesNot: ["type-only"] },
  },
  {
    name: "testkit-tooling-doors",
    severity: "error",
    from: { path: "^tests/support/" },
    to: { path: "^tooling/src/", pathNot: ["^tooling/src/[^/]+/index\\.ts$", "^tooling/src/floor/"] },
  },
  {
    name: "testkit-doors-only",
    comment: "Tests reach @orb/testkit through the doors its package.json exports; a deep path is a private helper.",
    severity: "error",
    from: { path: "^(tests|scripts|playwright)/", pathNot: "^tests/support/" },
    to: {
      path: "^tests/support/",
      pathNot: [
        "^tests/support/(iso|browser)/index\\.ts$",
        "^tests/support/browser/spec\\.ts$",
        "^tests/support/node/(index|auth|helpers|composed|ct|ct-corpus|tool-fixtures|composed-real)\\.ts$",
        "^tests/support/node/sdk-process-control\\.ts$",
        "^tests/support/node/factories/rows\\.ts$",
      ],
    },
  },
  {
    name: "playwright-runner-no-env-loader",
    comment:
      "The server env module loads the operator `.env` into the process that imports it, and the composed door loads that module. A runner-side file that reaches either puts the operator's secrets into the runner, its workers and every webServer started after it. Import Node helpers through @orb/testkit/node/helpers. This rule reads each file's own imports: a reachable rule would follow the helpers door's lazy imports of the server graph, so tests/e2e/support/runner-env.int.test.ts holds the transitive reach by collecting every spec under a canary `.env`.",
    severity: "error",
    from: { path: PLAYWRIGHT_RUNNER_FILES, pathNot: E2E_VITEST_SUITES },
    to: { path: ["^tests/support/node/composed\\.ts$", `${SRV}foundation/env/index\\.ts$`], dependencyTypesNot: ["type-only", "type-import"] },
  },
  {
    name: "e2e-no-client-lib-barrel",
    comment:
      "The node-side e2e transform loads the whole @orb/client/lib barrel, including its .tsx re-exports, so a spec or helper imports each name from its own module (#client/lib/<module>.ts) instead (.claude/rules/browser-tests.md).",
    severity: "error",
    from: { path: "^tests/e2e/" },
    to: { path: "^packages/client/src/lib/index\\.ts$" },
  },
  {
    name: "testkit-no-env-loader",
    comment:
      "The server env module loads the operator `.env` into every process that imports it, and the process seams import it, so testkit reaches the parsed record (foundation/env/record) instead. The two children exist to load that module in a process of their own. This rule reads each file's own imports: a reachable rule would follow the lazy loaders in the tooling doors, so tests/e2e/support/runner-env.int.test.ts holds the transitive reach by collecting both runners under a canary `.env`.",
    severity: "error",
    from: { path: "^tests/support/", pathNot: TESTKIT_ENV_LOADER_CHILDREN },
    to: { path: [`${SRV}foundation/env/index\\.ts$`, `${SRV}entry/compose/process-seams\\.ts$`], dependencyTypesNot: ["type-only", "type-import"] },
  },
  {
    name: "testkit-rows-persistence-only",
    comment: "Only persistence-tier tests insert rows directly; every other test seeds through the composed root's verbs.",
    severity: "error",
    from: { path: "^(tests|scripts|playwright)/", pathNot: ["^tests/support/", "^tests/db/", "^tests/.*/persistence/"] },
    to: { path: ROWS_TIER },
  },
  {
    name: "testkit-rows-closed-importers",
    comment: "Inside testkit only the closed list may import a row reader, so a door seed cannot hand a row to a verb suite.",
    severity: "error",
    from: { path: "^tests/support/", pathNot: ROWS_IMPORTERS },
    to: { path: ROWS_TIER },
  },
  {
    name: "testkit-persistence-helpers-own-tier",
    comment:
      "A helper under a persistence directory serves only its own tier; a historic state other suites need has one sanctioned home in testkit's factories.",
    severity: "error",
    from: { path: "^(tests|scripts|playwright)/", pathNot: ["^tests/support/", "^tests/db/", "^tests/.*/persistence/"] },
    to: { path: "^tests/.*/persistence/" },
  },
  ...serverTestMirrorRules(),
  ...Object.entries(CAKE).flatMap(packageTestMirrorRules),
  {
    name: "tooling-no-testkit",
    severity: "error",
    from: { path: "^tooling/" },
    to: { path: "^tests/support/" },
  },
] satisfies IForbiddenRuleType[];

const CLIENT_BOUNDARIES = [
  {
    name: "browser-and-iso-no-node-builtins",
    severity: "error",
    from: { path: [KIT, CONTRACTS, CLIENT, UI, "^tests/support/iso/"] },
    to: { dependencyTypes: ["core"] },
  },
  {
    name: "bus-contract-no-credentials",
    severity: "error",
    from: { path: `${CONTRACTS}(chat|user-bus|notifications|events|world-info|rpg|automation|workloads)/` },
    to: { path: `${CONTRACTS}credentials/` },
  },
  {
    name: "client-cake",
    severity: "error",
    from: { path: "^packages/client/" },
    to: { path: "^packages/", pathNot: [CAKE.client, SERVER_ROOT] },
  },
  {
    name: "client-no-backend-runtime",
    severity: "error",
    from: { path: "^packages/client/" },
    to: { path: ["^packages/server/", DB], dependencyTypesNot: ["type-only"] },
  },
  {
    name: "client-backend-types-only-through-trpc",
    comment: "data/trpc.ts owns the intentional server compiler dependency.",
    severity: "error",
    from: { path: "^packages/client/", pathNot: CLIENT_TRPC },
    to: { path: ["^packages/server/", DB], dependencyTypes: ["type-only"] },
  },
  {
    name: "client-trpc-type-target",
    comment: "The server root constrains the imported name; this rule constrains resolved paths and edge kinds.",
    severity: "error",
    from: { path: CLIENT_TRPC },
    to: { path: ["^packages/server/", DB], pathNot: SERVER_ROOT, dependencyTypes: ["type-only"] },
  },
  {
    name: "client-feature-front-door",
    comment: "Only styles/index.ts receives the shell stylesheet exception required by client-architecture-lockdown \u00A74.5.",
    severity: "error",
    from: { path: CLIENT, pathNot: [`${CLIENT}features/`, CLIENT_CSS_ENTRY] },
    to: {
      path: `${CLIENT}features/[^/]+/.+`,
      pathNot: `${CLIENT}features/[^/]+/index\\.ts$`,
    },
  },
  {
    name: "client-css-front-door-shell-only",
    comment: "Together with client-feature-front-door, only styles/index.ts can import the shell stylesheet.",
    severity: "error",
    from: { path: `${CLIENT}styles/` },
    to: {
      path: `${CLIENT}features/[^/]+/.+`,
      pathNot: CLIENT_SHELL_CSS,
      dependencyTypes: ["import"],
    },
  },
  {
    name: "client-features-no-cross",
    comment: "Cross-feature operations are injected; type-only composition shapes remain legal.",
    severity: "error",
    from: { path: `${CLIENT}features/([^/]+)/` },
    to: {
      path: `${CLIENT}features/([^/]+)/`,
      pathNot: `${CLIENT}features/$1/`,
      dependencyTypesNot: ["type-only"],
    },
  },
  {
    name: "confirm-uses-composite",
    severity: "error",
    from: { path: `${CLIENT}features/` },
    to: { path: "^packages/ui/src/primitives/alert-dialog/" },
  },
  {
    name: "client-tanstack-form-only-in-forms-editor",
    comment: "One createFormHook instance owns TanStack Form; every other form goes through the editor factories.",
    severity: "error",
    from: { path: CLIENT, pathNot: `${CLIENT}forms/editor/` },
    to: { path: "node_modules/@tanstack/(react-form|form-core)/" },
  },
  {
    name: "client-forms-editor-front-door",
    comment: "useAppForm and the bound fields stay behind forms/editor/index.ts, which exports the factories only.",
    severity: "error",
    from: { path: CLIENT, pathNot: `${CLIENT}forms/editor/` },
    to: { path: `${CLIENT}forms/editor/`, pathNot: `${CLIENT}forms/editor/index\\.ts$` },
  },
  {
    name: "view-transition-fence",
    severity: "error",
    from: {
      path: CLIENT,
      pathNot: [`${CLIENT}lib/index\\.ts$`, `${CLIENT}state/shell-store\\.ts$`],
    },
    to: { path: `${CLIENT}lib/view-transition\\.ts$` },
  },
  {
    name: "ui-class-merge-seal",
    comment: "A merger without the governed token groups silently drops custom-token classes.",
    severity: "error",
    from: {
      path: UI,
      pathNot: `${UI}lib/class-merge\\.ts$`,
    },
    to: { path: "node_modules/tailwind-merge/" },
  },
  {
    name: "ui-tailwind-variants-runtime-seal",
    comment: "The configured factory disables internal merging so the governed final merge runs exactly once.",
    severity: "error",
    from: {
      path: UI,
      pathNot: `${UI}lib/class-merge\\.ts$`,
    },
    to: {
      path: "node_modules/tailwind-variants/",
      dependencyTypesNot: ["type-only"],
    },
  },
  {
    name: "search-minisearch-seal",
    comment: "The lexical engine has one owner; vector verbs query the database instead.",
    severity: "error",
    from: {
      path: "^packages/server/",
      pathNot: "^packages/server/src/domain/search/substrate/field-index\\.ts$",
    },
    to: { path: "node_modules/minisearch/" },
  },
  {
    name: "ui-groups-independent",
    severity: "error",
    from: { path: `${UI}(layout|charts|markdown|stream|content|code-editor|diff|fuzzy-search)/` },
    to: {
      path: `${UI}(layout|charts|markdown|stream|content|code-editor|diff|fuzzy-search)/`,
      pathNot: `${UI}$1/`,
      dependencyTypesNot: ["type-only"],
    },
  },
  {
    name: "client-nothing-imports-main",
    comment: "Only the page's entry script (entry.ts, which loads main.tsx after the polyfills) imports the composition root.",
    severity: "error",
    from: { path: CLIENT, pathNot: `${CLIENT}(main\\.tsx|entry\\.ts)$` },
    to: { path: `${CLIENT}main\\.tsx$` },
  },
  {
    name: "client-composition-tier-door-only",
    comment: "A composition helper must not launder cross-feature runtime access into a lower tier.",
    severity: "error",
    from: { path: CLIENT, pathNot: [`${CLIENT}main\\.tsx$`, `${CLIENT}dev/`] },
    to: { path: `${CLIENT}dev/` },
  },
  {
    name: "client-compose-door-only",
    comment: "Browser test support mounts the production composition door; Node and isomorphic helpers do not.",
    severity: "error",
    from: { pathNot: [`${CLIENT}main\\.tsx$`, `${CLIENT}routes/router\\.tsx$`, `${CLIENT}compose/`, TEST_BROWSER_SUPPORT, TEST_TREES] },
    to: { path: `${CLIENT}compose/` },
  },
  {
    name: "tests-client-compose-door-only",
    comment: "A test reaches the composition door through browser test support, or reads a listed registry file for its definitions.",
    severity: "error",
    from: { path: TEST_TREES, pathNot: TEST_BROWSER_SUPPORT },
    to: { path: `${CLIENT}compose/`, pathNot: TEST_CONSTANT_HOME_PATHS },
  },
  {
    name: "plugin-ui-guest-worker-no-react",
    comment: "React refresh reads window at load; the guest Worker cannot reach React modules through any chain.",
    severity: "error",
    from: { path: `${CLIENT}features/plugin/lib/ui-guest/ui-guest\\.worker\\.ts$` },
    to: { path: [`${CLIENT}lib/index\\.ts$`, "\\.tsx$"], reachable: true },
  },
] satisfies IForbiddenRuleType[];

const SERVER_AUTHORITY = [
  {
    name: "process-env-composition-root-only",
    comment:
      "Importing foundation/env runs this process's env parse. Only the composition root reads it; every other site takes the parsed record (foundation/env/record) as a dependency.",
    severity: "error",
    from: {
      path: SRV,
      pathNot: [`${SRV}entry/(index|lifecycle)\\.ts$`, `${SRV}entry/compose/process-seams\\.ts$`],
    },
    to: { path: `${SRV}foundation/env/index\\.ts$`, dependencyTypesNot: ["type-only"] },
  },
  {
    name: "env-record-reads-no-host",
    comment:
      "The record parse takes the machine's container posture, its name and the secret-file reader as inputs, so a test root states every fact production reads. Only the process reader (foundation/env/index.ts) touches the file system, the OS or the process.",
    severity: "error",
    from: { path: `${SRV}foundation/env/record/index\\.ts$` },
    // `module` is listed because `createRequire` loads any host module past the static graph.
    to: { path: "^(node:)?(fs|fs/promises|os|process|child_process|module)$", reachable: true },
  },
  {
    name: "domain-no-host-io",
    comment:
      "A domain holds business logic; filesystem, network, process and host I/O is an infra/ adapter, and env or host facts come from foundation/ (Core-0-Architecture-and-Structure.md §3). `module` and `vm` load code past the static graph. A type from a host module stays legal.",
    severity: "error",
    from: { path: `${SRV}domain/` },
    to: {
      path: "^(node:)?(fs|fs/promises|net|http|https|http2|child_process|dgram|dns|dns/promises|tls|cluster|worker_threads|readline|readline/promises|module|vm|os|process|inspector|inspector/promises|sqlite)$",
      dependencyTypesNot: ["type-only"],
    },
  },
  {
    name: "domain-no-default-content",
    comment:
      "The composition root closes over the default-content readers and injects them, so seeders never learn where bytes come from (D160). A type the domain needs is declared in its own contract, so type-only imports are refused too.",
    severity: "error",
    from: { path: `${SRV}domain/` },
    to: { path: "^packages/default-content/" },
  },
  {
    name: "infra-no-db",
    comment: "Adapters receive database operations by injection rather than acquiring query authority.",
    severity: "error",
    from: { path: `${SRV}infra/` },
    to: { path: DB },
  },
  {
    name: "plugin-worker-no-db",
    comment: "Barrels can pull the database into every cold Worker boot; the backup-name matcher is a database-free leaf.",
    severity: "error",
    from: { path: `${SRV}infra/plugin-host/worker-runtime\\.ts$` },
    to: { path: DB, pathNot: `${DB}client/backup-names\\.ts$`, reachable: true },
  },
  {
    name: "local-light-worker-no-door",
    comment: "A front door widens the per-model Worker parse and heap footprint through re-exports.",
    severity: "error",
    from: { path: `${INFERENCE}backends/local-light/model-worker\\.ts$` },
    to: { path: [`${INFERENCE}index\\.ts$`, `${INFERENCE}.*/index\\.ts$`], reachable: true },
  },
  {
    name: "entry-wiring-no-query-capability",
    comment: "Composition receives inert database identities; raw query capabilities remain with physical boot and lower owners (D321).",
    severity: "error",
    from: { path: ENTRY_SOURCE, pathNot: ENTRY_DRIVER_PATTERN },
    to: {
      path: [DB, "(^|/)node_modules/(drizzle-orm|@libsql/client|libsql|better-sqlite3)(/|$)", "^node:sqlite$"],
      pathNot: [`${DB}client/(wiring|backup-names)\\.ts$`],
    },
  },
  {
    name: "entry-wiring-no-physical-driver",
    comment: "A helper or barrel cannot launder raw boot capabilities into composition.",
    severity: "error",
    from: { path: ENTRY_SOURCE, pathNot: ENTRY_DRIVER_PATTERN },
    to: { path: ENTRY_DRIVER_PATTERN },
  },
  {
    name: "host-module-loader-confined",
    comment:
      "createRequire loads any specifier at runtime, so it walks around every db door rule; only the resolve-only sites MODULE_LOADER_RESOLVERS names may import it (D335).",
    severity: "error",
    from: { path: [SRV, DB, INFERENCE], pathNot: Object.keys(MODULE_LOADER_RESOLVERS) },
    to: { path: "^(node:)?module$" },
  },
  {
    name: "query-wiring-owner-conversion",
    comment: "Only domain query owners, the audit writer, debug registrar and transport limiter recover executable query operands.",
    severity: "error",
    from: {
      path: SRV,
      pathNot: [`${SRV}domain/`, `${SRV}foundation/observability/(audit|debug/routes)\\.ts$`, `${SRV}transport/rate-limit\\.ts$`],
    },
    to: { path: `${DB}client/(?:wiring-owner/index|wiring-capabilities)\\.ts$` },
  },
  {
    name: "query-wiring-driver-admission",
    comment: "Wiring handles borrow physical connections; non-driver entry cannot mint or recover that capability.",
    severity: "error",
    from: { path: SRV, pathNot: ENTRY_DRIVER_PATTERN },
    to: { path: `${DB}client/wiring-driver\\.ts$` },
  },
  {
    name: "query-wiring-boot-admission",
    comment: "A request path holds only the plain handle; the cross-owner boot grant reaches the boot steps through these importers alone (D335).",
    severity: "error",
    from: { pathNot: Object.keys(BOOT_GRANT_IMPORTERS) },
    to: { path: `${DB}client/wiring-boot\\.ts$` },
  },
  {
    name: "query-wiring-capabilities-inside-db",
    comment:
      "The capability module also exports the boot mint, so code outside packages/db enters it only through the db doors, by any specifier or import() (D335).",
    severity: "error",
    from: { pathNot: DB },
    to: { path: `${DB}client/wiring-capabilities\\.ts$` },
  },
  {
    name: "query-wiring-contract-is-type-only",
    comment: "The inert wiring contract cannot publish executable owner conversions.",
    severity: "error",
    from: { path: `${DB}client/wiring\\.ts$` },
    to: { path: DB, dependencyTypesNot: ["type-only"] },
  },
  {
    name: "drivers-through-domain",
    comment: "Drivers call injected domain operations; the native database-backed limiter is the exact runtime exception.",
    severity: "error",
    from: { path: `${SRV}transport/`, pathNot: `${SRV}transport/rate-limit\\.ts$` },
    to: { path: [DB, `${SRV}infra/`], dependencyTypesNot: ["type-only"] },
  },
  {
    name: "job-drivers-domain-types-only",
    comment: "Job drivers receive their engine ops from the composition root and import only types from a domain front door (Tier-4 invariant 2).",
    severity: "error",
    from: { path: `${SRV}transport/jobs/` },
    to: { path: `${SRV}domain/`, dependencyTypesNot: ["type-only"] },
  },
  {
    name: "no-cross-driver",
    severity: "error",
    from: { path: `${SRV}transport/(trpc|jobs)/` },
    to: { path: `${SRV}transport/(trpc|jobs)/`, pathNot: `${SRV}transport/$1/` },
  },
] satisfies IForbiddenRuleType[];

const DOMAIN_AUTHORITY = [
  {
    name: "domain-no-cross-feature",
    comment: "No domain imports another (Core-0 §4); a cross-domain shape lives in packages/contracts or the consumer's contract/.",
    severity: "error",
    from: { path: `${SRV}domain/([^/]+)/` },
    to: {
      path: `${SRV}domain/([^/]+)/`,
      pathNot: [`${SRV}domain/$1/`, D117_WORKLOADS_DOOR],
    },
  },
  {
    name: "domain-workloads-door-types-only",
    comment: "D117: a domain imports the workloads door only for the WorkloadContribution type it registers through.",
    severity: "error",
    from: { path: `${SRV}domain/([^/]+)/`, pathNot: `${SRV}domain/workloads/` },
    to: { path: D117_WORKLOADS_DOOR, dependencyTypesNot: ["type-only"] },
  },
  {
    name: "domain-feature-front-door",
    severity: "error",
    from: { pathNot: [`${SRV}domain/`, TEST_TREES] },
    to: {
      path: `${SRV}domain/[^/]+/.+`,
      pathNot: `${SRV}domain/[^/]+/index\\.ts$`,
    },
  },
  {
    name: "tests-domain-front-door",
    comment: "A test enters a domain through its door, or reads a Spine-Testing §9 symbol from its listed owning file.",
    severity: "error",
    from: { path: TEST_TREES, pathNot: DOMAIN_TYPE_CONTRACT },
    to: {
      path: `${SRV}domain/[^/]+/.+`,
      pathNot: [`${SRV}domain/[^/]+/index\\.ts$`, ...TEST_CONSTANT_HOME_PATHS],
    },
  },
  {
    name: "tests-domain-type-contracts-own-internals",
    comment: "A .test-d.ts type contract may name its own domain's internal types; every other domain enters through its door.",
    severity: "error",
    from: { path: DOMAIN_TYPE_CONTRACT },
    to: {
      path: `${SRV}domain/[^/]+/.+`,
      pathNot: [`${SRV}domain/[^/]+/index\\.ts$`, `${SRV}domain/$1/`, ...TEST_CONSTANT_HOME_PATHS],
    },
  },
  {
    name: "domain-sibling-front-door",
    comment: "Type-only injected shapes also cross the public door; they do not admit sibling internals.",
    severity: "error",
    from: { path: `${SRV}domain/([^/]+)/` },
    to: {
      path: `${SRV}domain/([^/]+)/.+`,
      pathNot: [`${SRV}domain/$1/`, `${SRV}domain/[^/]+/index\\.ts$`],
    },
  },
  {
    name: "domain-no-cross-verb",
    comment: "Verb operations are injected at composition; group index modules are composition points.",
    severity: "error",
    from: { path: `${SRV}domain/([^/]+)/verbs/.+\\.ts$`, pathNot: "/index\\.ts$" },
    to: {
      path: `${SRV}domain/$1/verbs/.+\\.ts$`,
      pathNot: "/index\\.ts$",
      dependencyTypesNot: ["type-only"],
    },
  },
  {
    name: "domain-no-reach-up-into-verbs",
    severity: "error",
    from: { path: `${SRV}domain/([^/]+)/(?!verbs/)[^/]+/` },
    to: { path: `${SRV}domain/$1/verbs/`, dependencyTypesNot: ["type-only"] },
  },
  {
    name: "domain-substrate-mediates-subsystems",
    comment: "Root composition surfaces may assemble subsystems; verbs receive them through substrate injection.",
    severity: "error",
    from: {
      path: `${SRV}domain/([^/]+)/(verbs/)?[^/]+\\.ts$`,
      pathNot: `${SRV}domain/[^/]+/(service|index|context|workload-contributions)\\.ts$`,
    },
    to: {
      path: `${SRV}domain/([^/]+)/[^/]+/`,
      pathNot: [`${SRV}domain/$1/${FIXED_SLOTS}/`],
      dependencyTypesNot: ["type-only"],
    },
  },
  {
    name: "domain-teaching-contribution-compose-only",
    comment: "Teaching factories enter through domain front doors for registration at composition (D117).",
    severity: "error",
    from: { pathNot: `${SRV}domain/[^/]+/index\\.ts$` },
    to: { path: `${SRV}domain/[^/]+/teaching-contribution\\.ts$` },
  },
  {
    name: "role-data-private-decoder",
    comment: "Only the authorization kernel, projection owners and explicit SQL or wire boundaries decode opaque roles.",
    severity: "error",
    from: {
      pathNot:
        "^packages/server/src/(domain/admin/guard|domain/chat/(substrate/(member-visibility|participants-host)|persistence/role-encoding)|entry/http/auth-meta|transport/trpc/role-output)\\.ts$",
    },
    to: { path: "^packages/server/src/primitives/role-data/decode/index\\.ts$" },
  },
  {
    name: "role-data-private-registry",
    comment: "Only role capture and decoding may access the private role registry.",
    severity: "error",
    from: { pathNot: "^packages/server/src/primitives/role-data/(index|decode/index)\\.ts$" },
    to: { path: "^packages/server/src/primitives/role-data/registry\\.ts$" },
  },
  {
    name: "role-data-capture-owners",
    comment: "Actual row/input owners and closed SQL enumerators capture roles; capture does not mint authority.",
    severity: "error",
    from: {
      pathNot:
        "^packages/server/src/(domain/(admin/persistence/queries|automation/persistence/canon-reads|databank/persistence/scope|sessions/verbs/(validate|load-user-by-id|provision-identity)|chat/(persistence/(queries|participants-read)|verbs/(edit|read|participants)))|entry/(auth/seam|compose/chat))\\.ts$",
    },
    to: { path: "^packages/server/src/primitives/role-data/index\\.ts$" },
  },
  {
    name: "role-data-wire-output-owners",
    comment: "Role serialization belongs to transport output parsers, not domain unwrap APIs.",
    severity: "error",
    from: { pathNot: "^packages/server/src/transport/trpc/routers/(admin|chat|sessions|invites)\\.ts$" },
    to: { path: "^packages/server/src/transport/trpc/role-output\\.ts$" },
  },
  {
    name: "system-theme-writes-boot-only",
    comment: "Only the boot seeder receives ownerless palette write authority (D328).",
    severity: "error",
    from: { pathNot: `${SRV}domain/settings/seed-themes\\.ts$` },
    to: { path: `${SRV}domain/settings/persistence/system-themes\\.ts$` },
  },
  {
    name: "system-preset-writes-boot-only",
    comment: "Only the boot seeder receives ownerless default-preset write authority (D328).",
    severity: "error",
    from: { pathNot: `${SRV}domain/preset/seed\\.ts$` },
    to: { path: `${SRV}domain/preset/persistence/system-default\\.ts$` },
  },
  {
    name: "system-seed-writes-no-forwarding",
    comment: "Source-bearing exports cannot forward private seed writes (D328).",
    severity: "error",
    from: {},
    to: { path: `${SRV}domain/(settings/persistence/system-themes|preset/persistence/system-default)\\.ts$`, dependencyTypes: ["export"] },
  },
  {
    name: "principal-mint-owners",
    comment: "Only the request seam and frozen-host bridge mint Principal; barrels and re-exports cannot widen admission (D1/D40).",
    severity: "error",
    from: { pathNot: "^packages/server/src/entry/(auth/seam|compose/chat)\\.ts$" },
    to: { path: "^packages/server/src/entry/auth/principal-mint\\.ts$" },
  },
  {
    name: "chat-engine-authority-context",
    comment: "The turn engine receives frozen facts and bound ports, never request authority, even through type edges or barrels (D19).",
    severity: "error",
    from: { path: "^packages/server/src/domain/chat/engine/" },
    to: { path: "^packages/server/src/domain/chat/(context|contract/context|guard)\\.ts$", reachable: true },
  },
  {
    name: "domain-no-cross-subsystem",
    severity: "error",
    from: {
      path: `${SRV}domain/([^/]+)/([^/]+)/`,
      pathNot: [`${SRV}domain/[^/]+/${FIXED_SLOTS}/`],
    },
    to: {
      path: `${SRV}domain/([^/]+)/([^/]+)/`,
      pathNot: [`${SRV}domain/$1/$2/`, `${SRV}domain/[^/]+/${FIXED_SLOTS}/`],
      dependencyTypesNot: ["type-only"],
    },
  },
] satisfies IForbiddenRuleType[];

const EXECUTOR_BOUNDARIES = [
  {
    name: "providers-public-surface-only",
    comment: "Deep imports bypass the public inference surface and can expose credential-bearing backend internals.",
    severity: "error",
    from: { pathNot: [INFERENCE, "^tooling/", TEST_TREES] },
    to: {
      path: INFERENCE,
      pathNot: `${INFERENCE}index\\.ts$`,
    },
  },
  {
    name: "tests-providers-public-surface-only",
    comment: "A test enters inference through its public surface, or reads a listed Spine-Testing §9 symbol from its owning file.",
    severity: "error",
    from: { path: TEST_TREES },
    to: {
      path: INFERENCE,
      pathNot: [`${INFERENCE}index\\.ts$`, ...TEST_CONSTANT_HOME_PATHS],
    },
  },
  {
    name: "infra-strategy-isolation",
    comment: "Backends share only the explicit pure seams; sibling implementations remain private.",
    severity: "error",
    from: { path: `${INFERENCE}backends/([^/]+)/` },
    to: {
      path: `${INFERENCE}backends/([^/]+)/`,
      pathNot: [`${INFERENCE}backends/$1/`, `${INFERENCE}backends/(http|wire|v4)/`],
    },
  },
  {
    name: "credential-firewall-openrouter-not-agent-sdk",
    comment: "Hosted execution paths must not reach subscription credentials, including through shared helpers (D8).",
    severity: "error",
    from: {
      path: [`${INFERENCE}backends/([^/]+)/`, `${INFERENCE}(catalog|capability/sources/[^/]+)/openrouter\\.ts$`],
      pathNot: `${INFERENCE}backends/agent-sdk/`,
    },
    to: { path: `${INFERENCE}backends/agent-sdk/`, reachable: true },
  },
  {
    name: "persistence-no-io",
    comment: "Persistence cannot import Node built-ins; compiler and lint policies govern global operations such as fetch.",
    severity: "error",
    from: { path: `${SRV}domain/[^/]+/persistence/` },
    to: { dependencyTypes: ["core"] },
  },
  {
    name: "stats-no-vector-tables",
    severity: "error",
    from: { path: `${SRV}domain/stats/` },
    to: { path: `${DB}schema/embeddings` },
  },
] satisfies IForbiddenRuleType[];

const TOOLING_BOUNDARIES = [
  {
    name: "tooling-subprocess-import-owner",
    comment: "Tooling creates subprocesses through proc; direct raw imports and re-exports belong only to that owner.",
    severity: "error",
    from: { path: "^tooling/src/", pathNot: "^tooling/src/floor/process/proc\\.ts$" },
    to: {
      path: ["^(?:node:)?child_process$", "(?:^|/)node_modules/cross-spawn(?:/|$)"],
      dependencyTypesNot: ["type-only", "type-import"],
    },
  },
  {
    name: "packages-no-tooling",
    severity: "error",
    from: { path: "^packages/" },
    to: { path: "^tooling/" },
  },
  {
    name: "tooling-internal-direction",
    comment: "Tools consume sibling public doors; the shared floor remains directly accessible.",
    severity: "error",
    from: { path: "^tooling/src/([^/]+)/" },
    to: {
      path: "^tooling/src/([^/]+)/",
      pathNot: ["^tooling/src/$1/", "^tooling/src/[^/]+/index\\.ts$", "^tooling/src/floor/"],
    },
  },
  {
    name: "tooling-cli-via-index",
    comment: "CLI dispatch consumes its own public API rather than coupling argv handling to internals.",
    severity: "error",
    from: { path: "^tooling/src/([^/]+)/cli\\.ts$" },
    to: { path: "^tooling/src/$1/", pathNot: "^tooling/src/$1/index\\.ts$" },
  },
  {
    name: "tooling-shared-floor",
    severity: "error",
    from: { path: "^tooling/src/floor/" },
    to: { path: "^tooling/src/", pathNot: "^tooling/src/floor/" },
  },
  {
    name: "tooling-no-provider-families",
    comment: "Tools may inspect inference public APIs, not credential-bearing backend or contract internals.",
    severity: "error",
    from: { path: "^tooling/" },
    to: {
      path: `${INFERENCE}(backends|contract)/`,
      pathNot: `${INFERENCE}contract/index\\.ts$`,
    },
  },
  {
    name: "package-subpath-crossing",
    comment: "A narrow leaf exception avoids a barrel that would violate another bounded graph.",
    severity: "error",
    from: { path: SUBPATH_IMPORTER, pathNot: SUBPATH_LEAF_IMPORTERS },
    to: { dependencyTypes: ["aliased-subpath-import"], path: SUBPATH_INTERNALS, pathNot: ["^$1/", "/index\\.ts$"] },
  },
  {
    name: "package-parent-climb",
    comment:
      "Inside a package's src, a relative import climbs at most one directory; a deeper target is named by `#src/` or its module's front door (Core-0 §1). `$1` is the src root and `$1$2` the importer's grandparent directory, so a target outside src is outside the rule.",
    severity: "error",
    from: { path: "^(packages/[^/]+/src/)(.*/|)[^/]+/[^/]+$" },
    to: { dependencyTypes: ["local"], dependencyTypesNot: ["aliased-subpath-import"], path: "^$1", pathNot: "^$1$2" },
  },
] satisfies IForbiddenRuleType[];

const HYGIENE = [
  {
    name: "not-to-test",
    comment:
      "Covers every file of a package or of tooling, and the root files a test loads, because the test rules read a test's own imports and rely on no production file reaching test code.",
    severity: "error",
    from: { path: ["^packages/", "^tooling/", ...ROOT_FILE_PATHS] },
    to: { path: [TEST_SIDE_TREES, TEST_FILES] },
  },
  {
    name: "not-to-unresolvable",
    comment:
      "Vite emits this exact WASM asset request as a URL; the client build verifies the emitted binary. `codemod:*` modules exist only inside the codemod CLI sandbox; `codemod jssg test` verifies them.",
    severity: "error",
    from: {},
    to: { couldNotResolve: true, pathNot: ["^@jitl/quickjs-ng-wasmfile-release-sync/wasm\\?url$", "^codemod:"] },
  },
  {
    name: "no-duplicate-dep-types",
    comment: "Peer+dev supplies local checks without bundling the consumer runtime; extra runtime declarations remain duplicates.",
    severity: "error",
    from: {},
    to: {
      moreThanOneDependencyType: true,
      dependencyTypes: ["npm", "npm-optional", "npm-bundled"],
      dependencyTypesNot: ["type-only"],
    },
  },
  {
    name: "not-to-dev-dep",
    comment: "Ambient declarations emit no runtime; peer+dev dependencies receive their runtime from the consumer.",
    severity: "error",
    from: { path: "^packages/[^/]+/src/", pathNot: [TEST_FILES, "\\.d\\.ts$"] },
    to: {
      dependencyTypes: ["npm-dev"],
      dependencyTypesNot: ["type-only", "npm-peer"],
      pathNot: ["node_modules/@types/"],
    },
  },
  {
    name: "no-orphans",
    comment: "Knip owns full liveness; showcase guest entries are consumed as source bytes by compilePluginDirectory.",
    severity: "warn",
    from: {
      path: "^(?:packages|tooling)/",
      orphan: true,
      pathNot: ["\\.d\\.ts$", "(^|/)index\\.ts$", "^packages/showcase-plugins/bundles/[^/]+/(main|ui|frame)\\.ts$"],
    },
    to: {},
  },
] satisfies IForbiddenRuleType[];

const config = {
  extends: "dependency-cruiser/configs/recommended-strict",
  forbidden: [
    ...TEST_WORLDS,
    ...PACKAGE_DIRECTION,
    ...LAYER_DIRECTION,
    ...CLIENT_BOUNDARIES,
    ...UI_SATELLITE_OWNERS,
    ...SERVER_AUTHORITY,
    ...DOMAIN_AUTHORITY,
    ...EXECUTOR_BOUNDARIES,
    ...TOOLING_BOUNDARIES,
    ...HYGIENE,
  ],
  options: {
    // Native caches do not invalidate dependency manifests or installed package resolution.
    cache: false,
    tsPreCompilationDeps: true,
    detectImportsInAmbientModules: true,
    // Current cycle, orphan and reachability rules still require those analyses.
    skipAnalysisNotInRules: true,
    // Host builtin lookups acquire the same capability as an import.
    detectProcessBuiltinModuleCalls: true,
    // The source is ESM with CJS only in spawned helper strings; no AMD exists, and the native compiler drops it.
    moduleSystems: ["es6", "cjs"],
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".json"],
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
    // TypeScript owns declaration-relative resolution; retain the public bridge edge only.
    doNotFollow: { path: ["node_modules", SERVER_ROOT] },
    exclude: {
      path: [
        "^packages/[^/]+/dist/(?!router-types/packages/server/src/index\\.d\\.ts$)",
        "^playwright/\\.cache/",
        "^tooling/src/snap/lib/devtools-frontend/",
        "^tooling/src/codemods/[^/]+/tests[^/]*/",
      ],
    },
  },
} satisfies IConfiguration;

export default config;
