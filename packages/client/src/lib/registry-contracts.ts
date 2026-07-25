// Tier-4 contract home for the registry primitive (client-architecture-lockdown.md §6b/§6c) — the
// vocabulary-independent shapes a host feature and its cross-feature contributors both need (the CONTEXT
// model + a contributor tab def) without either importing the other. May import `@orb/contracts` types +
// the registry primitive; imports zero features. `SectionDefinition` itself lives in `#state` (it binds
// these shapes to the shell's SectionId/PanelMode vocabulary, which state owns — §5 rule 5).
//
// `S` appears only CONTRAVARIANTLY on `ContextTabDef` (when/body) — safe to erase, unsafe to PRODUCE
// across the registry seam (no existentials in TS). So `S` is confined to `defineContextTabs`/
// `resolveContextTabs`, paired with its consumer INSIDE the definition file; the shell only ever sees the
// NON-generic `ContextDefinition` this mint returns (§6b).

import type { MessageView, ParticipantView, RoomOverrides } from "@orb/contracts/chat";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { CharacterId, ChatId, PresetId, UserId } from "@orb/kit/ids";
import type { ReactNode } from "react";
import type { ContributorRegistry } from "./registry";

/** One CONTEXT-panel tab. `S` is the host section's OWN context-state projection — a real named type
 *  published by the host (never `any`/`unknown`/a loose index signature; O5 strict). A `void` host has
 *  no shared context state, so `when`/`body` take no argument. */
export interface ContextTabDef<S> {
  readonly id: string;
  readonly label: string;
  /** Absent = always visible. THE dynamic axis — subsumes chat's isHost/group/member conditionals. */
  readonly when?: (state: S) => boolean;
  readonly body: (state: S) => ReactNode;
}

/** What the shell renders for one tab — `S` already applied. */
export interface ResolvedContextTab {
  readonly id: string;
  readonly label: string;
  readonly node: ReactNode;
}

/** The resolved CONTEXT-panel tab strip — when-filtered, own tabs then contributors, declared order.
 *  `header` is the definition-owned CONTEXT-panel BAND slot (north-star §4 N4, P4): the active entity's
 *  identity, resolved from the SAME `S` the tabs read (a committed chat's avatar + title). It renders in
 *  the `.shell-panel-header` band (a different mount point than `tabs`/`actions`, which fill the body), so
 *  `SectionContextHeader` consumes `header` while `ContextTabsPanel` consumes `tabs`/`actions` — one
 *  resolve, two band/body consumers. Absent ⇒ the band shows the neutral "Details" default. */
export interface ResolvedContextTabs {
  readonly tabs: readonly ResolvedContextTab[];
  readonly actions?: ReactNode;
  readonly header?: ReactNode;
}

/** A section's CONTEXT-panel model — the four legacy wirings (registry-tabs · chat's bespoke Tabs ·
 *  worldInfo's single body · refinery's nothing) unified. `kind:"none"` is an EXPLICIT decision, never
 *  an absence. NON-generic: `S` never crosses the shell seam (§6b's variance proof) — a `tabs` host's
 *  `useResolved` hook has already applied its own `S` before the shell ever sees it. */
export type ContextDefinition =
  | { readonly kind: "none" }
  | { readonly kind: "single"; readonly body: () => ReactNode }
  | {
      readonly kind: "tabs";
      /** Minted ONLY by `defineContextTabs` (G3 wall). May suspend; `null` = nothing selected. */
      readonly useResolved: () => ResolvedContextTabs | null;
    };

/** The inputs `defineContextTabs<S>` pairs inside one definition file — the host's projection hook, its
 *  own tabs, and (optionally) a cross-feature contributor registry (§6c) typed against the SAME `S`. */
export interface ContextTabsSpec<S> {
  /** A module-level named `use*` fn (rules-of-hooks); may suspend; `null` = no selection. */
  readonly useContextState: () => S | null;
  readonly tabs: readonly ContextTabDef<S>[];
  readonly actions?: (state: S) => ReactNode;
  /** The CONTEXT-panel BAND identity (north-star §4 N4, P4) — the active entity's avatar + title, drawn
   *  from the SAME `S` the tabs read. Definition-owned + mint-supplied (never a route-fed prop or a
   *  shell-side per-section switch); the shell renders it blind via `SectionContextHeader`. */
  readonly header?: (state: S) => ReactNode;
  /** §6c — injected at the door (M8); merged after own tabs, same `when` gating. */
  readonly contributors?: ContributorRegistry<ContextTabDef<S>>;
}

/** The pure resolve step `defineContextTabs` closes over: own tabs → contributors, `when`-filtered, in
 *  declared order, mapped to the already-applied `ResolvedContextTab` shape. Exported for the unit test
 *  (M3.3) — `S` is confined to this one parametric function. */
export function resolveContextTabs<S>(spec: ContextTabsSpec<S>, state: S): ResolvedContextTabs {
  const own = spec.tabs;
  const contributed = spec.contributors?.list() ?? [];
  const all = [...own, ...contributed];
  const tabs: ResolvedContextTab[] = [];
  for (const tab of all) {
    if (tab.when?.(state) ?? true) {
      tabs.push({ id: tab.id, label: tab.label, node: tab.body(state) });
    }
  }
  return { tabs, actions: spec.actions?.(state), header: spec.header?.(state) };
}

/** THE mint (§6b) — pairs a projection hook with its tabs/contributors, closed over by a named
 *  `useResolved` hook, and returns the NON-generic `ContextDefinition` the shell consumes blind. Throws
 *  at construction (not render) on a duplicate tab id across own ∪ contributors. */
export function defineContextTabs<S>(spec: ContextTabsSpec<S>): ContextDefinition {
  const seen = new Set<string>();
  for (const tab of [...spec.tabs, ...(spec.contributors?.list() ?? [])]) {
    if (seen.has(tab.id)) {
      throw new Error(`defineContextTabs: duplicate tab id "${tab.id}"`);
    }
    seen.add(tab.id);
  }
  // biome-ignore lint/nursery/noComponentHookFactories: the D54 §13.1 editor-factory pattern — defineContextTabs runs at MODULE scope inside each section's definition file (const charactersSection = { context: defineContextTabs(...) }), so the returned hook has a stable identity the Compiler can analyze (see forms/create-saved-entity-form.ts).
  function useResolved(): ResolvedContextTabs | null {
    const state = spec.useContextState();
    if (state === null) {
      return null;
    }
    return resolveContextTabs(spec, state);
  }
  return { kind: "tabs", useResolved };
}

/** The sentinel a `void`-projection host (no shared context state) passes as its `useContextState`
 *  result — always-present and unconditionally called, so the mint never branches on a conditional hook
 *  (the rules-of-hooks constraint the optional-`useContextState?` alternative would have violated). */
export const VOID_STATE = undefined as undefined;

/** The Characters CONTEXT-panel state projection (O5 strict — a real named type, never void/any): the
 *  selected character every context tab drills into. */
export interface CharacterContextState {
  readonly characterId: CharacterId;
}

/** The Presets CONTEXT-panel state projection (O5 strict — a real named type, never void/any): the
 *  open preset every context tab drills into. */
export interface PresetContextState {
  readonly presetId: PresetId;
}

/** A COMMITTED chat's CONTEXT-panel projection — the `ChatDetail` wire fields the tabs read, plus
 *  `multiHumanCapable` (the deployment-capability flag, resolved via `#data`'s `useAuthConfig`). */
export interface CommittedChatContext {
  readonly phase: "committed";
  readonly chatId: ChatId;
  readonly participants: readonly ParticipantView[];
  readonly viewerUserId: UserId;
  readonly pendingHostUserId: UserId | null;
  readonly roomOverrides: RoomOverrides;
  readonly isHost: boolean;
  readonly multiHumanCapable: boolean;
  readonly background: ThemeBackground | null;
}

/** A DRAFT chat's CONTEXT-panel projection — no server row yet, so the tabs write the draft-config store;
 *  the effective cast is the deduped seed ∪ pre-send add-member picks. */
export interface DraftChatContext {
  readonly phase: "draft";
  readonly draftKey: string;
  readonly cast: readonly CharacterId[];
}

/** The Chats CONTEXT-panel state projection (O5 strict) — a phase-discriminated union so one
 *  `defineContextTabs<ChatContextState>` unifies both the committed panel and its draft twin (§6b/§15). */
export type ChatContextState = CommittedChatContext | DraftChatContext;

/** The Analytics CONTEXT-panel state projection (O5 strict — a real named type, never void/any). The
 *  three dimension tabs (Models/Time/Personas) are owner-scoped and IGNORE this state; it exists only so
 *  the definition-owned `header` slot (P4) can name the leaderboard-drilled character. `null` = the
 *  overview dashboard (nothing drilled) ⇒ the band shows the neutral "Analytics" identity. The projection
 *  is ALWAYS present (never `null` from `useContextState`) so the owner-scoped tabs stay unconditionally
 *  available whether or not a character is drilled. */
export interface AnalyticsContextState {
  readonly characterId: CharacterId | null;
}

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
