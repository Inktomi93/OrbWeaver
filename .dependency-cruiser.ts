import { builtinModules } from "node:module";
import type { IConfiguration, IForbiddenRuleType } from "dependency-cruiser";
import { BROWSER_TEST_SUFFIXES, TEST_KIND_DEFINITIONS, TEST_KIND_SUFFIXES } from "./tooling/src/floor/testing/test-kinds.ts";

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
const GROUPING_DIRS = {
  server: ["entry", "transport", "domain", "infra", "foundation", "primitives"],
  inference: ["backends"],
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
const CLIENT_TRPC = `${CLIENT}data/trpc\\.ts$`;
const SERVER_ROOT = "^packages/server/dist/router-types/packages/server/src/index\\.d\\.ts$";
const INFERENCE = "^packages/inference/src/";
const TEST_FILES = `(?:${TEST_KIND_SUFFIXES.map((suffix) => suffix.replaceAll(".", "\\.")).join("|")})$`;
const TEST_BROWSER_SUPPORT = "^tests/support/browser/";
const BROWSER_MOUNT_PATHS = ["^playwright/", "^(tests|scripts)/(?!support/(iso|node)/).*\\.tsx$"];
const BROWSER_TEST_PATHS = [TEST_BROWSER_SUPPORT, ...BROWSER_MOUNT_PATHS];
const BROWSER_TEST_FILES = `(?:${BROWSER_TEST_SUFFIXES.map((suffix) => suffix.replaceAll(".", "\\.")).join("|")})$`;
const NODE_TEST_PATHS = TEST_KIND_DEFINITIONS.filter(({ compilerWorld }) => compilerWorld === "node").map(
  ({ suffix }) => `^(tests|scripts)/.*${suffix.replaceAll(".", "\\.")}$`,
);
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
  "packages/server/src/infra/network/egress.ts",
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
].map((path) => `^${path.replaceAll(".", "\\.")}$`);

const PACKAGE_DIRECTION = [
  { name: "kit-purity", from: "^packages/kit/", allowed: "^packages/kit/" },
  { name: "contracts-cake", from: "^packages/contracts/", allowed: "^packages/(contracts|kit)/" },
  { name: "db-cake", from: "^packages/db/", allowed: "^packages/(db|contracts|kit)/" },
  { name: "inference-cake", from: "^packages/inference/", allowed: "^packages/(inference|contracts|kit)/" },
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

const TEST_WORLDS = [
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
    severity: "error",
    from: { path: NODE_TEST_PATHS, pathNot: BROWSER_TEST_FILES },
    to: { path: [TEST_BROWSER_SUPPORT, ...BROWSER_MOUNT_PATHS], reachable: true },
  },
  {
    name: "browser-mounts-no-node-or-server",
    comment: "Type edges and wrappers also bring compiler dependencies into the browser program.",
    severity: "error",
    from: { path: BROWSER_MOUNT_PATHS, pathNot: BROWSER_TEST_FILES },
    to: { path: ["^tests/support/node/", NODE_BUILTINS, SRV], reachable: true },
  },
  {
    name: "test-helper-world-direction",
    severity: "error",
    from: { path: "^tests/support/(iso|node)/" },
    to: { path: "^tests/support/(node|browser)/", pathNot: "^tests/support/$1/", reachable: true },
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
    to: { path: "^packages/", pathNot: ["^packages/(client|contracts|kit|ui)/", SERVER_ROOT] },
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
    severity: "error",
    from: { path: CLIENT, pathNot: `${CLIENT}main\\.tsx$` },
    to: { path: `${CLIENT}main\\.tsx$` },
  },
  {
    name: "client-composition-tier-door-only",
    comment: "A composition helper must not launder cross-feature runtime access into a lower tier.",
    severity: "error",
    from: { path: CLIENT, pathNot: [`${CLIENT}main\\.tsx$`, `${CLIENT}(agent-handles|agent-nav|agent-plugin|agent-rpg|agent-seed)/`] },
    to: { path: `${CLIENT}(agent-handles|agent-nav|agent-plugin|agent-rpg|agent-seed)/` },
  },
  {
    name: "client-compose-door-only",
    comment: "Browser test support mounts the production composition door; Node and isomorphic helpers do not.",
    severity: "error",
    from: { pathNot: [`${CLIENT}main\\.tsx$`, `${CLIENT}routes/router\\.tsx$`, `${CLIENT}compose/`, TEST_BROWSER_SUPPORT] },
    to: { path: `${CLIENT}compose/` },
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
      pathNot: [`${SRV}entry/(index|lifecycle)\\.ts$`, `${SRV}entry/compose/process-seams\\.ts$`, `${SRV}foundation/observability/logger\\.ts$`],
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
    name: "entry-wiring-no-module-loader",
    comment: "Host loaders bypass the resolved query frontier; physical boot owns the migrations resolver.",
    severity: "error",
    from: { path: ENTRY_SOURCE, pathNot: ENTRY_DRIVER_PATTERN },
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
    to: { path: `${DB}client/wiring-capabilities\\.ts$` },
  },
  {
    name: "query-wiring-driver-admission",
    comment: "Wiring handles borrow physical connections; non-driver entry cannot mint or recover that capability.",
    severity: "error",
    from: { path: SRV, pathNot: ENTRY_DRIVER_PATTERN },
    to: { path: `${DB}client/wiring-driver\\.ts$` },
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
    severity: "error",
    from: { path: `${SRV}domain/([^/]+)/` },
    to: {
      path: `${SRV}domain/([^/]+)/`,
      pathNot: `${SRV}domain/$1/`,
      dependencyTypesNot: ["type-only"],
    },
  },
  {
    name: "domain-feature-front-door",
    severity: "error",
    from: { pathNot: `${SRV}domain/` },
    to: {
      path: `${SRV}domain/[^/]+/.+`,
      pathNot: `${SRV}domain/[^/]+/index\\.ts$`,
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
    from: { pathNot: [INFERENCE, "^tooling/"] },
    to: {
      path: INFERENCE,
      pathNot: `${INFERENCE}index\\.ts$`,
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
] satisfies IForbiddenRuleType[];

const HYGIENE = [
  {
    name: "not-to-test",
    severity: "error",
    from: { path: ["^packages/[^/]+/src/", "^tooling/src/"] },
    to: { path: ["^tests/", TEST_FILES] },
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
