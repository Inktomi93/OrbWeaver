// @orb/contracts/chat/detail — the full chat read (`ChatDetail`) and the invite join result that carries it.
// The shape is authored as an interface (its per-field docs are the room's visibility contract) and twinned
// by a strict runtime schema; `zod-output-twin-parity` holds the two to the same output. The schema is the
// tRPC output parser of `invites.redeemInvite` and `invites.acceptInvite`, so a producer that adds a key to
// the detail, a roster row or an identity entry fails the join response instead of reaching the new member.

import type { ChatId, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import type { ChatRpgPointer } from "#rpg";
import { chatRpgPointerSchema } from "#rpg";
import type { ThemeBackground } from "#theme";
import { themeBackgroundSchema } from "#theme";
import type { GroupConfig, OpeningPolicy, RoomOverrides } from "./metadata.ts";
import { groupConfigSchema, openingPolicySchema, roomOverridesSchema } from "./metadata.ts";
import type { ChatIdentity } from "./producers.ts";
import { chatIdentitySchema } from "./producers.ts";
import type { ParticipantView } from "./roster.ts";
import { participantViewSchema } from "./roster.ts";

/** The full chat read (getChat) — the row resolved + the present roster + the effective room behavior
 *  (`group`/`roomOverrides`/`opening` parsed from `metadata`, fault-isolated to their defaults). The message
 *  list is fetched separately (listMessages, paged). */
export interface ChatDetail {
  readonly id: ChatId;
  readonly title: string | null;
  readonly starred: boolean;
  readonly archived: boolean;
  /** ST "Temporary Chat" — this room is ephemeral: hidden from `listChats` and swept once past
   *  the host's TTL. Exposed because the flag is CREATION-ONLY: a user who only learns their room was
   *  temporary after the first send cannot fix it, so the room must keep saying so. Read-only here — the
   *  only writer is `startChat` (`chat-detail.ts` projects it; no verb updates the column). */
  readonly temporary: boolean;
  readonly parentChatId: ChatId | null;
  readonly forkedAt: number | null;
  /** The stable `{{user}}` anchor persona (chat-open POV for card-authored sections). */
  readonly anchorPersonaId: ParticipantView["activePersonaId"];
  readonly participants: readonly ParticipantView[];
  /** The CALLER's own participant's `activePersonaId` (FINAL-Persona §A — Chat persona #3) — populated
   *  server-side from the resolving `principal`, so the client never has to find-and-match its own
   *  userId in `participants`. Null when the caller has none set (never null-because-absent: `getChat`
   *  requires present membership, so a matching participant always exists). */
  readonly viewerActivePersonaId: ParticipantView["activePersonaId"];
  /** `true` when the caller is this chat's host (`chat_participants.role === 'host'`) — gates
   *  host-only controls client-side (e.g. the Anchor re-pin) without a second round trip. */
  readonly viewerIsHost: boolean;
  /** The CALLER's own userId (== `principal.userId`, never a foreign-user leak) — the "own-authored
   *  content" signal for a client-side own-messages filter (e.g. reattribute's `authorUserId` match).
   *  NOT an identity/whoami surface (no handle/avatar/email) — those stay deferred to auth #50. */
  readonly viewerUserId: UserId;
  /** The pending host-handoff NOMINEE (`chats.pendingHostUserId`, Part III §2) — null when no handoff is
   *  in flight. Drives the Members-panel pending-nomination chip (FINAL-Chats §8.3); room-public (members
   *  already see every participant's userId), refreshed by the `chatUpdated` the nominate/accept verbs emit. */
  readonly pendingHostUserId: UserId | null;
  /** The effective room behavior (parsed from `metadata`; defaults applied — never raw). */
  readonly group: GroupConfig;
  readonly roomOverrides: RoomOverrides;
  /** The host's per-chat tool-call recursion cap (`metadata.toolRecurseLimit`, Phase A L3) — `null` when
   *  unset (the turn engine falls to its default). Exposed so the host's room-settings control can display +
   *  edit the current value; the WRITE is `chat.setToolRecurseLimit` (host-gated). */
  readonly toolRecurseLimit: number | null;
  /** D121-E — the host's display-tier room OPTION (`metadata.hostDisplayScripts`). `true` ⇒ the HOST's
   *  display-tier regex scripts render for every viewer here; `false` (the default) ⇒ display regex is
   *  strictly per-user. Exposed so the host's room-settings switch can show its state; the WRITE is
   *  `chat.setHostDisplayScripts` (host-gated). Room-public — a member reads it too, because it explains
   *  why their transcript looks the way it does. */
  readonly hostDisplayScripts: boolean;
  /** B1 — this room's OWN offer-choices posture (`metadata.offerChoices`), or `null` when the room has never
   *  been pinned and therefore INHERITS the viewer-host's per-user default. The RAW tri-state, deliberately
   *  not the resolved boolean: the resolution needs the HOST's `UserSettings.chat.offerChoices`, which this
   *  projection does not read (and must not, for a member viewer) — while the one surface that resolves it,
   *  the host's own toggle, already holds the host's settings because the viewer IS the host there. So the
   *  wire carries the fact and `resolveOfferChoices` (\@orb/contracts/chat) carries the rule, once. WRITE:
   *  `chat.setOfferChoices` (host-gated). Room-public on the read — a member may see why the model keeps
   *  offering choices. */
  readonly offerChoices: boolean | null;
  /** B7 — this room's OWN "characters can react" posture (`metadata.charactersCanReact`), or `null` for
   *  inherit. The same RAW tri-state as `offerChoices` above, for the same reason (the resolution needs
   *  the HOST's per-user default, which only the host's own toggle holds). WRITE:
   *  `chat.setCharactersCanReact` (host-gated). Room-public — a member may see why a character just
   *  dropped an emoji on their line. */
  readonly charactersCanReact: boolean | null;
  /** B7 — this room's OWN reaction-plane posture (`metadata.reactionsEnabled`), or `null` for inherit.
   *  RAW tri-state (see `offerChoices`); the RESOLVED verdict every member needs rides `listReactions`
   *  (`ChatReactionsView.reactionsEnabled`) — the read the pills and picker doors already consume. WRITE:
   *  `chat.setReactionsEnabled` (host-gated). */
  readonly reactionsEnabled: boolean | null;
  /** BG-C — the host-set per-chat carried BACKGROUND source (parsed `metadata.background`), or `null` when
   *  unset. Applied at the app-root background layer in a TRUE-SOLO room, above the card-carried twin; INERT
   *  for every viewer in any other composition (client-resolved). */
  readonly background: ThemeBackground | null;
  /** The OPAQUE rpg sync pointer (parsed `metadata.rpg`, docs/plans/rpg/design.md), or `null` when this chat is
   *  not a game. Mode-free `{gameId}` — the client's takeover gate is a SYNC read off this (data it already
   *  holds), then it reads the lite/full trim from `rpg.getGame`. Chat never dereferences it; a corrupt blob
   *  heals to absent at the parser. */
  readonly rpg: ChatRpgPointer | null;

  readonly opening: OpeningPolicy | null;
  /** The portable compaction checkpoint (D25) — the summary text + the seq it covers through. */
  readonly compactSummary: string | null;
  readonly compactedAtSeq: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** The kind-polymorphic CHAT IDENTITY producer (D137, Chat-Macro-Resolution.md §1), member-gated, covering
   *  every participant's seat/active-persona id — the client derives `{{char}}`/`{{user}}`/`{{persona}}`
   *  history names via `buildIdentityNameContext` → `@orb/kit/macro`'s `resolveRowMacros`, and the row
   *  attribution avatars via `buildIdentityAvatarMaps` → `resolveRowAttribution` (incl. the removed-character
   *  portrait floor: a character with no `ParticipantView` still resolves from this participant-independent
   *  entry). Does NOT cover a loaded page's message-stamped ids beyond the roster (a since-switched persona) —
   *  `listMessages`'s `MessagesPage.identities` covers that half; the client merges both as it paginates back
   *  (detail ∪ pages, last-write-wins on `identityKey`). */
  readonly identities: readonly ChatIdentity[];
}

/** The strict runtime twin of {@link ChatDetail}. Every object this module owns is strict. The reused
 *  sub-schemas keep their own semantics: `groupConfigSchema` and `roomOverridesSchema` are strict already;
 *  the carried `background` and `rpg` pointer reuse their lenient read schemas, which heal a stale stored value
 *  and strip an unknown key rather than fail (see `participantViewSchema` for why a join must not fail on one). */
export const chatDetailSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.chat),
  title: z.string().nullable(),
  starred: z.boolean(),
  archived: z.boolean(),
  temporary: z.boolean(),
  parentChatId: typeIdSchema(ID_PREFIX.chat).nullable(),
  forkedAt: z.number().nullable(),
  anchorPersonaId: typeIdSchema(ID_PREFIX.persona).nullable(),
  participants: z.array(participantViewSchema).readonly(),
  viewerActivePersonaId: typeIdSchema(ID_PREFIX.persona).nullable(),
  viewerIsHost: z.boolean(),
  viewerUserId: brandedId<UserId>(),
  pendingHostUserId: brandedId<UserId>().nullable(),
  group: groupConfigSchema,
  roomOverrides: roomOverridesSchema,
  toolRecurseLimit: z.number().nullable(),
  hostDisplayScripts: z.boolean(),
  offerChoices: z.boolean().nullable(),
  charactersCanReact: z.boolean().nullable(),
  reactionsEnabled: z.boolean().nullable(),
  // Lenient on purpose: strips and heals a stale stored blob so it cannot fail a committed join; no secrets here.
  background: themeBackgroundSchema.nullable(),
  // Lenient on purpose: strips and heals a stale stored blob so it cannot fail a committed join; no secrets here.
  rpg: chatRpgPointerSchema.nullable(),
  opening: openingPolicySchema.nullable(),
  compactSummary: z.string().nullable(),
  compactedAtSeq: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  identities: z.array(chatIdentitySchema).readonly(),
}) satisfies z.ZodType<ChatDetail>;

/** `redeemInvite` / `acceptInvite` — the now-joined chat as the new member reads it (their own D16 floor
 *  already applied by the producer) plus their own roster row. STRICT at every owned level and the output
 *  parser of both procedures. */
export const redeemInviteResultSchema = z.strictObject({
  chat: chatDetailSchema,
  participant: participantViewSchema,
});
export type RedeemInviteResult = z.infer<typeof redeemInviteResultSchema>;
