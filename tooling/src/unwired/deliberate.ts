// Members with no production caller on purpose: an external caller reaches them. Every scan reports these apart
// from the unwired members, each with its reason, through sortDeliberate. `member: null` covers every member of the home, and a
// `directory` entry covers every home of every file under it.
import type { JudgedEntry, JudgedSplit } from "./judged.ts";
import { sortJudged } from "./judged.ts";

/** One home's members, or with `member: null` all of them; or every home under a `directory`. */
export type DeliberateEntry =
  | { readonly file: string; readonly home: string; readonly member: string | null; readonly reason: string }
  | { readonly directory: string; readonly reason: string };

const AGENT_BRIDGE = "the dev-only `globalThis.__orb` agent bridge: Playwright, snap and browser-driving agents call it, never product code";
const SETTLE_SIGNAL = "docs/law/Spine-Testing.md: a suite waits on the composed root's actual settle signal, never a delay";
const PUBLISHED_API = "D266: the published plugin SDK surface; guest plugins outside the tree read and write it";
const DORMANT_AGENTS = "D60: the design of record for agent principals; the admin view carries an agent's kind and owner for that rebuild";
const KIND_PER_USE = "D350: the asset list carries every kind an asset is used as";
const RAW_KV_INSERT =
  "packages/server/src/domain/plugin/persistence/plugin-kv.ts creates a row only through one raw INSERT … SELECT, so the per-plugin key cap rides the write as a subquery (.claude/rules/db.md, Writes); raw SQL text is no column site";
const ROSTER_PRESET_OPS =
  "an op type that `domain/roster-preset` (and for `AddCharacterToChatOp` `domain/rpg`) is injected with names it in its signature, so it stays in `@orb/contracts` rather than a domain `contract/params.ts`";
const STATED_REASON = "D107: a declared field is wired or cites its reason, and this one is where its registry row states that reason";
const CONTENT_CLASS_PAIR =
  ".claude/rules/chat.md: the content-class policy table and its dispatch in spanToWirePart are edited together, and `wire` is the table's side of that pair";

export const DELIBERATE: readonly DeliberateEntry[] = [
  { directory: "packages/contracts/src/plugin/", reason: PUBLISHED_API },
  { directory: "packages/plugin-sdk/", reason: PUBLISHED_API },
  { file: "packages/contracts/src/automation/index.ts", home: "triggerFactPayloadSchema", member: null, reason: PUBLISHED_API },
  { file: "packages/contracts/src/automation/index.ts", home: "ListRulesParams", member: null, reason: `ListRulesOp is ${ROSTER_PRESET_OPS}` },
  { file: "packages/contracts/src/automation/index.ts", home: "DeleteRuleParams", member: null, reason: `DeleteRuleOp is ${ROSTER_PRESET_OPS}` },
  { file: "packages/contracts/src/chat/seat-ops.ts", home: "AddCharacterToChatParams", member: null, reason: `AddCharacterToChatOp is ${ROSTER_PRESET_OPS}` },
  {
    file: "packages/contracts/src/chat/owner-ops.ts",
    home: "ChatScopedParams",
    member: null,
    reason: `the base of SetGroupConfigParams, AddCharacterToChatParams and SetSeatKnobsParams, whose ops are ${ROSTER_PRESET_OPS}`,
  },
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
  { file: "packages/db/src/schema/plugin.ts", home: "pluginKv", member: "pluginId", reason: RAW_KV_INSERT },
  { file: "packages/db/src/schema/plugin.ts", home: "pluginKv", member: "ownerId", reason: RAW_KV_INSERT },
  { file: "packages/db/src/schema/plugin.ts", home: "pluginKv", member: "key", reason: RAW_KV_INSERT },
  { file: "packages/server/src/entry/compose/services.ts", home: "ServicesResult", member: "settleBackground", reason: SETTLE_SIGNAL },
  { file: "packages/server/src/domain/share/contract/composition.ts", home: "ShareGraph", member: "settle", reason: SETTLE_SIGNAL },
  { file: "packages/contracts/src/chat/content-classes.ts", home: "ContentClassPolicy", member: "wire", reason: CONTENT_CLASS_PAIR },
  { file: "packages/client/src/state/device-local-registry.ts", home: "DeviceLocalClassification", member: "why", reason: STATED_REASON },
  { file: "packages/client/src/state/config-section-partition.ts", home: "UnclaimedSettingsKey", member: "reason", reason: STATED_REASON },
];

/** The entry that excuses `member` of `home` in `file`, if any. */
function deliberateEntry(entries: readonly DeliberateEntry[], file: string, home: string, member: string): DeliberateEntry | null {
  return (
    entries.find((entry) =>
      "directory" in entry
        ? file.startsWith(entry.directory)
        : entry.file === file && entry.home === home && (entry.member === null || entry.member === member),
    ) ?? null
  );
}

/** A file, home and member the deliberate list is asked about. */
export interface DeliberateSide {
  readonly file: string;
  readonly home: string;
  readonly member: string;
}

/** Split findings into the unwired and the ones the deliberate list excuses, each of those with its reason. A finding
 *  that stands for several declarations, as a restated pair does, names each through `sides`; any excused side
 *  excuses it. */
export function sortDeliberate<Finding extends DeliberateSide>(
  findings: readonly Finding[],
  entries: readonly DeliberateEntry[],
  sides: (finding: Finding) => readonly DeliberateSide[] = (finding) => [finding],
): { readonly unwired: readonly Finding[]; readonly deliberate: readonly (Finding & { readonly reason: string })[] } {
  const unwired: Finding[] = [];
  const deliberate: (Finding & { readonly reason: string })[] = [];
  for (const finding of findings) {
    const reason = sides(finding)
      .map((side) => deliberateEntry(entries, side.file, side.home, side.member)?.reason)
      .find((found) => found !== undefined);
    if (reason === undefined) {
      unwired.push(finding);
    } else {
      deliberate.push({ ...finding, reason });
    }
  }
  return { unwired, deliberate };
}

/** {@link sortDeliberate}, then the judged list over what it leaves: every bucket a report without rulings of its own
 *  writes. */
export function sortRows<Finding extends DeliberateSide & { readonly key: string }>(
  findings: readonly Finding[],
  options: { readonly root: string; readonly deliberate: readonly DeliberateEntry[]; readonly judged?: readonly JudgedEntry[] | undefined },
): JudgedSplit<Finding> & { readonly deliberate: readonly (Finding & { readonly reason: string })[] } {
  const { unwired, deliberate } = sortDeliberate(findings, options.deliberate);
  return { ...sortJudged(unwired, options), deliberate };
}
