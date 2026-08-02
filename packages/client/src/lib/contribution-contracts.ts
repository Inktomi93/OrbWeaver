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

/** The character-DETAIL surface-anchor vocabulary (§6c) — closed `as const` tuple, so an unlisted anchor
 *  is unspellable. `editor-sections` is the review-cards region in the character editor body: the ONE
 *  named cross-feature need (crew 07-client-ui §4.2 — pending card-evolution proposals render there as
 *  review cards, owned by the crew feature, WITHOUT importing the character feature). */
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
 *  editor body (crew 07-client-ui §4.2 renders pending card-evolution proposals here). */
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

/** A per-tool-name renderer (§6c) — the cross-feature seam a feature (automation / a plugin surface) plugs a
 *  rich renderer into WITHOUT importing chat: chat consumes a `ContributorRegistry<ToolRenderer>` wired empty
 *  at `main.tsx` (the `ChatSurfaceContribution` precedent), keyed by the wire tool `name`. An UNREGISTERED name
 *  falls back to the generic `@orb/ui` `ToolCallBlock`, so zero registrants renders exactly the default block.
 *  `render` receives ONE persisted `ToolCallRecord` (the client's ONLY tool read surface — chat never
 *  body-parses for tool markers) and parses its `arguments`/`result` through the feature's own schemas. */
export interface ToolRenderer {
  /** The wire tool name this renderer claims (the registry key). */
  readonly id: string;
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

/** What a slash-command mount is handed. It receives the whole {@link SlashCommandContext} (not a bare
 *  `chatId`) precisely so a later context field reaches every command with zero call-site churn. */
export interface SlashCommandMountProps {
  readonly context: SlashCommandContext;
  /** Publish this command's runner. Called from an effect in the mount's OWN fiber. */
  readonly onRunner: (run: SlashCommandRunner) => void;
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
