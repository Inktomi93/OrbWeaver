// Tier-4 contract home for the CROSS-FEATURE CONTRIBUTOR seams (client-architecture-lockdown.md §6c) —
// the vocabularies a feature grafts itself onto ANOTHER feature's surface with, without either importing
// the other: the chat SURFACE ANCHORS, the character-DETAIL anchors, the tool renderers, and the slash
// commands. Every one of them is assembled at the composition root (`main.tsx`) into a
// `ContributorRegistry` and delivered to its host by props or context; zero registrants always renders
// exactly the host's own default.
//
// WHY IT IS ITS OWN FILE, not a block in `registry-contracts.ts` (the same reason
// `home-tile-contracts.ts` is): that file holds §6b — the CONTEXT-panel model, its mint, and the
// per-section `S` projections the `context-definition-shape` gate resolves BY PATH
// (`/lib/registry-contracts.ts$`), so those cannot move. §6c has no such pin, and the two halves share
// nothing but a tier: this file imports neither the registry primitive nor `registry-contracts.ts`.
// Tier, import surface and entry point are identical — every consumer imports from `#lib`.
//
// The house pattern for a NEW anchor family is visible three times below: a closed `as const` tuple
// (§5.5) so an unlisted anchor is unspellable, a named projection per POSITION, and a contribution union
// discriminated BY ANCHOR so `when`/`body` narrow to their own state with zero casts.

import type { QuickReplyMode } from "@orb/contracts/automation";
import { QUICK_REPLY_MODES } from "@orb/contracts/automation";
import type { MessageView, ToolCallRecord } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import type { LucideIcon } from "@orb/ui/icons";
import type { ReactNode } from "react";

/** The chat SURFACE-ANCHOR vocabulary (§6c/M8) — closed `as const` tuple, so an unlisted anchor is
 *  unspellable. `thread-flank`/`above-composer` are ROOM-level (mounted once per open room);
 *  `message-footer` is PER-ROW (mounted once per committed message). */
export const CHAT_SURFACE_ANCHORS = ["thread-flank", "above-composer", "message-footer"] as const;
export type ChatSurfaceAnchor = (typeof CHAT_SURFACE_ANCHORS)[number];

/** The room-level surface projection — `thread-flank` + `above-composer` read this. `chatId` is `null`
 *  for a draft (no server row yet); a contributor that needs a committed chat gates on it itself. */
export interface ChatRoomSurfaceState {
  readonly chatId: ChatId | null;
}

/** The per-message surface projection — `message-footer` reads this, one instance per COMMITTED row
 *  (never the streaming ghost row, which has no settled `MessageView` to hand a contributor). */
export interface ChatMessageSurfaceState {
  readonly message: MessageView;
}

/** A chat surface-anchor contribution (§6c/M8) — a discriminated union BY ANCHOR: the two room anchors
 *  share `ChatRoomSurfaceState`, `message-footer` carries `ChatMessageSurfaceState`. The `anchor` literal
 *  narrows `when`/`body` to the right state at every call site — no erasure, no cast (contrast §6b's
 *  `ContextTabDef<S>`, where a single S needs the mint's existential dodge; here the anchor IS the
 *  discriminant, so a plain union types cleanly through the registry). */
export type ChatSurfaceContribution =
  | {
      readonly id: string;
      readonly anchor: Extract<ChatSurfaceAnchor, "thread-flank" | "above-composer">;
      readonly when?: (state: ChatRoomSurfaceState) => boolean;
      readonly body: (state: ChatRoomSurfaceState) => ReactNode;
    }
  | {
      readonly id: string;
      readonly anchor: Extract<ChatSurfaceAnchor, "message-footer">;
      readonly when?: (state: ChatMessageSurfaceState) => boolean;
      readonly body: (state: ChatMessageSurfaceState) => ReactNode;
    };

// ── The "This chat" tab's SECTION seam (§6c — the THIRTEENTH contributor family) ───────────────────────
// The §6c families above graft a whole TAB (`contextTabs`), the whole PANE (`regions`), or a spot in the
// transcript (surface anchors). None of them could express what the B2 IA
// asks for: ONE MORE SECTION inside an existing tab body — automation's Rules beside Injections /
// Documents / Host controls in "This chat". Chat's `CommittedSettingsTab` is a chat-feature component and
// `client-features-no-cross` forbids it importing automation's surface at runtime, so the IA was
// unreachable and B2 shipped a host-only "Rules" TAB instead (a 5th tab that overflowed the strip at
// 1024px, and split per-chat configuration across two homes). OWNER RULING 2026-08-24 ("im fine with it
// going in this chat", #616) authorized this family; the tab graft was retired in the same change.
//
// THE HOST OWNS THE GRAMMAR, the contributor owns only the content: the contribution carries a `kicker`
// (its name in the band's own micro-caps voice) and a `body`, and the tab wraps both in the SAME
// `<Section kicker>` its own sections use. So a grafted section can never invent its own grouping chrome,
// and it inherits the pane's voice for free — which is precisely what the side-eye pass asked for.

/** The "This chat" SECTION-anchor vocabulary (§6c) — closed `as const` tuple, so an unlisted anchor is
 *  unspellable. `host-controls` is the tab's HOST-ONLY band (Background · Group behavior · Appearance ·
 *  Tool use): the whole band is omitted for a member, so a contribution there is host-gated by MOUNT, not
 *  by a predicate it could forget to write. A member-readable anchor is one tuple entry + one named arm on
 *  the union below, the {@link CharacterDetailContribution} extension shape. */
export const CHAT_SETTINGS_SECTION_ANCHORS = ["host-controls"] as const;
export type ChatSettingsSectionAnchor = (typeof CHAT_SETTINGS_SECTION_ANCHORS)[number];

/** The "This chat" section projection — what the tab body can supply a contributor. The room's committed
 *  `chatId` and nothing else, deliberately: the anchor's own host-only mount already answers the one
 *  permission question a section there could ask, and a projection field nobody reads is a promise the
 *  host would have to keep. A new availability input lands HERE (the `SlashCommandContext` posture). */
export interface ChatSettingsSectionState {
  readonly chatId: ChatId;
}

/** The `host-controls` arm — a section inside the "This chat" tab's host-only band. */
interface ChatSettingsHostControlsContribution {
  readonly id: string;
  readonly anchor: Extract<ChatSettingsSectionAnchor, "host-controls">;
  /** The section's NAME, rendered by the host as its `<Section kicker>` (a real `<h3>` in the pane's
   *  micro-caps voice) — never spelled by the contributor's own body. */
  readonly kicker: string;
  readonly when?: (state: ChatSettingsSectionState) => boolean;
  readonly body: (state: ChatSettingsSectionState) => ReactNode;
}

/** A "This chat" SECTION contribution (§6c) — a discriminated union BY ANCHOR (the
 *  {@link ChatSurfaceContribution} shape). One arm today; the `anchor` literal narrows `when`/`body` to
 *  their own state at every call site with zero casts. */
export type ChatSettingsSectionContribution = ChatSettingsHostControlsContribution;

// ── S1: the in-chat CONTROL seam ────────────────────────────────
// ONE registry + behavior contract for TRANSIENT interactive controls near the transcript/composer — the
// generalization of the click/consume contract `choice-send-provider.tsx` already spells for the `:::choices`
// fence (own `useSendMessage`, busy from the shared turn phase, a compose default the reader can edit).
//
// WHY THE DESCRIPTORS LIVE HERE and not in `features/chat/lib/`, stated precisely (an earlier revision of
// this header claimed `client-features-no-cross` would make the feature-tier home RED — it would NOT: that
// rule carries `dependencyTypesNot: ["type-only"]` and its own comment says cross-feature TYPE imports are
// allowed, `.dependency-cruiser.cjs:134-146`). The two real reasons:
//   1. ONE HOME, the §6c residency rule — every other contributor family's contract (surface anchors,
//      context tabs, tool renderers, slash commands, character detail) is declared in this tier-4 file, and
//      a twelfth family homed somewhere else is the parallel-map shape the lockdown exists to kill.
//   2. The VALUE half really would be RED. `CHAT_CONTROL_KINDS`/`CHAT_CONTROL_MODES` are runtime consts a
//      source imports to spell a descriptor; a `features/chat/lib/` home makes that a runtime cross-feature
//      import (`client-features-no-cross`, error). Type-only would have squeaked through — the values do not.
// Chat owns the MOUNT and the stacking law; a source owns only its descriptors.
//
// The seam is a TWO-LEVEL contribution: the door assembles a STATIC list of sources, and each source
// publishes a LIVE, changing list of controls from its own fiber (the `SlashCommandContribution` mount
// shape, for the same reason — a source's hooks must never run in a loop at the host). Zero sources ⇒ the
// mount's `when` is false ⇒ the band never renders ⇒ the room is byte-identical to a build without S1.

/** The control KINDS, in STACK ORDER (declared order IS render order: cards above chips — the attention
 *  budget of the one-visible-card law). Closed `as const` tuple + an exhaustive `Record<ChatControlKind, …>`
 *  renderer map at the mount: a new kind fails `tsc` until it is given a renderer AND a place in the stack. */
export const CHAT_CONTROL_KINDS = ["card", "chip"] as const;
export type ChatControlKind = (typeof CHAT_CONTROL_KINDS)[number];

/** The CONSUMPTION axis — what a control's click DOES, and therefore what makes it busy:
 *  `send` fires the text as the clicking member's turn (turn-phase-disabled, with the reason on `title`),
 *  `compose` seeds their composer draft (never disabled — writing a draft is always legal),
 *  `execute` calls a front-door verb (disabled only while its OWN mutation pends — it is not a turn).
 *  DERIVED from the wire tuple (`QUICK_REPLY_MODES`) rather than re-spelled, so an arm-surfaced chip's mode
 *  IS a control mode by construction; `execute` is the client-only third member no chip arm can carry. */
export const CHAT_CONTROL_MODES = [...QUICK_REPLY_MODES, "execute"] as const;
export type ChatControlMode = (typeof CHAT_CONTROL_MODES)[number];

/** ONE clickable affordance on a control. The text arms carry the string the click sends or composes; the
 *  `execute` arm carries its own runner AND its own pending flag — the source owns the mutation, so only the
 *  source can say whether it is in flight (the host never invents a pending state it cannot observe).
 *  `id` is the render key and must be unique WITHIN its control: a card may legitimately carry two
 *  same-labelled actions over different targets, and keying those by label collides them into one. */
export type ChatControlAction =
  | { readonly id: string; readonly label: string; readonly mode: QuickReplyMode; readonly text: string }
  | {
      readonly id: string;
      readonly label: string;
      readonly mode: Extract<ChatControlMode, "execute">;
      readonly run: () => void;
      readonly pending: boolean;
    };

/** A TRANSIENT control the band renders. `chip` is one affordance in the capped single row; `card` is the
 *  host-tier ask — a title, optional detail, its own actions, and an ALWAYS-PRESENT dismiss (a card that
 *  cannot be dismissed is a modal wearing a card's clothes). */
export type ChatControl =
  | { readonly kind: Extract<ChatControlKind, "chip">; readonly id: string; readonly action: ChatControlAction }
  | {
      readonly kind: Extract<ChatControlKind, "card">;
      readonly id: string;
      readonly title: string;
      readonly detail?: ReactNode;
      readonly actions: readonly ChatControlAction[];
      /** REQUIRED — every card carries an explicit dismiss (§3-S1). */
      readonly dismiss: () => void;
    };

/** What a control-source mount is handed: the room projection it resolves against, and the publish channel.
 *  `publish` is called from the source's OWN effect with its CURRENT control list (an empty array retires
 *  everything it had raised — that is how a consumed chip disappears), in ARRIVAL order, oldest first: the
 *  band shows the NEWEST card and discloses the rest as a count, so a source that publishes newest-first
 *  would hide the card the member is waiting for.
 *
 *  THE PUBLISH GUARD, and the ONE constraint it puts on you (read this before writing a source). The band
 *  IGNORES a publish whose controls are CONTENT-equal to the last one — same kind/id/title, same per-action
 *  id/label/mode/text/pending — because a source that rebuilds its list every render (the natural bus-driven
 *  shape) would otherwise re-render the band, which re-renders the source, forever. Two things are NOT
 *  compared, and are therefore yours to keep honest:
 *   - the ACTION CLOSURES (`run`, `dismiss`) and a card's `detail` node. An ignored publish keeps the
 *     PREVIOUS objects, so a source must never change what a control DOES (or what its detail shows)
 *     without also changing a compared field — give the control a new `id` when its behaviour changes.
 *   - Nothing else: any visible difference is a compared field, so a real update always lands. */
export interface ChatControlSourceMountProps {
  readonly state: ChatRoomSurfaceState;
  readonly publish: (controls: readonly ChatControl[]) => void;
}

/** A CONTROL SOURCE (§6c) — a feature raising transient controls into chat's one above-composer band without
 *  importing chat. `mount` is rendered as a COMPONENT (capitalized at the render site) so its hooks — a bus
 *  subscription, a store read, a mutation — live in their own fiber, and it must be render-idempotent (a
 *  host may mount the set in more than one subtree).
 *
 *  A MOUNT RENDERS `null`. It is a publish-only fiber: the band renders the mounts OUTSIDE its painted box
 *  precisely so a registered-but-silent source leaves the room's above-composer wrapper EMPTY and the
 *  wrapper collapses (`empty:hidden`). A mount that paints its own DOM defeats that collapse and puts
 *  chrome outside the stacking law — raise a control instead. */
export interface ChatControlSource {
  /** Names this source (the registry key), and namespaces its controls' ids in the band. */
  readonly id: string;
  readonly mount: (props: ChatControlSourceMountProps) => ReactNode;
}

/** The character-DETAIL surface-anchor vocabulary (§6c) — closed `as const` tuple, so an unlisted anchor
 *  is unspellable. `editor-sections` is the review-cards region in the character editor body: the ONE
 *  named cross-feature need (crew 07-client-ui §4.2 — pending card-evolution proposals render there as
 *  review cards, owned by the agents feature, WITHOUT importing the character feature). */
export const CHARACTER_DETAIL_ANCHORS = ["editor-sections"] as const;
export type CharacterDetailAnchor = (typeof CHARACTER_DETAIL_ANCHORS)[number];

/** The character-detail surface projection — what the editor body can actually supply a contributor: the
 *  id of the character being edited (the same drill subject the CONTEXT tabs read — a distinct POSITION,
 *  so its own named projection, mirroring how M8's surface anchors got projections distinct from the
 *  CONTEXT-tab `ChatContextState`). */
export interface CharacterDetailState {
  readonly characterId: CharacterId;
}

/** The `editor-sections` arm of the character-detail contribution union — the review-cards region in the
 *  editor body. No current second consumer (`characterDetailContributors` ships empty); the anchor stands
 *  on its own contract shape, not a promise of future crew integration (crew is dead by owner ruling). */
interface CharacterDetailSectionsContribution {
  readonly id: string;
  readonly anchor: Extract<CharacterDetailAnchor, "editor-sections">;
  readonly when?: (state: CharacterDetailState) => boolean;
  readonly body: (state: CharacterDetailState) => ReactNode;
}

/** A character-detail contribution (§6c) — a discriminated union BY ANCHOR (the M8 `ChatSurfaceContribution`
 *  shape). One arm today; a new anchor is one `CHARACTER_DETAIL_ANCHORS` entry + one named arm added to
 *  this union, and the `anchor` literal narrows `when`/`body` to its own state at every call site with
 *  zero casts. */
export type CharacterDetailContribution = CharacterDetailSectionsContribution;

/** HOW a {@link ToolRenderer}'s `id` claims a wire tool name — a CLOSED axis (§5.5), so a claim shape is
 *  unspellable outside this tuple.
 *  - `name`: `id` IS the wire tool name (the original, and the only shape a first-party renderer needs).
 *  - `prefix`: `id` is a NAMESPACE prefix and the renderer claims every wire name starting with it. Minted for
 *    the plugin plane (#679 U3): a plugin tool's wire name is `plugin_<slug'>_<name>`, which depends on WHO
 *    installed WHAT and is therefore unknowable at door-assembly time. Without it the door would have to grow
 *    per plugin — exactly what the one-assembly law (G8) forbids — so ONE `plugin_`-prefixed contribution fans
 *    per-plugin inside its own body instead. */
export const TOOL_RENDERER_MATCHES = ["name", "prefix"] as const;
export type ToolRendererMatch = (typeof TOOL_RENDERER_MATCHES)[number];

/** A per-tool renderer (§6c) — the cross-feature seam a feature (automation / a plugin surface) plugs a
 *  rich renderer into WITHOUT importing chat: chat consumes a `ContributorRegistry<ToolRenderer>` wired empty
 *  at `main.tsx` (the `ChatSurfaceContribution` precedent), claiming a wire tool `name`. An UNCLAIMED name
 *  falls back to the generic `@orb/ui` `ToolCallBlock`, so zero registrants renders exactly the default block.
 *  `render` receives ONE persisted `ToolCallRecord` (the client's ONLY tool read surface — chat never
 *  body-parses for tool markers) and parses its `arguments`/`result` through the feature's own schemas.
 *
 *  RESOLUTION IS TOTAL AND UNAMBIGUOUS (`message-tool-calls.tsx`): an EXACT (`match: "name"`) claim wins over
 *  every prefix claim, so a broad namespace claim can never shadow a renderer that named the tool outright;
 *  among prefix claims the FIRST in door order wins, and door order is a decision one file makes. */
export interface ToolRenderer {
  /** The wire tool name this renderer claims — or, at `match: "prefix"`, the namespace prefix. Also the
   *  registry key, so two contributors can never claim the identical string. */
  readonly id: string;
  /** How `id` claims a name. Required: a renderer that does not say is a renderer whose reach is a guess. */
  readonly match: ToolRendererMatch;
  readonly render: (record: ToolCallRecord) => ReactNode;
}

/** A WHOLE-MESSAGE tool renderer (§6c) — the per-message fold the per-tool {@link ToolRenderer} cannot
 *  express: a feature renders ALL of a message's tool records TOGETHER so it can AGGREGATE across them (fold
 *  N bookkeeping calls into one line) WITHOUT importing chat. Chat consumes a
 *  `ContributorRegistry<MessageToolsRenderer>` (assembled at `main.tsx`, delivered by context); for each
 *  committed message it tries the renderers in order and uses the FIRST non-null result, which OWNS that
 *  message's entire tool block. `null` = this renderer claims no tool in the message ⇒ chat falls back to the
 *  per-record `ToolRenderer` path (byte-identical). `records` is the message's persisted `ToolCallRecord[]` in
 *  array order (the client's ONLY tool read surface). */
export interface MessageToolsRenderer {
  /** Names this contributor (the registry key). */
  readonly id: string;
  readonly render: (records: readonly ToolCallRecord[]) => ReactNode | null;
}

/** The palette BUCKET a slash command lands in — a CLOSED axis (§5.5: one importable union, extended by
 *  editing this tuple), so a contributed command can never invent a heading. Entries are growth; the
 *  buckets are architecture. Declared order IS the palette's group order. */
export const SLASH_COMMAND_GROUPS = ["create", "commands"] as const;
export type SlashCommandGroup = (typeof SLASH_COMMAND_GROUPS)[number];

/** The heading each bucket renders under. Homed BESIDE its vocabulary tuple (the one sanctioned home for a
 *  keyed map over a closed axis — G2's "vocabulary tuple" allowance), so a heading can never drift from the
 *  axis: adding a group member fails `tsc` here until it is given copy. */
export const SLASH_COMMAND_GROUP_LABELS: Record<SlashCommandGroup, string> = {
  create: "Create",
  commands: "Commands",
};

/** THE projection every slash command is resolved against — the ONE place a new availability input lands.
 *  This is the forward-compatibility hinge: a command that later needs a PERMISSION (host-only, a capability
 *  flag, a seat) gets it by adding a field HERE and reading it in `unavailableReason`, never by growing the
 *  contribution shape — derive, don't re-declare (§5 rule 6's projection posture, applied to commands).
 *  `chatId` is `null` when there is no committed chat in view (a draft room, or the palette opened from a
 *  non-chat section); a command that needs a room says so through `unavailableReason`. */
export interface SlashCommandContext {
  readonly chatId: ChatId | null;
}

/** A command's imperative runner — receives the raw remainder AFTER `/<id>` (trimmed), so a command owns its
 *  own argument grammar. A future DECLARED argument spec (for completion/validation) is an ADDITIVE optional
 *  field on the contribution; this runner signature is what it would describe, never replace. */
export type SlashCommandRunner = (args: string) => void;

/** ONE arg-completion offer a command's arg completer yields (#791) — a hint the composer shows below the draft
 *  while the person is typing `/<id> <args…>`, and a click-to-complete affordance. This is the composer half of
 *  the typed-arg grammar the plugin plane's `/plugin <slug> <cmd> name=value` dispatch parses: a command that
 *  declares typed args publishes a completer so the composer can HINT the arg names and AUTOCOMPLETE enum values,
 *  without chat importing the owning feature. */
export interface SlashArgOffer {
  /** A stable render/match key, unique within the offered set. */
  readonly id: string;
  /** The shown hint (an arg name, or an enum value). */
  readonly label: string;
  /** A one-line gloss (the arg's type / requiredness / describe). */
  readonly describe?: string;
  /** The FULL args remainder (everything after `/<id> `) the draft becomes when this offer is picked — the
   *  completer owns the reconstruction, so the composer stays a dumb `/<id> <insert>` setter with no token math. */
  readonly insert: string;
}

/** A command's ARG completer (#791) — resolves the offers for the CURRENT partial args string (everything after
 *  `/<id> `). Published by the command's mount (like its runner), so a completer that needs hooks — a plugin's
 *  per-caller command list, read off a query — lives in its own fiber. Absent ⇒ the command declares no arg
 *  grammar and the composer shows no arg strip for it (byte-identical to before this seam). */
export type SlashArgCompleter = (argsText: string) => readonly SlashArgOffer[];

/** What a slash-command mount is handed. It receives the whole {@link SlashCommandContext} (not a bare
 *  `chatId`) precisely so a later context field reaches every command with zero call-site churn. */
export interface SlashCommandMountProps {
  readonly context: SlashCommandContext;
  /** Publish this command's runner. Called from an effect in the mount's OWN fiber. */
  readonly onRunner: (run: SlashCommandRunner) => void;
  /** OPTIONAL (#791) — publish this command's arg completer, for the composer's live arg hinting/enum
   *  completion. A command with no declared arg grammar never calls it, and the composer shows no arg strip. */
  readonly onArgComplete?: ((complete: SlashArgCompleter) => void) | undefined;
}

/** A SLASH COMMAND (§6c) — the ONE source of truth a command is declared in: the chat composer dispatches
 *  `/<id> …` to it AND the command palette lists it, so a feature grafts a command onto BOTH surfaces
 *  without importing either (assembled at `main.tsx`, delivered by context).
 *
 *  The `mount` render-to-publish shape (not a plain `run` callback) is what lets a runner use hooks: the
 *  host renders `mount` as a component, so the hooks live in their own fiber instead of a hooks-in-a-loop
 *  at the host. A host may mount the set more than once (the composer and the palette are different
 *  subtrees with different lifetimes) — a mount must therefore be render-idempotent and side-effect-free
 *  until its runner is called.
 *
 *  UNAVAILABILITY IS NEVER AN OMISSION: `unavailableReason` returns copy naming the unlock condition, and
 *  the surfaces render the command DISABLED with that reason (never hide it) — the one-real-surface rule. */
export interface SlashCommandContribution {
  /** The token after the leading slash — the registry key AND the match token. Lowercase kebab (`new-chat`). */
  readonly id: string;
  /** The palette row's title (Title Case, e.g. "New chat"). */
  readonly label: string;
  /** One-line help — the palette row's description and the composer completion strip's hint. */
  readonly describe: string;
  /** The argument shape shown after the token in the completion strip (e.g. `<NdM±K>`). Absent = no args. */
  readonly usage?: string;
  /** Extra palette search terms (cmdk scores `value`/`keywords`, never the rendered children). */
  readonly keywords?: readonly string[];
  readonly icon?: LucideIcon;
  /** @defaultValue `"commands"` */
  readonly group?: SlashCommandGroup;
  /** `null` = runnable. A string = the honest reason it is not, naming the unlock condition. */
  readonly unavailableReason?: (context: SlashCommandContext) => string | null;
  /** Rendered invisibly by each host; publishes the runner via `props.onRunner`. A component (capitalized
   *  at the render site) — it may use hooks. */
  readonly mount: (props: SlashCommandMountProps) => ReactNode;
}

/** ONE dynamic row a {@link CommandPaletteSource} fans into the command palette (§6c). A plain,
 *  pre-resolved row — NOT a {@link SlashCommandContribution}: a static contribution is one declaration = one
 *  row, assembled at the door, and cannot express rows that only exist at runtime (a plugin's registered
 *  commands, read per-caller off a query). The mount/runner indirection is deliberately absent too: a
 *  dynamic source owns ONE runner hook for its whole set (the rows share a resolver), so per-row fibers would
 *  buy nothing the source's own hook does not already give. `run` is the row's action; the HOST dismisses
 *  the palette around it (a command that opens another modal must not have this one close it back). */
export interface PaletteCommandRow {
  /** The cmdk `value` — a stable key unique across the source's rows (cmdk scores `value`/`keywords`, never
   *  the rendered children, so the visible text also rides `keywords`). */
  readonly id: string;
  /** The row's title — the visible, matched command name. */
  readonly label: string;
  /** One-line help — carried as a search term (the palette does not paint it, matching every other command
   *  row: describe is for finding, not display). */
  readonly describe: string;
  /** The owning entity's display name, rendered as a trailing row label AND folded into the accessible name
   *  (the disambiguator when two entities register a same-named command — the extensions-switcher precedent). */
  readonly badge?: string;
  /** Extra cmdk search terms beyond label/describe/badge. */
  readonly keywords?: readonly string[];
  /** Run the row. Fire-and-forget; the host closes the palette first. */
  readonly run: () => void;
}

/** A DYNAMIC command-palette SOURCE (§6c; §12 row 4 — the contributor channel) — a feature grafts a set of
 *  RUNTIME-derived rows onto the command palette without either feature importing the other. Assembled at the
 *  door into a `ContributorRegistry<CommandPaletteSource>` exactly like the static contributor families; the
 *  palette knows nothing about who contributes.
 *
 *  The difference from {@link SlashCommandContribution} is the whole reason this exists: a slash contribution
 *  is fixed vocabulary (its rows are known at door-assembly and it can never fan), while a source produces its
 *  rows from LIVE data inside its own fiber, so the count and content change with the caller's own state. That
 *  is what turns each plugin-registered command into its OWN first-class, searchable palette row rather than a
 *  single `/plugin <slug> <cmd>` sub-dispatch.
 *
 *  `useRows` is a HOOK — the host renders each source as its own component so the hook lives in its own fiber
 *  (never a hooks-in-a-loop at the palette). It runs unconditionally; an empty return renders no group, so a
 *  build/caller with nothing to contribute is byte-identical to one without the source. */
export interface CommandPaletteSource {
  /** Names the source (the registry key). */
  readonly id: string;
  /** The heading the source's rows render under. */
  readonly heading: string;
  /** A glyph rendered as each row's leading icon. */
  readonly icon?: LucideIcon;
  /** The source's live rows for the palette's context. A hook — runs in the source's own fiber. */
  readonly useRows: (context: SlashCommandContext) => readonly PaletteCommandRow[];
}
