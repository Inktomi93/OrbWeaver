// Members with no production caller on purpose: an external caller reaches them. The scan reports these apart
// from the unwired members, each with its reason. `member: null` covers every member of the home, and a
// `directory` entry covers every home of every file under it.

/** One home's members, or with `member: null` all of them; or every home under a `directory`. */
export type DeliberateEntry =
  | { readonly file: string; readonly home: string; readonly member: string | null; readonly reason: string }
  | { readonly directory: string; readonly reason: string };

const AGENT_BRIDGE = "the dev-only `globalThis.__orb` agent bridge: Playwright, snap and browser-driving agents call it, never product code";
const SETTLE_SIGNAL = "docs/law/Spine-Testing.md: a suite waits on the composed root's actual settle signal, never a delay";
const PUBLISHED_API = "D266: the published plugin SDK surface; guest plugins outside the tree read and write it";
const DORMANT_AGENTS = "D60: the design of record for agent principals; the admin view carries an agent's kind and owner for that rebuild";
const KIND_PER_USE = "D350: the asset list carries every kind an asset is used as";

export const DELIBERATE: readonly DeliberateEntry[] = [
  { directory: "packages/contracts/src/plugin/", reason: PUBLISHED_API },
  { directory: "packages/plugin-sdk/", reason: PUBLISHED_API },
  { file: "packages/contracts/src/automation/index.ts", home: "triggerFactPayloadSchema", member: null, reason: PUBLISHED_API },
  { file: "packages/contracts/src/identity/index.ts", home: "AdminUserView", member: "kind", reason: DORMANT_AGENTS },
  { file: "packages/contracts/src/identity/index.ts", home: "AdminUserView", member: "ownerHandle", reason: DORMANT_AGENTS },
  { file: "packages/contracts/src/assets/index.ts", home: "AssetListItem", member: "kinds", reason: KIND_PER_USE },
  { file: "packages/client/src/lib/theme-fallback-ring.ts", home: "ThemeFallbackRing", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/motion-stats.ts", home: "MotionSnapshot", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/motion-dead-class-flagger.ts", home: "MotionFlaggerDrainReceipt", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/motion-flaggers.ts", home: "MotionFlagRecord", member: null, reason: AGENT_BRIDGE },
  { file: "packages/ui/src/lib/css-merge-contract.ts", home: "CssMergeReceipt", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-bridge.ts", home: "OrbDebugHandle", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "OrbNavHandle", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "OrbSeedHandle", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "OrbCssHandle", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "OrbAgentHandles", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "SEED_PROFILES", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-plugin-bridge.ts", home: "OrbPluginLogLine", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-plugin-bridge.ts", home: "OrbPluginPublication", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-plugin-bridge.ts", home: "OrbPluginUiHost", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-plugin-bridge.ts", home: "OrbPluginUiSurface", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-plugin-bridge.ts", home: "OrbPluginUiCommand", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-plugin-bridge.ts", home: "OrbPluginUiEntry", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-plugin-bridge.ts", home: "OrbPluginUiSnapshot", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-bridge-appearance.ts", home: "AppearanceMessageRegistryReceipt", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-bridge-appearance.ts", home: "AppearanceMatrixBridgeContract", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "QuerySummary", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "ShellSnapshot", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "OrbNavCapabilities", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "OrbRpgSnapshot", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-bridge.ts", home: "OrbRingMetadata", member: null, reason: AGENT_BRIDGE },
  { file: "packages/server/src/entry/compose/services.ts", home: "ServicesResult", member: "settleBackground", reason: SETTLE_SIGNAL },
  { file: "packages/server/src/domain/share/contract/composition.ts", home: "ShareGraph", member: "settle", reason: SETTLE_SIGNAL },
];

/** The entry that excuses `member` of `home` in `file`, if any. */
export function deliberateEntry(entries: readonly DeliberateEntry[], file: string, home: string, member: string): DeliberateEntry | null {
  return (
    entries.find((entry) =>
      "directory" in entry
        ? file.startsWith(entry.directory)
        : entry.file === file && entry.home === home && (entry.member === null || entry.member === member),
    ) ?? null
  );
}
