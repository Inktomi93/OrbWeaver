// plugin-copy — the consent vocabulary. ONE ordered, tsc-exhaustive translation of the wire capability
// axis into what a person is actually agreeing to, plus the lifecycle copy the list rows use.
//
// EXHAUSTIVENESS IS THE POINT, and it is enforced at COMPILE time: a capability with no sentence here makes
// `UncoveredCapability` a non-`never` type and the `Exhaustive<…>` alias below un-typable, so the grant
// screen can never render a checkbox whose consequence is unexplained. That is the enforcement tier for "a
// user must be able to see exactly what they are agreeing to" — the #24 security requirement — and it is the
// coupled site a future capability (the parked `llm.quiet`) has to pass through.
//
// WHY AN ORDERED ARRAY AND NOT A `Record<PluginCapability, …>`, stated so nobody "simplifies" it back: the
// Record is the house shape and was written first, but ONE capability member (`global_vars`) is snake_case,
// and a snake_case Record KEY forces a `useNamingConvention` suppression — which in turn needs a row in the
// `suppressions.baseline.json` ratchet. The row array reaches the identical compile-time guarantee with zero
// suppressions, and it carries a second property the Record could not: its order IS the render order, which
// `PLUGIN_CAPABILITIES` already declares ("Order is the confirm-dialog display order",
// `contracts/plugin/manifest.ts:12`).
//
// The copy is deliberately NOT derived from the manifest's own comments: those are developer notes about
// which host function is gated. These are the reach a room owner is consenting to.
//
// `spends` marks the two SPEND-class capabilities (`turn.trigger`, `imagery.generate`) — the ones that draw
// on the installer's model budget every time the plugin uses them. Money is the one consequence a checkbox
// label must never bury, and the automation surface already names its spend arms the same way.

import type { PluginBuiltAgainst, PluginCapability, PluginStatus } from "@orb/contracts/plugin";

/** One capability as the consent screen speaks it. */
export interface CapabilityCopy {
  readonly id: PluginCapability;
  /** The plain-English permission, phrased as what the plugin gains. */
  readonly label: string;
  /** The consequence line under it — what the grant lets the plugin actually reach. */
  readonly consequence: string;
  /** SPEND class: using it draws on your model/image budget. */
  readonly spends?: true;
}

/** Every capability, in `PLUGIN_CAPABILITIES` order (the declared confirm-dialog display order). */
export const CAPABILITY_COPY_ROWS = [
  {
    id: "chat.read",
    label: "Read this room's messages",
    consequence: "Sees recent messages and the room's variables — only in rooms you are already in.",
  },
  {
    id: "chat.variables.write",
    label: "Change room variables",
    consequence: "Writes the counters and flags that rules and macros read. Only in rooms you host.",
  },
  {
    id: "chat.quick_reply",
    label: "Offer reply chips",
    consequence: "Puts suggested replies above the composer. Clicking one always sends as you.",
  },
  {
    id: "chat.transform",
    label: "Rewrite your outgoing messages",
    consequence: "Edits your draft after you press send, before it is committed, in rooms you host.",
  },
  {
    id: "worldinfo.write",
    label: "Write lorebook entries",
    consequence: "Adds and updates entries in lorebooks already attached to the room, up to 64 entries.",
  },
  {
    id: "global_vars",
    label: "Use your global variables",
    consequence: "Reads and writes your personal global-variable namespace — yours only, never another person's.",
  },
  {
    id: "storage.kv",
    label: "Keep its own private storage",
    consequence: "A key/value store only this plugin can see, up to 256 keys.",
  },
  {
    id: "notify",
    label: "Send notifications",
    consequence: "Posts short notices to room participants, at most one a minute per room.",
  },
  {
    id: "turn.trigger",
    label: "Ask for a reply on its own",
    consequence: "Makes a character reply without you typing. Runs on your model budget and counts against the room's automation limits.",
    spends: true,
  },
  {
    id: "imagery.generate",
    label: "Generate images",
    consequence: "Creates images on your image budget, under the same limits as an image rule.",
    spends: true,
  },
  {
    id: "events.subscribe",
    label: "Watch for things happening",
    consequence: "Runs its code when messages are committed, lore activates, and so on — only in rooms you are in.",
  },
  {
    id: "tools.register",
    label: "Add tools",
    consequence: "Registers tools a character or a rule can call. They run with your permissions, never more.",
  },
  {
    id: "net.fetch",
    label: "Reach the internet",
    consequence: "Makes requests to the exact hosts its manifest lists, and nowhere else.",
  },
] as const satisfies readonly CapabilityCopy[];

/**
 * THE COMPLETENESS PIN, carried by a real value rather than a dead type alias. It is the identity function,
 * but its declared type says "every `PluginCapability` is one of the ids the table above spells" — so the
 * day `PLUGIN_CAPABILITIES` gains a member with no row (the parked `llm.quiet`), `(c) => c` stops
 * typechecking HERE and the grant screen cannot ship an unexplained consent checkbox.
 */
const asExplainedCapability: (capability: PluginCapability) => (typeof CAPABILITY_COPY_ROWS)[number]["id"] = (capability) => capability;

/**
 * The copy for one capability. `undefined` is not the missing-row case — the pin above makes that a compile
 * error — it is the FORWARD-COMPAT case: a granted list read off the wire can name a capability a stale
 * client build does not know, and a consent surface must never invent a sentence for a permission it cannot
 * explain. Callers render nothing for a miss and say how many they could not name.
 */
export function capabilityCopy(capability: PluginCapability): CapabilityCopy | undefined {
  const id = asExplainedCapability(capability);
  return CAPABILITY_COPY_ROWS.find((row) => row.id === id);
}

/** The lifecycle status as a row's state line — never the raw wire word. */
export function statusCopy(status: PluginStatus): { readonly label: string; readonly intent: "success" | "neutral" | "danger" } {
  if (status === "enabled") {
    return { label: "On", intent: "success" };
  }
  return status === "errored" ? { label: "Stopped after an error", intent: "danger" } : { label: "Off", intent: "neutral" };
}

/**
 * The headline of the widened-reach notice. The server lands a REACH-WIDENING upgrade `disabled`
 * (`domain/plugin/verbs/upgrade.ts` — a newly-declared capability OR a `netHosts` entry the prior manifest
 * never carried), and this is the sentence that tells a person WHY the plugin stopped.
 *
 * It names the CAPABILITY count exactly, because that delta is computable client-side from the same two
 * inputs the server compares. It NEVER names a host count: the server compares against the prior MANIFEST's
 * hosts, which no read surface projects, so any number here would be invented. The hosts-only arm therefore
 * says what is true and no more — the reach changed, and the full list is right below.
 */
export function reConsentLine(addedCapabilities: readonly PluginCapability[]): string {
  const tail = "so it stayed off. Check what it wants below.";
  if (addedCapabilities.length === 0) {
    return `This update changed what this plugin can reach, ${tail}`;
  }
  const permissions = addedCapabilities.length === 1 ? "a permission you hadn't allowed" : `${addedCapabilities.length} permissions you hadn't allowed`;
  return `This update asks for ${permissions}, ${tail}`;
}

/** `builtAgainst` as a provenance line — display/warn only, never an install gate (the manifest's own rule). */
export function builtAgainstLine(builtAgainst: PluginBuiltAgainst | null): string | null {
  return builtAgainst === null ? null : `Built against Orbweaver ${builtAgainst.engineVersion}`;
}
