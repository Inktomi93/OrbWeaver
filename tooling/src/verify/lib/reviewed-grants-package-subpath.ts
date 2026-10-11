// Reviewed grants: package-subpath-crossing — the importers that keep a narrow leaf import across modules.
// Each one sits where a front-door barrel would widen a graph another check bounds: a plugin worker's (dep-cruiser
// proves it) or a DOM-free compiler world's (tsc proves it). `pnpm codemod deep-imports` takes the same list.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

const WORKER_DB =
  "the plugin guest Worker's graph must not reach @orb/db (dep-cruiser `plugin-worker-no-db`); the `#foundation/observability` barrel re-exports `audit.ts`, which imports @orb/db, so this worker-graph file imports the narrow leaf.";
const WORKER_REACT =
  "the plugin UI guest Worker has no window (dep-cruiser `plugin-ui-guest-worker-no-react`); the `#lib` barrel re-exports React modules, so this worker-graph file imports the wire leaf.";
const NODE_WORLD = "a DOM-free node test program (tsconfig.json) compiles this file; the `#lib` barrel re-exports DOM modules, so it imports the narrow leaf.";
const DOOR_SPLIT = "the module's door splits into a DOM-free (or DB-free) door and the full one, or the importer leaves that graph.";

const DEV_LEAVES =
  "the `#lib` barrel deliberately omits the dev instrumentation leaves this capture reads (agent bridge, console ring, appearance registry); re-exporting them would load DOM dev modules in every `#lib` consumer and break the DOM-free node test program (tsconfig.json).";
const ICON_WORLD =
  "the icons module is compiled by the DOM-free node test program (tsconfig.json); the `#art/web-weave` barrel re-exports the canvas renderer, so the glyph geometry is imported from its leaf.";

const BROKER_PERMISSION =
  "the plugin broker process runs under the Node permission model with no read grant outside its roots; the `#foundation/env` barrel parses the environment at load and probes the container marker files, which the broker may not read, so this broker-graph file imports the marker list from its leaf.";

const LOCAL_LIGHT_WORKER =
  "the local-light model Worker loads this file for every model it holds (dep-cruiser `local-light-worker-no-door`); the `#contract` barrel re-exports the whole inference contract and tripled the Worker's module graph, so the value import names its leaf.";
const REGISTRY_LEAF =
  "the appearance message registry is a dev leaf the `#lib` barrel deliberately omits (`lib/appearance-message-registry.ts` header: it does not enter the client barrel); re-exporting it would load it for every `#lib` consumer.";

export const REVIEWED_GRANTS_PACKAGE_SUBPATH: readonly ReviewedGateGrant[] = [
  {
    id: "package-subpath-crossing:chat-message-row",
    policyId: "package-subpath-crossing",
    subject: "packages/client/src/features/chat/components/message-row.tsx",
    operation: "cross-module-subpath:lib",
    why: REGISTRY_LEAF,
    endsWhen: "the appearance registry gains its own dev-only door, or message-row stops reading it.",
  },
  {
    id: "package-subpath-crossing:local-light-model-cache",
    policyId: "package-subpath-crossing",
    subject: "packages/inference/src/backends/local-light/model-cache.ts",
    operation: "cross-module-subpath:contract",
    why: LOCAL_LIGHT_WORKER,
    endsWhen: "the inference contract gains a narrow errors-and-worker-protocol door the Worker graph can enter, or this file leaves the Worker graph.",
  },
  {
    id: "package-subpath-crossing:local-light-model-worker",
    policyId: "package-subpath-crossing",
    subject: "packages/inference/src/backends/local-light/model-worker.ts",
    operation: "cross-module-subpath:contract",
    why: LOCAL_LIGHT_WORKER,
    endsWhen: "the inference contract gains a narrow errors-and-worker-protocol door the Worker graph can enter, or this file leaves the Worker graph.",
  },
  {
    id: "package-subpath-crossing:local-light-st-head",
    policyId: "package-subpath-crossing",
    subject: "packages/inference/src/backends/local-light/st-head.ts",
    operation: "cross-module-subpath:contract",
    why: LOCAL_LIGHT_WORKER,
    endsWhen: "the inference contract gains a narrow errors-and-worker-protocol door the Worker graph can enter, or this file leaves the Worker graph.",
  },
  {
    id: "package-subpath-crossing:local-light-text-windows",
    policyId: "package-subpath-crossing",
    subject: "packages/inference/src/backends/local-light/text-windows.ts",
    operation: "cross-module-subpath:contract",
    why: LOCAL_LIGHT_WORKER,
    endsWhen: "the inference contract gains a narrow errors-and-worker-protocol door the Worker graph can enter, or this file leaves the Worker graph.",
  },
  {
    id: "package-subpath-crossing:local-light-worker-cache",
    policyId: "package-subpath-crossing",
    subject: "packages/inference/src/backends/local-light/worker-cache.ts",
    operation: "cross-module-subpath:contract",
    why: LOCAL_LIGHT_WORKER,
    endsWhen: "the inference contract gains a narrow errors-and-worker-protocol door the Worker graph can enter, or this file leaves the Worker graph.",
  },
  {
    id: "package-subpath-crossing:plugin-host-process-permission",
    policyId: "package-subpath-crossing",
    subject: "packages/server/src/infra/plugin-host/process-permission.ts",
    operation: "cross-module-subpath:foundation/env",
    why: BROKER_PERMISSION,
    endsWhen: DOOR_SPLIT,
  },
  {
    id: "package-subpath-crossing:app-shell-bug-report-capture",
    policyId: "package-subpath-crossing",
    subject: "packages/client/src/features/app-shell/lib/bug-report-capture.ts",
    operation: "cross-module-subpath:lib",
    why: DEV_LEAVES,
    endsWhen: DOOR_SPLIT,
  },
  {
    id: "package-subpath-crossing:icons-orb-web",
    policyId: "package-subpath-crossing",
    subject: "packages/ui/src/primitives/icons/orb-web.ts",
    operation: "cross-module-subpath:art/web-weave",
    why: ICON_WORLD,
    endsWhen: DOOR_SPLIT,
  },
  {
    id: "package-subpath-crossing:chat-message-render-context",
    policyId: "package-subpath-crossing",
    subject: "packages/client/src/features/chat/lib/message-render-context.ts",
    operation: "cross-module-subpath:lib",
    why: NODE_WORLD,
    endsWhen: DOOR_SPLIT,
  },
  {
    id: "package-subpath-crossing:credentials-connection-editor-model",
    policyId: "package-subpath-crossing",
    subject: "packages/client/src/features/credentials/lib/connection-editor-model.ts",
    operation: "cross-module-subpath:lib",
    why: NODE_WORLD,
    endsWhen: DOOR_SPLIT,
  },
  {
    id: "package-subpath-crossing:credentials-connections-model",
    policyId: "package-subpath-crossing",
    subject: "packages/client/src/features/credentials/lib/connections-model.ts",
    operation: "cross-module-subpath:lib",
    why: NODE_WORLD,
    endsWhen: DOOR_SPLIT,
  },
  {
    id: "package-subpath-crossing:plugin-ui-guest-realm",
    policyId: "package-subpath-crossing",
    subject: "packages/client/src/features/plugin/lib/ui-guest/ui-guest-realm.ts",
    operation: "cross-module-subpath:lib",
    why: WORKER_REACT,
    endsWhen: DOOR_SPLIT,
  },
  {
    id: "package-subpath-crossing:plugin-ui-guest-worker",
    policyId: "package-subpath-crossing",
    subject: "packages/client/src/features/plugin/lib/ui-guest/ui-guest.worker.ts",
    operation: "cross-module-subpath:lib",
    why: WORKER_REACT,
    endsWhen: DOOR_SPLIT,
  },
  {
    id: "package-subpath-crossing:network-egress",
    policyId: "package-subpath-crossing",
    subject: "packages/server/src/infra/network/egress.ts",
    operation: "cross-module-subpath:foundation/observability",
    why: WORKER_DB,
    endsWhen: DOOR_SPLIT,
  },
  {
    id: "package-subpath-crossing:plugin-host-membrane",
    policyId: "package-subpath-crossing",
    subject: "packages/server/src/infra/plugin-host/membrane.ts",
    operation: "cross-module-subpath:foundation/observability",
    why: WORKER_DB,
    endsWhen: DOOR_SPLIT,
  },
  {
    id: "package-subpath-crossing:plugin-host-port",
    policyId: "package-subpath-crossing",
    subject: "packages/server/src/infra/plugin-host/port.ts",
    operation: "cross-module-subpath:foundation/observability",
    why: WORKER_DB,
    endsWhen: DOOR_SPLIT,
  },
];
