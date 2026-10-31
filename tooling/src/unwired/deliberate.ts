// Members with no production caller on purpose: an external caller reaches them. The scan reports these apart
// from the unwired members, each with its reason. `member: null` covers every member of the home.

export interface DeliberateEntry {
  readonly file: string;
  readonly home: string;
  readonly member: string | null;
  readonly reason: string;
}

const AGENT_BRIDGE = "the dev-only `globalThis.__orb` agent bridge: Playwright, snap and browser-driving agents call it, never product code";
const SETTLE_SIGNAL = "docs/law/Spine-Testing.md: a suite waits on the composed root's actual settle signal, never a delay";

export const DELIBERATE: readonly DeliberateEntry[] = [
  { file: "packages/client/src/lib/agent-bridge.ts", home: "OrbDebugHandle", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "OrbNavHandle", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "OrbSeedHandle", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "OrbCssHandle", member: null, reason: AGENT_BRIDGE },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "OrbAgentHandles", member: null, reason: AGENT_BRIDGE },
  { file: "packages/server/src/entry/compose/services.ts", home: "ServicesResult", member: "settleBackground", reason: SETTLE_SIGNAL },
  { file: "packages/server/src/domain/share/contract/composition.ts", home: "ShareGraph", member: "settle", reason: SETTLE_SIGNAL },
];

/** The entry that excuses `member` of `home` in `file`, if any. */
export function deliberateEntry(entries: readonly DeliberateEntry[], file: string, home: string, member: string): DeliberateEntry | null {
  return entries.find((entry) => entry.file === file && entry.home === home && (entry.member === null || entry.member === member)) ?? null;
}
