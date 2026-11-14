// verb: importGroupChats — the ST GROUP wave. One ST group definition + the transcripts its own `chats[]`
// claimed become ONE orb group room per transcript: the founding roster is the host plus every resolved member
// card, and each assistant turn is attributed to the character that actually voiced it.
//
// It owns NO write: exactly like `importChats`, it maps ST → the canonical `BulkImportChatInput` and delegates
// to chat's injected `bulkImportChats` op, which already carries the whole roster path (`roster` seats the
// extra cast, `messages[].characterId` voices a slot, and BOTH are ownership-gated + seat-gated before a row
// is written). Chat learns nothing about SillyTavern; import mints no participant row.
//
// MEMBER RESOLUTION IS BY CARD FILENAME, never by display name. ST's group file lists `members:
// ["Briar.png", "Lisa.png"]` and stamps `original_avatar: "Briar.png"` on every group-chat assistant line —
// the same key `settings.tag_map` uses and the same key the collector carries on `CollectedCard.filename`. Two
// cards named "Eleni" disambiguate to handles `eleni`/`eleni-2` while keeping distinct filenames, so a
// name-keyed roster seats the wrong card in silence. A display-name match, SCOPED to this group's own roster,
// is the fallback for pre-group-era exports whose lines carry no `original_avatar`.
//
// A group seats only the cards of its own profile directory: two profiles can keep different cards under one filename.
//
// ISOLATION IS PER GROUP AND PER MEMBER: a member card its profile does not carry is SKIPPED with a report note (the room still forms around the members that did resolve); a group
// whose members ALL fail to resolve is skipped with a note. Neither aborts the wave.

import type { BulkImportChatInput, ChatMetadata } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, narratorPolicyOf } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import type { CollectedGroup } from "../contract/collection.ts";
import type { ImportGroupsInput, ImportProfileGroups } from "../contract/params.ts";
import type {
  GroupSeats,
  ImportAmbiguousSpeakerName,
  ImportGroupsResult,
  ImportSeatedDisabledMember,
  ImportSkippedGroup,
  ImportSkippedGroupMember,
  ImportUnresolvedPinnedPersona,
} from "../contract/results.ts";
import type { ImportContext, ImportService } from "../contract/service.ts";
import { requireProfile } from "../guard.ts";
import { buildGroupChatInput, disambiguateChatTitles, unresolvedPinnedPersonas } from "../substrate/chat-input.ts";
import type { GroupRefusal } from "../substrate/group.ts";
import { groupRefusal, resolveMembers } from "../substrate/group.ts";

/** The room-behavior blob an imported ST group is born with. Only what ST actually states travels: its
 *  `generation_mode` (append ⇒ the whole cast in one narrated message) and `allow_self_responses`. Everything
 *  else stays at orb's own defaults rather than being invented from an ST knob that does not mean the same
 *  thing. The write op runs this through the column's OWN parser, so the defaults fill there. */
function metadataFor(group: CollectedGroup): ChatMetadata {
  const { allowSelfResponses, narratorOutput } = group.parsed;
  if (!narratorOutput) {
    return { group: { ...DEFAULT_GROUP_CONFIG, allowSelfResponses } };
  }
  // The narrator arm OMITS `cardScope` (the union makes `narrator ⇒ merged` unrepresentable) and is strict, so
  // it is built from the knobs BOTH arms share — destructured off the canonical default rather than re-spelled,
  // so a new shared knob is a compile error here instead of a silently-defaulted room. `speakerTags` is the
  // narrator arm's OWN default (true), which differs from the per-speaker arm's.
  const { policy, smartPicker, groupNudge, autoMode, autoModeMaxTurns, autoModeDelayMs, memberCardVisibility } = DEFAULT_GROUP_CONFIG;
  return {
    group: {
      output: "narrator",
      policy: narratorPolicyOf(policy),
      smartPicker,
      speakerTags: true,
      groupNudge,
      autoMode,
      autoModeMaxTurns,
      autoModeDelayMs,
      memberCardVisibility,
      allowSelfResponses,
    },
  };
}

/** The roster-scoped display-name fallback map, with the AMBIGUOUS names withheld. A bare
 *  `.set(name, id)` over the cast collapsed two same-named cards onto whichever seat wrote last, so a
 *  pre-group-era line carrying only a name was attributed to the WRONG character — deterministically, and
 *  with no record. A name two seats share resolves to NOBODY (the write op's documented "absent ⇒ the run's
 *  primary") and is reported instead: guessing between two Elenis is exactly the silent misattribution the
 *  filename-keyed design exists to prevent. A UNIQUE name still resolves — the fallback is narrowed, not
 *  removed. */
function speakerNamesOf(
  group: CollectedGroup,
  seated: readonly { readonly file: string; readonly characterId: CharacterId }[],
  input: ImportProfileGroups,
): { readonly byName: ReadonlyMap<string, CharacterId>; readonly ambiguous: ImportAmbiguousSpeakerName[] } {
  // Keyed by the LOWERCASED name (the lookup key a transcript line matches against), carrying the card's own
  // casing for the report — the operator recognizes "Eleni", not "eleni".
  const seatsByName = new Map<string, { readonly display: string; readonly seats: Set<CharacterId> }>();
  for (const s of seated) {
    const display = input.characterNameByCardFilename.get(s.file)?.trim();
    if (display === undefined || display.length === 0) {
      continue;
    }
    const key = display.toLowerCase();
    const entry = seatsByName.get(key) ?? { display, seats: new Set<CharacterId>() };
    entry.seats.add(s.characterId);
    seatsByName.set(key, entry);
  }
  const byName = new Map<string, CharacterId>();
  const ambiguous: ImportAmbiguousSpeakerName[] = [];
  for (const [key, { display, seats }] of seatsByName) {
    const only = seats.size === 1 ? [...seats][0] : undefined;
    if (only === undefined) {
      ambiguous.push({ group: group.parsed.name, name: display, seats: seats.size });
      continue;
    }
    byName.set(key, only);
  }
  return { byName, ambiguous };
}

/** The members ST had DISABLED, resolved to the SEATS they became. THE SEATING IS THE RECORDED RULING
 *  (`contract/collection.ts` on `ParsedStGroup.disabledMemberFiles`: "still seated — the room's cast is the cast")
 *  and it stands; what changed is its INPUT. A wire that could only REPORT the flag as lost was one where the
 *  bulk-import wire seated a flat `CharacterId[]` with no knob channel; the wire now carries `seatKnobs`, so
 *  the member is seated AND muted through orb's own per-seat knob and the report says the flag travelled.
 *
 *  Only a RESOLVED member counts: an unresolved card is already reported as a skipped member, and a mute for
 *  a seat that does not exist is a knob the write op would (rightly) refuse. */
function disabledSeatsOf(
  group: CollectedGroup,
  seated: readonly { readonly file: string; readonly characterId: CharacterId }[],
): { readonly reported: ImportSeatedDisabledMember[]; readonly mutedSeats: CharacterId[] } {
  const disabled = new Set(group.parsed.disabledMemberFiles);
  const muted = seated.filter((s) => disabled.has(s.file));
  return {
    reported: muted.map((s) => ({ group: group.parsed.name, member: s.file })),
    mutedSeats: muted.map((s) => s.characterId),
  };
}

const REFUSAL_REASONS: Readonly<Record<GroupRefusal, string>> = {
  "no-member": "none of its member cards resolved to an imported or existing character",
  "no-transcript": "the group claimed no readable transcript under `group chats/`",
};

/** The refusal reason for a group that cannot become a room, or null when it is importable. */
function refusalFor(group: CollectedGroup, seatCount: number): string | null {
  const refusal = groupRefusal(group, seatCount);
  return refusal === null ? null : REFUSAL_REASONS[refusal];
}

/** ONE group's room(s), or the contained refusal. PER-GROUP ISOLATION lives here rather than in the wave loop:
 *  a refused seat or one malformed transcript is one skipped room, never an aborted wave. */
type GroupOutcome =
  | { readonly ok: true; readonly chatsImported: number; readonly memoryChatIds: readonly ChatId[]; readonly chatsPersonaHealed: number }
  | { readonly ok: false; readonly reason: string };

export function createImportGroupChats(ctx: ImportContext): Pick<ImportService, "importGroupChats"> {
  async function importOne(
    group: CollectedGroup,
    profile: ReturnType<typeof requireProfile>,
    seats: GroupSeats,
  ): Promise<{ readonly chatsImported: number; readonly memoryChatIds: readonly ChatId[]; readonly chatsPersonaHealed: number }> {
    const { seated, speakerByName, mutedSeats } = seats;
    // Proven non-empty by `refusalFor` before this runs; the fallback keeps the read total.
    const primary = seated[0];
    if (primary === undefined) {
      return { chatsImported: 0, memoryChatIds: [], chatsPersonaHealed: 0 };
    }
    const characterIds = seated.slice(1).map((s) => s.characterId);
    const metadata = metadataFor(group);
    // Both maps are SCOPED to this group's own seated cast — a display-name match can only ever land on a
    // character the room already seats, which is what keeps the fallback from reaching a same-named stranger.
    // (`speakerByName` additionally withholds the AMBIGUOUS names — see `speakerNamesOf`.)
    const speakerByFile = new Map(seated.map((s) => [s.file, s.characterId]));
    // Every transcript of ONE group shares the room's name, so same-day leaves collide by construction — the
    // suffix pass runs over the group's whole set, exactly as the solo wave runs it over a character's.
    const chats: BulkImportChatInput[] = disambiguateChatTitles(
      group.chats.map((c) =>
        buildGroupChatInput(c, {
          now: profile.now,
          ...(profile.stWallClockZone === undefined ? {} : { wallClockZone: profile.stWallClockZone }),
          roomName: group.parsed.name,
          personaByUserName: profile.personaByUserName,
          characterIds,
          mutedSeats,
          speakerByFile,
          speakerByName,
          metadata,
        }),
      ),
    );
    const counts = await profile.bulkImportChats({ ownerId: ctx.ownerId, characterId: primary.characterId, chats });
    return { chatsImported: counts.chatsImported, memoryChatIds: counts.realConversationsWritten, chatsPersonaHealed: counts.chatsPersonaHealed };
  }

  /** Import one group, converting BOTH refusal shapes — the precondition miss and a thrown write — into the
   *  same contained outcome, so the wave loop below has no error handling of its own. */
  async function runGroup(group: CollectedGroup, profile: ReturnType<typeof requireProfile>, seats: GroupSeats): Promise<GroupOutcome> {
    const refusal = refusalFor(group, seats.seated.length);
    if (refusal !== null) {
      return { ok: false, reason: refusal };
    }
    try {
      const result = await importOne(group, profile, seats);
      return { ok: true, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: message.split("\n").filter(Boolean).at(-1) ?? message };
    }
  }

  async function importGroupChats(input: ImportGroupsInput): Promise<ImportGroupsResult> {
    const profile = requireProfile(ctx);
    let groupsImported = 0;
    let groupChatsImported = 0;
    const memoryChatIds: ChatId[] = [];
    let chatsPersonaHealed = 0;
    const skippedGroups: ImportSkippedGroup[] = [];
    const skippedMembers: ImportSkippedGroupMember[] = [];
    // §5.7: collected across EVERY group's transcripts, including a group that is later refused — the pick
    // still did not travel, and the report says so.
    const unresolvedPins: ImportUnresolvedPinnedPersona[] = [];
    // Both collected across EVERY group, INCLUDING one later refused: an ambiguous name and a carried mute are
    // facts about the ST snapshot, not about whether this room happened to import.
    const ambiguousSpeakerNames: ImportAmbiguousSpeakerName[] = [];
    const seatedDisabledMembers: ImportSeatedDisabledMember[] = [];

    const seatings = input.profiles.flatMap((scope) => scope.groups.map((entry) => ({ group: entry, cards: scope })));
    for (const { group, cards } of seatings) {
      const { seated, skipped } = resolveMembers(group, cards.characterIdByCardFilename);
      skippedMembers.push(...skipped);
      unresolvedPins.push(...unresolvedPinnedPersonas(group.chats, profile.personaByUserName));
      const disabled = disabledSeatsOf(group, seated);
      seatedDisabledMembers.push(...disabled.reported);
      const names = speakerNamesOf(group, seated, cards);
      ambiguousSpeakerNames.push(...names.ambiguous);
      const outcome = await runGroup(group, profile, { seated, speakerByName: names.byName, mutedSeats: disabled.mutedSeats });
      if (!outcome.ok) {
        skippedGroups.push({ group: group.parsed.name, reason: outcome.reason });
        continue;
      }
      // A room counts as IMPORTED only when it actually wrote a transcript: a second byte-identical run dedups
      // every transcript by importHash, and counting the room again would report a no-op as work.
      groupsImported += outcome.chatsImported > 0 ? 1 : 0;
      groupChatsImported += outcome.chatsImported;
      memoryChatIds.push(...outcome.memoryChatIds);
      chatsPersonaHealed += outcome.chatsPersonaHealed;
    }

    return {
      groupsImported,
      groupChatsImported,
      skippedGroups,
      skippedMembers,
      memoryChatIds,
      unresolvedPinnedPersonas: unresolvedPins,
      chatsPersonaHealed,
      ambiguousSpeakerNames,
      seatedDisabledMembers,
    };
  }
  return { importGroupChats };
}
