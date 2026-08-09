// Tier-4 contract home for the CONTEXT-PANEL registry model (client-architecture-lockdown.md §6b) — the
// vocabulary-independent shapes a host feature and its cross-feature contributors both need (the CONTEXT
// model, a contributor tab def, and a contributor's whole-pane REGION CLAIM) without either importing the
// other, plus every section's published `S` projection. May import `@orb/contracts` types +
// the registry primitive; imports zero features. `SectionDefinition` itself lives in `#state` (it binds
// these shapes to the shell's SectionId/PanelMode vocabulary, which state owns — §5 rule 5).
//
// THIS FILE'S PATH IS LOAD-BEARING: the `context-definition-shape` gate resolves a `defineContextTabs<S>`
// type argument by matching the declaration's file against `/lib/registry-contracts.ts$` (O5 strict —
// a projection must be a real type PUBLISHED here, never an inline literal). So the per-section
// projections below cannot be re-homed without moving the gate's anchor with them.
//
// The §6c CROSS-FEATURE CONTRIBUTOR vocabularies (chat/character surface anchors, tool renderers, slash
// commands) are a sibling file, `contribution-contracts.ts` — same tier, same `#lib` entry point, no
// shared imports, and split out when this file reached the 450-line component-size cap (the
// `home-tile-contracts.ts` precedent).
//
// `S` appears only CONTRAVARIANTLY on `ContextTabDef` (when/body) — safe to erase, unsafe to PRODUCE
// across the registry seam (no existentials in TS). So `S` is confined to `defineContextTabs`/
// `resolveContextTabs`, paired with its consumer INSIDE the definition file; the shell only ever sees the
// NON-generic `ContextDefinition` this mint returns (§6b).

import type { ParticipantView, RoomOverrides } from "@orb/contracts/chat";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { CharacterId, ChatId, RefinerySessionId, UserId } from "@orb/kit/ids";
import type { LucideIcon } from "@orb/ui/icons";
import type { ReactNode } from "react";
import type { ContributorRegistry } from "./registry.ts";

/** RAIL MEMBERSHIP — which of a CLAIMANT's two rails a CONTEXT tab belongs to (HUD-1 §4, owner decision 5).
 *  `"game"` = the STATE rail above the viewport; `"meta"` = the ADMINISTRATION rail below it. Membership is
 *  a property of the tab's JOB, declared by its owner, so chat's own tabs stay `"meta"` without knowing a
 *  claimant exists (an id-prefix rule would break the moment a non-rpg contributor ships a state tab). The
 *  GENERIC panel ignores it entirely — with no claim there is one strip carrying every visible tab. */
export type ContextTabStrip = "game" | "meta";

/** One CONTEXT-panel tab. `S` is the host section's OWN context-state projection — a real named type
 *  published by the host (never `any`/`unknown`/a loose index signature; O5 strict). A `void` host has
 *  no shared context state, so `when`/`body` take no argument. */
export interface ContextTabDef<S> {
  readonly id: string;
  readonly label: string;
  /** The tab's glyph (icon home = the registry, §4.3 rule 10). Carried so the strip can compress to
   *  icon+tooltip tabs when its container can't fit the word labels (progressive disclosure, §4.3 rule 4,
   *  via a container query) — the label stays the accessible name in BOTH forms. The CP-4 OSRS icon strips
   *  ARE this compressed form. Absent ⇒ the tab can only ever render its word label (never a nameless icon). */
  readonly icon?: LucideIcon;
  /** Absent = always visible. THE dynamic axis — subsumes chat's isHost/group/member conditionals. */
  readonly when?: (state: S) => boolean;
  readonly body: (state: S) => ReactNode;
  /** Rail membership for a CLAIMED pane (HUD-1 §4). Absent ⇒ `"meta"` (administration), so an untouched
   *  section never has to think about it. */
  readonly strip?: ContextTabStrip;
  /** HOST-ONLY affordance (HUD-1 §4): a claimant paints this cell's glyph crown-gold at rest. Declared by
   *  the tab's OWNER for {@link strip}'s reason (owner decision 5) — the alternative is a claimant carrying
   *  a list of foreign tab ids, i.e. rpg knowing chat's vocabulary. PRESENTATION only, never a gate: the
   *  host-only-ness is enforced by `when` (PERMISSION-omit). Absent ⇒ false. */
  readonly crown?: boolean;
  /** A changed-since-viewed marker (§4.6): a truthy boolean ⇒ a corner dot; a number \> 0 ⇒ a count. `null`
   *  / `false` / `0` ⇒ no badge. Resolved at resolve-time against `S` (same as `when`). Never rendered on
   *  the active tab (the strip suppresses it). */
  readonly badge?: (state: S) => number | boolean | null;
  /** PHASE disable-with-reason (§4.6), resolved against `S` like `when` — the REASON, never a rendering: the
   *  GENERIC panel renders it `aria-disabled` + `title` + lock glyph (focusable, never `disabled`); a CLAIMED
   *  pane renders lock + `title` and NOT `aria-disabled` — its locked cell OPENS (HUD-1 §3.6b). `null` ⇒ enabled. */
  readonly disabledReason?: (state: S) => string | null;
  /** Preferred-default marker (Context-Panel-Program §4.1) — when TRUE and no stored `contextTab` is visible,
   *  the panel lands on THIS tab instead of the declared-order first (a game chat lands on `rpg.status`, not
   *  the roster's Members). Resolved at resolve-time against `S` (same as `when`). A stored, still-visible
   *  `contextTab` always wins (continuity is untouched); when no tab flags it, the first visible tab is the
   *  default (backward-compat). The FIRST resolved tab whose flag is true supplies the default. */
  readonly defaultTab?: (state: S) => boolean;
}

/** What the shell renders for one tab — `S` already applied. `strip` is always present (defaulted to
 *  `"meta"` at resolve time); `badge`/`disabledReason` carry the RESOLVED values (`badge(state)` /
 *  `disabledReason(state)` already called), so the renderer is state-blind. */
export interface ResolvedContextTab {
  readonly id: string;
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly node: ReactNode;
  readonly strip: ContextTabStrip;
  /** RESOLVED host-only marker (HUD-1 §4), defaulted to `false` — the renderer never sees an absent field. */
  readonly crown: boolean;
  readonly badge: number | boolean | null;
  readonly disabledReason: string | null;
  /** RESOLVED preferred-default flag (Context-Panel-Program §4.1): `true` ⇒ the panel lands here when no
   *  stored `contextTab` is visible. First `true` tab wins; all-`false` ⇒ the declared-order first (today). */
  readonly defaultTab: boolean;
}

/** What the shell hands a CLAIMANT (HUD-1 §3.2): everything it would have rendered itself, already resolved
 *  — so the claimant never re-resolves, never calls `body(state)`, never re-runs `when`, never invents a tab. */
export interface ContextRegionView {
  /** ALL resolved tabs — the SAME set `ContextTabsPanel` consumes (own then contributors, `when`-filtered,
   *  declared order, `S` applied). The claimant splits them by `strip` for its own rails. */
  readonly tabs: readonly ResolvedContextTab[];
  /** The resolved selection (stored `contextTab` if still visible, else the `defaultTab` flag, else the
   *  declared-order first) + the pre-bound writer — the ONE selection seam; never mirror it locally. */
  readonly activeTab: string | null;
  readonly selectTab: (id: string) => void;
  /** The host's strip-trail actions, already state-bound (chat's draft add-member popover today). */
  readonly actions?: ReactNode;
}

/** A contributor's CLAIM on the WHOLE CONTEXT pane (HUD-1 §3.1) — the third contributor arm beside
 *  context-tabs and surface-anchors (§6c). While the claim holds the shell renders NONE of its own pane
 *  chrome (no band, no `.ctx-tab-strip`): the claimant returns ONE node composing band + strips + viewport
 *  in its own order, and the shell keeps only the panel MECHANICS it has always owned (D62 untouched — a
 *  claim is pane CONTENT). `S` stays CONTRAVARIANT-only exactly like `ContextTabDef`, so §6b's erasure
 *  proof is unchanged: `claims` CONSUMES `S`, `render` consumes the non-generic view. */
export interface ContextRegionDef<S> {
  readonly id: string;
  /** APPLICABILITY — the same class of gate as a tab's `when` (game-ness, read cache-first). */
  readonly claims: (state: S) => boolean;
  /** The whole pane. Gets ONLY the shell view — the claimant's domain state comes from its own hooks. */
  readonly render: (view: ContextRegionView) => ReactNode;
}

/** THE region mint (HUD-1 §8) — the ONE legal minter of a `ContextRegionDef`, so the shape has a single
 *  spelled home the gate can count: a hand-rolled literal elsewhere is RED, and at most ONE call site
 *  may exist project-wide (one pane, one owner). */
export function defineContextRegion<S>(def: ContextRegionDef<S>): ContextRegionDef<S> {
  return def;
}

/** The resolved CONTEXT-panel tab strip — when-filtered, own tabs then contributors, declared order.
 *  `header` is the definition-owned BAND slot (north-star §4 N4, P4): the active entity's identity from the
 *  SAME `S` the tabs read. It mounts in the `.shell-panel-header` band, not the body, so
 *  `SectionContextHeader` consumes `header` while `ContextTabsPanel` consumes `tabs`/`actions` — one
 *  resolve, two consumers. Absent ⇒ the band shows the neutral "Details" default. */
export interface ResolvedContextTabs {
  readonly tabs: readonly ResolvedContextTab[];
  readonly actions?: ReactNode;
  readonly header?: ReactNode;
  /** Present ⇒ a contributor CLAIMED the whole pane (HUD-1 §3.1): the shell renders this instead of its own
   *  band + strips + viewport, and `SectionContextHeader` renders nothing. Absent ⇒ today's generic panel,
   *  byte-identical. `tabs`/`actions` are still resolved in FULL — a claim never suppresses resolution. */
  readonly region?: (view: ContextRegionView) => ReactNode;
}

/** A section's CONTEXT-panel model — the four legacy wirings (registry-tabs · chat's bespoke Tabs ·
 *  worldInfo's single body · refinery's nothing) unified. `kind:"none"` is an EXPLICIT decision, never
 *  an absence. NON-generic: `S` never crosses the shell seam (§6b's variance proof) — a `tabs` host's
 *  `useResolved` hook has already applied its own `S` before the shell ever sees it. */
/**
 * THE NO-SELECTION ARM every CONTEXT pane owes (side-eye F-12, 2026-08-03; [[empty-states-are-load-bearing]]).
 *
 * Four of seven panes shipped voiceless: `worldInfo` printed the single word "Details" and nothing else,
 * and `chats` / `characters` / `refinery` shared one generic "Details / Details / Select something to see
 * its details here." — the word "Details" twice (the band's, then the body placeholder's title) over a
 * sentence that names no section, no entity and no payoff. An empty docked pane reads as UNBUILT, which is
 * the exact failure the empty-states law exists for — and the preset team had already built the model
 * answer beside them (a first-class ACTIVE PRESET / EFFECTIVE GENERATION / CAPABILITY readout), so this is
 * the sweep of that answer sideways.
 *
 * The contract is deliberately narrow: name WHAT THIS PANE WILL SHOW, in the section's own words. A shared
 * default is what produced the defect, so there is no default here — a section that wants a voice states
 * one, and a section that states none keeps the generic filler and stays legibly un-swept.
 */
export interface ContextEmptyArm {
  /** The no-selection arm's copy. `title` names the pane's SUBJECT, never the word "Details" (the band
   *  already says that); `description` names what appears once something is selected. */
  readonly empty?: { readonly title: string; readonly description: string };
}

export type ContextDefinition =
  | ({ readonly kind: "none" } & ContextEmptyArm)
  | ({
      readonly kind: "single";
      readonly body: () => ReactNode;
      /** The CONTEXT-panel BAND identity for a single-body context — the same P4 slot a `tabs` context
       *  supplies through `defineContextTabs`, available here because a single body is just as capable of
       *  naming what it reads. Absent ⇒ the neutral "Details" default (world-info's arm, unchanged).
       *  Preset's readout swaps its whole content per editor VIEW, so a band reading "Details" above a
       *  panel of Actions data names nothing (crunch item 11). */
      readonly header?: () => ReactNode;
    } & ContextEmptyArm)
  | ({
      readonly kind: "tabs";
      /** Minted ONLY by `defineContextTabs` (G3 wall). May suspend; `null` = nothing selected. */
      readonly useResolved: () => ResolvedContextTabs | null;
    } & ContextEmptyArm);

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
  /** §6c / HUD-1 §3.2 — the REGION-CLAIM arm, injected at the same door. The FIRST claiming region owns the
   *  whole pane for that state; zero claimants resolves to today's generic panel, unchanged. */
  readonly regions?: ContributorRegistry<ContextRegionDef<S>>;
  /** The section's NO-SELECTION arm (`ContextEmptyArm`, side-eye F-12) — what this pane says while
   *  `useContextState` resolves `null`. Passed through the mint untouched: the copy is the SECTION's, and
   *  the shell renders it blind, exactly like every other definition-owned slot here. */
  readonly empty?: ContextEmptyArm["empty"];
}

/** The pure resolve step `defineContextTabs` closes over: own tabs → contributors, `when`-filtered, in
 *  declared order, mapped to the already-applied `ResolvedContextTab` shape. Exported for the unit test
 *  (M3.3) — `S` is confined to this one parametric function. */
export function resolveContextTabs<S>(spec: ContextTabsSpec<S>, state: S): ResolvedContextTabs {
  const active = [...spec.tabs, ...(spec.contributors?.list() ?? [])].filter((tab) => tab.when?.(state) ?? true);
  const tabs: readonly ResolvedContextTab[] = active.map((tab) => ({
    id: tab.id,
    label: tab.label,
    node: tab.body(state),
    strip: tab.strip ?? "meta",
    crown: tab.crown ?? false,
    badge: tab.badge?.(state) ?? null,
    disabledReason: tab.disabledReason?.(state) ?? null,
    defaultTab: tab.defaultTab?.(state) ?? false,
    ...(tab.icon === undefined ? {} : { icon: tab.icon }),
  }));
  // The FIRST claiming region wins the whole pane (HUD-1 §3.2) — declared order decides, so the outcome is
  // deterministic; the ≤1-claimant gate arm makes a second claimant unbuildable anyway.
  const region = spec.regions?.list().find((candidate) => candidate.claims(state))?.render;
  const resolved = { tabs, actions: spec.actions?.(state), header: spec.header?.(state) };
  return region === undefined ? resolved : { ...resolved, region };
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
  return spec.empty === undefined ? { kind: "tabs", useResolved } : { kind: "tabs", useResolved, empty: spec.empty };
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

/** The Refinery CONTEXT-panel state projection (R3 — the Runs · Setup · Versions tabs' shared drill):
 *  the open session every tab reads through its own cache hooks. Deliberately minimal — the tabs fetch
 *  their own data by these ids (the cache dedupes); `characterId` rides so the Versions walk (the D28
 *  snapshot plane) needs no second resolve. */
export interface RefineryContextState {
  readonly sessionId: RefinerySessionId;
  readonly characterId: CharacterId;
}

/** The Characters LIST-pane PROJECTION view (list-pane-projection §3.2, the O5 published shape) — what the
 *  CHARACTER section hands the CHAT-owned projection body through the `makeCharactersSection` door param,
 *  so the pane can render chat-row anatomy over the `chat.listChats` cache without either feature importing
 *  the other (`client-features-no-cross`). Deliberately minimal: the row-click destination is chat's own
 *  business (it writes `selectChatFromList` + `setActiveSection` itself), so only the SUBJECT and the
 *  host-owned primary cross the seam.
 *
 *  The D18 rider in one sentence: this is a PROJECTION view — a character-scoped filter over the
 *  first-class chats read — never a "chats of a character" ownership seam. */
export interface CharacterChatsProjectionView {
  readonly characterId: CharacterId;
  /** Names the pane + its empty state ("No chats with Azarael yet"). */
  readonly characterName: string;
  /** Start a fresh chat with her. HOST-owned: it also leaves the section, which is the host's call. */
  readonly onNewChat: () => void;
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

/** The chat context-tab id VOCABULARY — one home beside `ChatContextState` (feature lib is not a type
 *  home, and importing it from chats-section created a component↔section cycle). The shell's
 *  `contextTab` channel stays an opaque string (sections interpret it); this typed vocabulary is how
 *  every chat deep-link (`setContextTab`/`openContextTab`) spells a tab id — a rename becomes a compile
 *  error at every site instead of a silent first-visible fallback (the CP-1 overrides→settings rename
 *  orphaned two deep-links exactly that way). The chats `defineContextTabs` defs derive their `id`s
 *  from this type. */
export const CHAT_CONTEXT_TAB_IDS = ["members", "settings", "preview"] as const;
export type ChatContextTabId = (typeof CHAT_CONTEXT_TAB_IDS)[number];

/** The Analytics CONTEXT-panel state projection (O5 strict — a real named type, never void/any). The
 *  three dimension tabs (Models/Time/Personas) are owner-scoped and IGNORE this state; it exists only so
 *  the definition-owned `header` slot (P4) can name the leaderboard-drilled character. `null` = the
 *  overview dashboard (nothing drilled) ⇒ the band shows the neutral "Analytics" identity. The projection
 *  is ALWAYS present (never `null` from `useContextState`) so the owner-scoped tabs stay unconditionally
 *  available whether or not a character is drilled. */
export interface AnalyticsContextState {
  readonly characterId: CharacterId | null;
}
