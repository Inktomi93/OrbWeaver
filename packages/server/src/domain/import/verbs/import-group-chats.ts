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
// ["Rowan.png", "Lisa.png"]` and stamps `original_avatar: "Rowan.png"` on every group-chat assistant line —
// the same key `settings.tag_map` uses and the same key the collector carries on `CollectedCard.filename`. Two
// cards named "Emily" disambiguate to handles `emily`/`emily-2` while keeping distinct filenames, so a
// name-keyed roster seats the wrong card in silence. A display-name match, SCOPED to this group's own roster,
// is the fallback for pre-group-era exports whose lines carry no `original_avatar`.
//
// ISOLATION IS PER GROUP AND PER MEMBER: a member card that is neither in this import set nor already in the
// library is SKIPPED with a report note (the room still forms around the members that did resolve); a group
// whose members ALL fail to resolve is skipped with a note. Neither aborts the wave.

import type { BulkImportChatInput, ChatMetadata } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import type { ImportContext } from "../context.ts";
import type { ImportGroupsResult } from "../contract/results.ts";
import type { ImportService } from "../contract/service.ts";
import type {
  CollectedGroup,
  GroupSeats,
  ImportAmbiguousSpeakerName,
  ImportGroupsInput,
  ImportSeatedDisabledMember,
  ImportSkippedGroup,
  ImportSkippedGroupMember,
  ImportUnresolvedPinnedPersona,
} from "../contract/views.ts";
import { requireProfile } from "../guard.ts";
import { buildGroupChatInput, disambiguateChatTitles, unresolvedPinnedPersonas } from "../substrate/chat-input.ts";

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
  const { policy, groupNudge, autoMode, autoModeMaxTurns, autoModeDelayMs, memberCardVisibility } = DEFAULT_GROUP_CONFIG;
  return {
    group: { output: "narrator", policy, speakerTags: true, groupNudge, autoMode, autoModeMaxTurns, autoModeDelayMs, memberCardVisibility, allowSelfResponses },
  };
}

/** Resolve one group's member FILENAMES against the run's card-filename → characterId map. Order is preserved
 *  (ST's own member order), and the FIRST resolved member becomes the room's primary — the character the write
 *  op scopes its dedup + branch resolution on. */
function resolveMembers(
  group: CollectedGroup,
  byFilename: ReadonlyMap<string, CharacterId>,
): { readonly seated: { readonly file: string; readonly characterId: CharacterId }[]; readonly skipped: ImportSkippedGroupMember[] } {
  const seated: { file: string; characterId: CharacterId }[] = [];
  const skipped: ImportSkippedGroupMember[] = [];
  for (const file of group.parsed.memberFiles) {
    const characterId = byFilename.get(file);
    if (characterId === undefined) {
      skipped.push({ group: group.parsed.name, member: file, reason: "no character with that card filename in the import set or the library" });
      continue;
    }
    // ST allows a member listed twice; one seat per card (the write op would refuse a duplicate roster row).
    if (!seated.some((s) => s.characterId === characterId)) {
      seated.push({ file, characterId });
    }
  }
  return { seated, skipped };
}

/** The roster-scoped display-name fallback map, with the AMBIGUOUS names withheld (#1469 item 5). A bare
 *  `.set(name, id)` over the cast collapsed two same-named cards onto whichever seat wrote last, so a
 *  pre-group-era line carrying only a name was attributed to the WRONG character — deterministically, and
 *  with no record. A name two seats share resolves to NOBODY (the write op's documented "absent ⇒ the run's
 *  primary") and is reported instead: guessing between two Emilys is exactly the silent misattribution the
 *  filename-keyed design exists to prevent. A UNIQUE name still resolves — the fallback is narrowed, not
 *  removed. */
function speakerNamesOf(
  group: CollectedGroup,
  seated: readonly { readonly file: string; readonly characterId: CharacterId }[],
  input: ImportGroupsInput,
): { readonly byName: ReadonlyMap<string, CharacterId>; readonly ambiguous: ImportAmbiguousSpeakerName[] } {
  // Keyed by the LOWERCASED name (the lookup key a transcript line matches against), carrying the card's own
  // casing for the report — the operator recognizes "Emily", not "emily".
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

/** The members ST had DISABLED, resolved to the SEATS they became (#1687). THE SEATING IS THE RECORDED RULING
 *  (`contract/views.ts` on `ParsedStGroup.disabledMemberFiles`: "still seated — the room's cast is the cast")
 *  and it stands; what changed is its INPUT. #1469 item 4 could only REPORT the flag as lost because the
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

/** The precondition a group must meet to become a room: at least one seated member AND at least one readable
 *  transcript. Returns the refusal reason, or null when the group is importable. */
function refusalFor(group: CollectedGroup, seatCount: number): string | null {
  if (seatCount === 0) {
    return "none of its member cards resolved to an imported or existing character";
  }
  return group.chats.length === 0 ? "the group claimed no readable transcript under `group chats/`" : null;
}

/** ONE group's room(s), or the contained refusal. PER-GROUP ISOLATION lives here rather than in the wave loop:
 *  a refused seat or one malformed transcript is one skipped room, never an aborted wave. */
type GroupOutcome =
  | { readonly ok: true; readonly chatsImported: number; readonly realConversation: boolean; readonly chatsPersonaHealed: number }
  | { readonly ok: false; readonly reason: string };

export function createImportGroupChats(ctx: ImportContext): Pick<ImportService, "importGroupChats"> {
  async function importOne(
    group: CollectedGroup,
    profile: ReturnType<typeof requireProfile>,
    seats: GroupSeats,
  ): Promise<{ readonly chatsImported: number; readonly realConversation: boolean; readonly chatsPersonaHealed: number }> {
    const { seated, speakerByName, mutedSeats } = seats;
    // Proven non-empty by `refusalFor` before this runs; the fallback keeps the read total.
    const primary = seated[0];
    if (primary === undefined) {
      return { chatsImported: 0, realConversation: false, chatsPersonaHealed: 0 };
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
          primaryCharacterId: primary.characterId,
          characterIds,
          mutedSeats,
          speakerByFile,
          speakerByName,
          metadata,
        }),
      ),
    );
    const counts = await profile.bulkImportChats({ ownerId: ctx.ownerId, characterId: primary.characterId, chats });
    return { chatsImported: counts.chatsImported, realConversation: counts.realConversationWritten, chatsPersonaHealed: counts.chatsPersonaHealed };
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
    let backfillNeeded = false;
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

    for (const group of input.groups) {
      const { seated, skipped } = resolveMembers(group, input.characterIdByCardFilename);
      skippedMembers.push(...skipped);
      unresolvedPins.push(...unresolvedPinnedPersonas(group.chats, profile.personaByUserName));
      const disabled = disabledSeatsOf(group, seated);
      seatedDisabledMembers.push(...disabled.reported);
      const names = speakerNamesOf(group, seated, input);
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
      backfillNeeded = backfillNeeded || outcome.realConversation;
      chatsPersonaHealed += outcome.chatsPersonaHealed;
    }

    return {
      groupsImported,
      groupChatsImported,
      skippedGroups,
      skippedMembers,
      backfillNeeded,
      unresolvedPinnedPersonas: unresolvedPins,
      chatsPersonaHealed,
      ambiguousSpeakerNames,
      seatedDisabledMembers,
    };
  }
  return { importGroupChats };
}
