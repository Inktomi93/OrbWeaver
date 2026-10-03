// verb: applyToChat — additively materialize a saved party onto an EXISTING chat the caller HOSTS, by
// driving chat's OWN injected verbs (never a second participant-insert path — D61 B6). Authority is
// owner-of-preset ∧ host-of-chat: the first is this domain's owner-scoped read, the second is chat's
// own `requireHost` — injected, and run FIRST, before ANY read of the target room (without it, an apply
// whose members are all already present and whose preset carries no config would fire zero host-gated
// ops and hand a non-host caller a roster-intersection oracle).
//
// Additive only (never kicks — the host prunes by hand) and IDEMPOTENT: a re-apply mints nothing
// (chat's `addCharacterToChat` present-seat floor returns the live seat) and RE-STAMPS the seat knobs —
// `disabled` always (NOT NULL in the junction, so the stored value IS the preset's answer),
// `talkativeness` only when the preset stores one (NULL = inherit the chat default). Members apply
// SEQUENTIALLY in position order — join order is visible in the roster UI, so the awaits in the loop
// are the semantics, not an accident. `skipped` is the PRE-DRIVE re-verify arm ONLY (stickler F3
// truth-repair): the FK CASCADE makes a stale member unrepresentable at rest, so the re-verify catches
// just the delete-between-read-and-verify window and drops those members from the drive, reported. A
// failure INSIDE the drive (an injected chat verb throwing) SURFACES and aborts the loop — deliberately
// not collected: distinguishing "this member's character died" from "the room died" inside a
// DomainNotFoundError would need error-class sniffing across the domain line, and the additive +
// idempotent contract already makes a retry converge (landed seats re-classify alreadyPresent).
//
// THE RULES PHASE (B10's rules rider — build record §6.4/§6.5) runs LAST, entirely through automation's
// injected front-door verbs (no second rule write path). Per stored cast rule, in cast order: the room's
// provenance groups (ONE `listRules` read) decide the arm — a COMPLETE knob-equal group re-asserts
// enablement (`rulesAlreadyPresent`); anything else under that preset id is deleted and re-minted with
// the cast's bag (v1 knob-edit IS re-mint; this flattens a multi-mint room to one instance and makes a
// half-minted set converge on retry); an absent one mints fresh. Minted rules are then ENABLED — the
// apply click, by the target room's HOST, is the consent act for this room (the cast captured
// enabled-only presets and the surface shows what it carries; a mid-mint failure leaves an inert
// born-disabled half set, so the safety posture survives). The catch discipline mirrors the member
// drive with ONE widening: `DomainOperationError` (the KIT base class automation's `RuleValidationError`
// extends — never a sibling-domain import) is an EXPECTED per-preset outcome (the lore presets'
// book-attachment consent gate refusing in a room without the book, a knob a catalogue evolution
// retired) and collects into `rulesSkipped` with automation's own reason; every OTHER class (a dying
// room's NotFound — a SIBLING of DomainOperationError in kit, never caught here) surfaces and aborts.
// Non-cast rules — hand-authored, other presets' — are NEVER touched (the never-kicks law's rule twin),
// and a sans-rules cast performs ZERO automation ops.

import type { RulePresetId, RulePresetView } from "@orb/contracts/automation";
import { rulePresetKnobBagsEqual } from "@orb/contracts/automation";
import type { Principal } from "@orb/contracts/identity";
import type { RosterPresetRuleSkip } from "@orb/contracts/roster-preset";
import { DomainOperationError } from "@orb/kit/errors";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import type { IanaTimeZone } from "@orb/kit/time";
import type { RuleView } from "#domain/automation";
import type { RosterPresetContext } from "../context.ts";
import { RosterPresetNotFoundError } from "../contract/errors.ts";
import type { ApplyRosterPresetParams } from "../contract/params.ts";
import type { CastRuleWrite, RosterPresetService } from "../contract/service.ts";
import { loadCastRuleRows, loadMemberRows, loadOwnedPresetRow } from "../persistence/queries.ts";

/** One cast rule's apply outcome — the three result arms, decided by {@link applyOneCastRule}. */
type CastRuleOutcome = { readonly kind: "minted" } | { readonly kind: "alreadyPresent" } | { readonly kind: "skipped"; readonly reason: string };

/** Is the room's provenance group EXACTLY this cast rule's mint? Complete (every rule of the set
 *  present) AND every stored bag knob-equal to the cast's — anything less re-mints. */
function isCompleteMatch(group: readonly RuleView[], def: RulePresetView, castRule: CastRuleWrite): boolean {
  return (
    group.length === def.ruleCount && group.every((rule) => rule.rulePresetKnobs !== null && rulePresetKnobBagsEqual(rule.rulePresetKnobs, castRule.knobs))
  );
}

/** The member knob re-stamp's rule twin: re-assert the cast's semantics (all enabled) — through
 *  automation's own consent verb, idempotent on an already-enabled rule. */
async function reassertEnabled(ctx: RosterPresetContext, principal: Principal, group: readonly RuleView[]): Promise<void> {
  for (const rule of group) {
    if (!rule.enabled) {
      await ctx.automation.setRuleEnabled({ principal, ruleId: rule.id, enabled: true });
    }
  }
}

/** One cast rule's drive inputs — bundled (useMaxParams) for the two drivers below. */
interface CastRuleDrive {
  readonly principal: Principal;
  readonly chatId: ChatId;
  /** The applying host's zone, stamped on every re-minted rule's clock. */
  readonly timeZone: IanaTimeZone;
  readonly castRule: CastRuleWrite;
  readonly group: readonly RuleView[];
}

/** Replace-then-mint-then-enable: the cast is the single authority for this preset's config in the
 *  room (knob drift, a half-minted set, or a multi-mint all flatten to ONE fresh set). The re-mint
 *  appends at position max+1 — a re-minted set's dispatch order moves to the end, exactly as B2's own
 *  delete+re-mint edit path moves it. Enabling runs AFTER the whole set minted, so a mid-mint failure
 *  leaves an inert born-disabled half set (the safety posture survives — header). */
async function replaceAndMint(ctx: RosterPresetContext, drive: CastRuleDrive): Promise<void> {
  const { principal, chatId, timeZone, castRule, group } = drive;
  for (const rule of group) {
    await ctx.automation.deleteRule({ principal, ruleId: rule.id });
  }
  const minted = await ctx.automation.createRuleFromPreset({ principal, chatId, presetId: castRule.rulePresetId, knobs: castRule.knobs, timeZone });
  for (const rule of minted) {
    await ctx.automation.setRuleEnabled({ principal, ruleId: rule.id, enabled: true });
  }
}

/** Decide + drive one cast rule (the header's catch discipline: `DomainOperationError` is the EXPECTED
 *  per-preset refusal and collapses to a reported skip; every other class surfaces to the caller). */
async function applyOneCastRule(ctx: RosterPresetContext, drive: CastRuleDrive, def: RulePresetView | undefined): Promise<CastRuleOutcome> {
  if (def === undefined || def.scope !== "chat") {
    return { kind: "skipped", reason: "this rule preset is no longer offered" };
  }
  if (isCompleteMatch(drive.group, def, drive.castRule)) {
    await reassertEnabled(ctx, drive.principal, drive.group);
    return { kind: "alreadyPresent" };
  }
  try {
    await replaceAndMint(ctx, drive);
    return { kind: "minted" };
  } catch (error) {
    if (error instanceof DomainOperationError) {
      return { kind: "skipped", reason: error.message };
    }
    throw error;
  }
}

/** The whole rules phase (header): classify + drive every cast rule against ONE `listRules` read,
 *  collecting the three result arms. Zero automation ops for a sans-rules cast — the caller guards. */
async function applyCastRules(
  ctx: RosterPresetContext,
  args: { readonly principal: Principal; readonly chatId: ChatId; readonly timeZone: IanaTimeZone; readonly castRules: readonly CastRuleWrite[] },
): Promise<{ minted: RulePresetId[]; alreadyPresent: RulePresetId[]; skipped: RosterPresetRuleSkip[] }> {
  const { principal, chatId, timeZone, castRules } = args;
  const minted: RulePresetId[] = [];
  const alreadyPresent: RulePresetId[] = [];
  const skipped: RosterPresetRuleSkip[] = [];
  // The LIVE catalogue decides existence + expected set size — a stored id a catalogue removal
  // orphaned (or a preset whose scope flipped) degrades to a reported skip, never a crash.
  const catalogue = new Map(ctx.automation.listRulePresets().map((def) => [def.id, def]));
  // ONE host-gated read classifies every cast rule (mutations are tracked per-preset, and cast rules
  // are unique per preset id, so the list is never stale within the loop).
  const roomRules = await ctx.automation.listRules({ principal, chatId });
  for (const castRule of castRules) {
    const group = roomRules.filter((rule) => rule.rulePresetId === castRule.rulePresetId);
    const outcome = await applyOneCastRule(ctx, { principal, chatId, timeZone, castRule, group }, catalogue.get(castRule.rulePresetId));
    if (outcome.kind === "minted") {
      minted.push(castRule.rulePresetId);
    } else if (outcome.kind === "alreadyPresent") {
      alreadyPresent.push(castRule.rulePresetId);
    } else {
      skipped.push({ rulePresetId: castRule.rulePresetId, reason: outcome.reason });
    }
  }
  return { minted, alreadyPresent, skipped };
}

export function createApplyToChat(ctx: RosterPresetContext): RosterPresetService["applyToChat"] {
  return async ({ principal, presetId, chatId, timeZone }: ApplyRosterPresetParams) => {
    const ownerId = principal.userId;
    const preset = await loadOwnedPresetRow(ctx.db, ownerId, presetId);
    if (preset === undefined) {
      throw new RosterPresetNotFoundError(presetId);
    }
    // Host authority FIRST (see the header) — a stranger and a dead room collapse to chat's own
    // leak-free NOT_FOUND, asserted THROUGH the injected guard so no second authority path exists.
    await ctx.chat.requireHost(principal, chatId);
    const memberRows = await loadMemberRows(ctx.db, presetId);
    const ownedNow = new Set(
      await ctx.verifyCharactersOwned(
        ownerId,
        memberRows.map((m) => m.characterId),
      ),
    );
    const present = new Map((await ctx.chat.listPresentCharacterSeats(chatId)).map((seat) => [seat.characterId, seat.participantId]));
    const added: CharacterId[] = [];
    const alreadyPresent: CharacterId[] = [];
    const skipped: CharacterId[] = [];
    for (const member of memberRows) {
      if (!ownedNow.has(member.characterId)) {
        skipped.push(member.characterId);
        continue;
      }
      let participantId = present.get(member.characterId);
      if (participantId === undefined) {
        const seat = await ctx.chat.addCharacterToChat({ principal, chatId, characterId: member.characterId });
        participantId = seat.id;
        added.push(member.characterId);
      } else {
        alreadyPresent.push(member.characterId);
      }
      await ctx.chat.setSeatKnobs({
        principal,
        chatId,
        participantId,
        patch: { disabled: member.disabled, ...(member.talkativeness !== null ? { talkativeness: member.talkativeness } : {}) },
      });
    }
    let configApplied = false;
    if (preset.groupConfig !== null) {
      // Parse-at-apply is CHAT's (`setGroupConfig` re-parses the stored input) — a preset WITHOUT a
      // config never touches the room's existing config.
      await ctx.chat.setGroupConfig({ principal, chatId, config: preset.groupConfig });
      configApplied = true;
    }

    // ── the rules phase (see the header; drivers above) ──────────────────────────────────────────
    const castRules = await loadCastRuleRows(ctx.db, [presetId]);
    const ruleResults =
      castRules.length > 0
        ? await applyCastRules(ctx, { principal, chatId, timeZone, castRules })
        : { minted: [] as RulePresetId[], alreadyPresent: [] as RulePresetId[], skipped: [] as RosterPresetRuleSkip[] };

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "rosterPreset.applyToChat",
        entityType: "roster_preset",
        entityId: presetId,
        metadata: {
          chatId,
          added: added.length,
          alreadyPresent: alreadyPresent.length,
          skipped: skipped.length,
          configApplied,
          rulesMinted: ruleResults.minted.length,
          rulesAlreadyPresent: ruleResults.alreadyPresent.length,
          rulesSkipped: ruleResults.skipped.length,
        },
      },
      ctx.now(),
    );
    // No `rosterPresetsChanged` here — an apply mutates the CHAT (which fans `chatUpdated` through the
    // injected chat verbs, and `rulesChanged` through automation's own); the library rows are untouched.
    return {
      added,
      alreadyPresent,
      skipped,
      configApplied,
      rulesMinted: ruleResults.minted,
      rulesAlreadyPresent: ruleResults.alreadyPresent,
      rulesSkipped: ruleResults.skipped,
    };
  };
}
