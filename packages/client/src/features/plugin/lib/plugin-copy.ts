// plugin-copy — the consent vocabulary. ONE ordered, tsc-exhaustive translation of the wire capability
// axis into what a person is actually agreeing to, plus the lifecycle copy the list rows use.
//
// EXHAUSTIVENESS IS THE POINT, and it is enforced at COMPILE time: a capability with no sentence here makes
// `UncoveredCapability` a non-`never` type and the `Exhaustive<…>` alias below un-typable, so the grant
// screen can never render a checkbox whose consequence is unexplained. That is the enforcement tier for "a
// user must be able to see exactly what they are agreeing to" — the #24 security requirement — and it is the
// coupled site a future capability has to pass through.
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
// `spends` marks the capabilities that can draw on the installer's model/image budget — including
// `search.query` when the active query embedding connection is hosted. Money is the one consequence
// a checkbox label must never bury, and the automation surface already names its spend arms the same way. The
// generation capabilities sit ADJACENT in `PLUGIN_CAPABILITIES`, and search stays beside the other library
// reads, so the badge carries its cost signal where a person scans for library access and asks
// "what can this cost me".
//
// A consequence line STATES ITS BOUND when the capability has one (`notify`'s minute, `storage.kv`'s 256 keys,
// `worldinfo.write`'s 64 entries, and the hourly floors on `net.fetch`, `net.fetch_asset`, `llm.quiet` and `search.query`). The numbers are
// prose copies of server constants (`domain/plugin/substrate/rate-floor.ts`) and drift is a copy bug, not a
// security one — the belt is enforced server-side either way — but a bound a person cannot see is a bound
// they cannot weigh.
//
// `risk` marks every capability that WRITES (room or personal state, your library, the tools the app runs
// for you) or can send data out (the open internet, a frame's unclosed channels). Its pill ("Reaches
// further") is the alarm for that class. Reads, spend (which has its own "Costs money" mark) and a pure
// display pass such as `chat.transform` do not wear it.

import type { RoutableTask } from "@orb/contracts/inference";
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
  /** RISK class: writes state or can send data out of the app — see the file header for the line this draws. */
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
    risk: true,
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
    label: "Change your messages and how they look",
    consequence:
      "Can rewrite your message as you send it, before it is committed, in rooms you host; change how messages look on your screen; or add its own {{macro}} tokens. A plugin may use only some of these.",
  },
  {
    // #788 F12 — the read symmetry of `worldinfo.write` below. BENIGN band (neither spend nor risk): a read of
    // lore the room already renders, scoped to books attached to rooms the person is in — it reaches nothing
    // outside its own sandbox, unlike the write that adds durable room state.
    id: "worldinfo.read",
    label: "Read this room's world books",
    consequence: "Reads the world book entries attached to rooms you are in — the room's own lore, never another room's or another person's.",
  },
  {
    id: "worldinfo.write",
    risk: true,
    label: "Write world book entries",
    consequence: "Adds and updates entries in world books already attached to the room, up to 64 entries.",
  },
  {
    id: "global_vars",
    risk: true,
    label: "Use your global variables",
    consequence: "Reads and writes your personal global-variable namespace — yours only, never another person's.",
  },
  {
    id: "storage.kv",
    label: "Keep its own private storage",
    consequence: "A key/value store only this plugin can see, up to 256 keys.",
  },
  {
    // #788 seam-11 read half. BENIGN band (neither spend nor risk): reading back the bytes of a file in YOUR own
    // storage that the plugin already has an id for (e.g. an image it just made) — your library only, no paid
    // budget, and it never leaves the sandbox to the internet.
    id: "assets.read",
    label: "Read your saved images and files",
    consequence: "Reads back the contents of files in your own storage it has an id for — yours only, never another person's.",
  },
  {
    // #788 F1 — the result is owner-scoped, but query embedding may use the installer's hosted provider, so it
    // is a `spends` row.
    id: "search.query",
    label: "Search your library",
    consequence: "Searches your own documents. Each query may go to your configured embedding provider and cost money, at most 120 queries an hour per plugin.",
    spends: true,
  },
  {
    id: "notify",
    label: "Send notifications",
    consequence: "Posts short notices to room participants, at most one a minute per room.",
  },
  {
    id: "ui.surface",
    label: "Show its own panels and controls",
    consequence:
      "Draws panels and controls the app renders itself, always inside a box labelled with the plugin's name — only for you, and it can't fake the app's own screens.",
  },
  {
    // THE CONSENT LINE IS VERBATIM FROM THE OWNER-RULED DESIGN and is a CONSENT ARTIFACT, not copy to tune. It
    // names the #124 WebRTC/STUN class as a channel NO POLICY CLOSES, because that is the measured truth
    // (`@orb/kit/card-frame` residual R1: `webrtc 'block'` is unrecognized by Chromium, so it is not emitted).
    // Softening it — "runs in a secure sandbox", "isolated for your safety" — would make this the one row on the
    // screen that under-states its own risk. `risk: true` for the same reason: this is the only UI capability
    // that reaches past the plugin's own sandbox.
    //
    // It also names the GRANTED-DATA REACH (owner ruling on #106). Frames relay host calls to
    // `plugin.uiHostCall` with the same server-gated access a scripted surface has, so a frame can read whatever
    // else this plugin was granted and carry it out over that same unclosable channel. The line says both.
    id: "ui.frame",
    label: "Show its own screens in an isolated frame",
    consequence:
      "runs its own interface code in an isolated frame — it can draw anything inside its box, use anything else this plugin is allowed to read, and send it out through browser channels no policy closes.",
    risk: true,
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
    // U8 seam 15. NOT `spends`: it touches no paid model/image budget — only the box's own local indexing compute.
    id: "databank.ingest",
    risk: true,
    label: "Add documents to your Data Bank",
    consequence: "Saves text documents into your own Data Bank and indexes them for search — your library only, never another person's.",
  },
  {
    // U8 seam 17 — the `databank.ingest` sibling, same consent grammar and the same not-`spends`
    // classification (a canon write into your own character library, no paid budget).
    id: "character.ingest",
    risk: true,
    label: "Add characters to your library",
    consequence: "Imports character cards into your own character library — your library only, never another person's.",
  },
  {
    // U8 D148 — per-card plugin state: data saved ON your character cards, which travels with the card when you
    // export it, so the consequence names it. NOT `spends` (no paid budget — a local metadata write). The
    // consequence names the two walls a person should be able to see: it is namespaced to the plugin (never
    // another plugin's data) and inert (it does not change what the character says or does).
    id: "character.card_state",
    risk: true,
    label: "Store its own data on your characters",
    consequence:
      "Saves and reads its own private data on your character cards — its own data only, never another plugin's — and it never changes what the character says. That data leaves with the card when you export it.",
  },
  {
    id: "events.subscribe",
    label: "Watch for things happening",
    consequence: "Runs its code when messages are committed, lore activates, and so on — only in rooms you are in.",
  },
  {
    // U8 §5a. BENIGN band (neither spend nor risk): the plane is private to YOUR plugins — it never reaches a
    // chat, another person, or the internet. It is what lets two of your plugins cooperate.
    id: "plugin_events",
    label: "Talk to your other plugins",
    consequence: "Sends and receives private signals among your own installed plugins — never reaches a chat, another person, or the internet.",
  },
  {
    id: "tools.register",
    risk: true,
    label: "Add tools",
    consequence: "Registers tools a character or a rule can call. They run with your permissions, never more.",
  },
  {
    id: "net.fetch",
    label: "Reach the internet",
    risk: true,
    consequence: "Makes requests to the exact hosts its manifest lists, and nowhere else — at most 360 an hour per plugin.",
  },
  {
    // #798 — the remote-image-into-CAS arm. `risk`, on the `net.fetch` precedent (it reaches the open internet),
    // AND it writes durable personal state (an image into your library), so the consequence names both walls: the
    // same allowlisted hosts + its own hourly image-download limit, plus that the download lands
    // in your storage. NOT `spends` — it draws no paid model/image budget, only your own local storage.
    id: "net.fetch_asset",
    label: "Save images from the internet",
    risk: true,
    consequence:
      "Downloads images from the exact hosts its manifest lists into your own storage — at most 1200 an hour per plugin, separately from internet text requests. Your library only, never another person's.",
  },
] as const satisfies readonly CapabilityCopy[];

/**
 * THE COMPLETENESS PIN, carried by a real value rather than a dead type alias. It is the identity function,
 * but its declared type says "every `PluginCapability` is one of the ids the table above spells" — so the
 * day `PLUGIN_CAPABILITIES` gains a member with no row, `(c) => c` stops typechecking HERE and the grant
 * screen cannot ship an unexplained consent checkbox.
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
  const spendVerb = notable === 1 ? "spends" : "spend";
  return `Granting ${permissions} — ${notableWord} past the sandbox or ${spendVerb} your budget.`;
}

/** The approve button's label: "all" only when there is more than one permission to approve. */
export function approveLabel(pluginName: string, permissionCount: number): string {
  return `${permissionCount > 1 ? "Approve all" : "Approve"} for ${pluginName}`;
}

/** The plain sentence a plugin card shows in place of its raw error text; the raw text rides a Copy control. */
export const PLUGIN_ERROR_SENTENCE = "Something went wrong the last time it ran. Turn it off and on again, or check for an update.";
/** What the Copy control on that sentence copies, as the tail of its accessible name. */
export const PLUGIN_ERROR_COPY_SUBJECT = "the error details";

/** The note under a spend permission whose model role has nothing behind it yet. */
export const NO_IMAGE_MODEL_NOTE = "You have no image model set up yet — this plugin can't paint until you add one under Connections.";

/** The capabilities whose spend runs on a model role the person has to set up, and that role's routable task. A
 *  capability absent here either runs on a model the app always has or has no single role to name. */
export const SPEND_ROLE_TASKS = { "imagery.generate": "generateImage" } as const satisfies Partial<Record<PluginCapability, RoutableTask>>;

/** The disclosure that holds a long host list: its count is what the person sees before opening it. */
export function hostsDisclosureLabel(count: number): string {
  return `Show all ${count} hosts`;
}

/** At or above this many hosts the list collapses behind {@link hostsDisclosureLabel}, so the decision button
 *  stays in view. */
export const HOSTS_COLLAPSE_AT = 5;

/**
 * The lifecycle status as a row's state line — never the raw wire word. `reconsentPending` (#650 P1-1) is
 * consulted for the `disabled` arm ONLY: it distinguishes "the owner turned this off" from "the system
 * refused it on the owner's behalf" — a widening upgrade that landed the row `disabled` reads identically to
 * the owner's own toggle-off otherwise, and the surface would be presenting the system's refusal as the
 * person's decision. `warning` rather than `neutral` because it names an OPEN question ("this still needs
 * you"), not a settled state — the row below carries the actual re-consent notice + action. A plugin that was
 * never approved is a first ask, not a refusal, and wears the quiet {@link NEEDS_APPROVAL_LABEL} instead.
 *
 * The granted set feeds the ENABLED-BUT-INERT arm (side-eye 2026-08-29 owner observation): a plugin switched
 * on with ZERO granted capabilities runs and can reach nothing — the least-privilege posture working as
 * designed, but "I turned it on and nothing happened" needed an answer ON THE ROW. The badge says why,
 * and says no more: an installed plugin's grant is only editable through the re-consent path (`setGrant`
 * is reached from the notice, never from the durable disclosure), so this label deliberately does NOT
 * point at a "tick something below" affordance that does not exist. `warning` on the statusCopy doc's own
 * rule — an on-but-inert plugin is an OPEN question, not a settled success.
 */
export function statusCopy(plugin: ConsentAskFacts & { readonly status: PluginStatus; readonly reconsentPending: boolean }): {
  readonly label: string;
  readonly intent: "success" | "neutral" | "warning" | "danger";
} {
  if (plugin.status === "enabled") {
    return plugin.grantedCapabilities.length === 0 ? { label: "On — nothing granted yet", intent: "warning" } : { label: "On", intent: "success" };
  }
  if (plugin.status === "errored") {
    return { label: "Stopped after an error", intent: "danger" };
  }
  if (!plugin.reconsentPending) {
    return { label: "Off", intent: "neutral" };
  }
  return consentAskKind(plugin) === "first"
    ? { label: NEEDS_APPROVAL_LABEL, intent: "neutral" }
    : { label: "Off — asked for more than you allowed", intent: "warning" };
}

/** The quiet state a plugin waiting on its owner's first approval wears, on the Plugins screen and in the
 *  Plugin pages list alike. */
export const NEEDS_APPROVAL_LABEL = "Needs approval";

/** The two projected fields that tell a first ask from an update's. */
interface ConsentAskFacts {
  readonly grantedCapabilities: readonly PluginCapability[];
  readonly widenedNetHosts: readonly string[];
}

/** Which ask a pending plugin is making. Both a never-approved install (the seeded examples, a distributed
 *  copy) and an update that widened reach raise `reconsentPending`. A held grant, or a host delta recorded by
 *  an update, makes it an update; a first ask has neither. */
export function consentAskKind(plugin: ConsentAskFacts): "first" | "update" {
  return plugin.grantedCapabilities.length === 0 && plugin.widenedNetHosts.length === 0 ? "first" : "update";
}

/** The headline of a never-approved plugin's ask. */
export function firstConsentLine(pluginName: string, askedCount: number): string {
  return `${pluginName} needs your OK for ${askedCount === 1 ? "1 permission" : `${askedCount} permissions`} before it can run.`;
}

/**
 * The headline of the widened-reach notice. The server lands a REACH-WIDENING upgrade `disabled`
 * (`domain/plugin/verbs/upgrade.ts` — a newly-declared capability OR a `netHosts` entry the prior manifest
 * never carried), and this is the sentence that tells a person WHY the plugin stopped.
 *
 * BOTH COUNTS ARE NOW EXACT. The capability delta was always computable client-side from the two projected
 * grant fields; the host delta was not — the server compares against the PRIOR manifest, which the same
 * upgrade overwrites — so this line used to fall back to a bare "changed what this plugin can reach" rather
 * than invent a number. `PluginView.widenedNetHosts` (#659) is that number, recorded server-side at the one
 * moment it existed, and naming it is the whole point of the row: "it can now ALSO reach one new host" is
 * the decision a person can actually make, where "re-read these eight hostnames" is not.
 *
 * The bare arm survives for the one state that can still reach it: a re-consent whose delta was recorded
 * before this field existed. It says what is true and no more, and the full list is right below.
 */
export function reConsentLine(addedCapabilities: readonly PluginCapability[], addedNetHosts: readonly string[] = []): string {
  const tail = "so it stayed off. Check what it wants below.";
  const permissions = addedCapabilities.length === 1 ? "a permission you hadn't allowed" : `${addedCapabilities.length} permissions you hadn't allowed`;
  const hosts = addedNetHosts.length === 1 ? "a new host it can reach" : `${addedNetHosts.length} new hosts it can reach`;
  if (addedCapabilities.length > 0 && addedNetHosts.length > 0) {
    return `This update asks for ${permissions} and adds ${hosts}, ${tail}`;
  }
  if (addedCapabilities.length > 0) {
    return `This update asks for ${permissions}, ${tail}`;
  }
  if (addedNetHosts.length > 0) {
    return `This update adds ${hosts}, ${tail}`;
  }
  return `This update changed what this plugin can reach, ${tail}`;
}

/** U8 2b — the auto update-check vocabulary, ONE home so the row and its CT read the same words. It spans every
 *  update source (`PluginView.updateSource`, #1740/#0081): a remembered bundle URL, a remembered Git
 *  repository, or the copy Orbweaver ships for a seeded example. A hand-uploaded plugin has none and never
 *  shows these. `CHECK_FOR_UPDATES_LABEL` triggers the check; the verdicts map 1:1 to `PluginUpdateCheck`
 *  (a showcase row can only reach `unreachable` by dropping out of the batch — nothing was fetched for it). */
export const CHECK_FOR_UPDATES_LABEL = "Check for updates";
/** The settled `up-to-date` line. */
export const UPDATE_UP_TO_DATE_LINE = "Up to date — this is the latest version from its source.";
/** The settled `unreachable` line — leak-free by design (the server never says WHY, so neither do we). */
export const UPDATE_UNREACHABLE_LINE = "Couldn't reach its source to check for updates.";
/** The one-click affordance's label — names the version to move to, so the act is legible before the click. */
export function updateAvailableLabel(newVersion: string): string {
  return `Update to ${newVersion}`;
}

const SOURCE_IDENTITY_ABBREVIATION_LENGTH = 12;

/** The stable short commit spelling used by update copy and accessible names. */
export function abbreviateSourceCommit(sourceCommit: string): string {
  return sourceCommit.slice(0, SOURCE_IDENTITY_ABBREVIATION_LENGTH);
}

export function updateCommitAvailableLabel(sourceCommit: string): string {
  return `Update from commit ${abbreviateSourceCommit(sourceCommit)}`;
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

/** The narrow-room disclosure that holds the chat-flank plugin surfaces: one surface is named (once, like its
 *  frame title), several are counted. */
export function flankDisclosureLabel(surfaces: readonly { readonly pluginName: string; readonly title: string }[]): string {
  const only = surfaces.length === 1 ? surfaces[0] : undefined;
  if (only !== undefined) {
    return only.title === only.pluginName ? only.pluginName : `${only.pluginName} — ${only.title}`;
  }
  return `Plugin panels (${surfaces.length})`;
}
