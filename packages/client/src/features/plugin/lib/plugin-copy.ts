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
// `spends` marks the three SPEND-class capabilities (`turn.trigger`, `imagery.generate`, `llm.quiet`) — the
// ones that draw on the installer's model budget every time the plugin uses them. Money is the one consequence
// a checkbox label must never bury, and the automation surface already names its spend arms the same way. The
// three sit ADJACENT in `PLUGIN_CAPABILITIES` (positions 9-11) so the badge and the reading order reinforce
// each other on a screen whose scan question is "what can this cost me".
//
// A consequence line STATES ITS BOUND when the capability has one (`notify`'s minute, `storage.kv`'s 256 keys,
// `worldinfo.write`'s 64 entries, and the two HOURLY floors on `net.fetch` and `llm.quiet`). The numbers are
// prose copies of server constants (`domain/plugin/substrate/rate-floor.ts`) and drift is a copy bug, not a
// security one — the belt is enforced server-side either way — but a bound a person cannot see is a bound
// they cannot weigh.
//
// `risk` marks the capabilities that reach BEYOND the plugin's own sandbox in a way that outlasts or leaves
// the room the person is looking at: rewriting what THEY send before it is committed, mutating shared room
// or personal global state rather than the plugin's own private store, or leaving the sandbox to the open
// internet. It is what P2-9 (side-eye #650) named "danger gradation" — every row rendered at identical
// weight regardless of what it actually does, so `chat.transform` (silently editing an outgoing message)
// read no louder than `storage.kv` (a private key/value box only the plugin itself can see). This is a
// judgment call, not a formula — `chat.quick_reply`, `notify` and `events.subscribe` all touch a room too,
// but only by SUGGESTING or WATCHING, never by silently rewriting what the person themselves said or by
// leaving the sandbox.

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
  /** RISK class: reaches past the plugin's own sandbox into shared/personal state, your own outgoing
   *  words, or the open internet — see the file header for the line this draws. */
  readonly risk?: true;
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
    risk: true,
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
    risk: true,
  },
  {
    id: "worldinfo.write",
    label: "Write lorebook entries",
    consequence: "Adds and updates entries in lorebooks already attached to the room, up to 64 entries.",
    risk: true,
  },
  {
    id: "global_vars",
    label: "Use your global variables",
    consequence: "Reads and writes your personal global-variable namespace — yours only, never another person's.",
    risk: true,
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
    id: "llm.quiet",
    label: "Ask a model on its own",
    consequence:
      "Sends its own prompts to your model and reads the answer, on your model budget, at most 30 times an hour. It cannot post the result anywhere by itself.",
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
    risk: true,
  },
  {
    id: "net.fetch",
    label: "Reach the internet",
    risk: true,
    consequence: "Makes requests to the exact hosts its manifest lists, and nowhere else — at most 120 an hour.",
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

/**
 * The one-line roll-up at the decision point (side-eye #650 P2-9). At the maximal ask (13 checked rows,
 * 2.63 screens of scroll in the CT-measured pane) a person scrolling to the Install button has forgotten
 * the top by the time they get there, and nothing at the button itself says what they are about to commit
 * to. This is the number that travels with the click: how many capabilities are checked, and how many of
 * THOSE reach past the sandbox (`risk`) or spend the installer's budget (`spends`) — the two axes a
 * checkbox count alone cannot say. Returns `null` for an empty grant (nothing to summarize) so the caller
 * can render nothing rather than a hollow "Granting 0 permissions."
 */
export function grantSummaryLine(granted: readonly PluginCapability[]): string | null {
  if (granted.length === 0) {
    return null;
  }
  const rows = granted.map((capability) => capabilityCopy(capability)).filter((row): row is CapabilityCopy => row !== undefined);
  const notable = rows.filter((row) => row.risk === true || row.spends === true).length;
  const permissions = rows.length === 1 ? "1 permission" : `${rows.length} permissions`;
  if (notable === 0) {
    return `Granting ${permissions}.`;
  }
  const notableWord = notable === 1 ? "1 of them reaches" : `${notable} of them reach`;
  return `Granting ${permissions} — ${notableWord} past the sandbox or spends your budget.`;
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

/** The one canonical explanation of what removing a plugin does — the row's overflow menu and the
 *  re-consent notice's escape action (P1-3) both trigger the SAME irreversible act, so they read the SAME
 *  sentence rather than two hand-written paraphrases drifting apart. */
export const REMOVE_PLUGIN_DESCRIPTION =
  "This deletes the plugin, its private storage and anything it registered. It can't be undone — you'd install it again from its bundle.";

/** `builtAgainst` as a provenance line — display/warn only, never an install gate (the manifest's own rule). */
export function builtAgainstLine(builtAgainst: PluginBuiltAgainst | null): string | null {
  return builtAgainst === null ? null : `Built against Orbweaver ${builtAgainst.engineVersion}`;
}
