// @orb/contracts/chat/views — chat's service-built library, turn, preview and picks wire projections.

import type { CharacterId, ChatId, ChatInjectionId, MessageVariantId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { MacroSourceRef, UserMacroInputDef } from "@orb/kit/macro";
import { MACRO_SOURCE_KINDS } from "@orb/kit/macro";
import { z } from "zod";
import type { ParticipantRole } from "#identity";
import type { ChoiceBlockSpec, TemplateDefId, UserMacroValues } from "#preset";
import { choiceBlockSchema, guidedActionKindSchema, promptConfigSchema, userMacroSchema, userMacroValuesSchema } from "#preset";
import { proseSlotIdSchema } from "#prose-slot";
import type { AssembledPrompt, AssembleTrace, AssemblyBudgetPreview, ChatInjection } from "./assemble.ts";
import { assembledPromptSchema, assembleTraceSchema, assemblyBudgetPreviewSchema, chatInjectionSchema } from "./assemble.ts";
import type { TurnAbortReason } from "./bus.ts";
import { TURN_ABORT_REASONS } from "./bus.ts";
import type { ChatDetail } from "./detail.ts";
import { chatDetailSchema } from "./detail.ts";
import type { ChatListCursor } from "./listing.ts";
import { chatListCursorSchema } from "./listing.ts";
import type { MessageView } from "./messages.ts";
import { messageViewSchema } from "./messages.ts";
import { participantRoleSchema } from "./roster.ts";

/** ONE character seat's face on a chat-list row (#192): the CAS portrait key plus the card name that backs
 *  its initials fallback and its accessible label (a stacked avatar needs both). `avatarHash` null = this
 *  seat has no portrait, which the row paints as its hue-seeded initials blob — never a broken image. */
export interface ChatSeatPortrait {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
}

/** The library-list row (listChats) — light, membership-scoped (D18: a chat I host OR am a member of; there
 *  is no `ownerId`). `lastMessageAt`/`messageCount` drive the list ordering + the unread chrome. */
export interface ChatSummary {
  readonly id: ChatId;
  readonly title: string | null;
  readonly starred: boolean;
  readonly archived: boolean;
  /** The timestamp of the newest message (null for an empty just-created chat). With `updatedAt` it IS the
   *  list's sort key — every surface renders `lastMessageAt ?? updatedAt` and `listChats` orders on exactly
   *  that expression in SQL (#150), so the row on top is the room whose stamp is the freshest. */
  readonly lastMessageAt: number | null;
  /** When the VIEWER last spoke here: the newest visible message they authored, or null when they never have.
   *  Per-caller, so Home resumes the room this person was in, not the room someone else was busiest in. */
  readonly viewerLastTurnAt: number | null;
  readonly messageCount: number;
  /** The SCENT line: the newest visible message flattened to plain text
   *  (`@orb/kit/content::projectBodyForPreview` — hidden-class spans + structured spans dropped, markdown
   *  flattened, word-boundary-capped at `PREVIEW_MAX_CHARS`). The budget is the WIDEST consumer's — home's
   *  two-line hero, not the one-line chats-list row that clips it in CSS (#188 N-2). `null` when there is
   *  nothing this CALLER may see: an empty chat, a body that was
   *  all structure, or — the member-visibility arm — a viewer whose D16 history floor sits ABOVE the newest
   *  row (their whole readable window is empty, so a preview would be the one surface leaking pre-join canon).
   *  Per-caller by construction: the floor is resolved from the viewer's own participant row, never stamped. */
  readonly lastMessagePreview: string | null;
  /** Is this chat a LIVE GAME (docs/plans/rpg/design.md)? The ONE takeover-gate predicate (`isRpgEngaged`) over the
   *  opaque `metadata.rpg` pointer this row already carries — the SAME sync surface `ChatDetail.rpg` and every
   *  client rpg gate read, so the list marker can never disagree with the chat it opens (chat stays
   *  rpg-table-blind: no join, no cross-domain read; a detached/healed pointer, or a game toggled OFF, is
   *  `false`).
   *
   *  RULING FORK, recorded (#863(f), 2026-08-30). This clause used to end "a disengaged game shows no panel,
   *  so it shows no marker". The MECHANISM survives verbatim — `isGame` is still the one engagement
   *  predicate, still pointer-only, and a disengaged game still shows no panel and no ⚔. What changed is its
   *  INPUT: the drive found that once a game is off, its existence is visible ONLY behind a host-only tab in
   *  a pane that ships closed, so a host cannot find the rooms with a sleeping game. The answer is a SECOND
   *  bit ({@link ChatSummary.gamePaused}), not a widened `isGame`. */
  readonly isGame: boolean;
  /** Does this chat carry a game that is currently OFF (#863(f), owner-ordered 2026-08-30)? The SECOND bit
   *  off the SAME opaque pointer — `metadata.rpg` present AND `isRpgEngaged` false. It does NOT widen
   *  `isGame` and it does NOT read the rpg tables (the rpg-table-blind mechanism above is untouched): it
   *  exists because the ONLY surviving evidence of a paused game was a host-only tab inside a pane that
   *  ships closed, so a host could not see which rooms had a game sleeping in them. The list row wears it as
   *  a QUIET marker (`Game chat — paused`), never as the live ⚔ — the panel/assembly still see nothing, which
   *  is what the `isGame` ruling actually protects. */
  readonly gamePaused: boolean;
  /** The resolved present characters for the list card (names only — the heavy roster is `getChat`), PER-CALLER:
   *  the VIEWER'S OWN seat is suppressed while any other seat remains, so an untitled row reads "Niko", not
   *  "You, Niko" (side-eye NR4 — the viewer is in every chat they can list, so their own name is a constant
   *  prefix that carries nothing and costs title width). A solo/self chat keeps its name, so the row never
   *  falls through to "Untitled chat". */
  readonly participantNames: readonly string[];
  /** The row's own PORTRAITS — one entry per PRESENT character seat, in seat order (#192). The list row
   *  paints a face per seat (one seat = a portrait, two or more = an `AvatarStack`), and until now the
   *  client resolved those faces by fetching the WHOLE character library (`character.list {limit: 500}`)
   *  on every surface that shows a chat row, then indexing character ids into it — a whole-library read to
   *  decorate six rows, and one that simply stopped resolving past the page ceiling.
   *  A row carries what it is about, so the seats ride the row.
   *
   *  Derived from the roster views this projection ALREADY loads (`loadParticipantViews` — the same read
   *  that produces `participantNames`), so it costs no extra query and its name/avatar resolution is the
   *  one the room itself uses. PRESENT seats only: a face is a statement about who is IN the room, and the
   *  roster resolver only decorates present seats. */
  readonly participantPortraits: readonly ChatSeatPortrait[];
  /** The CALLER's own role in this chat (D18 membership), derived per-caller from the `chat_participants`
   *  FK truth in the listing projection — never stamped. Drives the Automation pane's chat picker (which
   *  offers only HOSTED chats, since v1 rule authoring IS room-host authority) and any future
   *  host-vs-member list affordance. Present on every listing row (listChats/listForks/getChatLineage). */
  readonly viewerRole: ParticipantRole;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** One KEYSET page of the caller's chat library (`listChats`) — newest-CONVERSATION first (ordered on the
 *  clock the rows DISPLAY, `lastMessageAt ?? updatedAt`; #150), filtered by the
 *  request's `characterId`/`includeArchived`. Mirrors the `items`/`nextCursor` shape of `character`'s own
 *  `ListCharactersResult` and ADDS the census.
 *
 *  `totalCount` is a real server `COUNT` over the SAME scope this page windows, not `items.length`. The
 *  characters band had to DROP its count when that list went keyset-paged ("any number here would be
 *  'loaded so far', and a census that silently means something else is worse than none",
 *  `characters-list-header.tsx`) — chat prints its census in two user-visible places (the chats band's count
 *  and the character card's "N chats"), so the honest number is served rather than the badge deleted. */
export interface ChatListPage {
  readonly items: readonly ChatSummary[];
  /** The keyset boundary to pass as the next `cursor`; `null` when a short page came back (no row remains). */
  readonly nextCursor: ChatListCursor | null;
  readonly totalCount: number;
  /** When the viewer last spoke anywhere in this list's scope (not only this page), or null for an account that
   *  never has: Home's first-run test. */
  readonly viewerLastTurnAt: number | null;
}

/** The fork-lineage chain (`chat.getChatLineage`): the chat's ancestors then the chat itself, oldest root
 *  first. Each ancestor is gated independently (a fork grants no parent membership, D27), so an ancestor the
 *  caller is not a present member of is omitted and the chain may be sparse. */
export interface ChatLineageView {
  readonly chain: readonly ChatSummary[];
}

/** One sibling variant's identity + position (listMessageVariants) — NO content, just enough to resolve an
 *  idx to its variant id. Ordered by `idx` ascending. The swipe strip's step-target resolver: `MessageView`
 *  carries only the SELECTED variant per slot (D26), so reaching an idx this session hasn't rendered
 *  (e.g. a cold page load mid-way through a multi-variant slot) needs this read. */
export interface MessageVariantSummary {
  readonly variantId: MessageVariantId;
  readonly idx: number;
}

/** The assembly preview (previewAssembly) — the BUILD product for a hypothetical turn + the debug trace.
 *  Host/admin-only at the transport (the trace is metadata-about-assembly, never RP content). */
export interface AssemblyPreview {
  readonly prompt: AssembledPrompt;
  readonly trace: AssembleTrace;
  /** The next turn's CONTEXT BUDGET, partitioned by source (D-4 — the Preview tab's stacked bar + drill-in
   *  rows). Same build, same fit, same estimator as the turn itself; `sources` partitions `totalTokens`. */
  readonly budget: AssemblyBudgetPreview;
}

/** One ACTION template resolved against a bound chat (`previewActionTemplates` — D8 / §7.1). NON-exported:
 *  its ONE consumer is {@link ActionTemplatesPreview}, which carries it across the wire (the `matrix.ts`
 *  idiom — a second exported name for the same row would be dead surface). */
interface ActionTemplatePreview {
  /** The `TEMPLATE_DEFS` row this resolution belongs to — the readout keys its rows off the SAME registry
   *  the Actions list renders from, so a new template needs no new field here. */
  readonly id: TemplateDefId;
  /** The template rendered through the chat's own macro resolution: identity/chat macros REAL, the two
   *  fire-time tokens (`{{input}}`/`{{person}}`) preserved verbatim — the §7 honesty pin's bound arm. */
  readonly resolved: string;
}

/** The preset editor's BOUND readout payload: every ACTION template of
 *  the inspected preset, resolved against the bound chat, plus the identity bindings that resolution used.
 *
 *  HOST-GATED like the rest of the preview family: a rendered template can carry `{{charsysinfo}}` /
 *  `{{description}}` / `{{persona}}`, i.e. the D22 full-fidelity card bytes `previewSection` is host-gated
 *  for. Nothing here persists — it is a dry-run render of the chat as it stands. */
export interface ActionTemplatesPreview {
  /** WHAT `{{user}}`/`{{char}}` resolved TO in this chat — the readout's bound gloss names the resolution
   *  ("`{{user}}` resolves through the chat") instead of merely claiming one happened. */
  readonly identity: { readonly user: string; readonly char: string };
  readonly templates: readonly ActionTemplatePreview[];
}

/** One persisted positional injection (the `chat_injections` row resolved) — the `ChatInjection` wire shape
 *  plus its id. Returned by setChatInjection / listChatInjections. */
export interface ChatInjectionView extends ChatInjection {
  readonly id: ChatInjectionId;
}

/** The per-chat ChoiceBlock variable map (`{{get::<name>}}`) — what `getVariables` (effective,
 *  computed-this-turn) returns; the PERSISTED picks ride `getVariablePicks.values` (the pane's one read). */
export type ChatVariables = Record<string, string>;

/** One PICKABLE user macro as the picks pane sees it (#24) — the least-privilege projection of the active
 *  preset's `UserMacroSpec`: identity + the typed INPUT declarations only. The macro BODY and its declared
 *  `args` are deliberately NOT projected — the body is prompt content (the same class `previewAssembly`/
 *  `previewSection` are host-gated for), while this read is member-gated because a picker needs the
 *  question, not the template. `inputs` is kit's own `UserMacroInputDef` (contracts/preset's authored
 *  schema is pinned assignable to it), so the pane renders each control off the ONE input vocabulary.
 *  NON-exported (the `matrix.ts` idiom): its ONE consumer is {@link UserMacroPicksView}, which carries it
 *  across the wire — a second exported name for the same row would be dead surface (knip RED). */
interface UserMacroPickDef {
  readonly name: string;
  readonly description: string;
  readonly inputs: readonly UserMacroInputDef[];
  /** WHICH authoring home declared it (owner ruling #20's two homes) — `preset` = the chat's active preset,
   *  `game` = this chat's rpg game config. Derived from kit's own `MacroSourceRef.kind` (never a re-spelled
   *  union). The pane glosses a `game` macro so a picker can tell why a knob appeared with the game and will
   *  vanish with it; on a name clash the GAME def is the one projected (it is the one the turn resolves —
   *  `shadowPresetUserMacros`). */
  readonly source: MacroSourceRef["kind"];
}

/** The MU picks pane read (`getUserMacroPicks`, #24) — the chat's pickable user-macro declarations (the
 *  resolved preset's `userMacros` that declare at least one input; a macro with no inputs has nothing to
 *  pick) plus the persisted per-chat picks (`chats.user_macro_values`). Per-CHAT, not per-user: the picks
 *  are room state every member shares (the owner's Arm-A ruling — the `setVariables` sibling), and the
 *  WRITE is the member-gated `setUserMacroValues`. A macro/input absent from `values` is UNSET — it
 *  resolves its per-kind default at turn time (`resolveUserMacroInputs`), which is what the pane shows. */
export interface UserMacroPicksView {
  readonly macros: readonly UserMacroPickDef[];
  readonly values: UserMacroValues;
}

/** The picks pane's ChoiceBlock read (`getVariablePicks`) — the SECOND knob family in the same pane: the
 *  active preset's declared `variables` plus the persisted per-chat picks (`chats.variableValues`, written
 *  by the member-gated `setVariables`). Same member floor, same per-CHAT store, same UNSET semantics as its
 *  {@link UserMacroPicksView} sibling (an absent key — or an empty string, which `resolveChoiceVariables`
 *  reads alike — falls back to the declared `defaultValue`, else the first option).
 *
 *  PROJECTION: the WHOLE `ChoiceBlockSpec`, deliberately. Unlike a `UserMacroSpec` there is no body/args
 *  class to withhold — a ChoiceBlock IS its question + its offered values, and every remaining field is
 *  load-bearing for the picker (`multiSelect`/`separator` decide how a pick is stored, `randomPick` and
 *  `defaultValue` decide what the pick DOES and what UNSET resolves to). Withholding any of them would make
 *  the pane lie about the turn, not protect anything. */
export interface VariablePicksView {
  readonly variables: readonly ChoiceBlockSpec[];
  readonly values: ChatVariables;
}

/** The verb-level result of a completed (or aborted) turn — the committed message(s) joined to their
 *  selected variant. A per-speaker group round commits several rows. */
export interface TurnOutcome {
  /** Empty when the turn aborted before any commit. */
  readonly messages: readonly MessageView[];
  readonly aborted: boolean;
  readonly abortReason?: TurnAbortReason | undefined;
}

/** `startChat` — the lazily-created chat (+ roster) and the seeded opening, if any. `opening` is null when
 *  the resolved policy seeded no greeting (`none`, or a founding character with no card greeting). The
 *  `generate` opening + its `openingFailure` DEGRADED-NOT-BROKEN apparatus (START-1) retired with the
 *  creation-time draft carry (D166) — "guide the opening" is
 *  now an ordinary post-creation turn against the real room, so a failed generation is just a failed
 *  turn with the standard toast, never data on a successful `startChat`. */
export interface StartChatResult {
  readonly chat: ChatDetail;
  readonly opening: TurnOutcome | null;
}

/** `forkChat` — the new deep-copied, membership-scoped fork. */
export interface ForkResult {
  readonly chat: ChatDetail;
}

/** `reapTemporaryChats` — how many temporary chats were reaped. */
export interface ReapResult {
  readonly reaped: number;
}

export const chatSeatPortraitSchema = z.strictObject({
  characterId: typeIdSchema(ID_PREFIX.character),
  name: z.string(),
  avatarHash: z.string().nullable(),
}) satisfies z.ZodType<ChatSeatPortrait>;
export const chatSummarySchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.chat),
  title: z.string().nullable(),
  starred: z.boolean(),
  archived: z.boolean(),
  lastMessageAt: z.number().nullable(),
  viewerLastTurnAt: z.number().nullable(),
  messageCount: z.number(),
  lastMessagePreview: z.string().nullable(),
  isGame: z.boolean(),
  gamePaused: z.boolean(),
  participantNames: z.array(z.string()).readonly(),
  participantPortraits: z.array(chatSeatPortraitSchema).readonly(),
  viewerRole: participantRoleSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
}) satisfies z.ZodType<ChatSummary>;
export const chatListPageSchema = z.strictObject({
  items: z.array(chatSummarySchema).readonly(),
  nextCursor: chatListCursorSchema.strict().nullable(),
  totalCount: z.number(),
  viewerLastTurnAt: z.number().nullable(),
}) satisfies z.ZodType<ChatListPage>;
export const chatLineageViewSchema = z.strictObject({
  chain: z.array(chatSummarySchema).readonly(),
}) satisfies z.ZodType<ChatLineageView>;
export const messageVariantSummarySchema = z.strictObject({
  variantId: typeIdSchema(ID_PREFIX.messageVariant),
  idx: z.number(),
}) satisfies z.ZodType<MessageVariantSummary>;
export const assemblyPreviewSchema = z.strictObject({
  prompt: assembledPromptSchema,
  trace: assembleTraceSchema,
  budget: assemblyBudgetPreviewSchema,
}) satisfies z.ZodType<AssemblyPreview>;
const templateDefIdSchema = z.union([
  guidedActionKindSchema,
  promptConfigSchema.shape.formatStrings.unwrap().keyof(),
  proseSlotIdSchema,
]) satisfies z.ZodType<TemplateDefId>;
const actionTemplatePreviewSchema = z.strictObject({ id: templateDefIdSchema, resolved: z.string() }) satisfies z.ZodType<ActionTemplatePreview>;
export const actionTemplatesPreviewSchema = z.strictObject({
  identity: z.strictObject({ user: z.string(), char: z.string() }),
  templates: z.array(actionTemplatePreviewSchema).readonly(),
}) satisfies z.ZodType<ActionTemplatesPreview>;
export const chatInjectionViewSchema = chatInjectionSchema.extend({ id: typeIdSchema(ID_PREFIX.chatInjection) }) satisfies z.ZodType<ChatInjectionView>;
export const chatVariablesSchema = z.record(z.string(), z.string()) satisfies z.ZodType<ChatVariables>;
const macroInputSchema = userMacroSchema.shape.inputs.unwrap().element;
const macroInputViewSchema = macroInputSchema
  .strict()
  .extend({ options: z.array(macroInputSchema.shape.options.unwrap().element.strict()).readonly() }) satisfies z.ZodType<UserMacroInputDef>;
const userMacroPickDefSchema = z.strictObject({
  name: z.string(),
  description: z.string(),
  inputs: z.array(macroInputViewSchema).readonly(),
  source: z.enum(MACRO_SOURCE_KINDS),
}) satisfies z.ZodType<UserMacroPickDef>;
export const userMacroPicksViewSchema = z.strictObject({
  macros: z.array(userMacroPickDefSchema).readonly(),
  values: userMacroValuesSchema,
}) satisfies z.ZodType<UserMacroPicksView>;
export const variablePicksViewSchema = z.strictObject({
  variables: z.array(choiceBlockSchema.strict().extend({ options: z.array(choiceBlockSchema.shape.options.element.strict()) })).readonly(),
  values: chatVariablesSchema,
}) satisfies z.ZodType<VariablePicksView>;
export const turnOutcomeSchema = z.strictObject({
  messages: z.array(messageViewSchema).readonly(),
  aborted: z.boolean(),
  abortReason: z.enum(TURN_ABORT_REASONS).optional(),
}) satisfies z.ZodType<TurnOutcome>;
export const startChatResultSchema = z.strictObject({ chat: chatDetailSchema, opening: turnOutcomeSchema.nullable() }) satisfies z.ZodType<StartChatResult>;
export const forkResultSchema = z.strictObject({ chat: chatDetailSchema }) satisfies z.ZodType<ForkResult>;
export const reapResultSchema = z.strictObject({ reaped: z.number() }) satisfies z.ZodType<ReapResult>;
