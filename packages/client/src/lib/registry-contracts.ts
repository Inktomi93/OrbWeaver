// Tier-4 contract home for the CONTEXT-PANEL registry model (client-architecture-lockdown.md §6b) — the
// vocabulary-independent shapes a host feature and its cross-feature contributors both need (the CONTEXT
// model, a contributor tab def, and a contributor's HEAD-BAND region claim) without either importing the
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

import type { ChatIdentity, ParticipantView, RoomOverrides } from "@orb/contracts/chat";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { CharacterId, ChatId, RefinerySessionId, UserId } from "@orb/kit/ids";
import type { LucideIcon } from "@orb/ui/icons";
import type { ReactNode } from "react";
import type { ContributorRegistry } from "./registry.ts";

/** RAIL MEMBERSHIP — which of the bracket's two rails a CONTEXT tab belongs to (HUD-1 §4, owner decision 5;
 *  universal since the context bracket, #860). `"game"` = the STATE rail above the viewport; `"meta"` = the
 *  ADMINISTRATION rail pinned to the pane's foot. Membership is a property of the tab's JOB, declared by its
 *  owner, so chat's own tabs stay `"meta"` without knowing a state contributor exists (an id-prefix rule
 *  would break the moment a non-rpg contributor ships a state tab). The shell's bracket renders the TOP rail
 *  only when a `"game"` tab resolved (APPLICABILITY, Context-Panel-Program §4.1) and the FOOT rail always. */
export type ContextTabStrip = "game" | "meta";

/** The TOP (state) rail's on-screen name and a11y group name — a property of the closed strip vocabulary,
 *  homed beside it. "Game state", not "Game": the crown host console in the FOOT rail is a TAB named "Game",
 *  and two sibling groups where one's name is the other's member collide for anyone navigating by name
 *  (Context-Panel-Program §4.2). The FOOT rail is named by its SECTION (`ContextTabsSpec.railLabel`). */
export const GAME_STRIP_LABEL = "Game state";

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

/** The resolved VIEW the shell's context bracket renders from (HUD-1 §3.2, now the ONE composition): the
 *  resolved tabs, the ONE selection seam, and the host's rail-trail actions. Nothing here re-resolves —
 *  the bracket never calls `body(state)`, never re-runs `when`, never invents a tab. */
export interface ContextRegionView {
  /** ALL resolved tabs (own then contributors, `when`-filtered, declared order, `S` applied). The bracket
   *  splits them by `strip` into its two rails. */
  readonly tabs: readonly ResolvedContextTab[];
  /** The resolved selection (stored `contextTab` if still visible, else the `defaultTab` flag, else the
   *  declared-order first) + the pre-bound writer — the ONE selection seam; never mirror it locally. */
  readonly activeTab: string | null;
  readonly selectTab: (id: string) => void;
  /** The host's rail-trail actions, already state-bound (chat's draft add-member popover today). */
  readonly actions?: ReactNode;
}

/** A contributor's CLAIM on the CONTEXT pane's HEAD BAND (HUD-1 §3.1 as re-shaped by the context bracket,
 *  #860) — the third contributor arm beside context-tabs and surface-anchors (§6c). The shell renders ONE
 *  column for every tabs pane (band → optional state rail → viewport → ground → meta rail); the ONLY slot
 *  a contributor can take over is the band, and while the claim holds the claimant's band REPLACES the
 *  host section's own `header` in that slot — "one slot, three contents, never a second head". There is
 *  no API through which a claimant could render a rail or a viewport; the pane's chrome is the shell's
 *  (D62 untouched — a claim is band CONTENT). `S` stays CONTRAVARIANT-only exactly like `ContextTabDef`,
 *  so §6b's erasure proof is unchanged: `claims` CONSUMES `S`; `band` reads nothing from it (a claimant's
 *  domain state comes from its own hooks inside its own components). */
export interface ContextRegionDef<S> {
  readonly id: string;
  /** APPLICABILITY — the same class of gate as a tab's `when` (game-ness, read cache-first). */
  readonly claims: (state: S) => boolean;
  /** The pane's HEAD band while the claim holds. An element, not a render call — the claimant's hooks
   *  run inside the components it returns, never at resolve time. */
  readonly band: () => ReactNode;
}

/** THE region mint (HUD-1 §8) — the ONE legal minter of a `ContextRegionDef`, so the shape has a single
 *  spelled home the gate can count: a hand-rolled literal elsewhere is RED, and at most ONE call site
 *  may exist project-wide (one pane, one owner). */
export function defineContextRegion<S>(def: ContextRegionDef<S>): ContextRegionDef<S> {
  return def;
}

/** The resolved CONTEXT-panel tab set — when-filtered, own tabs then contributors, declared order.
 *  `header` is the pane's HEAD BAND content (north-star §4 N4, P4 — the artifact band of the context
 *  bracket, #860): the section's own `header` from the SAME `S` the tabs read, or the FIRST claiming
 *  region's band in its place. It mounts in the bracket's band slot inside the body — the shell's
 *  `.shell-panel-header` renders nothing for a tabs pane — so ONE consumer (`ContextTabsPanel`) takes the
 *  whole resolve. Absent ⇒ the bracket renders no band (the column starts at its first rail). */
export interface ResolvedContextTabs {
  readonly tabs: readonly ResolvedContextTab[];
  readonly actions?: ReactNode;
  readonly header?: ReactNode;
  /** The FOOT rail's name (`ContextTabsSpec.railLabel`), passed through untouched; absent ⇒ the host
   *  falls back to the section's rail label. */
  readonly railLabel?: string;
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
  /** The pane's HEAD BAND — the artifact's identity (a room's title + chips, a character's portrait + name),
   *  drawn from the SAME `S` the tabs read (north-star §4 N4, P4; the context bracket's band slot, #860).
   *  Definition-owned + mint-supplied (never a route-fed prop or a shell-side per-section switch); the
   *  shell renders it blind in the bracket's band. A claiming region's band replaces it. */
  readonly header?: (state: S) => ReactNode;
  /** The FOOT rail's name — the artifact NOUN the pane is about ("Chat", "Character"), printed as the
   *  rail's kicker and carried as its a11y group name. Absent ⇒ the section's rail label (the honest name
   *  for a pane that is about the section itself: Corpus, Analytics, Refinery). */
  readonly railLabel?: string;
  /** §6c — injected at the door (M8); merged after own tabs, same `when` gating. */
  readonly contributors?: ContributorRegistry<ContextTabDef<S>>;
  /** §6c / HUD-1 §3.2 — the BAND-CLAIM arm, injected at the same door. The FIRST claiming region's band
   *  takes the head slot for that state; zero claimants ⇒ the section's own `header`. */
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
  // The FIRST claiming region's band takes the head slot (HUD-1 §3.2, re-shaped by #860) — declared order
  // decides, so the outcome is deterministic; the ≤1-claimant gate arm makes a second claimant unbuildable
  // anyway. A claim never suppresses resolution: `tabs`/`actions` are the same set either way.
  const claim = spec.regions?.list().find((candidate) => candidate.claims(state));
  const header = claim === undefined ? spec.header?.(state) : claim.band();
  return {
    tabs,
    actions: spec.actions?.(state),
    header,
    ...(spec.railLabel === undefined ? {} : { railLabel: spec.railLabel }),
  };
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
  // biome-ignore lint/nursery/noComponentHookFactories: the D54 §13.1 editor-factory pattern — defineContextTabs runs at MODULE scope inside each section's definition file (const charactersSection = { context: defineContextTabs(...) }), so the returned hook has a stable identity the Compiler can analyze (see forms/editor/create-saved-entity-form.ts).
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

/** The Characters LIST-pane PROJECTION view (the O5 published shape) — what the
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
  /** The room's stored title, RAW (`ChatDetail.title` — null/blank until renamed) — the context band
   *  renders it through `deriveChatTitle` with the character names, exactly as the topbar identity does. */
  readonly title: string | null;
  readonly participants: readonly ParticipantView[];
  /** The room's member-gated CHAT IDENTITY producer (`ChatDetail.identities`, D137) — the ONE resolver a
   *  context tab has for turning a seat's `activePersonaId` into the persona name/portrait its row renders
   *  (the Members tab's human rows; see `features/chat/lib/member-rows.ts::toPersonRows`). */
  readonly identities: readonly ChatIdentity[];
  readonly viewerUserId: UserId;
  readonly pendingHostUserId: UserId | null;
  readonly roomOverrides: RoomOverrides;
  readonly isHost: boolean;
  readonly multiHumanCapable: boolean;
  readonly background: ThemeBackground | null;
}

/** The Chats CONTEXT-panel state projection (O5 strict) — what `defineContextTabs<ChatContextState>` and
 *  every chat-context CONTRIBUTOR (`ContextTabDef<ChatContextState>`) are typed against.
 *
 *  IT IS A SINGLE-ARM UNION ON PURPOSE. `DraftChatContext` (a rowless room carrying founding CHARACTER ids —
 *  its deleted field said `cast` — instead of a roster) was deleted with draft mode (chat-creation-draft-mode-replacement.md §4.1, R1), but
 *  the `phase` discriminant STAYS: it is the seam a second projection would re-enter through, every tab body
 *  and contributor already narrows on it, and collapsing it would be a churn across the whole contributor
 *  surface to save one literal. */
export type ChatContextState = CommittedChatContext;

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
 *  the definition-owned `header` slot can name the leaderboard-drilled character. `null` = the
 *  overview dashboard (nothing drilled) ⇒ the band shows the neutral "Analytics" identity. The projection
 *  is ALWAYS present (never `null` from `useContextState`) so the owner-scoped tabs stay unconditionally
 *  available whether or not a character is drilled. */
export interface AnalyticsContextState {
  readonly characterId: CharacterId | null;
}

/** One walkable door in the Config TEACHER (config-revamp-design.md §3.5/§7.2) — an "Applies"/"Related"
 *  row the reader can activate. Pre-bound: the host resolved the address into the `openConfigTo` (or a
 *  contribution's own) opener before it crossed this seam, so the tabs render state-blind. */
export interface ConfigTeachDoor {
  readonly label: string;
  readonly open: () => void;
}

/** The focused LEAF's value seam, projected for the About tab (§3.4 row chrome, #866): the `@modified`
 *  verdict at leaf grain and the pre-bound Reset — the COARSE pointer's one path to it (the row menu is
 *  fine-pointer chrome). `null` on the view ⇒ the focused subject has no per-leaf binding (a section, a
 *  group, a composite row) and About teaches without the block.
 *
 *  `current`/`defaultValue` ARE DISPLAY STRINGS, NOT THE STORED VALUES (#1099 F15): they were raw `unknown`s
 *  the teacher formatted, and the teacher cannot reach a control's option table — so the pane printed
 *  "Using the default — md." beside a control reading "Medium". This file's law already said the host
 *  flattens to display data; the value block was the one place that did not. The MODIFIED verdict and the
 *  Reset write still run on the RAW values host-side, so a label can never decide what gets written. */
export interface ConfigTeachValue {
  readonly current: string;
  readonly defaultValue: string;
  readonly modified: boolean;
  readonly reset: () => void;
}

/** ONE ROW OF THE TEACHER'S ROSTER (#926, the owner's PS5 ruling: "the teacher pane lists info about the
 *  settings that you can currently SEE, and when you scroll down … it changes the number of items"). One
 *  entry per setting row intersecting the CONTENT viewport, already flattened: the leaf's registry label,
 *  its one-line gloss, and its value in the control's own display words.
 *
 *  IT CARRIES NO DOOR, deliberately — the context pane is never navigation (`UI-Architecture-and-Layout.md`
 *  §4.2, #1101): a roster entry that scrolled its row into view would be the LIST's job restated 900px to
 *  its right, which is the exact duplicate-door defect the jump list was deleted for. */
export interface ConfigRosterEntry {
  /** `sub/setting` — the address, stable across a re-derive, and the React key. */
  readonly id: string;
  readonly label: string;
  /** The SAME first sentence the row's own `Field.Description` renders, so roster and row cannot disagree.
   *  `null` for a `{none}` leaf: it opted out of teaching but is still IN VIEW, and a roster that dropped it
   *  would lie about the count the owner's ruling is written in terms of. */
  readonly gloss: string | null;
  /** The value in the control's display words, or `null` when the leaf has no bound `key`. */
  readonly value: string | null;
  readonly modified: boolean;
}

/** The RESOLVED lesson the Config context pane teaches (§7.2) — the focused leaf's teach, its section's,
 *  or the group's own, already flattened to display data by the host (this file may not import `#state`,
 *  so no registry vocabulary crosses; ids were resolved into doors before this shape exists). */
export interface ConfigTeachView {
  /** What the pane is about — the focused setting's label, the section's, or the group's. */
  readonly title: string;
  /** The breadcrumb under the title ("Appearance · Sizing & motion"), locating the subject on the map. */
  readonly trail: string;
  readonly summary: string;
  readonly affects: readonly string[];
  /** Where a narrower scope wins — the Applies tab's rows. Empty ⇒ the tab teaches "nothing overrides this". */
  readonly applies: readonly ConfigTeachDoor[];
  readonly related: readonly ConfigTeachDoor[];
  /** The Learn tab's body; `null` ⇒ the tab is absent (APPLICABILITY, never hiding). */
  readonly learn: (() => ReactNode) | null;
  /** The focused leaf's default-vs-current block (About renders it; `null` = no binding). */
  readonly value: ConfigTeachValue | null;
}

/** The Config teacher's tab-id VOCABULARY — homed beside `CHAT_CONTEXT_TAB_IDS` for the same reason and by
 *  the same gate (a feature `lib/` is not a type home). `config-teacher-tabs.tsx` keeps the DEFS and pairs
 *  them with this axis through a TOTAL `Record`, so a fourth tab fails `tsc` there until someone writes its
 *  def AND its applicability `when` — it can never default to permanently visible, which is how the Applies
 *  cell survived 107 empty states (#926). */
export const CONFIG_TEACHER_TAB_IDS = ["config.about", "config.applies", "config.learn"] as const;
export type ConfigTeacherTabId = (typeof CONFIG_TEACHER_TAB_IDS)[number];

/** The Config CONTEXT-panel state projection (O5 strict — the `defineContextTabs<ConfigContextState>`
 *  anchor, #866 S3). `member` is the OPEN collection member's arm: while present the Applies tab renders
 *  it (a member's "where it's attached" IS its applies answer) and the head band names the member;
 *  `teach` then carries the owning collection's lesson for About. `null` from `useContextState` = no
 *  group active and nothing open — the section's `empty` arm renders. */
export interface ConfigContextState {
  readonly teach: ConfigTeachView;
  readonly member: { readonly title: string; readonly body: () => ReactNode } | null;
  /** THE AT-REST BODY (#926): the settings currently in the reader's viewport. Non-empty ⇒ About renders
   *  the ROSTER; EMPTY ⇒ About renders `teach` — which is every drilled state (a focused row's own lesson),
   *  every open member, and the honest fallback for a section that renders no leaf rows at all (a jobs
   *  table, a collection roster). One field, one rule, and the render stays state-blind. */
  readonly roster: readonly ConfigRosterEntry[];
}
