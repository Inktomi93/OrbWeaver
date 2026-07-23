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

import {
  assets,
  cardEvolutionProposals,
  characterDocuments,
  characterSprites,
  documents,
  themes,
  userCredentials,
  workloadSchedules,
  workloads,
} from "@orb/db";
import type {
  AssetId,
  CardEvolutionProposalId,
  CrewEditProposalId,
  DocumentId,
  MessageVariantId,
  ThemeId,
  UserCredentialId,
  WorkloadId,
  WorkloadScheduleId,
} from "@orb/kit/ids";
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
  rosterPreset: "AlphaSecretParty",
  // A saved BYO ComfyUI workflow's NAME bound to A — leaks via a broken comfyuiWorkflow.get/list owner gate
  // (the view carries `name` verbatim). C7 (comfyui-control §4.11).
  comfyuiWorkflow: "AlphaSecretWorkflow",
  book: "AlphaSecretBook",
  entry: "AlphaSecretEntry",
  tag: "alphasecrettag",
  theme: "AlphaSecretTheme",
  message: "AlphaSecretMessage",
  credential: "AlphaSecretCred",
  workload: "AlphaSecretWorkload",
  schedule: "AlphaSecretSchedule",
  databankDoc: "AlphaSecretDoc",
  // A card-evolution proposal's change text, bound to A's character — leaks via a broken
  // `listCardEvolutionProposals` owner gate (the view carries `changes[].text` verbatim).
  proposal: "AlphaSecretDrift",
  // A normalized expression-sprite label (a-z0-9_- only) bound to A's character — leaks via a broken
  // `listSprites` visibility gate (the CharacterSpriteView carries the label verbatim).
  sprite: "alphasecretsprite",
  // A host-authored automation rule's NAME bound to A's chat — leaks via a broken `automation.listRules`
  // host gate (the RuleView carries `name` verbatim).
  automationRule: "AlphaSecretRule",
} as const;
const MARKERS = Object.values(MARK);

/** Owner A's seeded ids — collected once, fed to every stranger probe. */
interface OwnerIds {
  characterId: string;
  personaId: string;
  presetId: string;
  rosterPresetId: string;
  comfyuiWorkflowId: string;
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
  proposalId: string;
  automationRuleId: string;
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
  {
    path: "character.listCardEvolutionProposals",
    call: (c, i) => c.character.listCardEvolutionProposals({ characterId: i.characterId }),
  },
  {
    path: "character.acceptCardEvolution",
    call: (c, i) => c.character.acceptCardEvolution({ proposalId: castId<CardEvolutionProposalId>(i.proposalId) }),
  },
  {
    path: "character.dismissCardEvolution",
    call: (c, i) => c.character.dismissCardEvolution({ proposalId: castId<CardEvolutionProposalId>(i.proposalId) }),
  },
  // crew config is membership-scoped (getConfig/setConfig gate via the chat's membership + `can()`); a
  // stranger gets a leak-free NOT_FOUND. setConfig is host-only AND write — the post-sweep integrity re-read
  // proves the stranger's probe never created/mutated A's crew_chats row.
  { path: "crew.getConfig", call: (c, i) => c.crew.getConfig({ chatId: i.chatId }) },
  { path: "crew.setConfig", call: (c, i) => c.crew.setConfig({ chatId: i.chatId, config: { version: 1 } }) },
  // runNow is host-only AND write (enqueues a workload) — a stranger hits `requireHost` (→ a leak-free
  // NOT_FOUND before any dispatch). The `keeper` member is a landed runner; the post-sweep integrity re-read
  // proves the stranger's probe enqueued nothing against A.
  { path: "crew.runNow", call: (c, i) => c.crew.runNow({ chatId: i.chatId, member: "keeper" }) },
  // The director host-ring surface (CW4) — both host-only (`requireHost` → leak-free NOT_FOUND for a stranger
  // before any plot read). getPlotState is a read; resetPlot is a write (deletes the plot + zeroes the counter),
  // so the post-sweep integrity re-read proves the stranger's probe mutated nothing on A.
  { path: "crew.getPlotState", call: (c, i) => c.crew.getPlotState({ chatId: i.chatId }) },
  { path: "crew.resetPlot", call: (c, i) => c.crew.resetPlot({ chatId: i.chatId }) },
  // The prose-audit review surface (CW5) — all four gate on `requireParticipant(chatId)` FIRST (a stranger
  // gets a leak-free NOT_FOUND before any proposal/variant is loaded); accept/dismiss additionally require the
  // proposal's `chatId` to match. The `proposalId`/`variantId` are unreachable fakes — the membership gate
  // fires before they're touched.
  { path: "crew.listEditProposals", call: (c, i) => c.crew.listEditProposals({ chatId: i.chatId }) },
  {
    path: "crew.acceptEditProposal",
    call: (c, i) => c.crew.acceptEditProposal({ chatId: i.chatId, proposalId: castId<CrewEditProposalId>(i.proposalId) }),
  },
  {
    path: "crew.dismissEditProposal",
    call: (c, i) => c.crew.dismissEditProposal({ chatId: i.chatId, proposalId: castId<CrewEditProposalId>(i.proposalId) }),
  },
  // The restore-original surface (CW4 tail) — both gate on `requireParticipant(chatId)` FIRST (a stranger gets
  // a leak-free NOT_FOUND before any proposal loads); revert additionally requires the proposal's `chatId` to
  // match + edit authority. The `proposalId` is an unreachable fake — the membership gate fires before it.
  { path: "crew.listRestorableEdits", call: (c, i) => c.crew.listRestorableEdits({ chatId: i.chatId }) },
  {
    path: "crew.revertEditProposal",
    call: (c, i) => c.crew.revertEditProposal({ chatId: i.chatId, proposalId: castId<CrewEditProposalId>(i.proposalId) }),
  },
  {
    path: "crew.requestProseAudit",
    call: (c, i) => c.crew.requestProseAudit({ chatId: i.chatId, variantId: castId<MessageVariantId>("variant_fake") }),
  },
  // Persistent guides (CW6) — listGuides gates on requireParticipant, every mutation on requireHost; a
  // stranger gets a leak-free NOT_FOUND before any guide row / injection / turn is touched.
  { path: "crew.listGuides", call: (c, i) => c.crew.listGuides({ chatId: i.chatId }) },
  {
    path: "crew.upsertGuide",
    call: (c, i) =>
      c.crew.upsertGuide({ chatId: i.chatId, guideKey: "probe", name: "n", template: "t", depth: 0, role: "system", labeled: true, autoRefresh: false }),
  },
  { path: "crew.addPackagedGuide", call: (c, i) => c.crew.addPackagedGuide({ chatId: i.chatId, template: "thinking" }) },
  { path: "crew.setGuideEnabled", call: (c, i) => c.crew.setGuideEnabled({ chatId: i.chatId, guideKey: "probe", enabled: false }) },
  { path: "crew.refreshGuide", call: (c, i) => c.crew.refreshGuide({ chatId: i.chatId, guideKey: "probe" }) },
  { path: "crew.editGuideContent", call: (c, i) => c.crew.editGuideContent({ chatId: i.chatId, guideKey: "probe", content: "x" }) },
  { path: "crew.flushGuide", call: (c, i) => c.crew.flushGuide({ chatId: i.chatId, guideKey: "probe" }) },
  { path: "crew.flushAllGuides", call: (c, i) => c.crew.flushAllGuides({ chatId: i.chatId }) },
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
  // ── roster-preset (owner-scoped library; D61) — get/update/remove/applyToChat take a presetId gated by
  //    fetchOwned (a stranger's presetId reads absent → RosterPresetNotFoundError → leak-free NOT_FOUND). The
  //    preset's `name` (MARK.rosterPreset) leaks via a broken get; the write-IDOR is caught by the post-sweep
  //    integrity re-read. `applyToChat` is owner-gated on the presetId BEFORE any chat write. ──
  { path: "rosterPreset.get", call: (c, i) => c.rosterPreset.get({ presetId: i.rosterPresetId }) },
  {
    path: "rosterPreset.update",
    call: (c, i) => c.rosterPreset.update({ presetId: i.rosterPresetId, name: "hacked", members: [{ kind: "character", characterId: i.characterId }] }),
  },
  { path: "rosterPreset.remove", call: (c, i) => c.rosterPreset.remove({ presetId: i.rosterPresetId }) },
  { path: "rosterPreset.applyToChat", call: (c, i) => c.rosterPreset.applyToChat({ presetId: i.rosterPresetId, chatId: i.chatId }) },
  // ── comfyui-workflow (owner-scoped BYO library; C7) — get/update/remove take a workflowId gated by fetchOwned
  //    (a stranger's workflowId reads absent → ComfyuiWorkflowNotFoundError → leak-free NOT_FOUND). The
  //    workflow's `name` (MARK.comfyuiWorkflow) leaks via a broken get; the write-IDOR is caught by the
  //    post-sweep integrity re-read. ──
  { path: "comfyuiWorkflow.get", call: (c, i) => c.comfyuiWorkflow.get({ workflowId: i.comfyuiWorkflowId }) },
  {
    path: "comfyuiWorkflow.update",
    call: (c, i) => c.comfyuiWorkflow.update({ workflowId: i.comfyuiWorkflowId, name: "hacked", graphJson: '{"1":{"class_type":"KSampler","inputs":{}}}' }),
  },
  { path: "comfyuiWorkflow.remove", call: (c, i) => c.comfyuiWorkflow.remove({ workflowId: i.comfyuiWorkflowId }) },
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
  // ── expressions (character-sprite CRUD) — set/remove are owner-only on the characterId (a stranger's
  //    probe collapses to NOT_FOUND before the assetId/label is used, the leak-free character-ownership gate).
  //    `list` is owner-OR-member-visible (assertCharacterVisible), so a non-member stranger passing A's
  //    characterId gets an EMPTY list (never A's seeded `alphasecretsprite` binding) — a leak-free no-answer.
  //    A wire-valid but nonexistent assetId keeps `set` past input validation to the ownership chokepoint. ──
  { path: "expressions.set", call: (c, i) => c.expressions.set({ characterId: i.characterId, label: "hacked", assetId: mintTypeId(ID_PREFIX.asset) }) },
  { path: "expressions.list", call: (c, i) => c.expressions.list({ characterId: i.characterId }) },
  { path: "expressions.remove", call: (c, i) => c.expressions.remove({ characterId: i.characterId, label: MARK.sprite }) },
  // generateSheet (E4) enqueues an owner-gated sprite-sheet job — the ownership check (assertCharacterOwned)
  // runs BEFORE any enqueue, so a stranger passing A's characterId collapses to NOT_FOUND and mints no workload.
  { path: "expressions.generateSheet", call: (c, i) => c.expressions.generateSheet({ characterId: i.characterId, labels: ["joy"] }) },
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
        messageIds: [i.messageId],
        personaId: i.personaId,
      }),
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
  { path: "chat.previewAssembly", call: (c, i) => c.chat.previewAssembly({ chatId: i.chatId }) },
  { path: "chat.getShapeTrace", call: (c, i) => c.chat.getShapeTrace({ chatId: i.chatId }) },
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
  // seatAgent is host-gated (`requireHost` → `requireParticipant` miss = leak-free NOT_FOUND) BEFORE the
  // ownerUserId/agent lookup ever runs, so a stranger seating into A's chat collapses to NOT_FOUND and
  // never mints/seats (D60, doc 04 §3). `ownerUserId` is any id — the chatId gate is the chokepoint.
  {
    path: "chat.seatAgent",
    call: (c, i) => c.chat.seatAgent({ chatId: i.chatId, ownerUserId: OWNER_USER_ID, sourceKind: "buddy" }),
  },
  // unseatAgent is host-gated (`requireHost` → `requireParticipant` miss = leak-free NOT_FOUND) on the chatId
  // BEFORE the agent-seat stamp, so a stranger unseating an agent in A's chat collapses to NOT_FOUND and
  // never touches a row (the seatAgent twin; the solo-operator fix, 2026-07-17). `agentUserId` is any id.
  {
    path: "chat.unseatAgent",
    call: (c, i) => c.chat.unseatAgent({ chatId: i.chatId, agentUserId: OWNER_USER_ID }),
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
  // getAgentCardView is member-gated (`requireParticipant` miss = leak-free NOT_FOUND) BEFORE the
  // agent-seat lookup, so a stranger reading into A's chat collapses to NOT_FOUND. `agentUserId` is any id.
  {
    path: "chat.getAgentCardView",
    call: (c, i) => c.chat.getAgentCardView({ chatId: i.chatId, agentUserId: OWNER_USER_ID }),
  },
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
  { path: "invites.selfLeave", call: (c, i) => c.invites.selfLeave({ chatId: i.chatId }) },
  {
    path: "invites.nominateHostHandoff",
    call: (c, i) => c.invites.nominateHostHandoff({ chatId: i.chatId, userId: OWNER_USER_ID }),
  },
  // requestAgentSeat is member-gated (`requireParticipant` miss = leak-free NOT_FOUND) BEFORE the
  // owner-of-the-agent check, so a stranger requesting a seat in A's chat collapses to NOT_FOUND and
  // delivers no notification (D60, doc 04 §3). `ownerUserId` is any id — the chatId gate is the chokepoint.
  {
    path: "invites.requestAgentSeat",
    call: (c, i) => c.invites.requestAgentSeat({ chatId: i.chatId, ownerUserId: OWNER_USER_ID, sourceKind: "buddy" }),
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
  { path: "chat.impersonate", call: (c, i) => c.chat.impersonate({ chatId: i.chatId }) },
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

  // ── rpg (R3): every verb is chat-gated (requireParticipant reads / requireHost writes) → a stranger with
  //    A's game chat gets a leak-free NOT_FOUND. Fake rpg-entity ids are REAL TypeIDs (brandedId validates the
  //    wire) + minimal-but-valid bodies, so the probe reaches the AUTH gate, not a 400. `rpg.stream` is a
  //    subscription (EXEMPT). ──
  { path: "rpg.getGame", call: (c, i) => c.rpg.getGame({ chatId: i.chatId }) },
  { path: "rpg.getHud", call: (c, i) => c.rpg.getHud({ chatId: i.chatId }) },
  { path: "rpg.getTracker", call: (c, i) => c.rpg.getTracker({ chatId: i.chatId }) },
  { path: "rpg.getEncounter", call: (c, i) => c.rpg.getEncounter({ chatId: i.chatId }) },
  { path: "rpg.getMap", call: (c, i) => c.rpg.getMap({ chatId: i.chatId }) },
  { path: "rpg.getParty", call: (c, i) => c.rpg.getParty({ chatId: i.chatId }) },
  // The lite Stats & Trackers editor's host config read (13 §7) — HOST-gated (requireHost → requireParticipant
  // miss = leak-free NOT_FOUND for a stranger) BEFORE any config read, so the private config never reaches a non-host.
  { path: "rpg.getConfig", call: (c, i) => c.rpg.getConfig({ chatId: i.chatId }) },
  // The full-mode edit-settings form's host config read (13 §7) — HOST-gated (requireHost → requireParticipant
  // miss = leak-free NOT_FOUND for a stranger) BEFORE any config read, so the full editable config never reaches a non-host.
  { path: "rpg.getGameConfig", call: (c, i) => c.rpg.getGameConfig({ chatId: i.chatId }) },
  { path: "rpg.previewSheetSeed", call: (c, i) => c.rpg.previewSheetSeed({ chatId: i.chatId, characterId: i.characterId }) },
  { path: "rpg.listNpcs", call: (c, i) => c.rpg.listNpcs({ chatId: i.chatId }) },
  { path: "rpg.listJournal", call: (c, i) => c.rpg.listJournal({ chatId: i.chatId }) },
  { path: "rpg.listQuests", call: (c, i) => c.rpg.listQuests({ chatId: i.chatId }) },
  { path: "rpg.listSessions", call: (c, i) => c.rpg.listSessions({ chatId: i.chatId }) },
  { path: "rpg.listClocks", call: (c, i) => c.rpg.listClocks({ chatId: i.chatId }) },
  { path: "rpg.listWidgets", call: (c, i) => c.rpg.listWidgets({ chatId: i.chatId }) },
  { path: "rpg.checkpointList", call: (c, i) => c.rpg.checkpointList({ chatId: i.chatId }) },
  {
    path: "rpg.createGame",
    call: (c, i) =>
      c.rpg.createGame({
        chatId: i.chatId,
        config: { genres: ["Fantasy"], tones: ["Heroic"], difficulty: "normal", rating: "sfw", gm: { kind: "standalone" } },
      }),
  },
  {
    path: "rpg.updateConfig",
    call: (c, i) =>
      c.rpg.updateConfig({
        chatId: i.chatId,
        config: { genres: ["Fantasy"], tones: ["Heroic"], difficulty: "normal", rating: "sfw", gm: { kind: "standalone" } },
      }),
  },
  { path: "rpg.assignGmSeat", call: (c, i) => c.rpg.assignGmSeat({ chatId: i.chatId, userId: null }) },
  { path: "rpg.setMode", call: (c, i) => c.rpg.setMode({ chatId: i.chatId, mode: "lite" }) },
  // The lite Stats & Trackers editor's config/sheet patches (13 §7) — patchConfig is HOST-gated, patchSheet is
  // MEMBER-gated at the floor (requireHost/requireParticipant → leak-free NOT_FOUND for a stranger) BEFORE any
  // write; the post-sweep integrity re-read proves the stranger mutated nothing on A. `steeringNote` is a
  // marker-free scalar; the partyMemberId is a real-but-absent TypeID (the auth gate fires before it is used).
  { path: "rpg.patchConfig", call: (c, i) => c.rpg.patchConfig({ chatId: i.chatId, steeringNote: "hacked" }) },
  { path: "rpg.patchSheet", call: (c, i) => c.rpg.patchSheet({ chatId: i.chatId, partyMemberId: mintTypeId(ID_PREFIX.rpgPartyMember) }) },
  { path: "rpg.editSnapshot", call: (c, i) => c.rpg.editSnapshot({ chatId: i.chatId }) },
  { path: "rpg.checkpointSave", call: (c, i) => c.rpg.checkpointSave({ chatId: i.chatId, label: "x" }) },
  { path: "rpg.checkpointRemove", call: (c, i) => c.rpg.checkpointRemove({ chatId: i.chatId, checkpointId: mintTypeId(ID_PREFIX.rpgCheckpoint) }) },
  { path: "rpg.checkpointRestore", call: (c, i) => c.rpg.checkpointRestore({ chatId: i.chatId, checkpointId: mintTypeId(ID_PREFIX.rpgCheckpoint) }) },
  { path: "rpg.upsertNpc", call: (c, i) => c.rpg.upsertNpc({ chatId: i.chatId, name: "x" }) },
  { path: "rpg.applyReputation", call: (c, i) => c.rpg.applyReputation({ chatId: i.chatId, npcId: mintTypeId(ID_PREFIX.rpgNpc), action: "met" }) },
  { path: "rpg.createClock", call: (c, i) => c.rpg.createClock({ chatId: i.chatId, name: "x", segments: 4, kind: "front" }) },
  { path: "rpg.tickClock", call: (c, i) => c.rpg.tickClock({ chatId: i.chatId, clockId: mintTypeId(ID_PREFIX.rpgClock), ticks: 1 }) },
  { path: "rpg.addJournalEntry", call: (c, i) => c.rpg.addJournalEntry({ chatId: i.chatId, type: "note", title: "x", content: "x" }) },
  { path: "rpg.upsertQuest", call: (c, i) => c.rpg.upsertQuest({ chatId: i.chatId, name: "x" }) },
  {
    path: "rpg.createMap",
    call: (c, i) =>
      c.rpg.createMap({
        chatId: i.chatId,
        name: "x",
        kind: "grid",
        data: { kind: "grid", width: 2, height: 2, cells: [], partyPosition: { x: 0, y: 0 } },
      }),
  },
  {
    path: "rpg.createWidget",
    call: (c, i) => c.rpg.createWidget({ chatId: i.chatId, type: "counter", label: "x", position: "hud_left", binding: { source: "morale" } }),
  },
  { path: "rpg.deleteWidget", call: (c, i) => c.rpg.deleteWidget({ chatId: i.chatId, widgetId: mintTypeId(ID_PREFIX.rpgWidget) }) },
  {
    path: "rpg.joinParty",
    call: (c, i) =>
      c.rpg.joinParty({ chatId: i.chatId, sheet: { attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, maxHp: 10 }, provenance: "joined" }),
  },
  { path: "rpg.startGame", call: (c, i) => c.rpg.startGame({ chatId: i.chatId }) },
  { path: "rpg.startSession", call: (c, i) => c.rpg.startSession({ chatId: i.chatId }) },
  {
    path: "rpg.concludeSession",
    call: (c, i) => c.rpg.concludeSession({ chatId: i.chatId, sessionId: mintTypeId(ID_PREFIX.rpgSession), summary: { summary: "x", resumePoint: "x" } }),
  },
  {
    path: "rpg.applySessionOutcome",
    call: (c, i) => c.rpg.applySessionOutcome({ chatId: i.chatId, sessionId: mintTypeId(ID_PREFIX.rpgSession), sheetProposals: [] }),
  },
  { path: "rpg.resumeSession", call: (c, i) => c.rpg.resumeSession({ chatId: i.chatId, sessionId: mintTypeId(ID_PREFIX.rpgSession) }) },
  { path: "rpg.getSessionWrap", call: (c, i) => c.rpg.getSessionWrap({ chatId: i.chatId }) },
  { path: "rpg.rollDice", call: (c, i) => c.rpg.rollDice({ chatId: i.chatId, notation: "1d6" }) },
  { path: "rpg.retractRound", call: (c, i) => c.rpg.retractRound({ chatId: i.chatId }) },
  {
    path: "rpg.resolvePendingCheck",
    call: (c, i) => c.rpg.resolvePendingCheck({ chatId: i.chatId, pendingCheckId: mintTypeId(ID_PREFIX.rpgPendingCheck) }),
  },
  { path: "rpg.confirmCharacterDeath", call: (c, i) => c.rpg.confirmCharacterDeath({ chatId: i.chatId, partyMemberId: mintTypeId(ID_PREFIX.rpgPartyMember) }) },
  // GM seat console (doc 12 §15) — host-gated seat verbs + the seat-shaped requestCheck + the member-scoped
  // pending-check read; a stranger with A's game chat gets a leak-free NOT_FOUND (requireHost / requireParticipant).
  { path: "rpg.moveParty", call: (c, i) => c.rpg.moveParty({ chatId: i.chatId, destination: "x" }) },
  { path: "rpg.offerChoices", call: (c, i) => c.rpg.offerChoices({ chatId: i.chatId, choices: ["a", "b"] }) },
  { path: "rpg.concludeEncounter", call: (c, i) => c.rpg.concludeEncounter({ chatId: i.chatId }) },
  {
    path: "rpg.requestCheck",
    call: (c, i) => c.rpg.requestCheck({ chatId: i.chatId, targetPartyMemberId: mintTypeId(ID_PREFIX.rpgPartyMember), skill: "stealth", dc: 12 }),
  },
  { path: "rpg.listPendingChecks", call: (c, i) => c.rpg.listPendingChecks({ chatId: i.chatId }) },
  // R10 scenes + recruit — chat-gated (host writes / member read) → a stranger with A's game chat gets NOT_FOUND.
  { path: "rpg.listScenes", call: (c, i) => c.rpg.listScenes({ chatId: i.chatId }) },
  { path: "rpg.planScene", call: (c, i) => c.rpg.planScene({ chatId: i.chatId }) },
  {
    path: "rpg.createScene",
    call: (c, i) =>
      c.rpg.createScene({
        chatId: i.chatId,
        plan: { name: "x", description: "x", scenario: "x", firstMessage: "x", participationGuide: "x", rating: "sfw" },
        participantCharacterIds: [],
      }),
  },
  { path: "rpg.concludeScene", call: (c, i) => c.rpg.concludeScene({ chatId: i.chatId, sceneId: mintTypeId(ID_PREFIX.rpgScene) }) },
  { path: "rpg.abandonScene", call: (c, i) => c.rpg.abandonScene({ chatId: i.chatId, sceneId: mintTypeId(ID_PREFIX.rpgScene) }) },
  { path: "rpg.recruitNpc", call: (c, i) => c.rpg.recruitNpc({ chatId: i.chatId, npcId: mintTypeId(ID_PREFIX.rpgNpc) }) },
  // ── RPG-CONSOLE-COMMIT (doc 12 §15) — the human-GM out-of-turn direct-commit arms + the promoted illustration
  //    verb. Every one is host-gated (`requireHost` → a stranger with A's game chat gets a leak-free NOT_FOUND
  //    BEFORE any snapshot/encounter write); the post-sweep integrity re-read proves nothing was mutated. Minimal
  //    valid bodies (the enemy blueprint carries a name+maxHp) so the probe reaches the AUTH gate, not a 400. ──
  { path: "rpg.advanceTimeConsole", call: (c, i) => c.rpg.advanceTimeConsole({ chatId: i.chatId, action: "explore" }) },
  { path: "rpg.setWidgetValueConsole", call: (c, i) => c.rpg.setWidgetValueConsole({ chatId: i.chatId, widgetRef: "morale" }) },
  { path: "rpg.grantLootConsole", call: (c, i) => c.rpg.grantLootConsole({ chatId: i.chatId, source: "chest" }) },
  { path: "rpg.startEncounterConsole", call: (c, i) => c.rpg.startEncounterConsole({ chatId: i.chatId, enemies: [{ name: "Goblin", maxHp: 8 }] }) },
  { path: "rpg.encounterRoundConsole", call: (c, i) => c.rpg.encounterRoundConsole({ chatId: i.chatId, actions: [] }) },
  { path: "rpg.attemptFleeConsole", call: (c, i) => c.rpg.attemptFleeConsole({ chatId: i.chatId, distraction: false }) },
  { path: "rpg.requestIllustration", call: (c, i) => c.rpg.requestIllustration({ chatId: i.chatId, sceneMoment: "a quiet dawn" }) },

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
  // ── plugin.setBudget (PLUGIN-SPEND) — owner-scoped exactly like getLog: the service gates
  //    `getById(ownerId=caller, pluginId)` BEFORE any budget write, so a stranger passing any pluginId hits
  //    a leak-free NOT_FOUND (never a foreign plugin's budget row). Fabricated id (the mintTypeId probe shape);
  //    the seeded-row owner teeth are in the verb int tests. ──
  { path: "plugin.setBudget", call: (c) => c.plugin.setBudget({ pluginId: mintTypeId(ID_PREFIX.plugin), maxActionsPerDay: 5 }) },
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
  "rosterPreset.create": "self-scoped: creates the caller's own preset (members validated owner-owned inside)",
  "rosterPreset.list": "self-scoped: lists the caller's own presets",
  "comfyuiWorkflow.create": "self-scoped: creates the caller's own BYO workflow",
  "comfyuiWorkflow.list": "self-scoped: lists the caller's own BYO workflows",
  "comfyuiWorkflow.listSeeds": "global read-only: lists the first-party shipped-static seed pool (no owner scope, caller-invariant)",
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
  "credentials.markRevokedByUser": "keyless-fixture: storage-disabled guard precedes the ownership check",
  "credentials.clearRevoked": "keyless-fixture: storage-disabled guard precedes the ownership check",
  "credentials.inspectEndpoint": "keyless-fixture: storage-disabled guard precedes the ownership check",
  "assets.listOwned": "self-scoped",
  "assets.listGallery": "self-scoped",
  // BYO pose library (C6c) — the caller's own skeletons, owner-scoped in the query WHERE through the
  // `asset_id → assets.ownerId` join (the row has no ownerId; a foreign asset's pose is simply absent, never a
  // foreign owner). Teeth in `import-poses.int.test.ts` (B never sees A's poses). Import (byte ingest) is a
  // multipart entry/http route, not a tRPC procedure — outside this tRPC sweep.
  "poses.listOwned": "self-scoped: owner-scoped via the assets join; see import-poses.int.test.ts",
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
  "hub.searchGifs":
    "self-scoped: resolves the caller's OWN gif-search credential (owner-scoped, no host fallback); query text + opaque cursor, no foreign id (hub.importGif IS probed)",
  // Card-hub browse (H2/H4) — no owned/foreign id. `search` takes a hub key + query text + the caller's own
  // filters; `getCard`/`previewCard`/`importCard` take an OPAQUE hub-card ref (a remote-catalog string, never
  // a TypeID/owned entity); `listHubs` takes no input. The remote catalog belongs to nobody — there is no
  // cross-tenant row to leak (a foreign ref returns that public card or a leak-free NOT_FOUND). `previewCard`
  // writes nothing; `importCard` creates rows owned by the ACTOR (off `ctx.auth`, no foreign id) and is
  // idempotent by importHash — the already-imported marker is owner-scoped (`findByImportedFrom`, owner in the
  // WHERE). Kill-switch + capability gating are covered by the hub domain verb tests.
  "hub.listHubs": "not-owned: the deployment's hub roster + capabilities; no id input",
  "hub.search": "self-scoped: a hub key + query text + the caller's own filters; the already-imported marker is owner-scoped, no foreign id",
  "hub.getCard": "not-owned: an OPAQUE remote-catalog card ref (never a TypeID/owned entity id); a foreign ref is that public card or a leak-free NOT_FOUND",
  "hub.previewCard": "not-owned: an OPAQUE remote-catalog card ref; ZERO writes, the already-imported marker is owner-scoped off ctx.auth",
  "hub.importCard": "self-scoped: an OPAQUE remote-catalog card ref; creates rows owned by the ACTOR (off ctx.auth), idempotent by owner-scoped importHash",
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
  "sessions.me": "self-scoped: projects the caller's own Principal",
  "sessions.streamUserEvents": "self-scoped: channel key is the caller's own userId",
  "sessions.listMyAgents": "self-scoped: ownerUserId is the caller's own userId, no foreign id",
  "sessions.provisionAgent": "self-scoped: mints the caller's OWN agent (ownerUserId = caller); input is only a sourceKind enum, no foreign id",
  "buddy.get": "self-scoped: one buddy per caller",
  "buddy.listQuips": "self-scoped: the caller's own reaction quips, keyed to principal.userId (no id input)",
  "buddy.hatch": "self-scoped",
  "buddy.ask": "self-scoped",
  "buddy.confirm": "not-a-cross-tenant-id: ephemeral in-memory proposal handle (per-user, 5-min TTL)",
  "buddy.history": "self-scoped",
  "buddy.clearChat": "self-scoped",
  "buddy.setReactions": "self-scoped",
  "buddy.setAgency": "self-scoped",
  "buddy.stream": "self-scoped: SSE reaction feed keyed to the caller's own userId (no id input)",
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
  "connection.getModelCapability": "not-owned: a model/source lookup, no owned id",
  "connection.resolveChatCapability":
    "self-scoped: resolves the caller's OWN chat-role ModelCapability from principal.userId's settings — " +
    "NO input at all (no caller-supplied user id/role), so there is no foreign id to probe",
  "connection.getModelsForSource":
    "self-scoped: the read-only picker facade over (source, role) — reads the caller's OWN credential " +
    "availability + the deployment catalog; no owned/foreign id in the input",
  "connection.orCredits": "self-scoped: reads the caller's OWN provider key",
  "connection.orGenerationCost": "not-owned: an upstream OpenRouter generation handle",
  "connection.testClaudeAuth": "self-scoped: the caller's own max-pro-sub health check",
  "connection.probeComfyui": "not-owned: probes the deployment-global owner-configured ComfyUI endpoint (no id input, no per-user resource)",
  "notifications.list": "self-scoped by principal.userId (multi-human belt)",
  "notifications.markAllRead": "self-scoped by principal.userId (recipient-scoped inside the verb, no foreign id)",
  "notifications.dismiss": "self-scoped by principal.userId (inbox scoped inside the verb)",
  "notifications.notifications": "subscription: self-scoped per-user channel",
  "chat.streamMessages": "subscription: non-member WITHHOLDS (yields nothing), not a NOT_FOUND throw — covered by chat.int durable-replay",
  "crew.stream":
    "subscription: the authority gate is the membership-scoped getConfig (throws NOT_FOUND on first pull for a non-member) — probed via crew.getConfig above",
  "rpg.stream": "subscription: the GM-eyes gate is getGame (throws NOT_FOUND on first pull for a non-member) — probed via rpg.getGame above",
  "automation.stream":
    "subscription: the visibility gate is resolveStreamAuthority (throws AutomationChatNotFound → NOT_FOUND on first pull for a non-present member, before any bus tail) AND narrows a non-host member to the room-visible quickReplySurfaced only — the membership gate is the loadCallerRole present-member read, covered by the automation.stream visibility unit test",
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
  "workloads.subscribe":
    "subscription: the existence check is the OWNER-scoped `get` (throws NOT_FOUND on first pull, not on call) — the gate is probed via workloads.get + the F3 authz int tests",
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
    // A saved roster preset owned by A — its `name` (MARK.rosterPreset) is the leak marker (a leaked get/list
    // or a leaked applyToChat error would surface it). Its cast is A's own character (the fetchOwned posture).
    const rosterPreset = await owner.rosterPreset.create({ name: MARK.rosterPreset, members: [{ kind: "character", characterId: character.id }] });
    // A saved BYO ComfyUI workflow owned by A — its `name` (MARK.comfyuiWorkflow) is the leak marker (a leaked
    // get/list would surface it). `graphJson` is a minimal valid API-format node graph (passes the arm's
    // isComfyuiGraph gate at create).
    const comfyuiWorkflow = await owner.comfyuiWorkflow.create({
      name: MARK.comfyuiWorkflow,
      graphJson: '{"1":{"class_type":"CLIPTextEncode","inputs":{"text":"%prompt%"}}}',
    });
    const book = await owner.worldInfo.createBook({ input: { name: MARK.book } });
    const entry = await owner.worldInfo.createEntry({
      bookId: book.id,
      input: { title: MARK.entry, content: "lore owned by A" },
    });
    const tag = await owner.tag.createTag({ input: { name: MARK.tag } });
    const snapshot = await owner.character.snapshot({ characterId: character.id });

    // An expression-sprite bound to A's character — seeded directly (an asset row + the character_sprites
    // binding, no CAS bytes needed). The binding's `label` (MARK.sprite) is A's marker, so a broken
    // `expressions.list` visibility gate that resolved A's character for a stranger would leak it here.
    const spriteAssetId = castId<AssetId>("asset_alphasprite");
    await db.insert(assets).values({
      id: spriteAssetId,
      ownerId: OWNER_USER_ID,
      kind: "sprite",
      mime: "image/png",
      size: 1,
      hash: "alpha-sprite-hash",
    });
    await db.insert(characterSprites).values({ characterId: character.id, label: MARK.sprite, assetId: spriteAssetId, createdAt: 1 });

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

    // A pending card-evolution proposal on A's character — its authority DERIVES via characterId →
    // characters.ownerId (chat-crew-design/02 §5). The change `text` carries A's marker, so a broken owner
    // join on list/accept/dismiss would leak it (list) or mutate A's world (accept/dismiss — the post-sweep
    // integrity re-read proves it survived).
    const proposalId = castId<CardEvolutionProposalId>("cardprop_alpha");
    await db.insert(cardEvolutionProposals).values({
      id: proposalId,
      characterId: character.id,
      chatId: null,
      changes: [{ field: "description", op: "append", text: MARK.proposal, rationale: "seeded" }],
      sourceSpan: null,
      status: "pending",
      createdAt: 1,
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
      rosterPresetId: rosterPreset.id,
      comfyuiWorkflowId: comfyuiWorkflow.workflowId,
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
      proposalId,
      automationRuleId: automationRule.id,
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
  });
});
