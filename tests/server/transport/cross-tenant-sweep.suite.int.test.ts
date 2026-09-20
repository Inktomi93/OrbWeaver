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

// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/composed-real.ts).
import "../../support/composed-real.ts";
import type { ProviderId } from "@orb/contracts/inference";
import { assets, characterDocuments, documents, notifications, plugins, themes, userCredentials, workloadSchedules, workloads } from "@orb/db";
import type {
  AssetId,
  AutomationRuleId,
  CharacterId,
  ChatId,
  DocumentId,
  MessageId,
  NotificationId,
  PersonaId,
  PluginId,
  PresetId,
  RefinerySchemaId,
  RefinerySessionId,
  RegexScriptId,
  RosterPresetId,
  RpgCheckpointId,
  RpgJournalId,
  RpgQuestId,
  TagId,
  ThemeId,
  UserCredentialId,
  WorkloadId,
  WorkloadScheduleId,
} from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { AutomationService } from "@orb/server/domain/automation";
import { appRouter } from "@orb/server/transport/trpc";
import { strToU8, zipSync } from "fflate";
import { describe } from "vitest";
import type { AppCaller } from "../../support/fixtures.ts";
import { expect, OWNER_USER_ID, test } from "../../support/fixtures.ts";
import { principal as automationPrincipal } from "../domain/automation/_support.ts";
import { seedChat, seedMessage, seedParticipant } from "../domain/chat/_support.ts";

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
  // C5 — an owner-GLOBAL rule authored by A (`automation_rules.chat_id IS NULL`). Its NAME is the marker a
  // stranger's `automation.listOwnerRules` would echo if `listRuleRowsForOwnerGlobal`'s `ownerId` predicate
  // were ever dropped (the query is `isNull(chatId) AND ownerId = …` — drop half and every user's private
  // global lane becomes one shared list). It ALSO rides the rule-scoped probes below as a foreign ruleId.
  automationOwnerRule: "AlphaSecretOwnerRule",
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
  // The refinery session's NAME — a leaked SessionView/summary carries it verbatim (R1: sessions derive
  // ownership through the character join, D23 — no ownerId column, so the join IS the belt under probe).
  refinerySession: "AlphaSecretRefinery",
  // R3: the custom-schema library row. Unlike sessions, `refinery_schemas` carries a DIRECT `ownerId`, so the
  // belt under probe is `loadOwnedSchemaRow`'s owner predicate. The marker rides the schema's NAME and its
  // DESCRIPTION — a leaked `updateSchema` returns the summary with the description verbatim even though the
  // stranger's patch overwrote the name, so both spellings are load-bearing. (The name must satisfy the
  // ResponseFormat identifier grammar `^[a-zA-Z_][a-zA-Z0-9_]*$` — hence no punctuation.)
  refinerySchema: "AlphaSecretSchema",
  // #26 — A's saved party (roster preset). The marker rides the preset NAME (a leaked view/summary
  // carries it verbatim); its one member is A's marker character, so a leaked member preview betrays
  // itself twice. `list` is PROBED (not EXEMPT) per the WHERE-partition rule: drop the ownerId predicate
  // and every user reads one shared party list.
  rosterPreset: "AlphaSecretParty",
  // #1627 — a durable row in A's INBOX. The inbox trio lost its PD-106 multi-human belt when single-human
  // notification sources landed, so the `recipient_user_id` WHERE-clause partition
  // (`domain/notifications/persistence/queries.ts`) is now the ONLY thing between two principals' inboxes —
  // the WHERE-partition rule (a dropped predicate makes every user read ONE shared inbox, which no parameter
  // shape can express). The marker rides the `automation-notice` member's rendered `message`, the one variant
  // that carries free text; every other member is ids-only and would be invisible to the leak detector.
  notification: "AlphaSecretNotice",
  // D147 — an installed plugin owned by A. `plugins.ownerId` is the partition key and every management verb
  // gates on it ALONE (there is no role gate any more, and deliberately no admin any-row branch), so these
  // probes are the transport-tier proof of the whole authority model. The marker rides the plugin's `name`,
  // which `toPluginView` returns verbatim — a leaked `upgrade`/`setGrant` result carries it.
  plugin: "AlphaSecretPlugin",
} as const;
const MARKERS = Object.values(MARK);

/** Owner A's seeded ids — collected once, fed to every stranger probe. */
interface OwnerIds {
  characterId: CharacterId;
  personaId: PersonaId;
  presetId: PresetId;
  bookId: string;
  entryId: string;
  tagId: TagId;
  // #795 — A's SECOND tag, seeded after `tagId` so A's tag order is a known [tagId, tagOrderBId]. The
  // `tag.setTagOrder` probe sends the reversal; the post-sweep order re-read is the only witness (a
  // single-tag order was un-reversible, so the old probe could not fail — the `regexGlobalOrder*` shape).
  tagOrderBId: TagId;
  credentialId: string;
  themeId: ThemeId;
  workloadId: WorkloadId;
  // #795 — a SECOND workload for A, seeded `queued`. `workloadId` above is `failed` so that `retry` is
  // meaningful, but `markCancelling` is a NO-OP ON A TERMINAL ROW — so the `cancel` probe aimed at it could
  // not mutate anything even with its owner belt REMOVED (measured: planted omission, suite stayed green).
  // A cancellable target is what gives that probe's write arm teeth.
  queuedWorkloadId: WorkloadId;
  scheduleId: string;
  snapshotId: string;
  chatId: ChatId;
  messageId: MessageId;
  documentId: DocumentId;
  automationRuleId: AutomationRuleId;
  // automation C5 — A's OWNER-GLOBAL rule id (`chat_id IS NULL`). The rule-scoped verbs are SHARED between
  // the two lanes, so this id is the only way to reach `requireRuleAuthority`'s owner-global arm from the
  // wire: for a chat rule the guard asks the roster, for this one it asks `rule.ownerId === principal.userId`
  // and must collapse a stranger to the SAME leak-free RuleNotFoundError (never FORBIDDEN — a global rule is
  // visible to exactly one person, so "not yours" and "no such rule" have to be indistinguishable).
  automationOwnerRuleId: AutomationRuleId;
  // rpg (W2) — A's real game-scoped ids, fed to the rpg write probes so a dropped `gameId`/membership predicate
  // on a foreign id would touch A's row (the W1b IDOR class this domain already hid once).
  rpgQuestId: RpgQuestId;
  rpgJournalId: RpgJournalId;
  rpgCheckpointId: RpgCheckpointId;
  regexScriptId: RegexScriptId;
  // #708 — two of A's scripts attached to A's GLOBAL tier in a known order. The `applyScopeOrder` global-scope
  // probe reverses them as the stranger; the post-sweep integrity re-read proves the order never moved. The
  // global tier has NO owner column (its scope IS the script's), so the verb's ownership pre-gate is the ONLY
  // belt between a stranger and A's execution order — the exact hole #708 closed.
  regexGlobalOrderAId: RegexScriptId;
  regexGlobalOrderBId: RegexScriptId;
  // refinery (R1) — A's real session id; every session verb derives ownership through the character join
  // (D23, no ownerId column), so a stranger passing it must collapse to leak-free NOT_FOUND.
  refinerySessionId: RefinerySessionId;
  // refinery (R3) — A's real custom-schema id; the schema table carries its OWN ownerId, so the probe
  // exercises `loadOwnedSchemaRow`'s direct owner predicate (read AND the owner-in-the-WHERE writes).
  refinerySchemaId: RefinerySchemaId;
  // plugin (D46/D147) — A's real installed plugin. Its whole authority model is `getById(db, caller.userId,
  // pluginId)`, so a stranger holding this id is the exact shape the belt exists to refuse.
  pluginId: PluginId;
  // #26 — A's saved party; every rosterPreset verb derives authority from `roster_presets.ownerId`, so a
  // stranger passing this id must collapse to leak-free NOT_FOUND.
  rosterPresetId: RosterPresetId;
  // #1627 — A's durable inbox row. `dismiss` is the only id-taking verb on the widened trio, so this is the
  // foreign id its leak-free NOT_FOUND collapse is probed with; `list`/`markAllRead` take no id at all and are
  // probed as the WHERE-partition shape (marker read / unread-flag witness).
  notificationId: NotificationId;
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
 * A `NOT_FOUND` throw or a benign marker-free resolve (a no-op mutation / empty list) is leak-free unless
 * the probe explicitly requires the authority contract to reject. Those probes must not silently resolve.
 */
async function leakVerdict(path: string, thunk: () => Promise<unknown>, requireNotFound = false): Promise<string | null> {
  let value: unknown;
  try {
    value = await thunk();
  } catch (e) {
    const code = trpcCode(e);
    return code === "NOT_FOUND" ? null : `${path}: a stranger's rejection must be leak-free NOT_FOUND, got ${code ?? `non-tRPC ${String(e)}`}`;
  }
  if (requireNotFound) {
    return `${path}: a stranger must be rejected with leak-free NOT_FOUND, but the call resolved`;
  }
  const leaked = MARKERS.find((m) => (JSON.stringify(value) ?? "").includes(m));
  return leaked === undefined ? null : `${path}: a stranger's result leaked owner A's data ("${leaked}")`;
}

// ── #795 — THE REVERSE DETECTOR (write-IDOR). ───────────────────────────────────────────────────────────────
// `leakVerdict` above asks "did A's data reach B?" — a READ-authority question. It is structurally BLIND to the
// opposite failure: an UPDATE that overwrites A's field with the attacker's value, or a DELETE that returns
// void, leaves the stranger's own result marker-free WHETHER THE WRITE WAS REFUSED OR SUCCEEDED (proven
// 2026-08-29, #755: dropping `eq(presets.ownerId, userId)` from `updatePresetRow` left this whole suite GREEN
// on a genuinely hijacked preset). The only witness is A's OWN world, re-read after the sweep.
//
// So this asks the mirror question — "did B's data reach A?" — and it is deliberately a CLASS belt rather than
// one hand-written pin per verb: nearly every mutating probe above writes the same distinctive attacker text,
// so ANY of them that silently lands is caught here, including probes added later by lanes that never read
// this comment. It does NOT replace the per-field pins below: it is blind to exactly what the forward detector
// is blind to — a boolean flipped, a number moved, an ORDER reversed, a row DELETED, a row ADDED — none of
// which carry text. Both halves are required, and each states which arms it owns.
const ATTACKER_TEXT = "hacked";

/** Did the stranger's text land in one of owner A's post-sweep reads? Returns a finding, or `null` when clean.
 *  Pure (the caller collects then asserts once), the `leakVerdict` posture. */
function hijackVerdict(surface: string, ownerRead: unknown): string | null {
  return (JSON.stringify(ownerRead) ?? "").includes(ATTACKER_TEXT)
    ? `${surface}: owner A's own read carries the STRANGER's text ("${ATTACKER_TEXT}") — a cross-tenant WRITE landed`
    : null;
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
  readonly requireNotFound?: boolean;
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

// C5 — the owner-global rate belt's two DISTINCT numbers. `automation_owner_budgets` is keyed by ownerId
// alone and its view is a bare `{maxFiresPerHour}`, so the marker-NAME detector is structurally toothless on
// it: two different numbers are what make the cross-owner partition observable at all. A seeds its ceiling to
// `OWNER_BUDGET_A`; the stranger's `setOwnerBudgets` probe writes `OWNER_BUDGET_STRANGER` into its OWN row
// (legitimate — it can only ever name itself). Post-sweep, A must still read A's number and the stranger must
// read the stranger's: either one reading the other's would be a partition failure the sweep's generic
// verdict cannot see. Both are away from `AUTOMATION_OWNER_BUDGET_DEFAULTS`, so a verb that silently
// projected the DDL default instead of the stored row would also fail these pins rather than pass them.
const OWNER_BUDGET_A = 7;
const OWNER_BUDGET_STRANGER = 99;

// ── #795 — the write-IDOR completeness audit's distinguishability constants. ────────────────────────────────
// EVERY one exists because the probe it belongs to was VACUOUS without it: a stranger's write whose payload
// equals the field's DEFAULT is indistinguishable from a refused write on the post-sweep re-read, so the pin
// passes whether the belt held or not. That is the `OWNER_BUDGET_A`/`OWNER_BUDGET_STRANGER` two-distinct-
// numbers rule (C5) generalized — a re-read is only a witness if the seeded value and the attacker's value
// differ. Each constant below is away from BOTH the schema default and the attacker's payload.

/** A's preset's distinctive generation knob. `preset.resetToDefault` REPLACES the config while KEEPING the
 *  name, so the existing `presetStill.name` pin is structurally blind to it — a default-configured preset
 *  reads identical before and after a hijacked reset. This knob is the only witness. */
const PRESET_TEMPERATURE_A = 0.42;
/** The stranger's `chat.setRoomOverrides` payload. It used to be `{}` — byte-identical to
 *  `DEFAULT_ROOM_OVERRIDES`, so a hijacked write left A's room reading exactly like an untouched one. This
 *  string reaches the assembled PROMPT (`scenario` is a section override), which is what makes the arm worth
 *  a real payload rather than an empty object. */
const ROOM_OVERRIDE_HACK = "hacked-room-override";

// A minimal schema that PASSES `refinerySchemaDocumentSchema` (liftable subset + the score stage's
// well-known `overallScore` 1-10 core). Deliberately valid: it seeds A's library row AND rides the
// `refinery.testSchema` probe, where a wire-invalid draft would BAD_REQUEST before the ownership belt and
// make a broken belt read as a pass. If the authoring belt tightens, the SEED throws loudly here.
const VALID_SCORE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: { overallScore: { type: "number", minimum: 1, maximum: 10 } },
  required: ["overallScore"],
};

/** A REAL plugin bundle (the two entries the funnel admits), base64-encoded for the wire. Deliberately valid
 *  and deliberately HOSTILE-shaped for the `plugin.upgrade` probe: it declares `net.fetch` at an attacker
 *  host and a version above A's, so a dropped ownership belt would not merely resolve — it would SWAP THE
 *  CODE A's row runs and re-point its egress wall. The post-sweep integrity re-read is what reads that back.
 *  A bytes-garbage payload would have been refused by `parseBundle` and made a broken belt look leak-free. */
function hostileBundleBase64(slug: string): string {
  const manifest = {
    id: slug,
    name: "Hijacked",
    version: "9.9.9",
    hostVersion: 1,
    entry: "main.js",
    description: "the stranger's bundle",
    capabilities: ["net.fetch"],
    netHosts: ["collector.attacker.example"],
  };
  const zipped = zipSync({ "manifest.json": strToU8(JSON.stringify(manifest)), "main.js": strToU8("orb.host(1);\n") });
  return Buffer.from(zipped).toString("base64");
}

const PROBES: readonly Probe[] = [
  // ── refinery (R1: ownership DERIVES through the character join — D23, no ownerId column; every probe
  //    must collapse to leak-free NOT_FOUND BEFORE any model call, so no stage probe ever reaches the
  //    summarize role). `startSession` takes A's CHARACTER id; the rest take A's session id; a leaked
  //    view carries MARK.refinerySession (the name) and MARK.character (inside the anchor card). ──
  { path: "refinery.startSession", call: (c, i) => c.refinery.startSession({ characterId: i.characterId }) },
  { path: "refinery.getSession", call: (c, i) => c.refinery.getSession({ sessionId: i.refinerySessionId }) },
  { path: "refinery.listRuns", call: (c, i) => c.refinery.listRuns({ sessionId: i.refinerySessionId }) },
  {
    path: "refinery.updateSession",
    call: (c, i) => c.refinery.updateSession({ sessionId: i.refinerySessionId, patch: { name: "hacked" } }),
  },
  { path: "refinery.deleteSession", call: (c, i) => c.refinery.deleteSession({ sessionId: i.refinerySessionId }) },
  { path: "refinery.runStage", call: (c, i) => c.refinery.runStage({ sessionId: i.refinerySessionId, stage: "score" }) },
  { path: "refinery.iterate", call: (c, i) => c.refinery.iterate({ sessionId: i.refinerySessionId }) },
  {
    path: "refinery.applyFields",
    call: (c, i) => c.refinery.applyFields({ sessionId: i.refinerySessionId, accepts: [{ field: "description" }] }),
  },
  // The BRANCH-OFF terminal act — same `resolveApplyBasis` preamble as applyFields, so the ownership belt
  // (`loadOwnedSessionRow`) is the FIRST thing it runs: a stranger collapses to NOT_FOUND before the injected
  // `character.duplicate` could mint a copy of A's card into the stranger's own library (the worst outcome
  // here is a cross-tenant card EXFILTRATION, not just a state write).
  {
    path: "refinery.applyAsCopy",
    call: (c, i) => c.refinery.applyAsCopy({ sessionId: i.refinerySessionId, accepts: [{ field: "description" }], name: "hacked" }),
  },
  // The HAND-AUTHORED rewrite door — a session-scoped WRITE (it inserts a `refinery_runs` row and flips the
  // session to `active`), so a dropped belt would let a stranger inject content into A's pipeline. The
  // ownership belt runs before the payload parse; post-sweep the session's run log is re-read for intactness.
  {
    path: "refinery.submitManualRewrite",
    call: (c, i) => c.refinery.submitManualRewrite({ sessionId: i.refinerySessionId, fields: [{ field: "description", text: "hacked" }] }),
  },
  // The output-budget readout: a READ that assembles A's REAL stage prompts (A's whole selected card
  // content) to MEASURE them. PROBED, but say the limit plainly: its result is numbers + the deployment's
  // summarizer model name and carries NO free text, so the marker detector is toothless on it — a dropped
  // belt would RESOLVE for the stranger (leaking A's card token-mass + resolved posture as a side channel)
  // and this sweep would read that as leak-free. Its real teeth are the verb-tier foreign/absent NOT_FOUND
  // pin added beside it in tests/server/domain/refinery/verbs/preflight.int.test.ts.
  { path: "refinery.preflight", call: (c, i) => c.refinery.preflight({ sessionId: i.refinerySessionId }) },
  // ── refinery R3 — the custom-schema library. `refinery_schemas` carries a DIRECT ownerId (not the D23
  //    character join), so these three probe `loadOwnedSchemaRow`'s own predicate. update/delete also carry
  //    the owner in the write's WHERE, so the post-sweep re-read is what proves the write-IDOR closed. ──
  {
    path: "refinery.updateSchema",
    call: (c, i) => c.refinery.updateSchema({ schemaId: i.refinerySchemaId, patch: { name: "hacked" } }),
  },
  { path: "refinery.deleteSchema", call: (c, i) => c.refinery.deleteSchema({ schemaId: i.refinerySchemaId }) },
  // testSchema is the ONE schema-library verb that takes a foreign-reachable id: a DRAFT schema (a caller
  // VALUE, not a reference) run against a caller-supplied `characterId`. Its ownership belt (`loadOwnedCard`)
  // is deliberately FIRST — before the draft belt and before any summarize spend (the existence-oracle
  // ordering its own header states) — so a stranger aiming it at A's card collapses to NOT_FOUND and never
  // funds a model call against A's content. A VALID draft is passed so the probe cannot die early on a wire
  // refusal and read as a pass.
  {
    path: "refinery.testSchema",
    call: (c, i) => c.refinery.testSchema({ schema: VALID_SCORE_SCHEMA, stage: "score", characterId: i.characterId }),
  },
  // ── character (owner-scoped) ──
  { path: "character.get", call: (c, i) => c.character.get({ characterId: i.characterId }) },
  // #1696 — the GROUP-BY-TAG census. PROBED rather than exempted alongside its `character.list` sibling,
  // because unlike `list` it echoes TAG NAMES: its result rows are `{id, name, folderType, characters}`
  // read through a `character_tags → tags` join, so a dropped `characters.owner_id` predicate would hand a
  // stranger a bucket literally named `alphasecrettag` (`MARK.tag`). Driven with A's tag as the include
  // filter, which is the shape a leak would travel on — the marker detector has real teeth here.
  { path: "character.listTagGroups", call: (c, i) => c.character.listTagGroups({ includeTagIds: [i.tagId] }) },
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
  // The per-snapshot CONTENT read (the refinery Versions walk). The teeth are maximal: the snapshot blob is
  // the whole card as it stood, so a resolved result carries MARK.character verbatim. Owner-gated through the
  // CHARACTER first (`loadOwnedCharacterRow`), then the snapshot is looked up chat—er, character-scoped; a
  // the CHARACTER first (`loadOwnedCharacterRow`), and only then is the snapshot looked up character-scoped;
  // a foreign character AND a snapshot outside it collapse to the SAME CharacterNotFoundError (leak-free — a
  // stranger cannot distinguish "not yours" from "no such snapshot"). A's real snapshotId is passed.
  {
    path: "character.getSnapshot",
    call: (c, i) => c.character.getSnapshot({ characterId: i.characterId, snapshotId: i.snapshotId }),
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
    path: "persona.listConnectedCharacters",
    call: (c, i) => c.persona.listConnectedCharacters({ personaId: i.personaId }),
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
  // The backward-bindings read (#279): it takes A's preset id and answers with A's active-pick flag plus
  // the ROOMS whose GM voice points at it — two facts a stranger must not learn. Both gates must hold: the
  // verb's own readable-preset predicate (which is what this probe attacks), and, behind it, the
  // membership filter on the rooms.
  { path: "preset.listUsage", call: (c, i) => c.preset.listUsage({ id: i.presetId }) },
  // ── rosterPreset (#26 — saved parties, single-owner + the chat-host second scope) ──
  { path: "rosterPreset.get", call: (c, i) => c.rosterPreset.get({ presetId: i.rosterPresetId }) },
  {
    // A resolve would echo the MEMBER's card name (A's character marker) even though the stranger's patch
    // overwrote the preset name — the refinery updateSchema double-marker posture.
    path: "rosterPreset.update",
    call: (c, i) =>
      c.rosterPreset.update({
        presetId: i.rosterPresetId,
        input: { name: "hacked", description: "", members: [{ kind: "character", characterId: i.characterId, position: 0 }] },
      }),
  },
  {
    // `remove` returns void — a silent resolve is a write-IDOR the marker detector cannot see, so the
    // authority contract must REJECT (and the post-sweep integrity re-read proves A's party survived).
    path: "rosterPreset.remove",
    call: (c, i) => c.rosterPreset.remove({ presetId: i.rosterPresetId }),
    requireNotFound: true,
  },
  {
    // The WHERE-partition plane (listOwnerRules class): no id input, but drop the ownerId predicate and
    // every user reads one shared party list — A's marker NAME in the stranger's resolve is the leak.
    path: "rosterPreset.list",
    call: (c) => c.rosterPreset.list(),
  },
  {
    // A foreign member characterId at CREATE must refuse — the FK proves existence, never ownership; a
    // resolve means the producer belt was dropped and the stranger minted a party over A's card.
    path: "rosterPreset.create",
    call: (c, i) =>
      c.rosterPreset.create({ input: { name: "TheftParty", description: "", members: [{ kind: "character", characterId: i.characterId, position: 0 }] } }),
    requireNotFound: true,
  },
  {
    // Scope 1: A's preset (+ A's chat) — the preset-ownership arm must refuse before anything room-shaped.
    path: "rosterPreset.applyToChat",
    call: (c, i) => c.rosterPreset.applyToChat({ presetId: i.rosterPresetId, chatId: i.chatId }),
    requireNotFound: true,
  },
  {
    // Scope 2 (the C5 second-scope rule): the stranger's OWN valid preset aimed at A's chat — the arm under
    // probe is chat's HOST authority through the injected guard; a resolve would mean the stranger stamped
    // seats onto A's room (the post-sweep chat integrity re-read backs this up).
    path: "rosterPreset.applyToChat",
    call: async (c, i) => {
      const myChar = await c.character.create({ input: { handle: "b-party-char", name: "StrangerPartyChar", description: "owned by B" } });
      const myParty = await c.rosterPreset.create({
        input: { name: "StrangerParty", description: "", members: [{ kind: "character", characterId: myChar.id, position: 0 }] },
      });
      return c.rosterPreset.applyToChat({ presetId: myParty.id, chatId: i.chatId });
    },
    requireNotFound: true,
  },
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
    path: "worldInfo.listAttachmentsForBook",
    call: (c, i) => c.worldInfo.listAttachmentsForBook({ bookId: i.bookId }),
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
  // #795 — the tag EXECUTION-ORDER arm, the `regex.applyScopeOrder` global-scope shape one plane over. The old
  // payload named A's ONE tag, so "reordered" and "refused" produced the identical single-element order and the
  // probe could not fail. A seeds TWO tags in a known order [tagId, tagOrderBId]; the stranger sends the
  // REVERSAL, and the post-sweep order re-read is the only witness (the verb answers void/a benign shape either
  // way, so the marker detector is structurally blind here).
  { path: "tag.setTagOrder", call: (c, i) => c.tag.setTagOrder({ orderedIds: [i.tagOrderBId, i.tagId] }) },
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
  // ── workloads (F3 per-user owner-scoped; get/cancel/retry take a workloadId) — a non-admin stranger must
  //    see a leak-free NOT_FOUND on a foreign workload (its `error` carries A's marker, so a broken gate that
  //    resolved A's row would leak it here). `list`/`start`/`subscribe` are EXEMPT (see below). ──
  { path: "workloads.get", call: (c, i) => c.workloads.get({ id: i.workloadId }) },
  // #795 — aimed at A's QUEUED row, not the failed one: `markCancelling` no-ops on a terminal row, so the old
  // spelling could not fail even with the owner belt deleted (planted omission, suite green). Against a queued
  // row a landed cancel moves `status` to `cancelled`, which the post-sweep pin reads.
  { path: "workloads.cancel", call: (c, i) => c.workloads.cancel({ id: i.queuedWorkloadId }) },
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
  { path: "chat.star", call: (c, i) => c.chat.star({ chatId: i.chatId, starred: true }) },
  { path: "chat.archive", call: (c, i) => c.chat.archive({ chatId: i.chatId, archived: true }) },
  {
    path: "chat.updateTitle",
    call: (c, i) => c.chat.updateTitle({ chatId: i.chatId, title: "hacked" }),
  },
  { path: "chat.delete", call: (c, i) => c.chat.delete({ chatId: i.chatId }) },
  // The R0 nav-away husk drop — host-only and DESTRUCTIVE (removes the row when the chat is still a
  // husk), so a dropped belt would let a stranger reap A's just-minted room out from under them. A's
  // fixture chat is CLAIMED (started), so even a belt-passing call must refuse on the husk predicate —
  // the probe proves the ownership belt fires FIRST (leak-free NOT_FOUND, row intact post-sweep).
  { path: "chat.reapHusk", call: (c, i) => c.chat.reapHusk({ chatId: i.chatId }) },
  {
    path: "chat.editMessage",
    call: (c, i) => c.chat.editMessage({ chatId: i.chatId, messageId: i.messageId, content: "hacked" }),
  },
  {
    // R3 §4.8/F6 — the seeded-greeting step. HOST-only and a CONTENT WRITE on A's canon, so a dropped
    // ownership belt would let a stranger rewrite the opening line of a room they cannot see. A's fixture
    // chat has a user row (it is a started conversation), so even a belt-passing call must refuse on the
    // freeze predicate — which is exactly why the probe matters: it proves the membership belt fires FIRST,
    // as a leak-free NOT_FOUND, rather than the caller learning anything from a coded `greeting_frozen`.
    path: "chat.setSeededGreeting",
    call: (c, i) => c.chat.setSeededGreeting({ chatId: i.chatId, messageId: i.messageId, greetingIndex: 0 }),
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
    // #795 — the payload was `{}`, which is byte-identical to `DEFAULT_ROOM_OVERRIDES`: a hijacked write left
    // A's room reading exactly like an untouched one, so the arm was un-witnessable by construction. A real
    // `scenario` override is what a hijack would actually be worth (it reaches the assembled prompt), and the
    // post-sweep `roomOverrides` re-read is its witness.
    path: "chat.setRoomOverrides",
    call: (c, i) => c.chat.setRoomOverrides({ chatId: i.chatId, overrides: { scenario: ROOM_OVERRIDE_HACK } }),
  },
  {
    // D85 host-only databank visibility override — `requireHost` → `requireParticipant` miss on a stranger's
    // chatId is a leak-free NOT_FOUND (the setRoomOverrides shape) BEFORE any metadata write.
    // #795: `hidden: []` was the DEFAULT, so the write was indistinguishable from a refusal. Naming A's real
    // documentId makes a hijacked write observable — and is the hostile shape besides (hiding a room's canon
    // from its own host).
    path: "chat.setChatDocumentVisibility",
    call: (c, i) => c.chat.setChatDocumentVisibility({ chatId: i.chatId, visibility: { hidden: [i.documentId] } }),
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
    // #1742 — the room's regex levers. Same `requireHost` → `requireParticipant` shape, and it carries the
    // same PROMPT stakes as `setOfferChoices` below: a stranger who could write these would be deciding
    // which text transforms run on someone else's room's prompt. Leak-free NOT_FOUND before any metadata
    // write.
    path: "chat.setRegexAllow",
    call: (c, i) => c.chat.setRegexAllow({ chatId: i.chatId, lever: { kind: "master", enabled: false } }),
  },
  {
    // #1742 — the host's effective-regex read. HOST-gated (three of its four tiers are the host's own
    // LIBRARY), so a stranger's call must not answer, and must not distinguish "not yours" from "no such
    // room": `requireHost` → `requireParticipant` miss is the leak-free NOT_FOUND before any library read.
    path: "chat.listEffectiveRegex",
    call: (c, i) => c.chat.listEffectiveRegex({ chatId: i.chatId }),
  },
  {
    // B1 — the per-room offer-choices posture. Same `requireHost` → `requireParticipant` shape as its
    // neighbour above, and it matters MORE here: this key reaches the PROMPT, so a stranger who could write
    // it would be steering someone else's room's model. Leak-free NOT_FOUND before any metadata write.
    path: "chat.setOfferChoices",
    call: (c, i) => c.chat.setOfferChoices({ chatId: i.chatId, enabled: true }),
  },
  {
    // B7 — the react-tool attach posture (the setOfferChoices twin, and the SAME "reaches the PROMPT"
    // stakes: a stranger who could pin it ON would be arming an autonomous tool in someone else's room).
    // `requireHost` → `requireParticipant` miss on a stranger's chatId is a leak-free NOT_FOUND before any
    // metadata write.
    path: "chat.setCharactersCanReact",
    call: (c, i) => c.chat.setCharactersCanReact({ chatId: i.chatId, enabled: true }),
  },
  {
    // B7 — the reaction-plane MASTER posture. Same shape; the stake is every member's write path (a
    // stranger flipping it OFF would silence a room's reactions for everyone in it). Leak-free NOT_FOUND
    // before any metadata write.
    path: "chat.setReactionsEnabled",
    call: (c, i) => c.chat.setReactionsEnabled({ chatId: i.chatId, enabled: false }),
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
    // S5 §4 (#669 C1) — the room's RUNTIME variable fold. UNCLASSIFIED until 2026-08-24: the proc landed in
    // f32b0af76 and nothing here covered it, so the completeness guard had been RED and this sweep was not a
    // verdict for anyone who ran it. It is a member-gated READ of live room state (the vars plane the clock
    // widget and the needle meter poll), so a dropped `requireParticipant` would hand a stranger the current
    // fold of A's room — leak-free NOT_FOUND is the only acceptable answer. Filed by the cb-plugin-scope lane
    // while re-classifying the plugin rows; the gate caught it exactly as designed.
    path: "chat.getRuntimeVariables",
    call: (c, i) => c.chat.getRuntimeVariables({ chatId: i.chatId }),
  },
  {
    // B6/MR0 — the reaction toggle. A WRITE that lands attributed canon in the room, so a dropped
    // `requireParticipant` would let a stranger put their name under a message in someone else's chat (and
    // fire that room's `reactionsChanged` rules). Two foreign-id surfaces, and the chatId gate is the one
    // that must bite: `requireParticipant` refuses BEFORE the seat or the variant is ever loaded. The
    // `variantId` half carries its OWN belt for the member case (`loadVariantSlotInChat` — in this chat AND
    // at or above the caller's D16 floor), pinned separately in the verb's int suite, which is why a fake
    // variant id is the right probe here: it must never get far enough for the id to matter.
    path: "chat.toggleReaction",
    call: (c, i) => c.chat.toggleReaction({ chatId: i.chatId, variantId: FAKE.variantId, emoji: "👍" }),
  },
  {
    // Its read twin — the room's grouped reaction window. Refused BEFORE the window loads: the groups name
    // A's participant seats, so a leak here hands a stranger part of A's roster.
    path: "chat.listReactions",
    call: (c, i) => c.chat.listReactions({ chatId: i.chatId }),
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
    // #795 — `personaId: null` IS the seeded default, so a hijacked write moved nothing observable. Aiming A's
    // REAL personaId makes the arm two-foreign-id (A's room + A's persona) AND gives the post-sweep
    // `anchorPersonaId` re-read something to see: a dropped host gate would re-point the `{{user}}` anchor
    // every card-authored section in A's room resolves against.
    path: "chat.setChatAnchorPersona",
    call: (c, i) => c.chat.setChatAnchorPersona({ chatId: i.chatId, personaId: i.personaId }),
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
  //    verbs (listRules/createRuleFromPreset/listChatActivity) gate `requireChatHost(chatId)` — a non-member
  //    stranger passing A's chatId collapses to a leak-free AutomationChatNotFoundError → NOT_FOUND. The
  //    rule-scoped verbs (setRuleEnabled/deleteRule/testRule/listFires) load A's REAL ruleId then
  //    gate its chat's host — a stranger (not a present member) collapses to RuleNotFoundError → NOT_FOUND
  //    BEFORE any write, so the seeded rule's name (MARK.automationRule) never leaks and its body is untouched
  //    (the post-sweep integrity re-read proves preset-mint/delete/setRuleEnabled mutated nothing). ──
  { path: "automation.listRules", call: (c, i) => c.automation.listRules({ chatId: i.chatId }) },
  { path: "automation.setRuleEnabled", call: (c, i) => c.automation.setRuleEnabled({ ruleId: i.automationRuleId, enabled: true }) },
  // B4's per-rule F4 opt-out — rule-scoped like `setRuleEnabled`, so it takes the SAME `requireRuleAuthority`
  // chokepoint and a stranger collapses to RuleNotFoundError → NOT_FOUND before the one-column write. Probed
  // with `false` (the OFF arm): if the gate ever dropped, A's rate-capped spend rules would silently stop
  // offering A the run-now invitation — a foreigner muting another tenant's room, with no error to notice.
  {
    path: "automation.setRuleSuggestOnRefusal",
    call: (c, i) => c.automation.setRuleSuggestOnRefusal({ ruleId: i.automationRuleId, suggestOnRefusal: false }),
  },
  { path: "automation.deleteRule", call: (c, i) => c.automation.deleteRule({ ruleId: i.automationRuleId }) },
  { path: "automation.testRule", call: (c, i) => c.automation.testRule({ ruleId: i.automationRuleId }) },
  // R7 + S4 (interaction-direction-spec §6 R7 / §3-S4). `runRuleNow` is rule-scoped — same `requireRuleHost`
  // chokepoint as testRule, so a stranger collapses to RuleNotFoundError → NOT_FOUND BEFORE any dispatch (no
  // fire row, no arm, no spend). The two suggestion verbs take an EPHEMERAL in-RAM id: a fabricated one
  // resolves to no pending ask and collapses on the store lookup, and a real one (unguessable, and never
  // emitted to a non-host) would still collapse on the same host gate — the stranger probe proves the
  // fabricated arm, which is the one a foreigner can actually reach.
  { path: "automation.runRuleNow", call: (c, i) => c.automation.runRuleNow({ ruleId: i.automationRuleId }) },
  { path: "automation.confirmSuggestion", call: (c) => c.automation.confirmSuggestion({ suggestionId: mintTypeId(ID_PREFIX.automationSuggestion) }) },
  { path: "automation.dismissSuggestion", call: (c) => c.automation.dismissSuggestion({ suggestionId: mintTypeId(ID_PREFIX.automationSuggestion) }) },
  // S3 (interaction-direction-spec §3-S3). `createRuleFromPreset` is chat-scoped and id-taking, so it is
  // probed like any other chat-scoped mutation. It mints through the EXISTING host-gated `createRule` per
  // rule, so a stranger collapses on that gate before any row is written — but "it routes through a gated
  // verb" is exactly the claim this sweep exists to stop anyone from making without a probe.
  //
  // THE `knobs` BAG IS LOAD-BEARING, and omitting it made this probe VACUOUS on first write (measured):
  // `autoAddLore.bookId` is an `entityRef` knob, and entityRef is the ONE kind with no default — it refuses
  // `choose a world book` when absent (`substrate/presets.ts:96-97`). That refusal is raised in
  // `createRuleFromPreset` BEFORE it calls `createRule`, so a knob-less probe got BAD_REQUEST from knob
  // resolution and never reached `requireChatHost` at all. It is NOT a leak — the refusal is chat-independent,
  // identical for the owner and for a stranger, so it is no existence oracle — but a probe that dies before
  // the gate it exists to test proves nothing. Passing A's real `bookId` carries it through knob resolution
  // and into the host gate, which is the arm under test.
  {
    path: "automation.createRuleFromPreset",
    call: (c, i) => c.automation.createRuleFromPreset({ chatId: i.chatId, presetId: "autoAddLore", knobs: { bookId: i.bookId } }),
  },
  { path: "automation.listFires", call: (c, i) => c.automation.listFires({ ruleId: i.automationRuleId }) },
  // B11 — the room Activity read is chat-scoped like `listRules`: `requireChatHost(chatId)`
  // gates it, so a non-member stranger passing A's chatId collapses to a leak-free AutomationChatNotFoundError
  // → NOT_FOUND before any fire row is read. A no-id proc is NOT auto-exempt — it is PROBED because it takes
  // A's chatId, the foreign handle a leak would ride.
  { path: "automation.listChatActivity", call: (c, i) => c.automation.listChatActivity({ chatId: i.chatId }) },
  // ── automation C5 — the OWNER-GLOBAL lane (cb8026bfc). These three take NO id, which is exactly why they
  //    are PROBED rather than exempted as "self-scoped": their partition is a WHERE clause, not a parameter,
  //    so the only thing separating two users' private global lanes is `ownerId = principal.userId` inside
  //    the read. A dropped predicate leaks WITHOUT any foreign id being expressible — the failure mode an
  //    id-shaped exemption reason would have declared out of existence. Derived from source, not assumed:
  //      • listOwnerRules → `listRuleRowsForOwnerGlobal` = `isNull(chat_id) AND owner_id = principal.userId`
  //        (persistence/rules.ts). Keep only the `isNull` half and every user's global rules become one
  //        shared list — which is why A's global rule carries MARK.automationOwnerRule: the stranger's list
  //        must come back marker-free (and the post-sweep pin asserts it comes back EMPTY).
  //      • getOwnerBudgets → `selectOwnerBudgetView(db, principal.userId)` on `automation_owner_budgets`,
  //        whose PK IS ownerId (persistence/budgets.ts). Its view is numbers only, so the marker detector is
  //        TOOTHLESS here and this row alone proves little — the teeth are the two-number post-sweep pins.
  //      • setOwnerBudgets → `upsertOwnerBudget(db, principal.userId, …)`. The stranger's call legitimately
  //        BORNS THE STRANGER'S OWN row (it can name no other), so leak-freedom is not the question: the
  //        question is whether A's row moved, and the post-sweep re-read is what answers it.
  { path: "automation.listOwnerRules", call: (c) => c.automation.listOwnerRules() },
  { path: "automation.getOwnerBudgets", call: (c) => c.automation.getOwnerBudgets() },
  { path: "automation.setOwnerBudgets", call: (c) => c.automation.setOwnerBudgets({ maxFiresPerHour: OWNER_BUDGET_STRANGER }) },
  // …and the OTHER half of C5's surface: the rule-lifecycle verbs are SHARED between the two lanes, so A's
  // owner-global ruleId is a foreign id a stranger CAN aim — at `requireRuleAuthority`'s global arm
  // (`rule.ownerId !== principal.userId` → RuleNotFoundError → NOT_FOUND, never the chat arm's FORBIDDEN).
  // The guard runs before validation or writes; the post-sweep re-read proves A's row stays intact.
  { path: "automation.setRuleEnabled", call: (c, i) => c.automation.setRuleEnabled({ ruleId: i.automationOwnerRuleId, enabled: true }) },
  {
    path: "automation.setRuleSuggestOnRefusal",
    call: (c, i) => c.automation.setRuleSuggestOnRefusal({ ruleId: i.automationOwnerRuleId, suggestOnRefusal: false }),
  },
  { path: "automation.deleteRule", call: (c, i) => c.automation.deleteRule({ ruleId: i.automationOwnerRuleId }) },
  { path: "automation.testRule", call: (c, i) => c.automation.testRule({ ruleId: i.automationOwnerRuleId }) },
  { path: "automation.runRuleNow", call: (c, i) => c.automation.runRuleNow({ ruleId: i.automationOwnerRuleId }) },
  { path: "automation.listFires", call: (c, i) => c.automation.listFires({ ruleId: i.automationOwnerRuleId }) },

  // ── plugin (D46/D147) — the FOUR management verbs. They used to sit in EXEMPT with an "admin-gated: the
  //    role gate precedes the pluginId ownership check" reason; that reason DIED when plugins went
  //    user-scoped (anyone installs for themselves, and there is no admin any-row branch), so the ownership
  //    predicate is now the ONLY thing between a stranger and A's row and it belongs under probe. Each takes
  //    A's REAL pluginId. `upgrade` carries a real, valid, hostile bundle so a dropped belt would actually
  //    swap A's code (the post-sweep re-read is its teeth — the verb's own leak would show as MARK.plugin in
  //    the returned view). setGrant asks for the widest reach; setEnabled would BOOT A's guest code under the
  //    stranger's principal, which is the confused-deputy case D147 exists to close. ──
  { path: "plugin.upgrade", call: (c, i) => c.plugin.upgrade({ pluginId: i.pluginId, bundleBase64: hostileBundleBase64("alpha-plugin") }) },
  // ── plugin.upgradeFromStoredUrl (plugin-ui-plane #679 U8 2b) — the one-click-from-remembered-URL twin, owner-
  //    scoped the SAME way and PROBED for the SAME reason: a stranger holding A's REAL pluginId must NOT_FOUND
  //    BEFORE the owner-scoped row load hands the verb A's `source_url` to fetch. A dropped pre-check would make
  //    the server fetch A's remembered URL on a stranger's behalf AND expose A's row to the #615 upgrade path;
  //    the tell would be a distinguishable non-NOT_FOUND (a fetch failure, or worse a mutated view) instead of
  //    the leak-free NOT_FOUND this probe pins. (A's seeded plugin is `upload`-origin, so even past the gate
  //    there is no URL to fetch — the ownership refusal is what this asserts, before origin is ever consulted.) ──
  { path: "plugin.upgradeFromStoredUrl", call: (c, i) => c.plugin.upgradeFromStoredUrl({ pluginId: i.pluginId }) },
  // ── plugin.upgradeFromShowcase (#1740) — the SEEDED-EXAMPLE twin, owner-scoped the SAME way and PROBED for the
  //    SAME reason: a stranger holding A's REAL pluginId must NOT_FOUND BEFORE the verb reads A's row at all. It
  //    triggers no egress (the bytes are the bundle this build ships), so what a dropped pre-check would leak is
  //    the #615 upgrade path onto A's row plus the fact of whether A's plugin is one of the examples. The tell is
  //    DISTINGUISHABLE and that is the probe's teeth: A's seeded row is `alpha-plugin`, which this build ships no
  //    bundle for, so past the ownership gate the verb answers BAD_REQUEST (`plugin_not_showcase`) instead of the
  //    leak-free NOT_FOUND pinned here. ──
  { path: "plugin.upgradeFromShowcase", call: (c, i) => c.plugin.upgradeFromShowcase({ pluginId: i.pluginId }) },
  {
    path: "plugin.setGrant",
    call: (c, i) => c.plugin.setGrant({ pluginId: i.pluginId, grant: ["chat.read", "net.fetch"], acknowledgedNetHosts: ["api.vendor.example"] }),
  },
  { path: "plugin.setEnabled", call: (c, i) => c.plugin.setEnabled({ pluginId: i.pluginId, enabled: true }) },
  { path: "plugin.uninstall", call: (c, i) => c.plugin.uninstall({ pluginId: i.pluginId }) },
  // getLog is owner-scoped the same way (getById filters ownerId=caller), so a stranger
  //    passing any pluginId reads absent → leak-free NOT_FOUND (the log ring lives on the caller's OWN resident
  //    instance). It gets A's REAL id like its four siblings above — the old fabricated-id shape predated the
  //    seeded plugin row and could not tell a working belt from a missing row. ──
  { path: "plugin.getLog", call: (c, i) => c.plugin.getLog({ pluginId: i.pluginId }) },
  // ── plugin.getSurfaceState / plugin.invokeUiAction (plugin-ui-plane #679 U1) — owner-scoped the SAME way as
  //    getLog: `getById(db, caller.userId, pluginId)` reads absent for a stranger holding A's REAL id →
  //    leak-free NOT_FOUND, BEFORE the surface/state is ever resolved. `invokeUiAction` is the guest-action
  //    round-trip, so a dropped gate would re-enter A's guest `onAction` under the STRANGER's principal — the
  //    confused-deputy case D147 exists to close. The surfaceId/actionId are inert (the owner gate refuses
  //    first, so they never reach surface resolution). ──
  { path: "plugin.getSurfaceState", call: (c, i) => c.plugin.getSurfaceState({ pluginId: i.pluginId, surfaceId: "probe_surface" }) },
  {
    path: "plugin.invokeUiAction",
    call: (c, i) => c.plugin.invokeUiAction({ pluginId: i.pluginId, surfaceId: "probe_surface", actionId: "probe_action", values: {} }),
  },
  // ── plugin.listBundleAssets (#820 seam 11) — owner-scoped on the SAME `getById(db, caller.userId, pluginId)`
  //    load, and probed with A's REAL pluginId because what it returns is a MAP OF A's CAS IDS. A dropped gate
  //    would hand a stranger the asset ids of somebody else's installed plugin. Those ids buy nothing on their
  //    own (the blob route is hash-keyed and the id→hash resolve puts the SESSION owner in its WHERE), which is
  //    exactly why the refusal has to be the owner load and not the id's inertness — "harmless to leak" is a
  //    property of today's blob route, not an authority decision this proc gets to inherit. ──
  { path: "plugin.listBundleAssets", call: (c, i) => c.plugin.listBundleAssets({ pluginId: i.pluginId }) },
  // ── plugin.uiHostCall / plugin.reportUiCrash (plugin-ui-plane #679 U4) — the Tier-C pair, owner-scoped on the
  //    SAME `getById(db, caller.userId, pluginId)` load as their four siblings above, and each is the worse
  //    half of a different failure. `uiHostCall` would RUN a membrane op through A's bridge — the bridge closes
  //    over the INSTALLER, so a dropped gate is not "read the wrong row", it is "execute a granted capability
  //    with A's storage, A's global vars and A's canon reach, at a stranger's request". `reportUiCrash` writes
  //    A's `consecutive_crashes`, so a dropped gate is a remote three-strike: three calls and a stranger has
  //    disabled somebody else's plugin. Both probes carry A's REAL pluginId, and the arguments are inert (the
  //    owner gate refuses before the fn tuple, the grant, the room, or the counter is ever consulted). ──
  { path: "plugin.uiHostCall", call: (c, i) => c.plugin.uiHostCall({ pluginId: i.pluginId, fn: "storage.list", argsJson: "[]" }) },
  { path: "plugin.reportUiCrash", call: (c, i) => c.plugin.reportUiCrash({ pluginId: i.pluginId, surfaceId: "probe_surface", reason: "probe" }) },
  // ── plugin Tier-C SECOND SCOPE (the room, plugin-ui-plane #679 U4 row 777) — getSurfaceState / invokeUiAction /
  //    uiHostCall each grew an OPTIONAL `chatId`, so by the cross-tenant-sweep-no-id-is-not-exempt SECOND-SCOPE
  //    rule they are PROBED AGAIN carrying owner A's REAL chatId: the no-chatId arms above exercise only the shape
  //    that names no room. The owner gate (`getById(db, caller.userId, pluginId)`) still refuses FIRST — a
  //    stranger holding A's plugin never reaches the room gate — so the tell is that supplying a valid-looking
  //    foreign room opens no NEW oracle: the outcome is the SAME leak-free NOT_FOUND, neither the plugin's
  //    existence nor A's chat membership readable through the added parameter. (Same duplicate-path shape as the
  //    C5 automation second-scope arms above.) ──
  { path: "plugin.getSurfaceState", call: (c, i) => c.plugin.getSurfaceState({ pluginId: i.pluginId, surfaceId: "probe_surface", chatId: i.chatId }) },
  {
    path: "plugin.invokeUiAction",
    call: (c, i) => c.plugin.invokeUiAction({ pluginId: i.pluginId, surfaceId: "probe_surface", actionId: "probe_action", values: {}, chatId: i.chatId }),
  },
  { path: "plugin.uiHostCall", call: (c, i) => c.plugin.uiHostCall({ pluginId: i.pluginId, fn: "storage.list", argsJson: "[]", chatId: i.chatId }) },
  // ── plugin.invokeUiCommand (plugin-ui-plane #679 U5) — the widest surface of the U5 set and the reason it is
  //    probed with BOTH of A's real ids at once: it takes a foreign pluginId (gated by the owner-scoped
  //    `getById`) AND a foreign chatId (gated by the same leak-free `resolveChatAuthority` the snippet uses).
  //    A command is a NEW way to reach a guest with a room attached, so a dropped belt on either half would run
  //    A's untrusted code under B, or admit B into A's room — the probe aims at both simultaneously.
  {
    path: "plugin.invokeUiCommand",
    call: (c, i) => c.plugin.invokeUiCommand({ pluginId: i.pluginId, name: "probe_command", args: "", chatId: i.chatId }),
  },
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

  // ── notifications.presence (#1039) — the presence DISCLOSURE read, PROBED with owner A's OWN userId as the
  //    stranger. IT IS THE ONE PROC ON THIS LIST WHOSE WIDE ANSWER IS THE RULING, NOT A DEFECT: the owner
  //    ruled 2026-09-01 that any AUTHENTICATED caller may read online state ("everyone can see who is online
  //    — for now at least"), so a stranger resolving here is CORRECT and must not be "fixed" by a reader who
  //    finds this row. What the probe still buys, stated so nobody over-reads it: the answer is the ONLINE
  //    SUBSET OF THE ASKED IDS — echoed ids only — so a marker NAME appearing in it could only come from a
  //    future widening of the response shape, which is exactly what this row would then catch. The
  //    disclosure's real teeth are elsewhere and are named here so they are not re-derived: the wire boundary
  //    (anonymous refusal, the ask cap, the one-key body) is
  //    tests/server/transport/trpc/routers/notifications.test.ts, the projection (no `lastSeenAt`, absent ==
  //    offline-or-withheld) is tests/server/transport/trpc/presence-disclosure.test.ts, and the PD-106 belt is
  //    trpc.test.ts's `beltSurfaces` table. If the audience ever narrows to room membership, THIS probe flips
  //    to a leak-free NOT_FOUND/empty expectation. ──
  { path: "notifications.presence", call: (c) => c.notifications.presence({ userIds: [OWNER_USER_ID] }) },

  // ── notifications — THE INBOX TRIO (#1627). These were EXEMPT("self-scoped … multi-human belt") while the
  //    PD-106 belt refused the whole router on any deployment that could not seat a second human. The belt is
  //    gone (single-human sources exist: a crash-disabled plugin, an auto-disabled automation rule), so the
  //    `recipient_user_id` WHERE-clause partition is the ONLY belt left — and that is precisely the shape
  //    EXEMPT cannot express: no parameter carries a foreign id for `list`/`markAllRead`, yet dropping the
  //    predicate makes every user read ONE shared inbox. So all three are PROBED:
  //      • `list` — the READ partition, witnessed by A's marker (and, from B's side, by the post-sweep
  //        empty-inbox pin: "the stranger sees nothing" and "A still sees its own" are two different failures).
  //      • `markAllRead` — no id at all and it returns a COUNT, so the forward detector is blind to it; its
  //        witness is A's `readAt` still null after the sweep.
  //      • `dismiss` — the one id-taking verb, `requireNotFound`: a stranger holding A's notificationId must
  //        get the same leak-free NOT_FOUND collapse the verb gives a nonexistent row, and A's row must
  //        still be in A's inbox afterwards (a landed dismiss REMOVES it from `list`). ──
  { path: "notifications.list", call: (c) => c.notifications.list() },
  { path: "notifications.markAllRead", call: (c) => c.notifications.markAllRead() },
  { path: "notifications.dismiss", call: (c, i) => c.notifications.dismiss({ notificationId: i.notificationId }), requireNotFound: true },

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
    call: (c, i) => c.rpg.patchActor({ chatId: i.chatId, targetRef: { kind: "npc", npcKey: "mira" }, ops: [{ op: "setStatus", status: "hacked" }] }),
  },
  { path: "rpg.dismissActor", call: (c, i) => c.rpg.dismissActor({ chatId: i.chatId, targetRef: { kind: "npc", npcKey: "mira" } }) },
  // R4 — the promotion doorway is the ONE rpg proc whose write reaches outside the game (a character card into
  // the ROOM HOST's library + a seat on their roster), which makes a cross-tenant leak here worse than a state
  // write: a stranger passing a foreign chatId must never get as far as the mint.
  { path: "rpg.promoteActor", call: (c, i) => c.rpg.promoteActor({ chatId: i.chatId, targetRef: { kind: "npc", npcKey: "mira" } }) },
  { path: "rpg.upsertQuest", call: (c, i) => c.rpg.upsertQuest({ chatId: i.chatId, questId: i.rpgQuestId, name: "hacked" }) },
  {
    path: "rpg.editQuestObjective",
    call: (c, i) => c.rpg.editQuestObjective({ chatId: i.chatId, questId: i.rpgQuestId, op: { kind: "add", text: "hacked" } }),
    requireNotFound: true,
  },
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
  // TOOLCALLS-INVISIBLE arm A — the recorded-turn window. MEMBER-gated (a tool call is not a GM secret), which
  // makes the cross-tenant belt the ONLY thing between a stranger and A's game: `resolveMember` collapses a
  // foreign chatId to leak-free NOT_FOUND exactly as its sibling reads do. PROBED, never EXEMPT.
  { path: "rpg.listTurnToolCalls", call: (c, i) => c.rpg.listTurnToolCalls({ chatId: i.chatId }) },
  { path: "rpg.getConfigView", call: (c, i) => c.rpg.getConfigView({ chatId: i.chatId }) },
  // §3.6 host-reveal read — a foreign chatId must collapse to leak-free NOT_FOUND (host gate inside the verb).
  { path: "rpg.revealHidden", call: (c, i) => c.rpg.revealHidden({ chatId: i.chatId }) },
  { path: "rpg.listCheckpoints", call: (c, i) => c.rpg.listCheckpoints({ chatId: i.chatId }) },
  // ── regex (owner-scoped script library, D121-E) — id-taking verbs owner-belted via `RegexNotFoundError`
  //    → NOT_FOUND (see the router's own classification header). The chat scope has no ownerId (D18) so
  //    attach/detach/listForChat/listRoomDisplayScripts are gated via chat's own host/member guards instead. ──
  // listScriptUsage takes a SCRIPT id and answers with the carriers attaching it — a stranger naming
  // A's script must learn nothing (the verb loads the owned script first; rooms ride the injected
  // present-membership op, so a foreign room never appears either).
  { path: "regex.listScriptUsage", call: (c, i) => c.regex.listScriptUsage({ scriptId: i.regexScriptId }) },
  {
    path: "regex.updateScript",
    call: (c, i) => c.regex.updateScript({ scriptId: i.regexScriptId, input: { name: "hacked" } }),
  },
  { path: "regex.removeScript", call: (c, i) => c.regex.removeScript({ scriptId: i.regexScriptId }) },
  { path: "regex.duplicateScript", call: (c, i) => c.regex.duplicateScript({ scriptId: i.regexScriptId }) },
  // The REGX2 BULK arm — PROBED SILENTLY (the router's own classification): the owner id is in the WHERE
  // (`setScriptsEnabledBulk`/`removeScriptsBulk`) or every id is gated through `loadOwnedScriptsByIds`
  // (`bulkSetScriptsGlobal`), so a foreign id is DROPPED rather than thrown on. The leak-free verdict here is
  // therefore a marker-free `{affected}` resolve — the count is identical for "you don't own it" and "it's
  // already gone", so the list can never be probed for membership. The TEETH are the post-sweep integrity
  // re-read: a dropped owner belt writes A's row and returns the same benign count, so the re-read asserts
  // A's `enabled` flag, A's row's survival, and A's (empty) global tier below.
  {
    path: "regex.bulkSetEnabled",
    call: (c, i) => c.regex.bulkSetEnabled({ scriptIds: [i.regexScriptId], enabled: false }),
  },
  {
    path: "regex.bulkSetGlobal",
    call: (c, i) => c.regex.bulkSetGlobal({ scriptIds: [i.regexScriptId], global: true }),
  },
  // The #57 bulk-placement arm — same silent owner-belt shape as bulkSetEnabled/bulkSetGlobal: every id is
  // gated through `loadOwnedScriptsByIds` (WHERE owner_id = principal), so a foreign id is DROPPED and the
  // verb answers a marker-free `{affected}` count (identical for "not yours" and "already gone" — never an
  // ownership oracle). The `placement` differs from A's seeded `["AI_OUTPUT"]` so the post-sweep integrity
  // re-read has teeth: a dropped belt would REPLACE A's placement set (and re-derive A's tier flags) and
  // return the same benign count, so A's `placement` is the only evidence a silent write-IDOR would leave.
  {
    path: "regex.bulkSetPlacement",
    call: (c, i) => c.regex.bulkSetPlacement({ scriptIds: [i.regexScriptId], placement: ["USER_INPUT"] }),
  },
  { path: "regex.bulkRemove", call: (c, i) => c.regex.bulkRemove({ scriptIds: [i.regexScriptId] }) },
  // The single-entity EXPORT door — owner-gated by `loadOwnedScript`; a foreign/absent id collapses to `null`
  // inside the verb and the router turns that into NOT_FOUND (the `worldInfo.exportBook` posture). A resolved
  // file would carry A's script NAME verbatim, so a dropped belt leaks here loudly.
  { path: "regex.exportScript", call: (c, i) => c.regex.exportScript({ scriptId: i.regexScriptId }) },
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
  // #708 — the GLOBAL-scope arm of the SAME verb (a second row for the same path, both run). The character arm
  // above is belted by the owned scope row; the global tier has NO owner column, so the verb's OWN ownership
  // pre-gate (`loadOwnedScriptsByIds`) is the only belt. A stranger naming A's globally-attached ids must
  // collapse to leak-free NOT_FOUND BEFORE any position write. The [B, A] reversal is what a dropped belt
  // would apply to A's tier; the leak check is marker-blind to a `{reordered}` count, so the post-sweep ORDER
  // re-read carries the teeth.
  {
    path: "regex.applyScopeOrder",
    call: (c, i) => c.regex.applyScopeOrder({ scope: { kind: "global" }, orderedScriptIds: [i.regexGlobalOrderBId, i.regexGlobalOrderAId] }),
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
  "automation.listRulePresets":
    "static catalogue: takes NO input and reads no db and no Principal — it projects the compile-time RulePresetDef table (contracts/automation/presets.ts), which is identical for every caller. Nothing owned is reachable through it. (Its id-taking sibling `createRuleFromPreset` IS probed above.)",
  "character.create": "self-scoped: creates the caller's own row",
  "character.list": "self-scoped: lists the caller's own rows",
  "refinery.listSessions":
    "self-scoped: the roster reads through the caller's OWN character join (no id input); a stranger's roster is [] — proven in list-sessions.int.test.ts",
  // ── refinery R3 schema library — the four verbs with NO cross-tenant-reachable id. Every id-taking one
  //    (update/delete/testSchema) is PROBED above; these take only VALUES. ──
  "refinery.listSchemas": "self-scoped: listOwnedSchemaRows filters WHERE refinery_schemas.owner_id = principal.userId; takes NO input at all",
  "refinery.createSchema":
    "self-scoped: mints a row stamping ownerId = principal.userId from VALUES only (name + description + stage + the schema blob) — no foreign id to reach through; the per-owner name-uniqueness check is itself owner-scoped",
  "refinery.generateSchema":
    "self-scoped model call: input is an NL description + a stage, no owned/foreign id. The forge resolves the CALLER's own prose overrides + preset params (resolveForgeCall(principal.userId)) and the draft is returned, never persisted — there is no tenant axis for a stranger to cross",
  "refinery.refineSchema":
    "self-scoped model call: input is a caller-supplied draft schema VALUE + an instruction + a stage — the draft is client-held, never a reference to a stored row, so a stranger can only ever iterate on bytes it already sent itself; same caller-scoped forge resolution as generateSchema, still never persisted",
  "persona.create": "self-scoped",
  "persona.list": "self-scoped",
  "persona.import": "self-scoped: imports into the caller's own namespace",
  "preset.create": "self-scoped",
  "preset.list": "self-scoped",
  "preset.importFile": "self-scoped: takes file TEXT and no id — it writes only the caller's own library",
  "worldInfo.createBook": "self-scoped",
  "worldInfo.importFile": "self-scoped: takes file TEXT and no id — it writes only the caller's own library",
  "worldInfo.listBooks": "self-scoped",
  "worldInfo.listBooksWithUsage": "self-scoped: the caller's own books; the junction counts are keyed to those ids, so a foreign book contributes nothing",
  "worldInfo.listGlobal": "self-scoped: the caller's globally-attached books",
  "regex.createScript": "self-scoped: mints the caller's own row, no foreign id",
  "regex.importScriptFile":
    "self-scoped: takes file TEXT and no id — the portable file carries no owner and no id, so the minted row (and its optional global attachment) can only ever land under the caller's own userId",
  "regex.listScripts": "self-scoped",
  "regex.listGlobal": "self-scoped: the caller's globally-attached scripts",
  "tag.createTag": "self-scoped",
  "tag.listTags": "self-scoped",
  "tag.listTagsWithUsage": "self-scoped",
  "tag.listTagFilterVocabulary": "self-scoped: the same owned rows as listTagsWithUsage, projected — no foreign id on the input",
  "tag.pruneUnusedTags": "self-scoped: prunes the caller's own unused tags",
  "credentials.add": "self-scoped",
  "credentials.list": "self-scoped",
  // Param-free and ROW-free: one boolean about the DEPLOYMENT's SecretBox (is a CREDENTIALS_KEY configured),
  // identical for every authenticated caller. There is no tenant axis for a cross-tenant probe to cross.
  "credentials.storageStatus": "no-tenant-axis: a deployment capability boolean, names no row and no owner",
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
  // The two build-identity reads (owner ask 2026-09-18). NOT exempted as "no input" — a no-id verb is not
  // automatically exempt (#1627). Exempt because there is no TENANT-PARTITIONED read to get wrong: neither
  // verb touches the db at all. `getVersion` returns a process constant frozen at boot; `checkForUpdate`
  // compares that constant to one unauthenticated GET of a PUBLIC upstream branch head. Every authed caller
  // is answered identically by construction, so there is no WHERE clause whose loss this sweep could detect.
  "settings.getVersion": "deployment-global: a frozen process fact (foundation/version); no db read, no parameter, identical for every principal",
  "settings.checkForUpdate": "deployment-global: the same frozen process fact compared to a PUBLIC upstream head; no db read, no parameter",
  "settings.getUserSettings": "self-scoped by principal.userId",
  "settings.updateUserSettingsSection": "self-scoped by principal.userId",
  // The whole-blob repair door (#1771). Self-scoped like its sibling AND unable to express a foreign
  // target: the procedure takes NO input at all, so there is no id to hijack — the classification rests on
  // the router shape, not only on the verb's internal scoping (a no-id verb is not automatically exempt).
  "settings.resetUserConfig": "self-scoped by principal.userId; the procedure accepts no input, so no foreign id can reach the write",
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
    "self-scoped: resolves the caller's OWN chat-role GenerationCapability from principal.userId's settings — " +
    "NO input at all (no caller-supplied user id/role), so there is no foreign id to probe",
  "connection.getModelsForSource":
    "self-scoped: the read-only picker facade over (source, role) — reads the caller's OWN credential " +
    "availability + the deployment catalog; no owned/foreign id in the input",
  "connection.orCredits": "self-scoped: reads the caller's OWN provider key",
  "connection.orGenerationCost": "not-owned: an upstream OpenRouter generation handle",
  "connection.testClaudeAuth": "self-scoped: the caller's own max-pro-sub health check",
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
  // Takes an OPTIONAL `characterId` (the analytics CONTEXT drill, 2026-08-19) — but it is a PROJECTION
  // filter inside an already self-scoped read, not a lookup key: the rows come from `personas.owner_id =
  // principal.userId` and the id only narrows WHICH of the caller's own chats are counted. A foreign id
  // can therefore only ever SHRINK the caller's own answer to zero, never widen it to a stranger's — so
  // there is no leak-free-NOT_FOUND behaviour to probe. Proven directly in
  // tests/server/domain/stats/persistence/rollups.int.test.ts ("another owner's characterId returns the
  // caller's roster at zero, never their data").
  "stats.personaUsage": "self-scoped by principal.userId; the optional characterId narrows the caller's OWN chats and cannot widen the read",
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
  // B5 SSO-identity link. Takes a `userId` + `externalId`, but it is `adminProcedure` (LAYER-1 owner∪admin)
  // AND re-checks `requireAdmin` (LAYER-2): the sweep's stranger is a plain `user`, refused FORBIDDEN at the
  // ladder BEFORE any user lookup — the admin.* role-gate pattern, tested by the admin-gate matrix, not IDOR.
  // The cross-USER binding is admin-plane authority by design (an admin already acts on every user's row —
  // there is no tenant boundary for a peer to cross), and the verb's own belts (owner-target immutable +
  // bind-once/subject-taken, spine U1) are the binding-safety surface, exercised in the admin domain tests.
  "admin.linkSsoIdentity": "admin-gated: role gate (identity-binding authority is admin-plane, not cross-tenant IDOR)",
  "admin.createUser": "admin-gated: role gate",
  "admin.resetPassword": "admin-gated: role gate",
  "admin.listSessions": "admin-gated: role gate",
  "admin.revokeSession": "admin-gated: role gate",
  "admin.revokeUserSessions": "admin-gated: role gate",
  "admin.vllmEngines": "admin-gated: role gate",
  "admin.restartVllmEngine": "admin-gated: role gate",
  // plugin (D46/D147) — RECLASSIFIED 2026-08-24. The five management verbs used to be exempt as "admin-gated:
  // the install-authority role gate precedes the pluginId ownership check". That classification is DEAD:
  // plugins are user-scoped, the `can(caller,"admin",{kind:"global"})` gate is gone from every verb, and the
  // owner-scoped `getById(db, caller.userId, pluginId)` load is now the ONLY thing standing between a
  // stranger and A's row. Four of the five are therefore PROBED above with A's real pluginId. Only the two
  // that take no foreign id remain exempt:
  "plugin.install": "self-scoped: install mints the CALLER's own row (ownerId = caller.userId) from bytes it was handed — there is no foreign id to probe",
  "plugin.previewFromUrl":
    "self-scoped (U8 seam 15): fetches a CALLER-named URL through the egress guard and returns its manifest — READ-ONLY, no owned id, touches no row; the wall is safeFetch's SSRF/private-range denial, not a tenant axis (a stranger can only ever preview a URL they themselves named)",
  "plugin.installFromUrl":
    "self-scoped (U8 seam 15): fetches a CALLER-named URL through the egress guard then DELEGATES to install, which mints the CALLER's own row (ownerId = caller.userId) — no foreign id, exactly the self-authority of plugin.install one byte-source over",
  "plugin.checkForUpdates":
    "self-scoped (U8 2b, #1740): takes NO input; the auto update-check walks listOwned WHERE owner_id = caller.userId and reads a version for only the CALLER's OWN rows — a re-fetch of their remembered source URL, or the shipped showcase manifest for a seeded row (no egress at all on that arm) — so there is no foreign id a stranger could aim and the egress it triggers only ever hits the caller's own rows' URLs (the plugin.list posture, one egress step over)",
  "plugin.list": "self-scoped: takes NO input at all; listOwned filters WHERE owner_id = caller.userId, so there is no id a stranger could aim",
  "plugin.listSurfaces":
    "self-scoped: takes NO input; listOwned filters WHERE owner_id = caller.userId and only the caller's OWN resident instances are consulted, so a stranger's surfaces are never in the result (plugin-ui-plane #679 U1)",
  "plugin.listCommands":
    "self-scoped: the listSurfaces twin — takes NO input; listOwned filters WHERE owner_id = caller.userId and only the caller's OWN resident instances are consulted, so a stranger's commands are never in the result (plugin-ui-plane #679 U5)",
  "plugin.listDisplayTransforms":
    "self-scoped: takes NO input; the exact listSurfaces shape (listOwned filters WHERE owner_id = caller.userId; only the caller's OWN resident instances are consulted) (plugin-ui-plane seam 14, U6)",
  "plugin.transformForDisplay":
    "self-scoped: takes a chatId + messageId but READS NOTHING with them — they are handed to the caller's own guest as its `env`. The only text in play is text the CALLER's client supplied, returned only to that caller; nothing is persisted and no authority derives from any input. The transforms run are exactly the caller's own (listOwned + the caller's own resident instances), so there is no foreign row a stranger could reach (plugin-ui-plane seam 14, U6)",
  // ── SERVER-WIDE DISTRIBUTION (D147 clause (d), added 2026-08-24). All three are `adminProcedure` + a domain
  //    `requireAdmin` re-check, so the sweep's plain-user stranger is refused FORBIDDEN at LAYER 1 before any
  //    lookup — the `admin.*` role-gate pattern, tested by the admin-gate matrix, not IDOR. None takes a
  //    foreign id: `installForAllUsers` takes BYTES, `uninstallForAllUsers` takes a SLUG (deployment policy,
  //    not an owned entity — it names a published bundle, and the withdrawal it drives runs per-recipient
  //    under EACH RECIPIENT's own Principal through the owner-scoped uninstall), and `listDistributed` takes
  //    no input. The cross-tenant property they DO have — a fan-out never touches a row a user already holds,
  //    and skips a diverged one — is pinned in tests/server/domain/plugin/verbs/{install,uninstall}-for-all-
  //    users.int.test.ts, where a stranger's row surviving is the assertion.
  "plugin.installForAllUsers": "admin-gated: role gate (publishes deployment policy; takes bundle bytes, no foreign id)",
  "plugin.uninstallForAllUsers": "admin-gated: role gate (withdraws deployment policy by SLUG; per-recipient uninstall runs as the recipient)",
  "plugin.listDistributed": "admin-gated: role gate (reads deployment policy; no input at all)",
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
  "databank.list":
    "self-scoped: listOwnedMeta filters WHERE owner_id = principal.userId; origin/limit/cursor only. The keyset `cursor` DOES carry a documentId, but it is never LOOKED UP — it is a `(updatedAt, id)` comparison ANDed with the owner predicate, so a foreign (or invented) id can only move the window inside the caller's own rows, never widen it. Nothing about the named document is returned or revealed",
  "databank.listGlobal":
    "self-scoped: listGlobalDocumentIds filters WHERE global_documents.owner_id = principal.userId (the junction's own scope column, D23); takes NO input at all, so there is no foreign id to probe",
  "databank.bankHealth":
    "self-scoped: takes NO input at all, so there is no foreign id to probe. Every number it returns is a COUNT over the same `owner_id = principal.userId` predicate `databank.list` pages (countOwnedDocuments), and its one cross-domain read — the injected chunk-count op — derives its scope through the FK join `document_chunks → documents.owner_id` (D20), proven in tests/server/domain/embeddings/verbs/count-document-chunks-by-owner.int.test.ts (another owner's chunked documents are absent from the map)",
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
      // @orb-waive no-test-fabrication(unknown): the tRPC `_def.procedures` introspection seam (no public enumeration API in v11). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
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
  async function seedOwnerWorld(owner: AppCaller, db: Parameters<typeof seedChat>[0], automation: AutomationService): Promise<OwnerIds> {
    const character = await owner.character.create({
      input: { handle: "alpha-hero", name: MARK.character, description: "owned by A" },
    });
    const persona = await owner.persona.create({
      input: { name: MARK.persona, description: "owned by A" },
    });
    // #795 — the preset is born with a DISTINCTIVE generation knob, not the default config. `resetToDefault`
    // replaces the config and KEEPS the name, so the `presetStill.name` pin below is structurally blind to it:
    // a default-configured preset reads byte-identical whether the stranger's reset landed or was refused.
    // `temperature` is the witness, and it rides the SAME `updatePresetRow` owner predicate #755 proved
    // droppable (dropping it left the whole sweep green on a hijacked preset).
    const preset = await owner.preset.create({
      name: MARK.preset,
      kind: "chat",
      config: { sections: [], params: { temperature: PRESET_TEMPERATURE_A } },
    });
    // #26 — A's saved party (front door): the NAME carries A's marker; its one member is A's marker
    // character, so a leaked view/summary betrays itself twice (name + member preview).
    const rosterPreset = await owner.rosterPreset.create({
      input: { name: MARK.rosterPreset, description: "owned by A", members: [{ kind: "character", characterId: character.id, position: 0 }] },
    });
    const book = await owner.worldInfo.createBook({ input: { name: MARK.book } });
    const entry = await owner.worldInfo.createEntry({
      bookId: book.id,
      input: { title: MARK.entry, content: "lore owned by A" },
    });
    const tag = await owner.tag.createTag({ input: { name: MARK.tag } });
    // #795 — A's SECOND tag, so A's tag ORDER is [tag, tagOrderB] and the stranger's `setTagOrder` reversal has
    // something to move. Deliberately marker-FREE: its job is positional, and a second marker name would only
    // add noise to the leak detector.
    const tagOrderB = await owner.tag.createTag({ input: { name: "alphaordertag" } });
    // …and A commits a MANUAL order over them. This is load-bearing, not tidiness: `listOwnedTags` orders
    // `sort_order IS NULL, sort_order, name`, so two never-ordered tags come back in NAME order — and A's
    // manual order below is deliberately the ANTI-ALPHABETICAL one ([alphasecrettag, alphaordertag]). That
    // separates three outcomes a name-ordered pair cannot: A's order intact, A's order REVERSED by the
    // stranger's `setTagOrder` probe, and A's `sort_order` WIPED (both failures collapse to name order, which
    // is the reversal here). Measured: without this call the pin reads name order and passes no matter what.
    await owner.tag.setTagOrder({ orderedIds: [tag.id, tagOrderB.id] });
    const snapshot = await owner.character.snapshot({ characterId: character.id });
    // A refinery session on A's character (front door) — its NAME is A's marker; the anchor card inside
    // carries A's character marker too, so a leaked SessionView betrays itself twice.
    const refinerySession = await owner.refinery.startSession({ characterId: character.id, name: MARK.refinerySession });
    // A custom payload-schema row owned by A (front door). Unlike the session, this table has its OWN
    // ownerId — the marker rides BOTH the name and the description because a leaked `updateSchema` returns
    // the summary AFTER the stranger's patch overwrote the name, leaving the description as the tell.
    const refinerySchema = await owner.refinery.createSchema({
      name: MARK.refinerySchema,
      description: `${MARK.refinerySchema} — owned by A`,
      stage: "score",
      schema: VALID_SCORE_SCHEMA,
    });

    // The credential is seeded DIRECTLY — the `app` fixture's SecretBox is keyless (CREDENTIALS_KEY unset),
    // so the front-door `credentials.add` is disabled. The ownership probes never decrypt; they gate on the
    // owner. The `label` is the leak marker (a returned CredentialView would carry it).
    const credentialId = castId<UserCredentialId>("user_credential_alpha");
    await db.insert(userCredentials).values({
      id: credentialId,
      ownerId: OWNER_USER_ID,
      provider: castId<ProviderId>("openrouter"),
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

    // A host-authored automation rule on A's chat. The tRPC hand-authoring wrapper is gone, so fixture setup
    // uses the composed domain front door directly; this preserves the unique marker without reintroducing a
    // privileged transport bypass. The rule is born DISABLED, and its id feeds every surviving wire probe.
    const automationRule = await automation.createRule({
      principal: automationPrincipal(OWNER_USER_ID),
      chatId,
      name: MARK.automationRule,
      trigger: { bus: "chat", type: "messageCommitted" },
      actions: [{ type: "set_variable", scope: "chat", key: "probe", op: "set", value: "1" }],
    });

    // ── C5: A's OWNER-GLOBAL lane — a rule with NO chat, plus A's owner-global rate ceiling. Both are the
    //    front door (the lane's whole authority is "the author is the scope", so A can seed its own). The
    //    rule's shape is what the owner-global ADMISSION MATRIX admits (substrate/validate.ts): the domain
    //    bus only (a chat-bus global rule has no room whose events it could hear) and a `global`-scope
    //    variable arm (a `chat`-scope one is refused) — a payload the matrix rejects would throw HERE, at the
    //    seed, rather than quietly leaving the probes below with no row to aim at. Born disabled like every
    //    rule, which is the baseline the stranger's setRuleEnabled probe must not move.
    const automationOwnerRule = await automation.createRule({
      principal: automationPrincipal(OWNER_USER_ID),
      chatId: null,
      name: MARK.automationOwnerRule,
      trigger: { bus: "domain", type: "character.updated" },
      actions: [{ type: "set_variable", scope: "global", key: "probe", op: "set", value: "1" }],
    });
    await owner.automation.setOwnerBudgets({ maxFiresPerHour: OWNER_BUDGET_A });

    // A workload owned by A — a USER-scope kind, `failed` so `retry` is meaningful. Its `error` carries A's
    // marker (a leaked `get`/`retry` result would surface it), so the probe has teeth (F3 owner-scoping).
    const workloadId = castId<WorkloadId>("workload_alpha");
    await db.insert(workloads).values({
      id: workloadId,
      kind: "reconcile-stats",
      status: "failed",
      mode: "singular",
      ownerId: OWNER_USER_ID,
      admissionSystem: false,
      error: MARK.workload,
      scheduledAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });

    // #795 — A's CANCELLABLE workload. `cancel` routes through `markCancelling`, which no-ops on a terminal
    // row, so the probe above (aimed at the `failed` row) exercises only the READ collapse; this `queued` row
    // is what makes its WRITE arm reachable. Proven necessary by a planted omission: with the owner belt
    // deleted from cancel.ts the suite stayed GREEN against the failed row.
    // Its KIND is deliberately NOT `reconcile-stats` (the failed row's kind): `insertWorkload` carries a
    // single-ACTIVE partial unique index per kind, so a queued `reconcile-stats` here would make the
    // `workloads.retry` clone collide and refuse — silently disarming the retry pin below. Measured: with
    // both rows the same kind, retry's belt could be deleted and the clone-count pin still passed.
    const queuedWorkloadId = castId<WorkloadId>("workload_alpha_queued");
    await db.insert(workloads).values({
      id: queuedWorkloadId,
      kind: "compute-themes",
      status: "queued",
      mode: "singular",
      ownerId: OWNER_USER_ID,
      admissionSystem: false,
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
    // scriptId-taking verb (get/update/remove/duplicate/attach-global/export) leaks it back to the stranger.
    // `enabled` is stated rather than defaulted, and the script is deliberately NOT globally attached: both are
    // the post-sweep integrity baseline for the REGX2 bulk arm (the flags a silent write-IDOR would move).
    const regexScript = await owner.regex.createScript({
      input: { name: MARK.regexScript, enabled: true, findRegex: "a", replaceString: "b", placement: ["AI_OUTPUT"] },
    });
    const regexScriptId = regexScript.id;

    // #708 — two MORE A-owned scripts, this time ATTACHED to A's global tier in a known order [A, B]. Unlike
    // `regexScriptId` above (deliberately un-attached — the attachGlobal/bulkSetGlobal teeth need A's tier to
    // start empty of it), these exist so the `applyScopeOrder` GLOBAL-scope probe has an ORDER to try to
    // reverse. The tier has no owner column, so only the verb's ownership pre-gate stands between a stranger
    // and A's execution order; a dropped gate leaves the marker-blind leak check green, so the ORDER re-read
    // in the post-sweep integrity block is the only teeth.
    const regexGlobalOrderA = await owner.regex.createScript({
      input: { name: "GlobalOrderOne", enabled: true, findRegex: "a", replaceString: "b", placement: ["AI_OUTPUT"] },
    });
    const regexGlobalOrderB = await owner.regex.createScript({
      input: { name: "GlobalOrderTwo", enabled: true, findRegex: "a", replaceString: "b", placement: ["AI_OUTPUT"] },
    });
    await owner.regex.attachGlobal({ scriptId: regexGlobalOrderA.id }); // position 0
    await owner.regex.attachGlobal({ scriptId: regexGlobalOrderB.id }); // position 1

    // ── An installed PLUGIN owned by A (D46/D147). Seeded DIRECTLY rather than through `plugin.install`
    //    because the front door stores the bundle in the real CAS; the ownership probes never read the
    //    bytes, they gate on `plugins.owner_id`. The bundle asset row is seeded first — `bundle_asset_id` is
    //    an FK with ON DELETE RESTRICT, so the plugin row cannot exist without it, and its survival is also
    //    what proves the stranger's `uninstall` never reached the reaper. The row is born `disabled` with a
    //    NARROW grant (`chat.read` only, `net.fetch` declared but NOT granted): every post-sweep field is
    //    therefore something a leaked write would MOVE — status (setEnabled), grantedCapabilities/
    //    reconsentPending (setGrant), version/name (upgrade). MARK.plugin rides `name`, which `toPluginView`
    //    returns verbatim. ──
    const pluginAssetId = castId<AssetId>("asset_alpha_plugin_bundle");
    await db.insert(assets).values({
      id: pluginAssetId,
      ownerId: OWNER_USER_ID,
      kind: "plugin",
      mime: "application/zip",
      size: 64,
      hash: "alpha-plugin-bundle-hash",
      uploadedAt: 1,
    });
    const pluginId = mintTypeId(ID_PREFIX.plugin);
    await db.insert(plugins).values({
      id: pluginId,
      ownerId: OWNER_USER_ID,
      slug: "alpha-plugin",
      name: MARK.plugin,
      version: "1.0.0",
      manifest: {
        id: "alpha-plugin",
        name: MARK.plugin,
        version: "1.0.0",
        hostVersion: 1,
        entry: "main.js",
        description: "owned by A",
        capabilities: ["chat.read", "net.fetch"],
        netHosts: ["api.vendor.example"],
      },
      bundleAssetId: pluginAssetId,
      grantedCapabilities: ["chat.read"],
      status: "disabled",
      origin: "upload",
      pendingReconsent: false,
      widenedNetHosts: [],
      consecutiveCrashes: 0,
      lastError: null,
      installedAt: 1,
      updatedAt: 1,
    });

    // #1627 — a durable row in A's INBOX, seeded DIRECTLY: notifications are raised by PRODUCERS (a
    // membership transition, a crashing plugin, an auto-disabling rule) and there is no front-door write
    // verb, which is exactly why the trio's only belt is the recipient predicate. The `automation-notice`
    // member is the one variant carrying free text, so the marker rides its rendered `message`; it points at
    // A's owner-global rule, the same chat-less lane whose auto-disable notice a single-user deployment
    // could not read while the PD-106 belt was on. `seq` is the per-recipient cursor (unique with the
    // recipient), and the row is born UNREAD + UNDISMISSED — both are post-sweep witnesses below.
    const notificationId = castId<NotificationId>("notification_alpha");
    await db.insert(notifications).values({
      id: notificationId,
      recipientUserId: OWNER_USER_ID,
      type: "automation-notice",
      payload: {
        type: "automation-notice",
        recipientUserId: OWNER_USER_ID,
        chatId: null,
        source: { kind: "rule", ruleId: automationOwnerRule.id },
        message: MARK.notification,
      },
      seq: 1,
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
      // @orb-waive no-test-fabrication(never): minimal override blob (see the note above) — the read seam degrades it to defaults. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
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
      tagOrderBId: tagOrderB.id,
      credentialId,
      themeId,
      workloadId,
      queuedWorkloadId,
      scheduleId,
      snapshotId: snapshot.id,
      chatId,
      messageId,
      documentId,
      automationRuleId: automationRule.id,
      automationOwnerRuleId: automationOwnerRule.id,
      rpgQuestId,
      rpgJournalId,
      rpgCheckpointId,
      regexScriptId,
      regexGlobalOrderAId: regexGlobalOrderA.id,
      regexGlobalOrderBId: regexGlobalOrderB.id,
      refinerySessionId: refinerySession.id,
      refinerySchemaId: refinerySchema.id,
      pluginId,
      rosterPresetId: rosterPreset.id,
      notificationId,
    };
  }

  test("owner A sees its own marker (the leak-detector has teeth) but a stranger never does", async ({ db, ownerCaller, otherCaller, services }) => {
    const ids = await seedOwnerWorld(ownerCaller, db, services.automation);

    // CONTROL: the owner's OWN read carries the marker — proving the detector below is not blind.
    const ownView = JSON.stringify(await ownerCaller.character.get({ characterId: ids.characterId }));
    expect(ownView).toContain(MARK.character);

    // THE SWEEP: every id-taking procedure, probed as the stranger, must be leak-free. Verdicts are
    // collected then asserted ONCE (no branching expect) so EVERY leak surfaces in a single readable diff.
    const leaks: string[] = [];
    for (const probe of PROBES) {
      const verdict = await leakVerdict(probe.path, () => probe.call(otherCaller, ids), probe.requireNotFound);
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
    // #26 — A's saved party survived the stranger's update/remove/apply probes byte-intact.
    const partyStill = await ownerCaller.rosterPreset.get({ presetId: ids.rosterPresetId });
    expect(partyStill.name).toBe(MARK.rosterPreset);
    expect(partyStill.members.map((m) => m.characterId)).toEqual([ids.characterId]);
    const docAttachments = await ownerCaller.databank.listAttachments({ id: ids.documentId });
    expect(docAttachments.characters.map((c) => c.id)).toEqual([ids.characterId]); // the character junction survived detachFromCharacter
    const rulesStill = await ownerCaller.automation.listRules({ chatId: ids.chatId });
    expect(rulesStill).toHaveLength(1); // the stranger's createRuleFromPreset enqueued no rule into A's chat
    expect(rulesStill[0]?.name).toBe(MARK.automationRule);
    expect(rulesStill[0]?.enabled).toBe(false); // born disabled — untouched by the stranger's setRuleEnabled probe
    // B4 — the stranger's `setRuleSuggestOnRefusal(false)` probe never muted A's F4 invitations. A write-IDOR
    // here returns void and leaks nothing, so the ONLY way to see it is to re-read the column.
    expect(rulesStill[0]?.suggestOnRefusal).toBe(true);
    // ── C5, the owner-GLOBAL lane. The sweep's marker detector covers the LIST leak; these pins cover what it
    //    structurally cannot see — the numeric rate belt, and the write arm of `requireRuleAuthority`'s
    //    owner-global branch. Both principals are read, because "the stranger sees nothing" and "A still sees
    //    its own" are two different failures (a partition can break by widening OR by projecting a default).
    const strangerOwnerRules = await otherCaller.automation.listOwnerRules();
    expect(strangerOwnerRules).toEqual([]); // the stranger's global lane is its own and it is EMPTY — A's rule is not in it
    const ownerRulesStill = await ownerCaller.automation.listOwnerRules();
    expect(ownerRulesStill).toHaveLength(1); // survived the stranger's deleteRule probe on A's global ruleId
    expect(ownerRulesStill[0]?.name).toBe(MARK.automationOwnerRule);
    expect(ownerRulesStill[0]?.enabled).toBe(false); // born disabled — the stranger's setRuleEnabled never flipped A's consent
    expect(ownerRulesStill[0]?.suggestOnRefusal).toBe(true); // B4 — nor did its setRuleSuggestOnRefusal probe mute A's lane
    const strangerBudget = await otherCaller.automation.getOwnerBudgets();
    expect(strangerBudget.maxFiresPerHour).toBe(OWNER_BUDGET_STRANGER); // the stranger reads back its OWN written ceiling…
    const ownerBudgetStill = await ownerCaller.automation.getOwnerBudgets();
    expect(ownerBudgetStill.maxFiresPerHour).toBe(OWNER_BUDGET_A); // …and A's is unmoved by that write (ownerId is the upsert's key)
    // rpg: A's game surfaces survived the stranger's write probes (updateConfig/patchSheet/upsert/delete/restore).
    const rpgConfigStill = await ownerCaller.rpg.getConfigView({ chatId: ids.chatId });
    expect(rpgConfigStill.steeringNote).toBe(MARK.rpgSteering); // untouched by the stranger's rpg.updateConfig probe
    const rpgTrackerStill = await ownerCaller.rpg.getTrackerView({ chatId: ids.chatId });
    expect(rpgTrackerStill.gameTrackers.map((t) => t.def.label)).toContain(MARK.rpgWidget); // the tracker def survived the stranger's updateConfig probe
    expect(rpgTrackerStill.quests.map((q) => q.name)).toContain(MARK.rpgQuest); // quest survived deleteQuest
    expect(rpgTrackerStill.quests.find((q) => q.id === ids.rpgQuestId)?.objectives).toEqual([]); // stranger's editQuestObjective added nothing
    const rpgJournalStill = await ownerCaller.rpg.listJournal({ chatId: ids.chatId });
    expect(rpgJournalStill.map((j) => j.title)).toContain(MARK.rpgJournal); // entry survived deleteJournalEntry
    const rpgCheckpointsStill = await ownerCaller.rpg.listCheckpoints({ chatId: ids.chatId });
    expect(rpgCheckpointsStill.map((cp) => cp.label)).toContain(MARK.rpgCheckpoint); // checkpoint survived (stranger never reached it)
    // regex: the row SURVIVED (a leaked `removeScript`/`bulkRemove` would make this read throw NOT_FOUND) and its
    // FLAGS are unmoved — the bulk arm answers the same benign `{affected}` count whether it wrote A's row or
    // dropped the id, so the flags are the only evidence a silent write-IDOR leaves. `enabled` is A's seeded value
    // (true) against the stranger's `bulkSetEnabled({enabled:false})`; A's global tier is empty against
    // `bulkSetGlobal({global:true})` + the single `attachGlobal` probe — `global_regex_scripts` has no owner
    // column (its scope IS the script's ownership), so a dropped belt parks A's script in A's own global tier.
    const regexScriptStill = (await ownerCaller.regex.listScripts()).find((script) => script.id === ids.regexScriptId);
    expect(regexScriptStill, "A's regex script survived the stranger's remove/bulkRemove probes").toBeDefined();
    expect(regexScriptStill?.name).toBe(MARK.regexScript); // untouched by the stranger's update/remove/attach/bulkRemove probes
    expect(regexScriptStill?.enabled).toBe(true); // untouched by the stranger's regex.bulkSetEnabled probe
    expect(regexScriptStill?.placement).toEqual(["AI_OUTPUT"]); // A's seeded placement — untouched by the stranger's regex.bulkSetPlacement probe
    const regexGlobalStill = await ownerCaller.regex.listGlobal();
    expect(regexGlobalStill.map((s) => s.id)).not.toContain(ids.regexScriptId); // no stranger attachGlobal/bulkSetGlobal reached A's tier
    // #708 — A's global EXECUTION ORDER is intact: the stranger's `applyScopeOrder({scope:global})` [B,A] reversal
    // was refused (NOT_FOUND) before any write, so A's two attached scripts are still in seed order [A, B]. A
    // dropped ownership pre-gate would have written the reversal and left the marker-blind leak check green.
    expect(regexGlobalStill.map((s) => s.id)).toEqual([ids.regexGlobalOrderAId, ids.regexGlobalOrderBId]);
    // refinery R3: A's schema row SURVIVED `deleteSchema` and is UNPATCHED by `updateSchema` — both return
    // void/a summary, so the row itself is the only evidence a silent write-IDOR would leave. `version` is
    // the sharpest of the three: updateSchema bumps it on any content change, so an unmoved 1 proves the
    // stranger's patch never landed even if a future name/description carry made the text arms agree.
    const schemasStill = await ownerCaller.refinery.listSchemas();
    const schemaStill = schemasStill.find((s) => s.id === ids.refinerySchemaId);
    expect(schemaStill?.name).toBe(MARK.refinerySchema); // survived deleteSchema; untouched by updateSchema
    expect(schemaStill?.version).toBe(1); // no content bump — the stranger's patch never reached A's row
    // refinery R1: A's session survived every stranger write. The run log is still EMPTY — no stranger
    // `submitManualRewrite` injected a hand-authored rewrite into A's pipeline and no `runStage`/`iterate`
    // appended a model run — and the status is still the born `active`, which is what proves `applyAsCopy`
    // (whose terminal act flips it to `completed`) never reached A's session.
    const sessionStill = await ownerCaller.refinery.getSession({ sessionId: ids.refinerySessionId });
    expect(sessionStill.status).toBe("active");
    expect(await ownerCaller.refinery.listRuns({ sessionId: ids.refinerySessionId })).toEqual([]);
    // plugin (D147): every one of the four probes is a WRITE that returns void or a view, so A's row is the
    // only evidence a silent IDOR would leave — and each field below is moved by a DIFFERENT probe, which is
    // why they are asserted separately rather than as one object compare.
    const pluginStill = await ownerCaller.plugin.list();
    expect(pluginStill.map((p) => p.id)).toEqual([ids.pluginId]); // survived the stranger's uninstall
    expect(pluginStill[0]?.version).toBe("1.0.0"); // the stranger's 9.9.9 bundle never swapped A's code
    expect(pluginStill[0]?.name).toBe(MARK.plugin); // …nor its manifest-derived name
    expect(pluginStill[0]?.grantedCapabilities).toEqual(["chat.read"]); // setGrant never widened A's grant
    expect(pluginStill[0]?.netHosts).toEqual(["api.vendor.example"]); // the egress wall was not re-pointed
    expect(pluginStill[0]?.status).toBe("disabled"); // setEnabled never booted A's guest code as the stranger
    // ── #755 — WRITE-authority for the owner-scoped E5 candidates the marker detector is STRUCTURALLY BLIND
    //    to. An UPDATE probe OVERWRITES A's marker field with the attacker's value ("hacked"), and a DELETE
    //    probe returns void, so a resolved probe carries no marker whether the write was REFUSED or SILENTLY
    //    SUCCEEDED — the two are indistinguishable to `leakVerdict`. These four families had NO post-sweep
    //    re-read, so a dropped owner predicate on persona.remove/update, preset.update/remove/resetToDefault,
    //    worldInfo.updateBook/updateEntry/removeBook/removeEntry/attachToCharacter, or tag.updateTag/removeTag/
    //    mergeTags resolved leak-free here (proven: dropping `eq(presets.ownerId, userId)` from updatePresetRow
    //    left this suite GREEN). Re-reading A's row is the ONLY witness that the write's authority reached the
    //    commit — the same posture the refinery/plugin/rpg re-reads above already carry for their write probes.
    const personaStill = await ownerCaller.persona.get({ personaId: ids.personaId });
    expect(personaStill.name).toBe(MARK.persona); // survived persona.remove; untouched by persona.update
    const presetStill = await ownerCaller.preset.get({ id: ids.presetId });
    expect(presetStill.name).toBe(MARK.preset); // survived preset.remove/resetToDefault; untouched by preset.update
    const bookStill = await ownerCaller.worldInfo.getBook({ bookId: ids.bookId });
    expect(bookStill.name).toBe(MARK.book); // survived removeBook; untouched by updateBook
    const entryStill = await ownerCaller.worldInfo.getEntry({ entryId: ids.entryId });
    expect(entryStill.title).toBe(MARK.entry); // untouched by the stranger's updateEntry/removeEntry probes
    // world-info primary-book (E5): the stranger aimed A's book at A's character as `primary`; a dropped
    // `ensureCharacterOwned` belt would MUTATE A's `character_books` junction. A's book has no seeded
    // attachment, so an empty character list proves the stranger's attach never landed on A's world.
    const bookAttachmentsStill = await ownerCaller.worldInfo.listAttachmentsForBook({ bookId: ids.bookId });
    expect(bookAttachmentsStill.characters).toEqual([]);
    const tagStill = (await ownerCaller.tag.listTags()).find((t) => t.id === ids.tagId);
    expect(tagStill?.name).toBe(MARK.tag); // survived removeTag/mergeTags; untouched by updateTag

    // ── #1627 — THE INBOX PARTITION, read from BOTH sides. The forward detector covers the `list` READ; these
    //    cover what it structurally cannot see, because neither remaining probe leaves text: `markAllRead`
    //    answers a COUNT and `dismiss` answers void-or-a-view, and BOTH move a null timestamp. `dismiss` is
    //    the sharper of the two — a landed cross-tenant dismiss EXCLUDES the row from `list` entirely
    //    (`isNull(dismissedAt)` in the query), so A's inbox would simply go quiet. MEASURED (#1627,
    //    2026-09-05) against one planted omission per verb in `domain/notifications/persistence/queries.ts`:
    //    dropping the recipient predicate from `selectInbox` fires the forward detector on the marker, from
    //    `dismissScoped` fires the probe's own `requireNotFound` arm (the stranger's dismiss RESOLVED), and
    //    from `markAllReadScoped` fires the `readAt` pin below — which is the sole witness of that probe,
    //    since a cross-tenant markAllRead leaves no text and returns only a count. ──
    const inboxStill = await ownerCaller.notifications.list();
    expect(inboxStill.items).toHaveLength(1); // the stranger's dismiss never removed A's row from A's inbox
    expect(inboxStill.items[0]?.readAt).toBeNull(); // …nor did its markAllRead flip A's unread state
    expect(JSON.stringify(inboxStill.items[0]?.payload)).toContain(MARK.notification); // and it is still A's own notice
    // The B side: "the stranger sees nothing" is a different failure from "A still sees its own" (the C5
    // owner-budget posture) — a partition can break by widening OR by projecting someone else's rows.
    expect(await otherCaller.notifications.list()).toEqual({ items: [], nextCursor: null });

    // ══ #795 — THE WRITE-IDOR COMPLETENESS AUDIT ═══════════════════════════════════════════════════════════
    // #755 closed four families by hand (persona/preset/world-info/tag). This closes the REST: every remaining
    // owner-scoped UPDATE or void-returning write probe above now has a witness, in one of two forms.
    //
    // FORM 1 — the REVERSE DETECTOR (see `hijackVerdict`): A's own reads must not carry the stranger's text.
    // Growth-proof and class-wide.
    // FORM 2 — a FIELD PIN, for the arms text cannot see: a boolean flipped, a number moved, an order
    // reversed, a row deleted, a row added. Each is named with the probe it witnesses.
    //
    // The rule this establishes, and the one a future lane owes: A WRITE PROBE WITHOUT A WITNESS IS NOT A
    // PROBE. It resolves leak-free whether the belt held or not, so it reports green forever.

    // ── FORM 1: the reverse sweep. Owner A re-reads its world; none of it may carry the attacker's text. ──
    // The POSITIVE CONTROL runs first and in the SAME invocation: a bare "no hijacks found" is "I could not
    // measure" unless the detector is shown to fire on a known-hijacked value.
    expect(
      hijackVerdict("__control", { name: ATTACKER_TEXT }),
      "the reverse detector must fire on a known hijack — a clean sweep from a blind detector is not evidence",
    ).not.toBeNull();

    const messagesStill = await ownerCaller.chat.listMessages({ chatId: ids.chatId });
    const injectionsStill = await ownerCaller.chat.listChatInjections({ chatId: ids.chatId });
    const themeStill = await ownerCaller.settings.getTheme({ id: ids.themeId });
    const workloadStill = await ownerCaller.workloads.get({ id: ids.workloadId });
    const schedulesStill = await ownerCaller.workloads.listSchedules();
    const scheduleStill = schedulesStill.find((s) => s.id === ids.scheduleId);
    const rpgTrackerAgain = await ownerCaller.rpg.getTrackerView({ chatId: ids.chatId });
    const hijacks = [
      hijackVerdict("chat.getChat (title/overrides/background)", chatStill),
      hijackVerdict("chat.listMessages (canon content)", messagesStill), // chat.editMessage / setSeededGreeting
      hijackVerdict("chat.listChatInjections", injectionsStill), // chat.setChatInjection
      hijackVerdict("settings.getTheme", themeStill), // settings.updateTheme
      hijackVerdict("workloads.get", workloadStill), // workloads.cancel / retry
      hijackVerdict("workloads.listSchedules", schedulesStill), // workloads.updateSchedule / setScheduleEnabled
      hijackVerdict("character.get", stillThere), // character.update / bulkAddCardTag
      hijackVerdict("rpg.getTrackerView", rpgTrackerAgain), // rpg.editSnapshot / patchActor / patchSheet / upsertQuest
      hijackVerdict("rpg.listJournal", rpgJournalStill), // rpg.addJournalEntry / editJournalEntry
      hijackVerdict("rpg.listCheckpoints", rpgCheckpointsStill), // rpg.createCheckpoint
      hijackVerdict("rpg.getConfigView", rpgConfigStill), // rpg.updateConfig
      hijackVerdict("automation.listRules", rulesStill),
      hijackVerdict("automation.listOwnerRules", ownerRulesStill),
      hijackVerdict("refinery.getSession", sessionStill), // refinery.updateSession / submitManualRewrite
      hijackVerdict("refinery.listSchemas", schemasStill), // refinery.updateSchema
      hijackVerdict("plugin.list", pluginStill), // plugin.upgrade (the hostile bundle's "Hijacked" name)
      hijackVerdict("regex.listScripts", regexScriptStill), // regex.updateScript
      hijackVerdict("rosterPreset.get", partyStill), // rosterPreset.update
      hijackVerdict("persona.get", personaStill), // persona.update
      hijackVerdict("preset.get", presetStill), // preset.update
      hijackVerdict("worldInfo.getBook", bookStill), // worldInfo.updateBook
      hijackVerdict("worldInfo.getEntry", entryStill), // worldInfo.updateEntry
      hijackVerdict("databank.get", docStill), // databank.rename
      hijackVerdict("tag.listTags", tagStill), // tag.updateTag
    ].filter((v): v is string => v !== null);
    expect(hijacks, `cross-tenant WRITE-IDOR — the stranger's data landed in owner A's world (STOP-and-report):\n${hijacks.join("\n")}`).toEqual([]);

    // ── FORM 2: the field pins the reverse detector is structurally blind to. ──

    // settings/themes — NO witness existed before #795. `updateTheme` overwrites the marker field and
    // `removeTheme` returns void, so both were indistinguishable from a refusal. The read THROWING would be
    // the removeTheme tell; the name is the updateTheme tell (the reverse sweep covers the text half).
    expect(themeStill.name).toBe(MARK.theme); // survived removeTheme; untouched by updateTheme

    // ── WORKLOADS — NO witness existed, and getting one right took two corrections a planted omission forced.
    //    Neither probe leaves TEXT behind, so the reverse detector is blind to both; and they fail DIFFERENTLY:
    //      • `cancel` mutates IN PLACE — but `markCancelling` NO-OPS ON A TERMINAL ROW, so aimed at the seeded
    //        `failed` workload it could not move anything even with its owner belt deleted (measured). It now
    //        aims at A's `queued` row, where a landed cancel is visible as `cancelled`.
    //      • `retry` does NOT mutate the original at all — it INSERTS A CLONE stamped `ownerId:
    //        original.ownerId` (retry.ts:71), i.e. a new row in A's OWN queue. Re-reading the original is
    //        structurally blind to it; the LIST COUNT is the witness.
    expect(workloadStill.status).toBe("failed"); // A's retried-from row is itself unmoved
    expect(workloadStill.error).toBe(MARK.workload);
    const queuedStill = await ownerCaller.workloads.get({ id: ids.queuedWorkloadId });
    expect(queuedStill.status).toBe("queued"); // the stranger's workloads.cancel never reached A's live row
    expect(await ownerCaller.workloads.list()).toHaveLength(2); // workloads.retry enqueued no clone into A's queue

    // workload SCHEDULES — NO witness existed for any of the three write probes, and each moves a DIFFERENT
    // non-text field, which is why they are asserted separately: `deleteSchedule` (existence),
    // `updateSchedule({cadence:"weekly"})` (cadence), `setScheduleEnabled({enabled:false})` (the flag).
    expect(scheduleStill, "A's schedule survived the stranger's workloads.deleteSchedule probe").toBeDefined();
    expect(scheduleStill?.cadence).toBe("daily"); // untouched by the stranger's updateSchedule({cadence:"weekly"})
    expect(scheduleStill?.enabled).toBe(true); // the stranger's setScheduleEnabled({enabled:false}) never landed

    // ── The CHAT ROOM-OPTION cluster. Thirteen host-gated write probes shared ONE witness (`chatStill.title`),
    //    and title is moved by exactly one of them. Every field below is the seeded default and is moved by a
    //    DIFFERENT probe — several of them reach the assembled PROMPT (roomOverrides / offerChoices /
    //    anchorPersona), which is what a room hijack is actually worth. ──
    expect(chatStill.starred).toBe(false); // chat.star({starred:true})
    expect(chatStill.archived).toBe(false); // chat.archive({archived:true})
    expect(chatStill.roomOverrides).toEqual({}); // chat.setRoomOverrides({scenario: ROOM_OVERRIDE_HACK}) — also a prompt reach
    expect(chatStill.toolRecurseLimit).toBeNull(); // chat.setToolRecurseLimit({limit:5})
    expect(chatStill.hostDisplayScripts).toBe(false); // chat.setHostDisplayScripts({enabled:true})
    expect(chatStill.offerChoices).toBeNull(); // chat.setOfferChoices({enabled:true}) — reaches the prompt
    expect(chatStill.charactersCanReact).toBeNull(); // chat.setCharactersCanReact({enabled:true}) — arms a tool in A's room
    expect(chatStill.reactionsEnabled).toBeNull(); // chat.setReactionsEnabled({enabled:false}) — would silence A's room
    expect(chatStill.background).toBeNull(); // chat.setChatBackground({kind:"none"})
    expect(chatStill.anchorPersonaId).toBeNull(); // chat.setChatAnchorPersona(A's personaId) — would re-point {{user}}
    expect(chatStill.pendingHostUserId).toBeNull(); // invites.nominateHostHandoff never nominated in A's room

    // ── CHAT CANON. `editMessage`/`setSeededGreeting` overwrite content (reverse-swept above); these three
    //    move NON-text state and had no witness: a deletion, a visibility flip, an attribution restamp. The
    //    count also witnesses the stranger's `send`/`commitMessage`/`swipe` probes minting a row in A's room. ──
    expect(messagesStill.messages).toHaveLength(1); // chat.deleteMessages never dropped A's row; send/commitMessage never added one
    expect(messagesStill.messages[0]?.content).toBe(MARK.message); // untouched by chat.editMessage
    expect(messagesStill.messages[0]?.excludedFromPrompt).toBe(false); // chat.setMessageHidden({hidden:true}) never landed
    expect(messagesStill.messages[0]?.personaId).toBeNull(); // chat.reattributePersona never restamped A's row
    expect(injectionsStill).toEqual([]); // chat.setChatInjection never spliced prompt content into A's room

    // ── CHAT ROSTER + membership. `addCharacterToChat`/`removeCharacterFromChat`/`setSeatKnobs`/`kick`/
    //    `rosterPreset.applyToChat` are all void-or-view writes on A's seat table with no witness before now.
    //    `kick` is the sharpest: it would remove A from A's OWN room. (A kicked A would also make the
    //    `getChat` above throw — but that is an accident of the read order, not a stated pin, so state it.) ──
    expect(chatStill.participants).toHaveLength(1); // only A's host seat: no character seated, none removed
    expect(chatStill.participants[0]?.userId).toBe(OWNER_USER_ID); // invites.kick never removed A from A's own chat
    expect(chatStill.participants[0]?.role).toBe("host"); // invites.nominateHostHandoff/acceptHostHandoff never moved A's host role
    expect(chatStill.participants[0]?.disabled).toBe(false); // chat.setSeatKnobs({disabled:true}) never muted A's seat
    expect(await ownerCaller.invites.listInvites({ chatId: ids.chatId })).toEqual([]); // invites.createInvite minted no seat-grant into A's room

    // ── The CHAT VARIABLE planes (member-gated writes, both void). `setVariables`/`setUserMacroValues` write
    //    values a turn assembles against, and neither had a witness. ──
    expect(await ownerCaller.chat.getRuntimeVariables({ chatId: ids.chatId })).toEqual({}); // chat.setVariables({mood:"grim"}) never landed

    // ── CHARACTER non-text state. `update`'s text arm is witnessed by the name; these two bulk arms move a
    //    FLAG and a JUNCTION, and `snapshot` MINTS a row — none leaves text, so all three were unwitnessed. ──
    expect(stillThere.archived).toBe(false); // character.bulkArchive({archived:true}) never landed
    expect(stillThere.tags.map((t) => t.name)).not.toContain("x"); // character.bulkAddCardTag({tagName:"x"}) never tagged A's card
    expect(stillThere.tags.map((t) => t.id)).not.toContain(ids.tagId); // tag.attachTag never attached A's tag to A's card
    expect(await ownerCaller.character.listSnapshots({ characterId: ids.characterId })).toHaveLength(1); // character.snapshot minted nothing on A's card

    // ── PRESET config. `resetToDefault` REPLACES the config and KEEPS the name, so the `presetStill.name` pin
    //    above is structurally blind to it — a default-configured preset reads identical hijacked or not.
    //    This knob rides the same `updatePresetRow` owner predicate #755 proved droppable. ──
    expect(presetStill.config.params.temperature).toBe(PRESET_TEMPERATURE_A); // preset.resetToDefault never wiped A's knobs

    // ── WORLD-INFO book CONTENTS + the two junction planes. `createEntry` ADDS a row, `applyEntryOrder`
    //    REORDERS, and attachToPersona/attachToChat write junctions — none carries text, none had a witness. ──
    const entriesStill = await ownerCaller.worldInfo.listEntries({ bookId: ids.bookId });
    expect(entriesStill).toHaveLength(1); // worldInfo.createEntry never appended lore to A's book
    expect(entriesStill[0]?.id).toBe(ids.entryId); // …and applyEntryOrder never reordered it
    expect(await ownerCaller.worldInfo.listForPersona({ personaId: ids.personaId })).toEqual([]); // worldInfo.attachToPersona never landed
    expect(await ownerCaller.worldInfo.listForChat({ chatId: ids.chatId })).toEqual([]); // worldInfo.attachToChat never injected lore into A's room

    // ── PERSONA↔CHARACTER junction (`connectToCharacter` returns void on A's two rows). ──
    expect(await ownerCaller.persona.listConnectedToCharacter({ characterId: ids.characterId })).toEqual([]); // persona.connectToCharacter never landed

    // ── TAG ORDER — the `regex.applyScopeOrder` global-scope shape one plane over. `setTagOrder` answers void
    //    and the order is not text, so A's seeded [tag, tagOrderB] is the ONLY evidence the stranger's
    //    reversal was refused. (The probe was un-failable before #795: it named A's single tag.) ──
    const tagOrderStill = (await ownerCaller.tag.listTags()).map((t) => t.id);
    expect(tagOrderStill).toEqual([ids.tagId, ids.tagOrderBId]); // tag.setTagOrder's reversal never reached A's tier

    // ── DATABANK + REGEX attachment planes (junction writes, all void-returning). ──
    expect(await ownerCaller.databank.listActiveForChat({ chatId: ids.chatId })).toEqual([]); // databank.attachToChat never fed A's room
    expect(await ownerCaller.regex.listForChat({ chatId: ids.chatId })).toEqual([]); // regex.attachToChat never landed
    expect(await ownerCaller.regex.listForCharacter({ characterId: ids.characterId })).toEqual([]); // regex.attachToCharacter never landed
    expect(await ownerCaller.regex.listForPreset({ presetId: ids.presetId })).toEqual([]); // regex.attachToPreset never landed

    // ── RPG residuals. The existing pins prove A's seeded rows SURVIVED (`toContain`); these prove nothing was
    //    ADDED — a `toContain` passes with an attacker's row sitting beside A's, and `addJournalEntry` /
    //    `createCheckpoint` / `upsertQuest` are exactly ADD-shaped writes. ──
    expect(rpgJournalStill).toHaveLength(1); // rpg.addJournalEntry never appended to A's log
    expect(rpgCheckpointsStill).toHaveLength(1); // rpg.createCheckpoint never appended to A's timeline
    expect(rpgTrackerAgain.quests).toHaveLength(1); // rpg.upsertQuest minted no second quest in A's game
    // A's game carries exactly ONE actor — A's OWN user seat, born with `createGame` (NOT an empty list; the
    // first spelling of this pin asserted `[]` and was simply wrong about the domain). The COUNT is the
    // witness: `patchActor`/`promoteActor`/`populateFromCharacter` are all ADD-shaped, so a second actor is
    // what a landed write looks like. `promoteActor` is the sharpest of the three — its write reaches OUTSIDE
    // the game (a character card into the room host's library plus a roster seat).
    expect(rpgTrackerAgain.actors).toHaveLength(1); // no stranger actor minted into A's game
    expect(rpgTrackerAgain.actors[0]?.actorRef).toEqual({ kind: "user", userId: OWNER_USER_ID }); // …and the one actor is still A's own seat
    expect(rpgTrackerAgain.actors[0]?.sheet.className).toBe(""); // rpg.patchSheet({className:"hacked"}) never landed on A's sheet

    // ── THE GLOBAL-TIER PLANES. An `attachGlobal` hijack lands in ONE of two places, and WHICH ONE depends on
    //    whether the junction carries its own owner column — so a single direction is a false clean for half of
    //    them. This was measured, not reasoned: the first spelling of this block pinned only the STRANGER's
    //    tiers, and bypassing `worldInfo.attachGlobal`'s ownership gate left the suite GREEN.
    //      • `global_books` (world-info) and `global_regex_scripts` have NO owner column — scope derives
    //        through the entity's own ownership (D23). A hijacked attach therefore makes A's OWN book/script
    //        global, in A'S tier. Only an A-SIDE read sees it.
    //      • `global_documents` (databank) HAS `owner_id`. A hijacked attach inserts `(stranger, A's doc)`, so
    //        the row lands in B'S tier and only a B-SIDE read sees it.
    expect(await ownerCaller.worldInfo.listGlobal()).toEqual([]); // worldInfo.attachGlobal never made A's book fire in every one of A's rooms
    expect(await otherCaller.worldInfo.listGlobal()).toEqual([]); // …and B's own tier stayed empty either way
    expect(await otherCaller.regex.listGlobal()).toEqual([]); // (A's side is `regexGlobalStill` above — the no-owner-column shape)
    expect(await otherCaller.databank.listGlobal()).toEqual([]); // databank.attachGlobal never parked A's document in B's owner-keyed tier
    // The EXFILTRATION direction: `character.duplicate` and `refinery.applyAsCopy` do not write A's row at
    // all — they MINT A COPY of A's card into the STRANGER's own library, which every A-side re-read is blind
    // to (A's original is untouched, so `stillThere.name` passes). The stranger's library is the only witness.
    // It is NOT empty — the `rosterPreset.applyToChat` scope-2 probe legitimately creates B's own character —
    // so the pin is that nothing in it is A's, never a bare count of zero.
    const strangerLibrary = await otherCaller.character.list();
    expect(strangerLibrary.items.map((c) => c.name)).not.toContain(MARK.character); // no copy of A's card landed in B's library
    expect(strangerLibrary.items.map((c) => c.id)).not.toContain(ids.characterId); // …and B never acquired A's row itself
  });
});
