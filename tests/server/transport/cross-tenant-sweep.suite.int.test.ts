// Cross-tenant IDOR sweep — THE forcing function for "a new verb forgot its owner/membership predicate."
// Seed one-of-everything as owner A (real rows, distinctive marker NAMES), then probe EVERY id-taking tRPC
// procedure as a STRANGER (owner B) with A's real ids, asserting a LEAK-FREE outcome: a thrown TRPCError is
// `NOT_FOUND` (the doctrine's leak-free collapse — NEVER `FORBIDDEN`, which is an existence oracle for an
// owned entity), and a resolved value carries NONE of A's marker names (never A's row). A post-sweep
// integrity re-read proves no probe silently MUTATED A's world (a write-IDOR that returns void).
//
// It runs over the REAL composition root (`app` fixture = the whole server graph) through the REAL tRPC
// middleware ladder + routers, so a verb that dropped its `requireOwner`/`requireParticipant`/`can()` gate
// leaks here — nothing else covers the whole surface at once. The COMPLETENESS GUARD enumerates
// `appRouter._def.procedures` and fails if any procedure is neither PROBED nor EXEMPT(reason) — so the sweep
// GROWS WITH THE ROUTER: a new id-taking verb can't be added without classifying it here.
//
// FINDINGS PROTOCOL: any probe that returns A's data OR throws a distinguishable (non-NOT_FOUND) error is a
// security finding — this suite goes RED and the failure is a STOP-and-report item (route to
// security-executor), NOT something the docs/test lane fixes.

import { themes, userCredentials, workloadSchedules, workloads } from "@orb/db";
import type { ThemeId, UserCredentialId, WorkloadId, WorkloadScheduleId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { appRouter } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import type { AppCaller } from "../../support/fixtures";
import { expect, OWNER_USER_ID, test } from "../../support/fixtures";
import { seedChat, seedMessage, seedParticipant } from "../domain/chat/_support";

// ── Owner A's distinctive marker names — these strings exist ONLY in A's owned rows, so their appearance in
//    a stranger's result is an unambiguous LEAK signal (an echoed input id is NOT a leak — a stranger's own
//    empty/zeroed result may legitimately carry the id it asked about; a NAME never appears by accident). ──
const MARK = {
  character: "AlphaSecretHero",
  persona: "AlphaSecretPersona",
  preset: "AlphaSecretPreset",
  book: "AlphaSecretBook",
  entry: "AlphaSecretEntry",
  tag: "alphasecrettag",
  theme: "AlphaSecretTheme",
  message: "AlphaSecretMessage",
  credential: "AlphaSecretCred",
  workload: "AlphaSecretWorkload",
  schedule: "AlphaSecretSchedule",
} as const;
const MARKERS = Object.values(MARK);

/** Owner A's seeded ids — collected once, fed to every stranger probe. */
interface OwnerIds {
  characterId: string;
  personaId: string;
  presetId: string;
  bookId: string;
  entryId: string;
  tagId: string;
  credentialId: string;
  themeId: string;
  workloadId: string;
  scheduleId: string;
  snapshotId: string;
  chatId: string;
  messageId: string;
}

/** tRPC's cross-realm error duck-type (matchers.ts precedent): an Error named "TRPCError" with a code. */
function trpcCode(e: unknown): string | null {
  if (e instanceof Error && e.name === "TRPCError" && "code" in e) {
    const code: unknown = (e as Error & { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

/**
 * The uniform leak-free VERDICT for ONE stranger probe (pure — the sweep collects verdicts then asserts once,
 * so there is no branching `expect`). A probe is a LEAK (verdict `ok:false`) if it:
 *   • throws a NON-`NOT_FOUND` error (a `FORBIDDEN` existence-oracle, a 500, a non-tRPC throw), OR
 *   • resolves with any of owner A's marker NAMES in the serialized result.
 * A `NOT_FOUND` throw or a benign marker-free resolve (a no-op mutation / empty list) is leak-free.
 */
async function leakVerdict(path: string, thunk: () => Promise<unknown>): Promise<string | null> {
  let value: unknown;
  try {
    value = await thunk();
  } catch (e) {
    const code = trpcCode(e);
    return code === "NOT_FOUND"
      ? null
      : `${path}: a stranger's rejection must be leak-free NOT_FOUND, got ${code ?? `non-tRPC ${String(e)}`}`;
  }
  const leaked = MARKERS.find((m) => (JSON.stringify(value) ?? "").includes(m));
  return leaked === undefined
    ? null
    : `${path}: a stranger's result leaked owner A's data ("${leaked}")`;
}

/** One probe: the router path + the stranger call built from owner A's ids. */
interface Probe {
  readonly path: string;
  readonly call: (stranger: AppCaller, ids: OwnerIds) => Promise<unknown>;
}

// Synthesized secondary ids — `brandedId` is `z.string().min(1)` (no prefix check), and the OWNER/MEMBER
// gate is the chokepoint (it rejects before any secondary-id existence check), so a stranger sees NOT_FOUND
// regardless of whether these resolve to a real row.
const FAKE = {
  variantId: "variant_fake",
  injectionId: "chat_injection_fake",
  inviteId: "chatinvite_fake",
  // A raw invite token that hashes to nothing — token-authenticated probes collapse to NOT_FOUND.
  inviteToken: "stranger-guess-token",
} as const;

const PROBES: readonly Probe[] = [
  // ── character (owner-scoped) ──
  { path: "character.get", call: (c, i) => c.character.get({ characterId: i.characterId }) },
  {
    path: "character.getCard",
    call: (c, i) => c.character.getCard({ characterId: i.characterId }),
  },
  {
    path: "character.update",
    call: (c, i) => c.character.update({ characterId: i.characterId, input: { name: "hacked" } }),
  },
  { path: "character.remove", call: (c, i) => c.character.remove({ characterId: i.characterId }) },
  {
    path: "character.duplicate",
    call: (c, i) => c.character.duplicate({ characterId: i.characterId }),
  },
  {
    path: "character.snapshot",
    call: (c, i) => c.character.snapshot({ characterId: i.characterId }),
  },
  {
    path: "character.listSnapshots",
    call: (c, i) => c.character.listSnapshots({ characterId: i.characterId }),
  },
  {
    path: "character.restore",
    call: (c, i) => c.character.restore({ characterId: i.characterId, snapshotId: i.snapshotId }),
  },
  {
    path: "character.bulkRemove",
    call: (c, i) => c.character.bulkRemove({ characterIds: [i.characterId] }),
  },
  {
    path: "character.bulkArchive",
    call: (c, i) => c.character.bulkArchive({ characterIds: [i.characterId], archived: true }),
  },
  {
    // biome-ignore lint/security/noSecrets: "character.bulkAddCardTag" is a router path constant, not a secret.
    path: "character.bulkAddCardTag",
    call: (c, i) => c.character.bulkAddCardTag({ tagName: "x", characterIds: [i.characterId] }),
  },
  {
    // biome-ignore lint/security/noSecrets: "character.bulkRemoveCardTag" is a router path constant, not a secret.
    path: "character.bulkRemoveCardTag",
    call: (c, i) => c.character.bulkRemoveCardTag({ tagName: "x", characterIds: [i.characterId] }),
  },
  // ── persona (owner-scoped) ──
  { path: "persona.get", call: (c, i) => c.persona.get({ personaId: i.personaId }) },
  {
    path: "persona.update",
    call: (c, i) => c.persona.update({ personaId: i.personaId, input: { name: "hacked" } }),
  },
  { path: "persona.remove", call: (c, i) => c.persona.remove({ personaId: i.personaId }) },
  { path: "persona.duplicate", call: (c, i) => c.persona.duplicate({ personaId: i.personaId }) },
  { path: "persona.export", call: (c, i) => c.persona.export({ personaId: i.personaId }) },
  {
    path: "persona.createFromCharacter",
    call: (c, i) =>
      c.persona.createFromCharacter({ characterId: i.characterId, swapMacros: false }),
  },
  {
    path: "persona.connectToCharacter",
    call: (c, i) =>
      c.persona.connectToCharacter({ characterId: i.characterId, personaId: i.personaId }),
  },
  {
    path: "persona.disconnectFromCharacter",
    call: (c, i) =>
      c.persona.disconnectFromCharacter({ characterId: i.characterId, personaId: i.personaId }),
  },
  {
    path: "persona.listConnectedToCharacter",
    call: (c, i) => c.persona.listConnectedToCharacter({ characterId: i.characterId }),
  },
  {
    path: "persona.setActivePersona",
    call: (c, i) => c.persona.setActivePersona({ chatId: i.chatId, personaId: i.personaId }),
  },
  // ── preset (single-owner) ──
  { path: "preset.get", call: (c, i) => c.preset.get({ id: i.presetId }) },
  { path: "preset.update", call: (c, i) => c.preset.update({ id: i.presetId, name: "hacked" }) },
  { path: "preset.remove", call: (c, i) => c.preset.remove({ id: i.presetId }) },
  { path: "preset.resetToDefault", call: (c, i) => c.preset.resetToDefault({ id: i.presetId }) },
  // ── world-info (owner-scoped) ──
  { path: "worldInfo.getBook", call: (c, i) => c.worldInfo.getBook({ bookId: i.bookId }) },
  {
    path: "worldInfo.updateBook",
    call: (c, i) => c.worldInfo.updateBook({ bookId: i.bookId, input: { name: "hacked" } }),
  },
  { path: "worldInfo.removeBook", call: (c, i) => c.worldInfo.removeBook({ bookId: i.bookId }) },
  {
    path: "worldInfo.duplicateBook",
    call: (c, i) => c.worldInfo.duplicateBook({ bookId: i.bookId }),
  },
  { path: "worldInfo.listEntries", call: (c, i) => c.worldInfo.listEntries({ bookId: i.bookId }) },
  {
    path: "worldInfo.createEntry",
    call: (c, i) =>
      c.worldInfo.createEntry({ bookId: i.bookId, input: { title: "x", content: "x" } }),
  },
  {
    path: "worldInfo.backfillTitles",
    call: (c, i) => c.worldInfo.backfillTitles({ bookId: i.bookId }),
  },
  {
    path: "worldInfo.applyEntryOrder",
    call: (c, i) => c.worldInfo.applyEntryOrder({ bookId: i.bookId, orderedEntryIds: [i.entryId] }),
  },
  {
    path: "worldInfo.attachGlobal",
    call: (c, i) => c.worldInfo.attachGlobal({ bookId: i.bookId }),
  },
  {
    path: "worldInfo.detachGlobal",
    call: (c, i) => c.worldInfo.detachGlobal({ bookId: i.bookId }),
  },
  { path: "worldInfo.getEntry", call: (c, i) => c.worldInfo.getEntry({ entryId: i.entryId }) },
  {
    path: "worldInfo.updateEntry",
    call: (c, i) => c.worldInfo.updateEntry({ entryId: i.entryId, input: { title: "hacked" } }),
  },
  {
    path: "worldInfo.removeEntry",
    call: (c, i) => c.worldInfo.removeEntry({ entryId: i.entryId }),
  },
  {
    path: "worldInfo.attachToCharacter",
    call: (c, i) =>
      c.worldInfo.attachToCharacter({
        characterId: i.characterId,
        bookId: i.bookId,
        role: "primary",
      }),
  },
  {
    path: "worldInfo.detachFromCharacter",
    call: (c, i) =>
      c.worldInfo.detachFromCharacter({ characterId: i.characterId, bookId: i.bookId }),
  },
  {
    path: "worldInfo.listForCharacter",
    call: (c, i) => c.worldInfo.listForCharacter({ characterId: i.characterId }),
  },
  {
    path: "worldInfo.attachToPersona",
    call: (c, i) => c.worldInfo.attachToPersona({ personaId: i.personaId, bookId: i.bookId }),
  },
  {
    path: "worldInfo.detachFromPersona",
    call: (c, i) => c.worldInfo.detachFromPersona({ personaId: i.personaId, bookId: i.bookId }),
  },
  {
    path: "worldInfo.listForPersona",
    call: (c, i) => c.worldInfo.listForPersona({ personaId: i.personaId }),
  },
  // ── tag (owner-scoped) ──
  { path: "tag.getTag", call: (c, i) => c.tag.getTag({ tagId: i.tagId }) },
  {
    path: "tag.mergeTags",
    call: (c, i) => c.tag.mergeTags({ sourceTagId: i.tagId, targetTagId: "tag_other_fake" }),
  },
  {
    path: "tag.updateTag",
    call: (c, i) => c.tag.updateTag({ tagId: i.tagId, patch: { name: "hacked" } }),
  },
  { path: "tag.removeTag", call: (c, i) => c.tag.removeTag({ tagId: i.tagId }) },
  {
    path: "tag.attachTag",
    call: (c, i) =>
      c.tag.attachTag({ tagId: i.tagId, targetType: "character", targetId: i.characterId }),
  },
  {
    path: "tag.detachTag",
    call: (c, i) =>
      c.tag.detachTag({ tagId: i.tagId, targetType: "character", targetId: i.characterId }),
  },
  {
    path: "tag.bulkAttachTag",
    call: (c, i) =>
      c.tag.bulkAttachTag({ tagIds: [i.tagId], targetType: "character", targetId: i.characterId }),
  },
  { path: "tag.setTagOrder", call: (c, i) => c.tag.setTagOrder({ orderedIds: [i.tagId] }) },
  // The `pending` review inbox narrowed by a characterId — owner-scoped via `characters.ownerId`
  // (list-pending-suggestions.ts), so a stranger passing A's characterId gets an empty list (leak-free).
  {
    path: "tag.listPendingSuggestions",
    call: (c, i) => c.tag.listPendingSuggestions({ characterId: i.characterId }),
  },
  // ── discovery (owner-scoped write on a caller-supplied characterId) ──
  // The on-demand "Suggest tags" distill: `ownerId` = the resolved principal, so a stranger's probe with A's
  // characterId reads zero targets and short-circuits to an empty stats object BEFORE any summarize call —
  // a leak-free no-op that never touches A's world (readCardDistillTargets gates on characters.ownerId).
  {
    path: "discovery.suggestCharacterTags",
    call: (c, i) => c.discovery.suggestCharacterTags({ characterId: i.characterId }),
  },
  // discovery.characterKeywords takes a caller-supplied characterId — a stranger's probe with A's id reads
  // zero rows (the owner belt joins `characters.ownerId = principal`), a leak-free empty.
  {
    path: "discovery.characterKeywords",
    call: (c, i) => c.discovery.characterKeywords({ characterId: i.characterId }),
  },
  // discovery.compareCharacters takes two caller-supplied characterIds — a stranger comparing A's card (idA)
  // against any id gets null (each card's owner belt joins `characters.ownerId = principal`; distinct ids so
  // the `idA === idB` short-circuit doesn't mask the belt), a leak-free non-answer.
  {
    path: "discovery.compareCharacters",
    call: (c, i) =>
      c.discovery.compareCharacters({ idA: i.characterId, idB: "character_other_fake" }),
  },
  // discovery.similarChats takes a caller-supplied chatId — a stranger's probe with A's chat reads zero target
  // segments (the present-host owner belt joins `chat_participants.userId = principal AND role='host' AND
  // leftSeq IS NULL`), so the centroid scan finds no target space → a leak-free empty list.
  {
    path: "discovery.similarChats",
    call: (c, i) => c.discovery.similarChats({ chatId: i.chatId }),
  },
  // ── search similarity (seed-id-taking) — the seed read is owner-belted (characters.ownerId ∩, for art,
  //    assets.ownerId), so a stranger seeding with A's characterId reads NO seed vector and short-circuits to
  //    an empty list (leak-free; never A's neighbourhood — the neo V2-2 cross-tenant-seed refusal). `discover`
  //    is query-only (no seed id) → EXEMPT (self-scoped ownerId). ──
  {
    path: "search.similarCharacters",
    call: (c, i) => c.search.similarCharacters({ characterId: i.characterId, topN: 5 }),
  },
  {
    path: "search.similarArt",
    call: (c, i) => c.search.similarArt({ characterId: i.characterId, topN: 5 }),
  },
  // ── credentials (owner-scoped) — only the read-shaped `fetchModels` is probed here; the mutation verbs
  //    are EXEMPT in this harness (the keyless SecretBox trips their storage-disabled guard first, below). ──
  {
    path: "credentials.fetchModels",
    call: (c, i) => c.credentials.fetchModels({ credentialId: i.credentialId }),
  },
  // ── hub.importGif (D61 gif slice) — takes a cross-tenant `subjectCharacterId`. `importGif` gates the
  //    subject character on the caller's ownership FIRST, before any network fetch, so a stranger passing A's
  //    real characterId gets a leak-free NOT_FOUND (and no egress happens). The `url` is never reached (the
  //    ownership gate throws first) — a fake Tenor-media URL keeps the probe self-contained. `searchGifs` is
  //    EXEMPT (self-scoped: the caller's OWN gif-search key + query text, no foreign id). ──
  {
    path: "hub.importGif",
    call: (c, i) =>
      c.hub.importGif({
        url: "https://media.tenor.com/probe-never-fetched.gif",
        subjectCharacterId: i.characterId,
      }),
  },
  // ── workloads (F3 per-user owner-scoped; get/cancel/retry take a workloadId) — a non-admin stranger must
  //    see a leak-free NOT_FOUND on a foreign workload (its `error` carries A's marker, so a broken gate that
  //    resolved A's row would leak it here). `list`/`start`/`subscribe` are EXEMPT (see below). ──
  { path: "workloads.get", call: (c, i) => c.workloads.get({ id: i.workloadId }) },
  { path: "workloads.cancel", call: (c, i) => c.workloads.cancel({ id: i.workloadId }) },
  { path: "workloads.retry", call: (c, i) => c.workloads.retry({ id: i.workloadId }) },
  // ── workload SCHEDULES (F3 per-user owner-scoped; update/delete/setEnabled take a scheduleId) — a stranger
  //    must see leak-free NOT_FOUND on a foreign schedule (its `params` carries A's marker, so a broken gate
  //    that resolved A's row would leak it via the returned row). `create`/`list` are EXEMPT (self-scoped). ──
  {
    path: "workloads.updateSchedule",
    call: (c, i) => c.workloads.updateSchedule({ id: i.scheduleId, cadence: "weekly" }),
  },
  {
    path: "workloads.deleteSchedule",
    call: (c, i) => c.workloads.deleteSchedule({ id: i.scheduleId }),
  },
  {
    path: "workloads.setScheduleEnabled",
    call: (c, i) => c.workloads.setScheduleEnabled({ id: i.scheduleId, enabled: false }),
  },
  // ── settings themes (owner-scoped) ──
  { path: "settings.getTheme", call: (c, i) => c.settings.getTheme({ id: i.themeId }) },
  {
    path: "settings.updateTheme",
    call: (c, i) => c.settings.updateTheme({ id: i.themeId, input: { name: "hacked" } }),
  },
  { path: "settings.duplicateTheme", call: (c, i) => c.settings.duplicateTheme({ id: i.themeId }) },
  { path: "settings.removeTheme", call: (c, i) => c.settings.removeTheme({ id: i.themeId }) },
  // ── stats (single-owner) ──
  { path: "stats.character", call: (c, i) => c.stats.character({ characterId: i.characterId }) },
  // ── chat (membership-scoped; the chatId gate is the chokepoint for every secondary id) ──
  { path: "chat.getChat", call: (c, i) => c.chat.getChat({ chatId: i.chatId }) },
  { path: "chat.listMessages", call: (c, i) => c.chat.listMessages({ chatId: i.chatId }) },
  {
    path: "chat.listMessageVariants",
    call: (c, i) => c.chat.listMessageVariants({ chatId: i.chatId, messageId: i.messageId }),
  },
  { path: "chat.star", call: (c, i) => c.chat.star({ chatId: i.chatId, star: true }) },
  { path: "chat.archive", call: (c, i) => c.chat.archive({ chatId: i.chatId, archived: true }) },
  {
    path: "chat.updateTitle",
    call: (c, i) => c.chat.updateTitle({ chatId: i.chatId, title: "hacked" }),
  },
  { path: "chat.delete", call: (c, i) => c.chat.delete({ chatId: i.chatId }) },
  {
    path: "chat.editMessage",
    call: (c, i) =>
      c.chat.editMessage({ chatId: i.chatId, messageId: i.messageId, content: "hacked" }),
  },
  {
    path: "chat.setMessageHidden",
    call: (c, i) =>
      c.chat.setMessageHidden({ chatId: i.chatId, messageId: i.messageId, hidden: true }),
  },
  {
    path: "chat.deleteMessages",
    call: (c, i) => c.chat.deleteMessages({ chatId: i.chatId, messageIds: [i.messageId] }),
  },
  {
    path: "chat.reattributePersona",
    call: (c, i) =>
      c.chat.reattributePersona({
        chatId: i.chatId,
        messageIds: [i.messageId],
        personaId: i.personaId,
      }),
  },
  { path: "chat.forkChat", call: (c, i) => c.chat.forkChat({ chatId: i.chatId }) },
  {
    path: "chat.setRoomOverrides",
    call: (c, i) => c.chat.setRoomOverrides({ chatId: i.chatId, overrides: {} }),
  },
  { path: "chat.previewAssembly", call: (c, i) => c.chat.previewAssembly({ chatId: i.chatId }) },
  {
    path: "chat.setChatInjection",
    call: (c, i) =>
      c.chat.setChatInjection({
        chatId: i.chatId,
        position: "in_chat",
        depth: 0,
        role: "system",
        content: "x",
      }),
  },
  {
    path: "chat.listChatInjections",
    call: (c, i) => c.chat.listChatInjections({ chatId: i.chatId }),
  },
  {
    path: "chat.deleteChatInjection",
    call: (c, i) => c.chat.deleteChatInjection({ chatId: i.chatId, injectionId: FAKE.injectionId }),
  },
  {
    path: "chat.addCharacterToChat",
    call: (c, i) => c.chat.addCharacterToChat({ chatId: i.chatId, characterId: i.characterId }),
  },
  {
    path: "chat.setParticipantDisabled",
    call: (c, i) =>
      c.chat.setParticipantDisabled({
        chatId: i.chatId,
        characterId: i.characterId,
        disabled: true,
      }),
  },
  {
    path: "chat.setParticipantTalkativeness",
    call: (c, i) =>
      c.chat.setParticipantTalkativeness({
        chatId: i.chatId,
        characterId: i.characterId,
        talkativeness: 0.5,
      }),
  },
  {
    path: "chat.forceCharacterTurn",
    call: (c, i) => c.chat.forceCharacterTurn({ chatId: i.chatId, characterId: i.characterId }),
  },
  { path: "chat.getGroupConfig", call: (c, i) => c.chat.getGroupConfig({ chatId: i.chatId }) },
  {
    path: "chat.setChatAnchorPersona",
    call: (c, i) => c.chat.setChatAnchorPersona({ chatId: i.chatId, personaId: null }),
  },
  { path: "chat.abort", call: (c, i) => c.chat.abort({ chatId: i.chatId }) },
  { path: "chat.send", call: (c, i) => c.chat.send({ chatId: i.chatId, content: "hi" }) },
  // ── invites / human-membership (FINAL-Auth-Modes §7 P1 — host/member-gated inside the verbs; the
  //    token-carrying verbs are token-authenticated: a guessed token is a leak-free NOT_FOUND, and a
  //    targeted/foreign invite collapses to the same shape). The fixture context is multi-human capable,
  //    so the PD-106 belt is OPEN and the real authority gates are what these probes exercise. ──
  {
    path: "invites.createInvite",
    call: (c, i) => c.invites.createInvite({ chatId: i.chatId, input: {} }),
  },
  {
    path: "invites.previewInvite",
    call: (c) => c.invites.previewInvite({ token: FAKE.inviteToken }),
  },
  {
    path: "invites.redeemInvite",
    call: (c) => c.invites.redeemInvite({ token: FAKE.inviteToken }),
  },
  {
    path: "invites.revokeInvite",
    call: (c, i) => c.invites.revokeInvite({ chatId: i.chatId, inviteId: FAKE.inviteId }),
  },
  {
    path: "invites.declineInvite",
    call: (c) => c.invites.declineInvite({ inviteId: FAKE.inviteId }),
  },
  // Accept-by-id is SELF-AUTHORIZING (bound to `invitedUserId`): a stranger accepting a foreign / unknown
  // inviteId matches nothing in the atomic seat → the verb throws the same leak-free NOT_FOUND (never confirms
  // the invite exists, never seats the stranger).
  {
    path: "invites.acceptInvite",
    call: (c) => c.invites.acceptInvite({ inviteId: FAKE.inviteId }),
  },
  {
    path: "invites.kick",
    call: (c, i) => c.invites.kick({ chatId: i.chatId, userId: OWNER_USER_ID }),
  },
  { path: "invites.selfLeave", call: (c, i) => c.invites.selfLeave({ chatId: i.chatId }) },
  {
    path: "invites.nominateHostHandoff",
    call: (c, i) => c.invites.nominateHostHandoff({ chatId: i.chatId, userId: OWNER_USER_ID }),
  },
  {
    path: "invites.acceptHostHandoff",
    call: (c, i) => c.invites.acceptHostHandoff({ chatId: i.chatId }),
  },
  {
    path: "chat.swipe",
    call: (c, i) => c.chat.swipe({ chatId: i.chatId, messageId: i.messageId }),
  },
  {
    path: "chat.selectVariant",
    call: (c, i) =>
      c.chat.selectVariant({ chatId: i.chatId, messageId: i.messageId, variantId: FAKE.variantId }),
  },
  {
    path: "chat.continueTurn",
    call: (c, i) => c.chat.continueTurn({ chatId: i.chatId, messageId: i.messageId }),
  },
  { path: "chat.impersonate", call: (c, i) => c.chat.impersonate({ chatId: i.chatId }) },
  { path: "chat.generate", call: (c, i) => c.chat.generate({ chatId: i.chatId }) },
  {
    path: "chat.generateImage",
    call: (c, i) => c.chat.generateImage({ chatId: i.chatId, mode: "free", prompt: "x", n: 1 }),
  },
];

// Every remaining procedure, with WHY it is not a cross-tenant IDOR probe. A new procedure that lands in
// NEITHER `PROBES` nor here fails the completeness guard → it MUST be classified before it ships.
const EXEMPT: Readonly<Record<string, string>> = {
  // Public / unauthenticated — no owned resource, no id.
  health: "public: no auth, no id",
  echo: "public: no auth, no id",
  clientError: "public: fire-and-forget log sink, no id",
  // Self-scoped by the resolved Principal — no cross-tenant id input (returns only the caller's own world).
  "character.create": "self-scoped: creates the caller's own row",
  "character.list": "self-scoped: lists the caller's own rows",
  "persona.create": "self-scoped",
  "persona.list": "self-scoped",
  "persona.import": "self-scoped: imports into the caller's own namespace",
  "preset.create": "self-scoped",
  "preset.list": "self-scoped",
  "worldInfo.createBook": "self-scoped",
  "worldInfo.listBooks": "self-scoped",
  "worldInfo.listGlobal": "self-scoped: the caller's globally-attached books",
  "tag.createTag": "self-scoped",
  "tag.listTags": "self-scoped",
  "tag.listTagsWithUsage": "self-scoped",
  "tag.pruneUnusedTags": "self-scoped: prunes the caller's own unused tags",
  "credentials.add": "self-scoped",
  "credentials.list": "self-scoped",
  // The credential MUTATION verbs guard on storage-enabled FIRST — the `app` fixture's SecretBox is keyless
  // (no CREDENTIALS_KEY), so they reject BAD_REQUEST (`credentials_disabled`) before the ownership check can
  // run. The cross-tenant gate is unreachable in this harness; owner-scoping is covered by the credentials
  // domain int tests. (The read-shaped `fetchModels` IS probed — it degrades leak-free without a key.)
  "credentials.setActive": "keyless-fixture: storage-disabled guard precedes the ownership check",
  "credentials.remove": "keyless-fixture: storage-disabled guard precedes the ownership check",
  "credentials.testHealth": "keyless-fixture: storage-disabled guard precedes the ownership check",
  "credentials.markRevokedByUser":
    "keyless-fixture: storage-disabled guard precedes the ownership check",
  "credentials.clearRevoked":
    "keyless-fixture: storage-disabled guard precedes the ownership check",
  "credentials.inspectEndpoint":
    "keyless-fixture: storage-disabled guard precedes the ownership check",
  "assets.listOwned": "self-scoped",
  "assets.listGallery": "self-scoped",
  // #67 render resolvers — both return `{assetId, hash}` pairs (asset HASHES, never a marker NAME), so the
  // marker-based leak detector is TOOTHLESS here; the cross-tenant/structural teeth live in the assets domain
  // tests. `resolveBlobRefs` is owner-scoped (ownerId = principal.userId; a foreign asset id is simply absent
  // — never a foreign owner), teeth in `resolve-owned-asset-refs.int.test.ts`. `resolveChatBlobRefs` is
  // membership-scoped on `chatId` + the STRUCTURAL `message_assets` reference + owner-present (a non-
  // participant caller, or an asset not attached in this chat, resolves to nothing) — teeth in
  // `resolve-chat-asset-refs.int.test.ts` and the blob byte-serve attachment arm in `get-metadata.int.test.ts`.
  "assets.resolveBlobRefs":
    "self-scoped (ownerId = principal); see resolve-owned-asset-refs.int.test.ts",
  "assets.resolveChatBlobRefs":
    "membership + structural-reference scoped; asset hashes are not marker NAMES (sweep toothless) — see resolve-chat-asset-refs.int.test.ts + get-metadata attachment arm",
  "hub.searchGifs":
    "self-scoped: resolves the caller's OWN gif-search credential (owner-scoped, no host fallback); query text + opaque cursor, no foreign id (hub.importGif IS probed)",
  // Gallery ids are strict `typeIdSchema` — a synthesized id fails WIRE validation (BAD_REQUEST) before the
  // ownership gate, and seeding a real gallery item needs CAS bytes. Asset-ownership IDOR (the shared-avatar
  // reference check) is covered by the assets domain's `loadCoParticipantOwner` tests.
  "assets.addToGallery":
    "strict-typeid input validation precedes the ownership gate; see loadCoParticipantOwner tests",
  "assets.removeFromGallery":
    "strict-typeid input validation precedes the ownership gate; see the assets domain tests",
  // `groupConfigSchema` is a discriminated union — a minimal `{}` fails WIRE validation before the verb's
  // membership gate. That IDENTICAL host/member gate IS exercised by `chat.getGroupConfig` (probed → NOT_FOUND).
  "chat.setGroupConfig":
    "group-config wire schema validates before the membership gate; the gate is probed via chat.getGroupConfig",
  "chat.startChat": "self-scoped: creates a chat the caller hosts",
  "chat.listChats": "self-scoped: only the caller's member chats",
  "settings.getUserSettings": "self-scoped by principal.userId",
  "settings.updateUserSettings": "self-scoped by principal.userId",
  "settings.updateUserSettingsSection": "self-scoped by principal.userId",
  "settings.listThemes": "self-scoped: owned ∪ seeds",
  "settings.createTheme": "self-scoped",
  "sessions.me": "self-scoped: projects the caller's own Principal",
  "sessions.streamUserEvents": "self-scoped: channel key is the caller's own userId",
  "buddy.get": "self-scoped: one buddy per caller",
  "buddy.hatch": "self-scoped",
  "buddy.ask": "self-scoped",
  "buddy.confirm":
    "not-a-cross-tenant-id: ephemeral in-memory proposal handle (per-user, 5-min TTL)",
  "buddy.history": "self-scoped",
  "buddy.clearChat": "self-scoped",
  "buddy.setReactions": "self-scoped",
  "buddy.setAgency": "self-scoped",
  "buddy.stream": "self-scoped: SSE reaction feed keyed to the caller's own userId (no id input)",
  "search.knn": "self-scoped: ownerId = principal.userId",
  "search.findCharacters": "self-scoped: ownerId = principal.userId",
  "search.images":
    "self-scoped: ownerId = principal.userId (owner via assets.ownerId; query text, no id)",
  "search.fields":
    "self-scoped: ownerId = principal.userId (index corpus = owner's cards; query text, no id)",
  "search.suggest":
    "self-scoped: ownerId = principal.userId (index corpus = owner's cards; query text, no id)",
  "search.discover":
    "self-scoped: ownerId = principal.userId (owner-wide verbatim scan derived via characters.ownerId; query text, no id)",
  "discovery.duplicateCharacters": "self-scoped: userId = principal.userId",
  "discovery.duplicateChats":
    "self-scoped: userId = principal.userId (owner via present-host EXISTS)",
  "discovery.themes": "self-scoped: userId = principal.userId",
  "discovery.browseCharacters":
    "self-scoped: userId = principal.userId (owner via characters join)",
  "discovery.characterFacets": "self-scoped: userId = principal.userId",
  "discovery.catalog": "self-scoped: userId = principal.userId (owner via characters join)",
  "discovery.archetypes": "self-scoped: userId = principal.userId",
  "discovery.corpusProjection": "self-scoped: userId = principal.userId",
  "discovery.topKeywords": "self-scoped: userId = principal.userId (owner via characters join)",
  "discovery.cooccurringKeywords":
    "self-scoped: userId = principal.userId; `keyword` is a free string, not an owned id",
  "discovery.themeDrift":
    "self-scoped: userId = principal.userId (owner via theme_clusters.ownerId)",
  "discovery.unusedCharacters": "self-scoped: userId = principal.userId",
  "discovery.forgottenGems":
    "self-scoped: userId = principal.userId (owner via characters join + the self-scoped stats economics op)",
  "discovery.modelRouting":
    "self-scoped: userId = principal.userId (owner via characters join + the self-scoped stats economics op)",
  "discovery.similarityGraph":
    "self-scoped: userId = principal.userId (no id input; owner via characters join)",
  "discovery.imageDuplicates": "self-scoped: userId = principal.userId",
  "discovery.visualArchetypes": "self-scoped: userId = principal.userId",
  "discovery.portraitAlignment": "self-scoped: userId = principal.userId",
  "discovery.imageFacets": "self-scoped: userId = principal.userId",
  "discovery.charactersByImageFacet":
    "self-scoped: userId = principal.userId; facet/value are allowlisted strings, not an owned id",
  "discovery.home": "self-scoped: userId = principal.userId",
  "discovery.themeDetail":
    "self-scoped: userId = principal.userId; clusterIdx is a facet index, not an owned id (the theme list is owner-scoped)",
  "connection.getCatalog": "not-owned: the deployment-global model catalog",
  "connection.getAgentSdkCatalog":
    "not-owned: the deployment-global agent-sdk daemon model catalog (no id, authed browse)",
  "connection.getModelCapability": "not-owned: a model/source lookup, no owned id",
  "connection.getModelsForSource":
    "self-scoped: the read-only picker facade over (source, role) — reads the caller's OWN credential " +
    "availability + the deployment catalog; no owned/foreign id in the input",
  "connection.orCredits": "self-scoped: reads the caller's OWN provider key",
  "connection.orGenerationCost": "not-owned: an upstream OpenRouter generation handle",
  "connection.testClaudeAuth": "self-scoped: the caller's own max-pro-sub health check",
  "notifications.list": "self-scoped by principal.userId (multi-human belt)",
  "notifications.markRead": "self-scoped by principal.userId (inbox scoped inside the verb)",
  "notifications.markAllRead":
    "self-scoped by principal.userId (recipient-scoped inside the verb, no foreign id)",
  "notifications.dismiss": "self-scoped by principal.userId (inbox scoped inside the verb)",
  "notifications.notifications": "subscription: self-scoped per-user channel",
  "chat.streamMessages":
    "subscription: non-member WITHHOLDS (yields nothing), not a NOT_FOUND throw — covered by chat.int durable-replay",
  // Stats — every verb scopes on ctx.auth.userId (single-owner); no cross-tenant id but `character` (probed).
  "stats.overview": "self-scoped by principal.userId",
  "stats.leaderboard": "self-scoped by principal.userId",
  "stats.timeseries": "self-scoped by principal.userId",
  "stats.byModel": "self-scoped by principal.userId",
  "stats.freshness": "self-scoped by principal.userId",
  "stats.personaUsage": "self-scoped by principal.userId",
  "stats.wrapped": "self-scoped by principal.userId",
  "stats.temporal": "self-scoped by principal.userId",
  "stats.activityHeatmap": "self-scoped by principal.userId",
  "stats.momentum": "self-scoped by principal.userId",
  "stats.latency": "self-scoped by principal.userId",
  // Admin-gated (LAYER-1 role gate): a plain-user stranger is refused FORBIDDEN at the ladder BEFORE any
  // resource lookup — the role gate is the authz surface, tested by the admin-gate matrix, not IDOR.
  "admin.listUsers": "admin-gated: role gate (not IDOR)",
  "admin.setRole": "admin-gated: role gate",
  "admin.setEnabled": "admin-gated: role gate",
  "admin.createUser": "admin-gated: role gate",
  "admin.resetPassword": "admin-gated: role gate",
  "admin.listSessions": "admin-gated: role gate",
  "admin.revokeSession": "admin-gated: role gate",
  "admin.revokeUserSessions": "admin-gated: role gate",
  "admin.vllmEngines": "admin-gated: role gate",
  "admin.restartVllmEngine": "admin-gated: role gate",
  "admin.embedCharacterCard": "admin-gated: role gate",
  // get/cancel/retry are PROBED above (owner-scoped, id-taking). start/list/subscribe below:
  "workloads.start":
    "self-scoped: a singular run stamps ownerId = caller (a bulk run requires the box owner); no foreign id",
  "workloads.list":
    "self-scoped: a non-admin caller is forced to its own ownerId (no cross-tenant id)",
  "workloads.subscribe":
    "subscription: the existence check is the OWNER-scoped `get` (throws NOT_FOUND on first pull, not on call) — the gate is probed via workloads.get + the F3 authz int tests",
  "workloads.createSchedule":
    "self-scoped: stamps ownerId = caller (a bulk schedule requires the box owner); no foreign id",
  "workloads.listSchedules":
    "self-scoped: a non-admin caller is forced to its own ownerId (no cross-tenant id)",
  "connection.refreshCatalog": "admin-gated: writes the deployment KV snapshot",
  "connection.refreshAgentSdkCatalog":
    "admin-gated: writes the deployment agent-sdk catalog KV snapshot",
  "settings.getAppSettings": "admin-gated: deployment settings",
  "settings.updateAppSettings": "admin-gated: deployment settings",
  "settings.getGlobalSetting": "admin-gated: raw global KV",
  "settings.setGlobalSetting": "admin-gated: raw global KV",
};

describe("cross-tenant IDOR sweep — the completeness guard (grows with the router)", () => {
  test("EVERY router procedure is classified as either a PROBE or an EXEMPT(reason)", () => {
    // tRPC v11 has no public procedure-enumeration API — reading `_def.procedures` (the flat
    // path→procedure record) is the sanctioned introspection seam for a router-completeness gate.
    const all = Object.keys(
      // FABRICATION-OK: the tRPC `_def.procedures` introspection seam (no public enumeration API in v11).
      (appRouter as unknown as { _def: { procedures: Record<string, unknown> } })._def.procedures,
    ).sort();
    const covered = new Set([...PROBES.map((p) => p.path), ...Object.keys(EXEMPT)]);
    const uncovered = all.filter((p) => !covered.has(p));
    expect(
      uncovered,
      `unclassified procedure(s) — add each to PROBES (id-taking, cross-tenant) or EXEMPT (with a reason): ${uncovered.join(", ")}`,
    ).toEqual([]);
    // And no stale entries pointing at deleted procedures.
    const known = new Set(all);
    const stale = [...covered].filter((p) => !known.has(p));
    expect(
      stale,
      `stale probe/exempt entries for procedures that no longer exist: ${stale.join(", ")}`,
    ).toEqual([]);
  });
});

describe("cross-tenant IDOR sweep — every id-taking procedure is leak-free for a stranger", () => {
  /** Seed owner A's one-of-everything (front door where possible; direct db for the turn-engine-bound rows). */
  async function seedOwnerWorld(
    owner: AppCaller,
    db: Parameters<typeof seedChat>[0],
  ): Promise<OwnerIds> {
    const character = await owner.character.create({
      input: { handle: "alpha-hero", name: MARK.character, description: "owned by A" },
    });
    const persona = await owner.persona.create({
      input: { name: MARK.persona, description: "owned by A" },
    });
    const preset = await owner.preset.create({ name: MARK.preset, kind: "chat" });
    const book = await owner.worldInfo.createBook({ input: { name: MARK.book } });
    const entry = await owner.worldInfo.createEntry({
      bookId: book.id,
      input: { title: MARK.entry, content: "lore owned by A" },
    });
    const tag = await owner.tag.createTag({ input: { name: MARK.tag } });
    const snapshot = await owner.character.snapshot({ characterId: character.id });

    // The credential is seeded DIRECTLY — the `app` fixture's SecretBox is keyless (CREDENTIALS_KEY unset),
    // so the front-door `credentials.add` is disabled. The ownership probes never decrypt; they gate on the
    // owner. The `label` is the leak marker (a returned CredentialView would carry it).
    const credentialId = castId<UserCredentialId>("user_credential_alpha");
    await db.insert(userCredentials).values({
      id: credentialId,
      ownerId: OWNER_USER_ID,
      provider: "openrouter",
      ciphertext: "x",
      iv: "x",
      tag: "x",
      label: MARK.credential,
      createdAt: 1,
      updatedAt: 1,
    });

    // The turn/canon rows sidestep the provider — seed them directly (owner A is the host member).
    const chatId = await seedChat(db, "idor", { title: "AlphaSecretChatTitle" });
    await seedParticipant(db, { chatId, key: "idor_h", userId: OWNER_USER_ID, role: "host" });
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "user",
      authorUserId: OWNER_USER_ID,
      content: MARK.message,
    });

    // A workload owned by A — a USER-scope kind, `failed` so `retry` is meaningful. Its `error` carries A's
    // marker (a leaked `get`/`retry` result would surface it), so the probe has teeth (F3 owner-scoping).
    const workloadId = castId<WorkloadId>("workload_alpha");
    await db.insert(workloads).values({
      id: workloadId,
      kind: "reconcile-stats",
      status: "failed",
      mode: "singular",
      ownerId: OWNER_USER_ID,
      error: MARK.workload,
      scheduledAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });

    // A recurring schedule owned by A — its `params.token` carries A's marker (a leaked update/setEnabled
    // result row would surface it), so the schedule probes have teeth (F3 owner-scoping over the TIME dimension).
    const scheduleId = castId<WorkloadScheduleId>("workload_schedule_alpha");
    await db.insert(workloadSchedules).values({
      id: scheduleId,
      ownerId: OWNER_USER_ID,
      kind: "import-bundle",
      mode: "singular",
      params: { token: MARK.schedule },
      cadence: "daily",
      nextRunAt: 1,
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    });

    // A theme row seeded directly (the front-door createTheme needs a full color-token override — the
    // lenient read seam accepts a partial blob, so this is representative for the ownership probe).
    const themeId = castId<ThemeId>("theme_alpha");
    await db.insert(themes).values({
      id: themeId,
      ownerId: OWNER_USER_ID,
      name: MARK.theme,
      // The ThemeOverride read seam parses leniently (per-field `.catch` → defaults) and the ownership
      // probe never inspects the palette, only the owner.
      // FABRICATION-OK: minimal override blob (see the note above) — the read seam degrades it to defaults.
      override: {} as never,
      createdAt: 1,
      updatedAt: 1,
    });

    return {
      characterId: character.id,
      personaId: persona.id,
      presetId: preset.id,
      bookId: book.id,
      entryId: entry.id,
      tagId: tag.id,
      credentialId,
      themeId,
      workloadId,
      scheduleId,
      snapshotId: snapshot.id,
      chatId,
      messageId,
    };
  }

  test("owner A sees its own marker (the leak-detector has teeth) but a stranger never does", async ({
    db,
    ownerCaller,
    otherCaller,
  }) => {
    const ids = await seedOwnerWorld(ownerCaller, db);

    // CONTROL: the owner's OWN read carries the marker — proving the detector below is not blind.
    const ownView = JSON.stringify(
      await ownerCaller.character.get({ characterId: ids.characterId }),
    );
    expect(ownView).toContain(MARK.character);

    // THE SWEEP: every id-taking procedure, probed as the stranger, must be leak-free. Verdicts are
    // collected then asserted ONCE (no branching expect) so EVERY leak surfaces in a single readable diff.
    const leaks: string[] = [];
    for (const probe of PROBES) {
      // biome-ignore lint/performance/noAwaitInLoops: probes run serially against one shared graph/db (isolation + readable per-probe failures).
      const verdict = await leakVerdict(probe.path, () => probe.call(otherCaller, ids));
      if (verdict !== null) {
        leaks.push(verdict);
      }
    }
    expect(
      leaks,
      `cross-tenant IDOR leak(s) — STOP-and-report findings:\n${leaks.join("\n")}`,
    ).toEqual([]);

    // POST-SWEEP INTEGRITY: no probe silently MUTATED/deleted A's world (a write-IDOR returning void).
    const stillThere = await ownerCaller.character.get({ characterId: ids.characterId });
    expect(stillThere.name).toBe(MARK.character); // untouched by the stranger's `update`/`remove` probes
    const chatStill = await ownerCaller.chat.getChat({ chatId: ids.chatId });
    expect(chatStill.title).toBe("AlphaSecretChatTitle"); // untouched by the stranger's chat-mutation probes
  });
});
