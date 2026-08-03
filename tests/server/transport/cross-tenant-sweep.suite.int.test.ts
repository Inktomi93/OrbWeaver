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

import { characterDocuments, documents, themes, userCredentials, workloadSchedules, workloads } from "@orb/db";
import type { DocumentId, ThemeId, UserCredentialId, WorkloadId, WorkloadScheduleId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
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
  databankDoc: "AlphaSecretDoc",
  // A host-authored automation rule's NAME bound to A's chat — leaks via a broken `automation.listRules`
  // host gate (the RuleView carries `name` verbatim).
  automationRule: "AlphaSecretRule",
  // ── rpg (W2): a game on A's chat, markers on every READABLE surface — a stranger's read probe would echo
  //    one back if the game-scoping regressed (rpg has NO ownerId; authority is chat-FK-derived, D18/D20).
  //    `rpgSteering` = the host-only `getConfigView.steeringNote`; `rpgWidget` = a game-tracker label
  //    (`getTrackerView.gameTrackers[].def.label`); `rpgQuest` = a quest name (`getTrackerView.quests[].name`);
  //    `rpgJournal` = a journal entry title/content (`listJournal[]`); `rpgCheckpoint` = a checkpoint label
  //    (`listCheckpoints[]`). getGame carries no free-text, so its teeth are the NOT_FOUND collapse alone. ──
  rpgSteering: "AlphaSecretSteering",
  rpgWidget: "AlphaSecretWidget",
  rpgQuest: "AlphaSecretQuest",
  rpgJournal: "AlphaSecretJournal",
  rpgCheckpoint: "AlphaSecretCheckpoint",
  regexScript: "AlphaSecretRegexScript",
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
  documentId: DocumentId;
  automationRuleId: string;
  // rpg (W2) — A's real game-scoped ids, fed to the rpg write probes so a dropped `gameId`/membership predicate
  // on a foreign id would touch A's row (the W1b IDOR class this domain already hid once).
  rpgQuestId: string;
  rpgJournalId: string;
  rpgCheckpointId: string;
  regexScriptId: string;
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
    return code === "NOT_FOUND" ? null : `${path}: a stranger's rejection must be leak-free NOT_FOUND, got ${code ?? `non-tRPC ${String(e)}`}`;
  }
  const leaked = MARKERS.find((m) => (JSON.stringify(value) ?? "").includes(m));
  return leaked === undefined ? null : `${path}: a stranger's result leaked owner A's data ("${leaked}")`;
}

/** Drain a subscription probe to a plain array (the gate runs on the first `.next()`), so a streaming probe
 *  reaches the participant chokepoint AND its yields land in the marker-leak check. A tRPC caller returns the
 *  subscription as a Promise<AsyncIterable>, so await it first. NOTE: the router's `withSubscriptionErrors`
 *  converts a domain NOT_FOUND into a `__subscriptionError` FRAME (not a throw) — a marker-free frame carrying
 *  `code:"NOT_FOUND"`, which `leakVerdict` correctly reads as leak-free (no owner-A data). */
async function drainAsyncIterable(source: Promise<AsyncIterable<unknown>>): Promise<unknown[]> {
  const iter = await source;
  const out: unknown[] = [];
  for await (const v of iter) {
    out.push(v);
  }
  return out;
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
  participantId: "chat_participant_fake",
  inviteId: "chatinvite_fake",
  // A raw invite token that hashes to nothing — token-authenticated probes collapse to NOT_FOUND.
  inviteToken: "stranger-guess-token",
} as const;

const PROBES: readonly Probe[] = [
  // ── character (owner-scoped) ──
  { path: "character.get", call: (c, i) => c.character.get({ characterId: i.characterId }) },
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
    path: "character.bulkAddCardTag",
    call: (c, i) => c.character.bulkAddCardTag({ tagName: "x", characterIds: [i.characterId] }),
  },
  {
    path: "character.bulkRemoveCardTag",
    call: (c, i) => c.character.bulkRemoveCardTag({ tagName: "x", characterIds: [i.characterId] }),
  },
  // Greeting studio (audit §3) — owner-gated bounded completions on a caller-supplied characterId. The
  // owner gate (`loadOwnedCharacterRow`) is the chokepoint: a stranger passing A's characterId collapses to
  // a leak-free CharacterNotFoundError → NOT_FOUND BEFORE any preset read or LLM spend (so the sweep's
  // vllmDisabled harness never reaches an engine). Both RETURN text and NEVER write — the post-sweep
  // character integrity re-read proves A's card was untouched.
  {
    path: "character.rewriteGreeting",
    call: (c, i) => c.character.rewriteGreeting({ characterId: i.characterId, greeting: "hi there", steer: "make it formal" }),
  },
  {
    path: "character.generateGreeting",
    call: (c, i) => c.character.generateGreeting({ characterId: i.characterId, steer: "a cheerful opening" }),
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
    call: (c, i) => c.persona.createFromCharacter({ characterId: i.characterId, swapMacros: false }),
  },
  {
    path: "persona.connectToCharacter",
    call: (c, i) => c.persona.connectToCharacter({ characterId: i.characterId, personaId: i.personaId }),
  },
  {
    path: "persona.disconnectFromCharacter",
    call: (c, i) => c.persona.disconnectFromCharacter({ characterId: i.characterId, personaId: i.personaId }),
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
  // The effective-profile read: it takes A's preset id, so a missing owner predicate would project A's
  // generation knobs to a stranger. The capability half is Principal-only (no id to aim), so the preset
  // read is the whole attack surface — and it must collapse leak-free.
  { path: "preset.resolveEffective", call: (c, i) => c.preset.resolveEffective({ id: i.presetId }) },
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
  { path: "worldInfo.exportBook", call: (c, i) => c.worldInfo.exportBook({ bookId: i.bookId }) },
  { path: "worldInfo.listEntries", call: (c, i) => c.worldInfo.listEntries({ bookId: i.bookId }) },
  {
    path: "worldInfo.createEntry",
    call: (c, i) => c.worldInfo.createEntry({ bookId: i.bookId, input: { title: "x", content: "x" } }),
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
    call: (c, i) => c.worldInfo.detachFromCharacter({ characterId: i.characterId, bookId: i.bookId }),
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
  // attach/detach-to-chat are HOST-gated on the chatId (the injected `requireChatHost`, D18 — attaching a book
  // injects room-wide prompt content, a one-shot jailbreak surface); a non-member stranger passing A's chatId
  // collapses to NOT_FOUND before the book-ownership check even runs. listForChat is MEMBER-readable (the
  // room's attached books are the shared pool every member's turns assemble against) — gated by the injected
  // `requireChatMember`; a non-member stranger passing A's chatId gets a leak-free NOT_FOUND.
  {
    path: "worldInfo.attachToChat",
    call: (c, i) => c.worldInfo.attachToChat({ chatId: i.chatId, bookId: i.bookId }),
  },
  {
    path: "worldInfo.detachFromChat",
    call: (c, i) => c.worldInfo.detachFromChat({ chatId: i.chatId, bookId: i.bookId }),
  },
  { path: "worldInfo.listForChat", call: (c, i) => c.worldInfo.listForChat({ chatId: i.chatId }) },
  // ── tag (owner-scoped) ──
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
    call: (c, i) => c.tag.attachTag({ tagId: i.tagId, targetType: "character", targetId: i.characterId }),
  },
  {
    path: "tag.detachTag",
    call: (c, i) => c.tag.detachTag({ tagId: i.tagId, targetType: "character", targetId: i.characterId }),
  },
  {
    path: "tag.bulkAttachTag",
    call: (c, i) => c.tag.bulkAttachTag({ tagIds: [i.tagId], targetType: "character", targetId: i.characterId }),
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
    call: (c, i) => c.discovery.compareCharacters({ idA: i.characterId, idB: "character_other_fake" }),
  },
  // discovery.compareCharactersDeep — same two-id owner belt as compareCharacters (it DECORATES that diff);
  // a stranger comparing A's card gets null before any summarize call (each card's belt joins characters.ownerId).
  {
    path: "discovery.compareCharactersDeep",
    call: (c, i) => c.discovery.compareCharactersDeep({ idA: i.characterId, idB: "character_other_fake" }),
  },
  // discovery.askCard — owner-belted via readOwnedCardFacet (characters.ownerId ∩ characterId): a stranger
  // asking about A's card reads no owned/distilled row → null before any summarize/scene read (leak-free).
  {
    path: "discovery.askCard",
    call: (c, i) => c.discovery.askCard({ characterId: i.characterId, question: "who are they?" }),
  },
  // discovery.swipeHotspots — owner-belted via characters.ownerId (the chat's assistant slots belong to A's
  // characters, not the stranger's), so a stranger passing A's chatId reads zero rows → a leak-free empty list.
  {
    path: "discovery.swipeHotspots",
    call: (c, i) => c.discovery.swipeHotspots({ chatId: i.chatId }),
  },
  // discovery.characterDossier — owner-belted via readOwnedCardFacet (characters.ownerId ∩ characterId): a
  // stranger requesting A's character reads no owned/distilled row → null (never A's portrait/neighbours).
  {
    path: "discovery.characterDossier",
    call: (c, i) => c.discovery.characterDossier({ characterId: i.characterId }),
  },
  // discovery.similarChats takes a caller-supplied chatId — a stranger's probe with A's chat reads zero target
  // segments (the present-host owner belt joins `chat_participants.userId = principal AND role='host' AND
  // leftSeq IS NULL`), so the centroid scan finds no target space → a leak-free empty list.
  {
    path: "discovery.similarChats",
    call: (c, i) => c.discovery.similarChats({ chatId: i.chatId }),
  },
  // ── search similarity (seed-id-taking) — the seed read is owner-belted (assets.ownerId), so a stranger
  //    seeding with A's characterId reads NO seed vector and short-circuits to an empty list (leak-free;
  //    never A's neighbourhood — the neo V2-2 cross-tenant-seed refusal). `discover` is query-only (no seed
  //    id) → EXEMPT (self-scoped ownerId); `similarCharacters` is now `search.search` (over: "characters")
  //    → EXEMPT below, its owner-belt proven in search.int.test.ts. ──
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
  // ── databank (DB4 source-documents — owner-scoped canon + membership-scoped chat attach). The id-taking
  //    verbs gate on `principal.userId` ownership (`loadOwnedDocument`/`loadOwnedMeta`/the `WHERE owner_id=?`
  //    RETURNING) or the INJECTED chat guard (`ensureChatHost`/`ensureChatMember`, D18) — a stranger passing
  //    A's real ids sees the leak-free NOT_FOUND collapse (`DocumentNotFoundError`/`ChatNotFoundError`). The
  //    seeded document's `name` + `extractedText` carry A's marker, so a dropped owner belt on the READ verbs
  //    (`get`) leaks it here; the rename/remove write-IDOR is caught by the post-sweep document integrity
  //    re-read (below). `createFromText`/`list` are EXEMPT (self-scoped, no foreign id). ──
  { path: "databank.get", call: (c, i) => c.databank.get({ id: i.documentId, includeText: true }) },
  { path: "databank.rename", call: (c, i) => c.databank.rename({ id: i.documentId, name: "hacked" }) },
  { path: "databank.remove", call: (c, i) => c.databank.remove({ id: i.documentId }) },
  // reindex's `document` scope is owner-gated (`loadOwnedMeta`) BEFORE the enqueue — no reindexing a foreign
  // document. (The `owner` scope is the caller's own bank; the id-taking `document` scope is the probe.)
  {
    path: "databank.reindex",
    call: (c, i) => c.databank.reindex({ scope: { kind: "document", documentId: i.documentId } }),
  },
  { path: "databank.listAttachments", call: (c, i) => c.databank.listAttachments({ id: i.documentId }) },
  // attachGlobal gates on document ownership (`loadOwnedMeta` → NOT_FOUND for a stranger). detachGlobal has
  // no separate gate: its `DELETE … WHERE owner_id=<stranger> AND document_id=?` is SELF-SCOPED on the
  // caller's ownerId (the `(ownerId, documentId)` PK), so a stranger's detach of A's doc matches nothing and
  // is a leak-free no-op void — it can never reach A's `(A, documentId)` row.
  { path: "databank.attachGlobal", call: (c, i) => c.databank.attachGlobal({ documentId: i.documentId }) },
  { path: "databank.detachGlobal", call: (c, i) => c.databank.detachGlobal({ documentId: i.documentId }) },
  // attach/detach-to-chat are HOST-gated on the chatId (`ensureChatHost`, D18 — attaching injects room-wide
  // prompt content); a non-member stranger passing A's chatId collapses to NOT_FOUND before the document
  // ownership check even runs.
  {
    path: "databank.attachToChat",
    call: (c, i) => c.databank.attachToChat({ documentId: i.documentId, chatId: i.chatId }),
  },
  {
    path: "databank.detachFromChat",
    call: (c, i) => c.databank.detachFromChat({ documentId: i.documentId, chatId: i.chatId }),
  },
  // listActiveForChat is MEMBER-readable (every participant may see what feeds the room's prompts) — gated by
  // the injected `ensureChatMember`; a non-member stranger passing A's chatId gets a leak-free NOT_FOUND.
  { path: "databank.listActiveForChat", call: (c, i) => c.databank.listActiveForChat({ chatId: i.chatId }) },
  // attach/detach-to-character (DB8) gate on CHARACTER ownership (`ensureCharacterOwned` → DatabankCharacter
  // NotFoundError, mapped NOT_FOUND) BEFORE the document check / the junction delete — the characterId is A's,
  // so a stranger collapses to NOT_FOUND (never reaching A's `(characterId, documentId)` row). Both take A's
  // real characterId + documentId.
  {
    path: "databank.attachToCharacter",
    call: (c, i) => c.databank.attachToCharacter({ documentId: i.documentId, characterId: i.characterId }),
  },
  {
    path: "databank.detachFromCharacter",
    call: (c, i) => c.databank.detachFromCharacter({ documentId: i.documentId, characterId: i.characterId }),
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
  { path: "chat.checkSendAvailability", call: (c, i) => c.chat.checkSendAvailability({ chatId: i.chatId }) },
  // D22 member-card read — the chatId membership gate refuses a stranger BEFORE any card load (the secondary
  // `characterId` is roster-scoped inside the verb, but the chatId chokepoint is what the sweep probes).
  { path: "chat.getMemberCard", call: (c, i) => c.chat.getMemberCard({ chatId: i.chatId, characterId: i.characterId }) },
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
    call: (c, i) => c.chat.editMessage({ chatId: i.chatId, messageId: i.messageId, content: "hacked" }),
  },
  {
    path: "chat.setMessageHidden",
    call: (c, i) => c.chat.setMessageHidden({ chatId: i.chatId, messageId: i.messageId, hidden: true }),
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
        scope: { kind: "messages", messageIds: [i.messageId] },
        personaId: i.personaId,
      }),
  },
  {
    // The `mine` SCOPE arm (FINAL-Persona §A.7) resolves its OWN rows server-side, so it takes no foreign
    // messageId — the probe is that the chatId chokepoint still refuses: `requireParticipant` runs BEFORE any
    // row is resolved, so a stranger's "restamp mine" on A's chat can never enumerate (let alone stamp) a row
    // in it. Same path twice is intentional: the two arms are two reachable shapes of one procedure.
    path: "chat.reattributePersona",
    call: (c, i) => c.chat.reattributePersona({ chatId: i.chatId, scope: { kind: "mine" }, personaId: i.personaId }),
  },
  { path: "chat.forkChat", call: (c, i) => c.chat.forkChat({ chatId: i.chatId }) },
  {
    path: "chat.setRoomOverrides",
    call: (c, i) => c.chat.setRoomOverrides({ chatId: i.chatId, overrides: {} }),
  },
  {
    // D85 host-only databank visibility override — `requireHost` → `requireParticipant` miss on a stranger's
    // chatId is a leak-free NOT_FOUND (the setRoomOverrides shape) BEFORE any metadata write.
    path: "chat.setChatDocumentVisibility",
    call: (c, i) => c.chat.setChatDocumentVisibility({ chatId: i.chatId, visibility: { hidden: [] } }),
  },
  {
    // BG-C host-only per-chat background — `requireHost` → `requireParticipant` miss on a stranger's chatId
    // is a leak-free NOT_FOUND (the setRoomOverrides shape) BEFORE any metadata write.
    path: "chat.setChatBackground",
    call: (c, i) => c.chat.setChatBackground({ chatId: i.chatId, background: { kind: "none" } }),
  },
  {
    // Host-only per-chat tool-recurse cap — `requireHost` → `requireParticipant` miss on a stranger's chatId
    // is a leak-free NOT_FOUND (the setRoomOverrides shape) BEFORE any metadata write.
    path: "chat.setToolRecurseLimit",
    call: (c, i) => c.chat.setToolRecurseLimit({ chatId: i.chatId, limit: 5 }),
  },
  {
    // D121-E display-tier room option — `requireHost` → `requireParticipant` miss on a stranger's chatId is
    // a leak-free NOT_FOUND (the setRoomOverrides shape) BEFORE any metadata write.
    path: "chat.setHostDisplayScripts",
    call: (c, i) => c.chat.setHostDisplayScripts({ chatId: i.chatId, enabled: true }),
  },
  {
    // WAVE MU: the per-chat user-macro INPUT picks flush — `requireParticipant` miss on a stranger's chatId is
    // a leak-free NOT_FOUND (the setVariables/member shape) BEFORE any `chats.user_macro_values` write.
    path: "chat.setUserMacroValues",
    call: (c, i) => c.chat.setUserMacroValues({ chatId: i.chatId, values: { mood: { tone: "grim" } } }),
  },
  {
    // #24: the picks pane read — `requireParticipant` miss on a stranger's chatId is a leak-free NOT_FOUND
    // BEFORE either half loads (neither the host's macro declarations nor the room's picks cross out).
    path: "chat.getUserMacroPicks",
    call: (c, i) => c.chat.getUserMacroPicks({ chatId: i.chatId }),
  },
  {
    // The picks pane's ChoiceBlock half — `requireParticipant` miss on a stranger's chatId is a leak-free
    // NOT_FOUND BEFORE any `chats.variableValues` write.
    path: "chat.setVariables",
    call: (c, i) => c.chat.setVariables({ chatId: i.chatId, values: { mood: "grim" } }),
  },
  {
    // Its read twin — refused BEFORE either half loads (neither the host's declared variables nor the room's
    // picks cross out).
    path: "chat.getVariablePicks",
    call: (c, i) => c.chat.getVariablePicks({ chatId: i.chatId }),
  },
  {
    // Probed with the D121-G `presetOverride` ON, so the sweep exercises the SAME two-foreign-id shape the
    // preset editor's bound Prompt readout sends. Identical verdict to `previewActionTemplates` below: the
    // chatId gate (`requireHost`) is the one that must bite, and the override needs no probe of its own
    // because compose resolves it under the ROOM HOST.
    path: "chat.previewAssembly",
    call: (c, i) => c.chat.previewAssembly({ chatId: i.chatId, presetOverride: i.presetId }),
  },
  {
    // D8's bound readout. TWO foreign-id surfaces on one call, and the chatId gate is the one that must bite:
    // `requireHost` refuses the stranger's chat BEFORE any preset is resolved or any template is rendered. The
    // `presetId` half needs no probe of its own — the override is resolved `preset.get({userId: <the HOST>})`
    // by compose, so a caller cannot aim it at a library that is not the room host's (and a miss degrades to
    // the host's own default rather than throwing).
    path: "chat.previewActionTemplates",
    call: (c, i) => c.chat.previewActionTemplates({ chatId: i.chatId, presetId: i.presetId }),
  },
  { path: "chat.getShapeTrace", call: (c, i) => c.chat.getShapeTrace({ chatId: i.chatId }) },
  {
    // The per-variant WIRE RECORD (RAWVIEW). TWO foreign-id surfaces and the chatId gate is the one that must
    // bite: `requireHost` refuses the stranger's chatId BEFORE `loadVariantWire` runs, so no stored prompt is
    // ever loaded. The `variantId` half carries its OWN belt (the query's `messages.chatId` join), pinned
    // separately in read.int.test.ts — a HOST of chat A passing chat B's REAL variantId gets the same
    // NOT_FOUND; that arm needs a legitimate host, which this stranger sweep by construction cannot be.
    path: "chat.getVariantWire",
    call: (c, i) => c.chat.getVariantWire({ chatId: i.chatId, variantId: FAKE.variantId }),
  },
  { path: "chat.previewContextFit", call: (c, i) => c.chat.previewContextFit({ chatId: i.chatId }) },
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
    path: "chat.removeCharacterFromChat",
    call: (c, i) => c.chat.removeCharacterFromChat({ chatId: i.chatId, characterId: i.characterId }),
  },
  // setSeatKnobs (D80 — the ONE participantId-keyed AI-seat knob write, replacing the retired per-kind
  // forking) is host-gated (`requireHost` → `requireParticipant` miss = leak-free NOT_FOUND) on the chatId
  // BEFORE the seat lookup, so a stranger tuning a seat in A's chat collapses to NOT_FOUND and never touches a
  // row. `participantId` is any id — the chatId gate is the chokepoint.
  {
    path: "chat.setSeatKnobs",
    call: (c, i) => c.chat.setSeatKnobs({ chatId: i.chatId, participantId: FAKE.participantId, patch: { disabled: true } }),
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
  { path: "chat.commitMessage", call: (c, i) => c.chat.commitMessage({ chatId: i.chatId, content: "hi" }) },
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
  // Host-only outstanding-invites read (requireHost → requireParticipant miss = leak-free NOT_FOUND for a
  // non-member stranger, exactly like createInvite/revokeInvite).
  {
    path: "invites.listInvites",
    call: (c, i) => c.invites.listInvites({ chatId: i.chatId }),
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
  // The D16 join-history policy write is host-gated on the chatId (`requireHost` → `requireParticipant` miss =
  // leak-free NOT_FOUND) BEFORE the target lookup, so a stranger restricting a member of A's chat collapses to
  // NOT_FOUND and never touches a row — the `chat.setSeatKnobs` shape, keyed by userId instead of participantId.
  {
    path: "invites.setMemberHistoryVisibility",
    call: (c, i) => c.invites.setMemberHistoryVisibility({ chatId: i.chatId, userId: OWNER_USER_ID, visibility: "from-join" }),
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
    call: (c, i) => c.chat.selectVariant({ chatId: i.chatId, messageId: i.messageId, variantId: FAKE.variantId }),
  },
  {
    path: "chat.continueTurn",
    call: (c, i) => c.chat.continueTurn({ chatId: i.chatId, messageId: i.messageId }),
  },
  // undo/revertContinue gate `requireParticipant(chatId)` then load the snapshot chat-scoped: a stranger
  // passing A's chatId collapses to NOT_FOUND before the load, and a foreign messageId (chat B's) matches
  // nothing under A → refused `no_continuation`, identical to a nonexistent id (turn.int.test.ts F1 pins the
  // canon-untouched proof). Same messageId-scoped shape as `continueTurn`.
  {
    path: "chat.undoContinue",
    call: (c, i) => c.chat.undoContinue({ chatId: i.chatId, messageId: i.messageId }),
  },
  {
    path: "chat.revertContinue",
    call: (c, i) => c.chat.revertContinue({ chatId: i.chatId, messageId: i.messageId }),
  },
  // A SUBSCRIPTION (async iterable) — the `requireParticipant` gate runs on the first `.next()`, so DRAIN it
  // to trigger the gate (a stranger's iteration must throw the leak-free NOT_FOUND before yielding a byte).
  { path: "chat.impersonateStream", call: (c, i) => drainAsyncIterable(c.chat.impersonateStream({ chatId: i.chatId })) },
  { path: "chat.generate", call: (c, i) => c.chat.generate({ chatId: i.chatId }) },
  {
    path: "chat.generateImage",
    call: (c, i) => c.chat.generateImage({ chatId: i.chatId, mode: "free", prompt: "x", n: 1 }),
  },

  // ── imagery (I5): the client-facing leaf verbs. editImage/readProvenance gate on the OWNED-asset join
  //    (`assets.ownerId`) — a stranger passing A's assetId (a wire-valid but foreign id) gets a leak-free
  //    NOT_FOUND (readProvenance returns `null`, which the leak matcher treats as no-leak). extractPrompt is
  //    chat-scoped (the shaper reads A's history) → `requireParticipant` collapses a stranger to NOT_FOUND
  //    before any spend. Fake asset ids are REAL TypeIDs so the probe reaches the ownership chokepoint. ──
  {
    path: "imagery.editImage",
    call: (c, i) => c.imagery.editImage({ sourceAssetId: mintTypeId(ID_PREFIX.asset), instruction: "make it night", chatId: i.chatId }),
  },
  { path: "imagery.extractPrompt", call: (c, i) => c.imagery.extractPrompt({ chatId: i.chatId, mode: "scenario" }) },
  { path: "imagery.readProvenance", call: (c) => c.imagery.readProvenance({ assetId: mintTypeId(ID_PREFIX.asset) }) },

  // ── automation (A8): every rule-lifecycle verb is host-authored room authority (04 §2). The chat-scoped
  //    verbs (listRules/createRule/reorderRules/setBudgets/getBudgets) gate `requireChatHost(chatId)` — a non-member
  //    stranger passing A's chatId collapses to a leak-free AutomationChatNotFoundError → NOT_FOUND. The
  //    rule-scoped verbs (updateRule/setRuleEnabled/deleteRule/testRule/listFires) load A's REAL ruleId then
  //    gate its chat's host — a stranger (not a present member) collapses to RuleNotFoundError → NOT_FOUND
  //    BEFORE any write, so the seeded rule's name (MARK.automationRule) never leaks and its body is untouched
  //    (the post-sweep integrity re-read proves create/update/delete/reorder/setRuleEnabled mutated nothing). ──
  { path: "automation.listRules", call: (c, i) => c.automation.listRules({ chatId: i.chatId }) },
  {
    path: "automation.createRule",
    call: (c, i) =>
      c.automation.createRule({
        chatId: i.chatId,
        name: "hacked",
        trigger: { bus: "chat", type: "messageCommitted" },
        actions: [{ type: "set_variable", scope: "chat", key: "x", op: "set", value: "1" }],
      }),
  },
  {
    path: "automation.updateRule",
    call: (c, i) =>
      c.automation.updateRule({
        ruleId: i.automationRuleId,
        name: "hacked",
        trigger: { bus: "chat", type: "messageCommitted" },
        actions: [{ type: "set_variable", scope: "chat", key: "x", op: "set", value: "1" }],
      }),
  },
  { path: "automation.setRuleEnabled", call: (c, i) => c.automation.setRuleEnabled({ ruleId: i.automationRuleId, enabled: true }) },
  { path: "automation.deleteRule", call: (c, i) => c.automation.deleteRule({ ruleId: i.automationRuleId }) },
  { path: "automation.reorderRules", call: (c, i) => c.automation.reorderRules({ chatId: i.chatId, orderedIds: [i.automationRuleId] }) },
  { path: "automation.testRule", call: (c, i) => c.automation.testRule({ ruleId: i.automationRuleId }) },
  { path: "automation.listFires", call: (c, i) => c.automation.listFires({ ruleId: i.automationRuleId }) },
  { path: "automation.setBudgets", call: (c, i) => c.automation.setBudgets({ chatId: i.chatId, maxFiresPerHour: 5 }) },
  { path: "automation.getBudgets", call: (c, i) => c.automation.getBudgets({ chatId: i.chatId }) },

  // ── plugin (D46) — getLog is owner-scoped (getById filters ownerId=caller, NOT admin-gated), so a stranger
  //    passing any pluginId reads absent → leak-free NOT_FOUND (the log ring lives on the caller's OWN resident
  //    instance). Fabricated id (the established mintTypeId probe shape); the seeded-row teeth are in
  //    get-plugin-log.int.test.ts. install/upgrade/setEnabled/uninstall are admin-gated (EXEMPT below). ──
  { path: "plugin.getLog", call: (c) => c.plugin.getLog({ pluginId: mintTypeId(ID_PREFIX.plugin) }) },
  // ── plugin.runSnippet (03 §1) takes owner A's chatId — the service gates on `resolveChatAuthority`
  //    (`loadPresentRole` under the caller): a stranger is not present ⇒ canRead=false ⇒ NOT_FOUND BEFORE the
  //    snippet ever runs (no read, no write, no execution against A's chat). Leak-free by the loadPresentRole
  //    compose-gate semantics. ──
  { path: "plugin.runSnippet", call: (c, i) => c.plugin.runSnippet({ chatId: i.chatId, code: "orb.host(1).log.info('probe');" }) },

  // ── rpg (W2): EVERY verb is chatId-scoped with NO ownerId — game-ness + authority both derive
  //    `rpg_games.chatId → chat_participants` (D18/D20), resolved by the injected `getMembership` at
  //    `domain/rpg/guard.ts`. A NON-MEMBER stranger passing A's chatId collapses to ONE leak-free
  //    `DomainNotFound` → NOT_FOUND (indistinguishable from a no-game chat — a foreigner never learns the
  //    chat is a game), for reads AND writes alike. The READS carry A's markers (steering note / tracker label
  //    / quest name / journal entry / checkpoint label), so a regressed game-scoping would ECHO one on a
  //    stranger's result; the WRITES take A's REAL rule-scoped ids so a dropped `gameId` predicate would touch
  //    A's row (the W1b IDOR class — the post-sweep integrity re-read below proves nothing mutated). `createGame`
  //    gates on the STRANGER's OWN membership directly (the game row doesn't exist yet): a non-member gets the
  //    SAME leak-free NOT_FOUND collapse (never a distinguishable BAD_REQUEST that would confirm A's chat is real). ──
  // ── stream (SSE-1): the multiplexed socket's two MUTATIONS. A stranger passing owner A's chatId inside a
  //    room ref must never learn anything: `attach` on a chat-scoped room is ACCEPT-ALWAYS by design
  //    (withhold-not-throw — a game/chat room is legitimately attachable before it exists, and refusing would
  //    be an existence oracle), so the leak-free outcome here is a marker-free `void`, and the actual data
  //    gate is the room source's per-yield membership probe (proven in routers/stream.test.ts: a non-member
  //    attaches and receives NOTHING). The `chat` room (S2) is the same shape — accept-always at attach, the
  //    verdict per yield. `detach` is idempotent and touches only the caller's own socket cell.
  //    The `automation` room (S4) is the OTHER posture and is probed too: it REFUSES at attach
  //    (`resolveStreamAuthority` throws AutomationChatNotFound for a non-present member → the same leak-free
  //    NOT_FOUND), which is deliberate — an automation room, unlike a chat/rpg one, is never legitimately
  //    attachable before you are seated. The `workloads` room (S5) is that same refusing posture on an
  //    OWNER-scoped row: its `authorizeAttach` IS the `workloads.get` verb, so a stranger passing owner A's
  //    workloadId gets the identical leak-free NOT_FOUND — which is why the deleted `workloads.subscribe`
  //    exemption is a real probe now. The socketId here is the STRANGER's own — a foreign one is refused
  //    before any room is recorded (stream/socket-registry.test.ts). ──
  { path: "stream.attach", call: (c, i) => c.stream.attach({ socketId: "socket_sweep_probe", ref: { channel: "rpg", chatId: i.chatId } }) },
  { path: "stream.attach", call: (c, i) => c.stream.attach({ socketId: "socket_sweep_probe", ref: { channel: "automation", chatId: i.chatId } }) },
  { path: "stream.attach", call: (c, i) => c.stream.attach({ socketId: "socket_sweep_probe", ref: { channel: "workloads", workloadId: i.workloadId } }) },
  { path: "stream.detach", call: (c, i) => c.stream.detach({ socketId: "socket_sweep_probe", ref: { channel: "rpg", chatId: i.chatId } }) },

  { path: "rpg.createGame", call: (c, i) => c.rpg.createGame({ chatId: i.chatId, mode: "lite" }) },
  { path: "rpg.updateConfig", call: (c, i) => c.rpg.updateConfig({ chatId: i.chatId, patch: { steeringNote: "hacked" } }) },
  {
    path: "rpg.patchSheet",
    call: (c, i) => c.rpg.patchSheet({ chatId: i.chatId, actorRef: { kind: "user", userId: OWNER_USER_ID }, patch: { className: "hacked" } }),
  },
  { path: "rpg.editSnapshot", call: (c, i) => c.rpg.editSnapshot({ chatId: i.chatId, patch: { location: "hacked" } }) },
  // R1 — the op-shaped actor door + its removal gesture: chatId-scoped hand writes, so a stranger passing a
  // foreign chatId must see the SAME leak-free NOT_FOUND every other rpg verb collapses to.
  {
    path: "rpg.patchActor",
    call: (c, i) => c.rpg.patchActor({ chatId: i.chatId, targetRef: { kind: "cast", castKey: "mira" }, ops: [{ op: "setStatus", status: "hacked" }] }),
  },
  { path: "rpg.dismissActor", call: (c, i) => c.rpg.dismissActor({ chatId: i.chatId, targetRef: { kind: "cast", castKey: "mira" } }) },
  // R4 — the promotion doorway is the ONE rpg proc whose write reaches outside the game (a character card into
  // the ROOM HOST's library + a seat on their roster), which makes a cross-tenant leak here worse than a state
  // write: a stranger passing a foreign chatId must never get as far as the mint.
  { path: "rpg.promoteActor", call: (c, i) => c.rpg.promoteActor({ chatId: i.chatId, targetRef: { kind: "cast", castKey: "mira" } }) },
  { path: "rpg.upsertQuest", call: (c, i) => c.rpg.upsertQuest({ chatId: i.chatId, questId: i.rpgQuestId, name: "hacked" }) },
  { path: "rpg.deleteQuest", call: (c, i) => c.rpg.deleteQuest({ chatId: i.chatId, questId: i.rpgQuestId }) },
  { path: "rpg.addJournalEntry", call: (c, i) => c.rpg.addJournalEntry({ chatId: i.chatId, type: "note", title: "hacked", content: "hacked" }) },
  {
    path: "rpg.editJournalEntry",
    call: (c, i) => c.rpg.editJournalEntry({ chatId: i.chatId, entryId: i.rpgJournalId, patch: { title: "hacked" } }),
  },
  { path: "rpg.deleteJournalEntry", call: (c, i) => c.rpg.deleteJournalEntry({ chatId: i.chatId, entryId: i.rpgJournalId }) },
  { path: "rpg.createCheckpoint", call: (c, i) => c.rpg.createCheckpoint({ chatId: i.chatId, label: "hacked" }) },
  { path: "rpg.restoreCheckpoint", call: (c, i) => c.rpg.restoreCheckpoint({ chatId: i.chatId, checkpointId: i.rpgCheckpointId }) },
  { path: "rpg.rollDice", call: (c, i) => c.rpg.rollDice({ chatId: i.chatId, notation: "1d20" }) },
  // §3.3 detach heal — HOST-gated on the chatId via `getMembership` DIRECTLY (the game gate can't run when the
  // game is gone). A non-member stranger collapses to leak-free NOT_FOUND BEFORE any pointer write; and against
  // A's LIVE game the verb refuses (rpg_pointer_not_dangling) — either way it never nulls A's real pointer (the
  // post-sweep chat integrity re-read proves A's game/pointer untouched).
  { path: "rpg.detachDanglingPointer", call: (c, i) => c.rpg.detachDanglingPointer({ chatId: i.chatId }) },
  // §1.3 resyncFromStory — HOST-gated model-call verb: a non-member stranger passing A's chatId collapses to
  // leak-free NOT_FOUND (`resolveHost` → `getMembership` miss) BEFORE any host-principal model call resolves, so
  // a stranger can never fund/trigger a rebuild against A's game (the consent-seam boundary). The post-sweep
  // chat/game integrity re-read proves A's snapshot/pointer untouched.
  { path: "rpg.resyncFromStory", call: (c, i) => c.rpg.resyncFromStory({ chatId: i.chatId }) },
  // populateFromCharacter — the SECOND host-gated model-call verb (the born-state doorway, owner ruling
  // 2026-08-01). Same boundary as the resync AND one more: the probe passes A's REAL characterId, so a dropped
  // membership predicate would read A's card into a stranger-funded model call. `resolveHost` misses first, so
  // the collapse is leak-free NOT_FOUND before any card read or model call.
  {
    path: "rpg.populateFromCharacter",
    call: (c, i) => c.rpg.populateFromCharacter({ chatId: i.chatId, actorRef: { kind: "character", characterId: i.characterId } }),
  },
  { path: "rpg.getGame", call: (c, i) => c.rpg.getGame({ chatId: i.chatId }) },
  { path: "rpg.getTrackerView", call: (c, i) => c.rpg.getTrackerView({ chatId: i.chatId }) },
  { path: "rpg.listJournal", call: (c, i) => c.rpg.listJournal({ chatId: i.chatId }) },
  { path: "rpg.getConfigView", call: (c, i) => c.rpg.getConfigView({ chatId: i.chatId }) },
  // §3.6 host-reveal read — a foreign chatId must collapse to leak-free NOT_FOUND (host gate inside the verb).
  { path: "rpg.revealHidden", call: (c, i) => c.rpg.revealHidden({ chatId: i.chatId }) },
  { path: "rpg.listCheckpoints", call: (c, i) => c.rpg.listCheckpoints({ chatId: i.chatId }) },
  // ── regex (owner-scoped script library, D121-E) — id-taking verbs owner-belted via `RegexNotFoundError`
  //    → NOT_FOUND (see the router's own classification header). The chat scope has no ownerId (D18) so
  //    attach/detach/listForChat/listRoomDisplayScripts are gated via chat's own host/member guards instead. ──
  { path: "regex.getScript", call: (c, i) => c.regex.getScript({ scriptId: i.regexScriptId }) },
  {
    path: "regex.updateScript",
    call: (c, i) => c.regex.updateScript({ scriptId: i.regexScriptId, input: { name: "hacked" } }),
  },
  { path: "regex.removeScript", call: (c, i) => c.regex.removeScript({ scriptId: i.regexScriptId }) },
  { path: "regex.duplicateScript", call: (c, i) => c.regex.duplicateScript({ scriptId: i.regexScriptId }) },
  { path: "regex.attachGlobal", call: (c, i) => c.regex.attachGlobal({ scriptId: i.regexScriptId }) },
  { path: "regex.detachGlobal", call: (c, i) => c.regex.detachGlobal({ scriptId: i.regexScriptId }) },
  {
    path: "regex.attachToCharacter",
    call: (c, i) => c.regex.attachToCharacter({ characterId: i.characterId, scriptId: i.regexScriptId }),
  },
  {
    path: "regex.detachFromCharacter",
    call: (c, i) => c.regex.detachFromCharacter({ characterId: i.characterId, scriptId: i.regexScriptId }),
  },
  { path: "regex.listForCharacter", call: (c, i) => c.regex.listForCharacter({ characterId: i.characterId }) },
  {
    path: "regex.attachToPreset",
    call: (c, i) => c.regex.attachToPreset({ presetId: i.presetId, scriptId: i.regexScriptId }),
  },
  {
    path: "regex.detachFromPreset",
    call: (c, i) => c.regex.detachFromPreset({ presetId: i.presetId, scriptId: i.regexScriptId }),
  },
  { path: "regex.listForPreset", call: (c, i) => c.regex.listForPreset({ presetId: i.presetId }) },
  {
    // HOST-gated (D18) — a stranger's chatId collapses to NOT_FOUND via `requireHost` before the scriptId
    // ownership check even runs.
    path: "regex.attachToChat",
    call: (c, i) => c.regex.attachToChat({ chatId: i.chatId, scriptId: i.regexScriptId }),
  },
  {
    path: "regex.detachFromChat",
    call: (c, i) => c.regex.detachFromChat({ chatId: i.chatId, scriptId: i.regexScriptId }),
  },
  { path: "regex.listForChat", call: (c, i) => c.regex.listForChat({ chatId: i.chatId }) },
  // D121-E MEMBER-gated broadcast read — the membership rung IS the probe: a non-member stranger passing
  // A's chatId collapses to a leak-free NOT_FOUND before the host-opt-in flag is even read (per-verb
  // ownership/opt-in behavior for an actual member is proven in the regex domain suites, not here).
  {
    path: "regex.listRoomDisplayScripts",
    call: (c, i) => c.regex.listRoomDisplayScripts({ chatId: i.chatId }),
  },
  {
    path: "regex.applyScopeOrder",
    call: (c, i) => c.regex.applyScopeOrder({ scope: { kind: "character", characterId: i.characterId }, orderedScriptIds: [i.regexScriptId] }),
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
  "chat.reapTemporaryChats": "self-scoped maintenance: no input at all — sweeps only the CALLER's own expired temp chats (matrix: non-chat-scoped)",
  "character.create": "self-scoped: creates the caller's own row",
  "character.list": "self-scoped: lists the caller's own rows",
  "persona.create": "self-scoped",
  "persona.list": "self-scoped",
  "persona.import": "self-scoped: imports into the caller's own namespace",
  "preset.create": "self-scoped",
  "preset.list": "self-scoped",
  "preset.importFile": "self-scoped: takes file TEXT and no id — it writes only the caller's own library",
  "worldInfo.createBook": "self-scoped",
  "worldInfo.importFile": "self-scoped: takes file TEXT and no id — it writes only the caller's own library",
  "worldInfo.listBooks": "self-scoped",
  "worldInfo.listGlobal": "self-scoped: the caller's globally-attached books",
  "regex.createScript": "self-scoped: mints the caller's own row, no foreign id",
  "regex.listScripts": "self-scoped",
  "regex.listGlobal": "self-scoped: the caller's globally-attached scripts",
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
  "credentials.markRevokedByUser": "keyless-fixture: storage-disabled guard precedes the ownership check",
  "credentials.clearRevoked": "keyless-fixture: storage-disabled guard precedes the ownership check",
  "credentials.inspectEndpoint": "keyless-fixture: storage-disabled guard precedes the ownership check",
  "assets.listOwned": "self-scoped",
  "assets.listGallery": "self-scoped",
  // #67 render resolvers — both return `{assetId, hash}` pairs (asset HASHES, never a marker NAME), so the
  // marker-based leak detector is TOOTHLESS here; the cross-tenant/structural teeth live in the assets domain
  // tests. `resolveBlobRefs` is owner-scoped (ownerId = principal.userId; a foreign asset id is simply absent
  // — never a foreign owner), teeth in `resolve-owned-asset-refs.int.test.ts`. `resolveChatBlobRefs` is
  // membership-scoped on `chatId` + the STRUCTURAL `message_assets` reference + owner-present (a non-
  // participant caller, or an asset not attached in this chat, resolves to nothing) — teeth in
  // `resolve-chat-asset-refs.int.test.ts` and the blob byte-serve attachment arm in `get-metadata.int.test.ts`.
  "assets.resolveBlobRefs": "self-scoped (ownerId = principal); see resolve-owned-asset-refs.int.test.ts",
  "assets.resolveChatBlobRefs":
    "membership + structural-reference scoped; asset hashes are not marker NAMES (sweep toothless) — see resolve-chat-asset-refs.int.test.ts + get-metadata attachment arm",
  // Gallery ids are strict `typeIdSchema` — a synthesized id fails WIRE validation (BAD_REQUEST) before the
  // ownership gate, and seeding a real gallery item needs CAS bytes. Asset-ownership IDOR (the shared-avatar
  // reference check) is covered by the assets domain's `loadCoParticipantOwner` tests.
  "assets.addToGallery": "strict-typeid input validation precedes the ownership gate; see loadCoParticipantOwner tests",
  "assets.removeFromGallery": "strict-typeid input validation precedes the ownership gate; see the assets domain tests",
  // `groupConfigSchema` is a discriminated union — a minimal `{}` fails WIRE validation before the verb's
  // membership gate. That IDENTICAL host/member gate IS exercised by `chat.getGroupConfig` (probed → NOT_FOUND).
  "chat.setGroupConfig": "group-config wire schema validates before the membership gate; the gate is probed via chat.getGroupConfig",
  "chat.startChat": "self-scoped: creates a chat the caller hosts",
  "chat.listChats": "self-scoped: only the caller's member chats",
  "settings.getUserSettings": "self-scoped by principal.userId",
  "settings.updateUserSettingsSection": "self-scoped by principal.userId",
  "settings.addExternalBackground": "self-scoped: materializes the pasted URL into the caller's OWN CAS (principal.userId); no foreign id in params",
  "settings.listThemes": "self-scoped: owned ∪ seeds",
  "settings.createTheme": "self-scoped",
  "settings.promoteTheme": "self-scoped: mints an owned row from VALUES only (name + override) — no foreign id to reach through",
  "sessions.me": "self-scoped: projects the caller's own Principal",
  "search.fields": "self-scoped: ownerId = principal.userId (index corpus = owner's cards; query text, no id)",
  "search.suggest": "self-scoped: ownerId = principal.userId (index corpus = owner's cards; query text, no id)",
  // Takes ids inside `scope`, but EVERY scope is owner-belted in the dispatch (digest scans carry the
  // characters.ownerId belt; the verbatim segments chat is gated against the owner's materialized chat
  // set) — a stranger's id yields []. Unprobeable HERE: the digest/segment path requires a live embedder
  // and this sweep runs vllmDisabled (no engine). The owner belt is proven leak-free by the dedicated slice
  // tests/server/domain/search/verbs/search.int.test.ts (foreign character id → [], foreign chatId → []).
  "search.search":
    "owner-belted-per-scope: ids in `scope` are owner-belted; unprobeable under vllmDisabled (needs an embedder). Belt proven in search.int.test.ts. The `documents` target (DB5) is owner-ONLY on the omnibox (requireOwnerScope → scope `{ownerId: principal.userId}`); the chat/character scopes are reached only via the compose-injected op (chat's already-authorized GATHER), never the wire — the databank scope-leak belt is proven in search/verbs/documents.int.test.ts (gate-8).",
  "discovery.duplicateCharacters": "self-scoped: userId = principal.userId",
  "discovery.duplicateChats": "self-scoped: userId = principal.userId (owner via present-host EXISTS)",
  "discovery.themes": "self-scoped: userId = principal.userId",
  "discovery.browseCharacters": "self-scoped: userId = principal.userId (owner via characters join)",
  "discovery.characterFacets": "self-scoped: userId = principal.userId",
  "discovery.catalog": "self-scoped: userId = principal.userId (owner via characters join)",
  "discovery.archetypes": "self-scoped: userId = principal.userId",
  "discovery.corpusProjection": "self-scoped: userId = principal.userId",
  "discovery.topKeywords": "self-scoped: userId = principal.userId (owner via characters join)",
  "discovery.cooccurringKeywords": "self-scoped: userId = principal.userId; `keyword` is a free string, not an owned id",
  "discovery.themeDrift": "self-scoped: userId = principal.userId (owner via theme_clusters.ownerId)",
  "discovery.unusedCharacters": "self-scoped: userId = principal.userId",
  "discovery.forgottenGems": "self-scoped: userId = principal.userId (owner via characters join + the self-scoped stats economics op)",
  "discovery.modelRouting": "self-scoped: userId = principal.userId (owner via characters join + the self-scoped stats economics op)",
  "discovery.similarityGraph": "self-scoped: userId = principal.userId (no id input; owner via characters join)",
  "discovery.imageDuplicates": "self-scoped: userId = principal.userId",
  "discovery.visualArchetypes": "self-scoped: userId = principal.userId",
  "discovery.portraitAlignment": "self-scoped: userId = principal.userId",
  "discovery.imageFacets": "self-scoped: userId = principal.userId",
  "discovery.charactersByImageFacet": "self-scoped: userId = principal.userId; facet/value are allowlisted strings, not an owned id",
  "discovery.home": "self-scoped: userId = principal.userId",
  "discovery.themeDetail": "self-scoped: userId = principal.userId; clusterIdx is a facet index, not an owned id (the theme list is owner-scoped)",
  "connection.getCatalog": "not-owned: the deployment-global model catalog",
  "connection.getAgentSdkCatalog": "not-owned: the deployment-global agent-sdk daemon model catalog (no id, authed browse)",
  "connection.resolveChatCapability":
    "self-scoped: resolves the caller's OWN chat-role ModelCapability from principal.userId's settings — " +
    "NO input at all (no caller-supplied user id/role), so there is no foreign id to probe",
  "connection.getModelsForSource":
    "self-scoped: the read-only picker facade over (source, role) — reads the caller's OWN credential " +
    "availability + the deployment catalog; no owned/foreign id in the input",
  "connection.orCredits": "self-scoped: reads the caller's OWN provider key",
  "connection.orGenerationCost": "not-owned: an upstream OpenRouter generation handle",
  "connection.testClaudeAuth": "self-scoped: the caller's own max-pro-sub health check",
  "notifications.list": "self-scoped by principal.userId (multi-human belt)",
  "notifications.markAllRead": "self-scoped by principal.userId (recipient-scoped inside the verb, no foreign id)",
  "notifications.dismiss": "self-scoped by principal.userId (inbox scoped inside the verb)",
  // The multiplexed socket (SSE-1). `attach`/`detach` are ordinary mutations and ARE probed below. `connect`
  // is the one EventSource and NEVER TERMINATES, so the sweep's drain would hang on it — the exemption is the
  // same one every other subscription here carries. Its cross-tenant teeth are a dedicated unit test: a
  // foreign socketId is refused in the RESOLVER (before any frame) with the leak-free NOT_FOUND —
  // tests/server/transport/trpc/stream/socket-registry.test.ts + routers/stream.test.ts.
  "stream.connect":
    "subscription: never terminates (undrainable here); the foreign-socketId NOT_FOUND refusal is unit-tested in stream/socket-registry.test.ts + routers/stream.test.ts",
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
  // The one WRITE on the stats surface: no id input at all — the rebuild scope IS principal.userId, so a
  // stranger can only ever rebuild its own rollups (the owner-scoping is unit-tested at the verb mirror).
  "stats.reconcile": "self-scoped WRITE: rebuild scope is principal.userId, no id input",
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
  // plugin (D46) — install/upgrade/setEnabled/uninstall gate on `can(caller,"admin",{kind:"global"})` FIRST
  // (owner∪admin, 02 §4), so a non-admin stranger is refused by the role gate BEFORE any pluginId ownership
  // read — the admin.* pattern (a role gate, not an IDOR). `list` is self-scoped fetchOwned. `getLog` (owner-
  // scoped, not admin-gated) IS probed above.
  "plugin.install": "admin-gated: install authority role gate (creates the caller's own plugin, no foreign id)",
  "plugin.upgrade": "admin-gated: the install-authority role gate precedes the pluginId ownership check",
  "plugin.setEnabled": "admin-gated: the install-authority role gate precedes the pluginId ownership check",
  "plugin.uninstall": "admin-gated: the install-authority role gate precedes the pluginId ownership check",
  "plugin.list": "self-scoped: the caller's own plugins (fetchOwned)",
  "admin.embedCharacterCard": "admin-gated: role gate",
  // get/cancel/retry are PROBED above (owner-scoped, id-taking). start/list/subscribe below:
  "workloads.start": "self-scoped: a singular run stamps ownerId = caller (a bulk run requires the box owner); no foreign id",
  "workloads.list": "self-scoped: a non-admin caller is forced to its own ownerId (no cross-tenant id)",
  "workloads.createSchedule": "self-scoped: stamps ownerId = caller (a bulk schedule requires the box owner); no foreign id",
  "workloads.listSchedules": "self-scoped: a non-admin caller is forced to its own ownerId (no cross-tenant id)",
  "connection.refreshCatalog": "admin-gated: writes the deployment KV snapshot",
  "connection.refreshAgentSdkCatalog": "admin-gated: writes the deployment agent-sdk catalog KV snapshot",
  // databank — the id-taking verbs are PROBED above; these two take no foreign id (verified in the verbs):
  "databank.createFromText": "self-scoped: stamps ownerId = principal.userId; input is name + text, no foreign id",
  "databank.scrapeWeb":
    "self-scoped: stamps ownerId = principal.userId; input is a single url string, no foreign id — the fetched page becomes the caller's OWN canon. The fetch rides the compose-bound ANY_HOST safeFetch guard (SSRF belt proven in tests/server/infra/network/egress.test.ts); a refusal collapses to a leak-free ScrapeFailedError (BAD_REQUEST)",
  "databank.scrapeYoutube":
    "self-scoped: stamps ownerId = principal.userId; input is a url + lang string, no foreign id — the caption track becomes the caller's OWN canon. Same ANY_HOST safeFetch guard as scrapeWeb; a refusal collapses to a leak-free ScrapeFailedError",
  "databank.scrapeWiki":
    "self-scoped: stamps ownerId = principal.userId; input is a single url string, no foreign id — the article extract becomes the caller's OWN canon. Same ANY_HOST safeFetch guard as scrapeWeb; a refusal collapses to a leak-free ScrapeFailedError",
  "databank.list": "self-scoped: listOwnedMeta filters WHERE owner_id = principal.userId; origin/limit/offset only, no foreign id",
  "settings.getAppSettings": "admin-gated: deployment settings",
  "settings.getAppSettingsWithOverrides": "admin-gated: deployment settings (resolved + raw overrides)",
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
    expect(uncovered, `unclassified procedure(s) — add each to PROBES (id-taking, cross-tenant) or EXEMPT (with a reason): ${uncovered.join(", ")}`).toEqual(
      [],
    );
    // And no stale entries pointing at deleted procedures.
    const known = new Set(all);
    const stale = [...covered].filter((p) => !known.has(p));
    expect(stale, `stale probe/exempt entries for procedures that no longer exist: ${stale.join(", ")}`).toEqual([]);
  });
});

describe("cross-tenant IDOR sweep — every id-taking procedure is leak-free for a stranger", () => {
  /** Seed owner A's one-of-everything (front door where possible; direct db for the turn-engine-bound rows). */
  async function seedOwnerWorld(owner: AppCaller, db: Parameters<typeof seedChat>[0]): Promise<OwnerIds> {
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

    // A host-authored automation rule on A's chat (front door — A is the chat's host). Its `name` (MARK.
    // automationRule) is A's marker, so a broken `automation.listRules`/`testRule`/`listFires` host gate that
    // resolved A's rule for a stranger leaks it; the rule is born DISABLED, and the ruleId feeds every
    // rule-scoped probe (update/setRuleEnabled/delete/testRule/listFires collapse a stranger to NOT_FOUND).
    const automationRule = await owner.automation.createRule({
      chatId,
      name: MARK.automationRule,
      trigger: { bus: "chat", type: "messageCommitted" },
      actions: [{ type: "set_variable", scope: "chat", key: "probe", op: "set", value: "1" }],
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

    // A databank source-document owned by A — seeded directly (origin 'text', no CAS/ingest dependency). Its
    // `name` AND `extractedText` carry A's marker, so a dropped owner belt on `get` (esp. `includeText`) leaks
    // it, and the post-sweep integrity re-read proves rename/remove never touched A's canon.
    // A STRICT-valid TypeID (minted, not cast) — `reindex`'s `reindexScopeSchema.documentId` is the strict
    // `documentIdSchema`, so a non-TypeID like "document_alpha" would fail WIRE validation (BAD_REQUEST) before
    // reaching the owner gate; a real `document_…` id lets the probe exercise the actual ownership belt.
    const documentId = mintTypeId(ID_PREFIX.document);
    await db.insert(documents).values({
      id: documentId,
      ownerId: OWNER_USER_ID,
      sourceAssetId: null,
      name: MARK.databankDoc,
      mime: "text/plain",
      origin: "text",
      sourceUrl: null,
      extractedText: `${MARK.databankDoc} canon owned by A`,
      importHash: "alpha-doc-hash",
      byteSize: 1,
      extractorVersion: "none",
      createdAt: 1,
      updatedAt: 1,
    });
    // A REAL character-scope junction on A's character + document — the `databank.detachFromCharacter`
    // probe's teeth: the junction is keyed on characterId (not the caller's ownerId), so an UNGATED detach
    // would delete THIS row; the post-sweep integrity re-read asserts it survived the stranger's probe.
    await db.insert(characterDocuments).values({ characterId: character.id, documentId });

    // ── An rpg GAME on A's chat (front door — A is the chat's host). rpg has NO ownerId: game-ness + authority
    //    derive `rpg_games.chatId → chat_participants` (D18/D20), so a stranger passing A's chatId to ANY rpg
    //    verb must collapse to a leak-free NOT_FOUND. Markers stamp every readable surface (config steering note,
    //    a tracker label, a quest name, a journal entry, a checkpoint label) so a regressed game-scoping would
    //    ECHO one back on a stranger's getTrackerView/getConfigView/listJournal/listCheckpoints probe. The
    //    rule-scoped write ids (quest/journal/checkpoint) are A's REAL ids — a dropped `gameId`/membership
    //    predicate on a foreign id would touch A's row (the W1b IDOR class this domain already hid once). ──
    await owner.rpg.createGame({ chatId, mode: "lite" });
    // The host-only config write door — steeringNote is A's marker (getConfigView.steeringNote, host-read).
    await owner.rpg.updateConfig({ chatId, patch: { steeringNote: MARK.rpgSteering } });
    // The host-only tracker-def door — A's marker rides a game-subject tracker (getTrackerView.gameTrackers).
    await owner.rpg.updateConfig({
      chatId,
      patch: { trackers: [{ key: "mark", label: MARK.rpgWidget, shape: "meter", write: "set", subject: "game", max: 100 }] },
    });
    // upsertQuest clone-forwards off the turnless game's default state → mints the FIRST snapshot (the narrator
    // slot), so the subsequent createCheckpoint has a resolved head to label.
    const rpgQuestId = await owner.rpg.upsertQuest({ chatId, name: MARK.rpgQuest });
    const rpgJournalId = await owner.rpg.addJournalEntry({ chatId, type: "note", title: MARK.rpgJournal, content: `${MARK.rpgJournal} — owned by A` });
    const rpgCheckpointId = await owner.rpg.createCheckpoint({ chatId, label: MARK.rpgCheckpoint });

    // A regex library script owned by A — its `name` is the leak marker, so a broken owner belt on any
    // scriptId-taking verb (get/update/remove/duplicate/attach-global) leaks it back to the stranger.
    const regexScript = await owner.regex.createScript({
      input: { name: MARK.regexScript, findRegex: "a", replaceString: "b", placement: ["AI_OUTPUT"] },
    });
    const regexScriptId = regexScript.id;

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
      documentId,
      automationRuleId: automationRule.id,
      rpgQuestId,
      rpgJournalId,
      rpgCheckpointId,
      regexScriptId,
    };
  }

  test("owner A sees its own marker (the leak-detector has teeth) but a stranger never does", async ({ db, ownerCaller, otherCaller }) => {
    const ids = await seedOwnerWorld(ownerCaller, db);

    // CONTROL: the owner's OWN read carries the marker — proving the detector below is not blind.
    const ownView = JSON.stringify(await ownerCaller.character.get({ characterId: ids.characterId }));
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
    expect(leaks, `cross-tenant IDOR leak(s) — STOP-and-report findings:\n${leaks.join("\n")}`).toEqual([]);

    // POST-SWEEP INTEGRITY: no probe silently MUTATED/deleted A's world (a write-IDOR returning void).
    const stillThere = await ownerCaller.character.get({ characterId: ids.characterId });
    expect(stillThere.name).toBe(MARK.character); // untouched by the stranger's `update`/`remove` probes
    const chatStill = await ownerCaller.chat.getChat({ chatId: ids.chatId });
    expect(chatStill.title).toBe("AlphaSecretChatTitle"); // untouched by the stranger's chat-mutation probes
    const docStill = await ownerCaller.databank.get({ id: ids.documentId });
    expect(docStill.name).toBe(MARK.databankDoc); // untouched by the stranger's databank.rename/remove probes
    const docAttachments = await ownerCaller.databank.listAttachments({ id: ids.documentId });
    expect(docAttachments.characterIds).toEqual([ids.characterId]); // the character junction survived detachFromCharacter
    const rulesStill = await ownerCaller.automation.listRules({ chatId: ids.chatId });
    expect(rulesStill).toHaveLength(1); // the stranger's createRule enqueued no rule into A's chat
    expect(rulesStill[0]?.name).toBe(MARK.automationRule); // untouched by the stranger's automation.updateRule probe
    expect(rulesStill[0]?.enabled).toBe(false); // born disabled — untouched by the stranger's setRuleEnabled probe
    // rpg: A's game surfaces survived the stranger's write probes (updateConfig/patchSheet/upsert/delete/restore).
    const rpgConfigStill = await ownerCaller.rpg.getConfigView({ chatId: ids.chatId });
    expect(rpgConfigStill.steeringNote).toBe(MARK.rpgSteering); // untouched by the stranger's rpg.updateConfig probe
    const rpgTrackerStill = await ownerCaller.rpg.getTrackerView({ chatId: ids.chatId });
    expect(rpgTrackerStill.gameTrackers.map((t) => t.def.label)).toContain(MARK.rpgWidget); // the tracker def survived the stranger's updateConfig probe
    expect(rpgTrackerStill.quests.map((q) => q.name)).toContain(MARK.rpgQuest); // quest survived deleteQuest
    const rpgJournalStill = await ownerCaller.rpg.listJournal({ chatId: ids.chatId });
    expect(rpgJournalStill.map((j) => j.title)).toContain(MARK.rpgJournal); // entry survived deleteJournalEntry
    const rpgCheckpointsStill = await ownerCaller.rpg.listCheckpoints({ chatId: ids.chatId });
    expect(rpgCheckpointsStill.map((cp) => cp.label)).toContain(MARK.rpgCheckpoint); // checkpoint survived (stranger never reached it)
    const regexScriptStill = await ownerCaller.regex.getScript({ scriptId: ids.regexScriptId });
    expect(regexScriptStill.name).toBe(MARK.regexScript); // untouched by the stranger's update/remove/attach probes
  });
});
