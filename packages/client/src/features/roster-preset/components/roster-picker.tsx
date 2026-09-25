// The Saved-rosters modal body: the owner's roster
// library with the three affordance families the program doc's §6 sketches, in ONE surface:
//   · per row — START a chat from the roster (members in position order + the anchor persona through the
//     REAL `useStartChat`, then the `applyToChat` polish call for knobs + config: two calls is CORRECT,
//     call 1 alone yields a fully valid room and the polish is idempotently retryable);
//   · per row — ADD the roster to the OPEN room (additive `applyToChat`; result toast "Added N…"),
//     rendered only when a room is open (the server's host gate refuses a non-host with chat's own
//     leak-free error — the affordance itself stays capability-quiet rather than lying);
//   · the header — SAVE the open room's CURRENT roster as a new saved roster (author-by-example: present
//     character seats + their live knobs + the room's effective group config + the anchor persona +
//     the room's ENABLED rule presets, B10's rules rider — capture derives from `listRules` mint
//     provenance and the include-line shows what rides), rendered only when the viewer HOSTS the room.
//
// All three states ship (features/README §4.6): the designed EMPTY state (with the save-current action
// when hosting), the shape-matched skeleton (the modal def's QueryBoundary), and QueryBoundary's error
// arm. Freshness is bus-driven end to end: `rosterPresetsChanged` covers the list, `chatUpdated` covers
// the room the apply mutated.
//
// THE WORD IS `roster`, AND IT IS NOT A LOCAL CHOICE (#1650). This family named a saved RosterPresetSummary
// value `cast` in ~60 places, which is neither of the two concepts that word can mean: docs/law/vocabulary-map.md
// row 4 gives `character` to the seated characters in a room and row 46 gives Roster / `rosterPreset` to this
// saved template, "CONFORMING, never renamed". A value of that type is a `roster` here and in every sibling
// module; look the word up in the map rather than off a neighbour before re-opening it.

import type { RulePresetView } from "@orb/contracts/automation";
import type { ApplyRosterPresetResult, RosterPresetSummary } from "@orb/contracts/roster-preset";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, MessagesSquare, Trash2, UserPlus, Users } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog } from "#components";
import { useInvalidation, useStartChat, useTRPC } from "#data";
import { notify } from "#lib";
import { closeModal, openModal } from "#state";
import { useApplyRosterPreset, useCreateRosterPreset, useRemoveRosterPreset } from "../hooks/use-roster-preset-mutations.ts";
import type { CapturedRosterRule, RosterRuleCapture } from "../hooks/use-saved-rosters.ts";
import { useActiveRosterChat, useRosterRuleCapture, useRulePresetCatalogue, useSavedRosters } from "../hooks/use-saved-rosters.ts";
import { applyNotice, characterCountPhrase, rosterCountsSuffix, rosterRuleLine } from "../lib/roster-copy.ts";

/** Derived, not re-minted (no-inline-types): the hook's own return shape. */
type SavedRosterSummary = RosterPresetSummary;

/** One roster row: name + member preview + the row actions. `canAddToChat` = a room is open AND the
 *  viewer HOSTS it (program doc §6 — the add door is capability-driven and HIDDEN for a non-host, the
 *  D16 precedent; the server's own host gate stays the enforcement, this is just not offering a
 *  dead-end).
 *
 *  THE ROW ADAPTS TO ITS OWN BOX, NOT THE VIEWPORT (side-eye 2026-08-29 P1-1). Measured at the row's real
 *  316px width inside the 430×932 dialog, with the three actions a HOST sees: the name rendered at **0px**
 *  (natural 57) and the rules badge overlapped Start by 48px, so `elementFromPoint` at the badge's own
 *  centre returned Start — a tap on "2 rules" minted a room. The cause is a `shrink-0` action cluster that
 *  is sized by the COARSE touch floor (an unbudgeted width tax) against a name that was free to shrink to
 *  nothing. Both halves are fixed here: under `@md` the row stacks (name+badge line, actions line — each
 *  owns the full width, so nothing competes), and the name itself is `min-w-0 flex-1 truncate` inside its
 *  own line so it degrades to an ellipsis rather than to zero. `@container` sits on the row WRAPPER
 *  because an element cannot query itself. The crossover sits between the two measured points: 316px was
 *  broken, 480px was clean, both pinned in the CT width matrix under both pointers.
 *
 *  THE COUNTS RIDE THE ACCESSIBLE NAMES (P2-1). Nine tab stops and not one said that applying this roster
 *  switches automation on in the room; the badges are visual-only (a `<span>` has no name to carry), so
 *  the consent information goes where the keyboard actually lands — the two APPLY doors' own names. The
 *  member count also moves into the subtitle beside the member NAMES, which is the one grammar the two
 *  badges never had: a bare digit read as decoration next to a labelled pill. */
function RosterRow(props: {
  readonly roster: SavedRosterSummary;
  readonly canAddToChat: boolean;
  readonly busy: boolean;
  readonly onStart: (roster: SavedRosterSummary) => void;
  readonly onAddToChat: (roster: SavedRosterSummary) => void;
  readonly onDelete: (roster: SavedRosterSummary) => void;
}): ReactElement {
  const { roster, canAddToChat, busy, onStart, onAddToChat, onDelete } = props;
  const memberNames = roster.members.map((m) => m.name).join(", ");
  const counts = rosterCountsSuffix(roster.characterCount, roster.rules.length, roster.hasGroupConfig);
  return (
    <Stack gap="tight" padding="block" className="@container border-border border-b last:border-b-0" data-slot="roster-row">
      <Row align="center" gap="field" className="@max-md:flex-col @max-md:items-stretch">
        <Stack gap="tight" className="min-w-0 flex-1">
          <Row align="center" gap="field">
            <Text voice="label" className="min-w-0 flex-1 truncate">
              {roster.name}
            </Text>
            {roster.rules.length > 0 ? (
              <Badge className="shrink-0" intent="neutral" tone="soft">
                {roster.rules.length} rule{roster.rules.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {/* #1032 — the THIRD thing an apply carries. `hasGroupConfig` was served and never read, so a
                roster that also rewrites the room's reply mode / speaker labels / card visibility wore the
                same face as one that only adds seats. Same badge grammar as the rules pill; the word is the
                settings section's own ("Group behavior"), and the fact rides the apply doors' accessible
                names through `rosterCountsSuffix` — a `<span>` badge has no name to carry it. */}
            {roster.hasGroupConfig ? (
              <Badge className="shrink-0" intent="neutral" tone="soft">
                group behavior
              </Badge>
            ) : null}
          </Row>
          <Text voice="gloss" className="truncate">
            {characterCountPhrase(roster.characterCount)} · {memberNames}
          </Text>
        </Stack>
        <Row align="center" gap="tight" justify="end" className="shrink-0">
          <Button disabled={busy} intent="ghost" size="sm" onClick={(): void => onStart(roster)} aria-label={`Start a chat with ${roster.name}${counts}`}>
            <Icon icon={MessagesSquare} size="sm" />
            Start
          </Button>
          {canAddToChat ? (
            <Button disabled={busy} intent="ghost" size="sm" onClick={(): void => onAddToChat(roster)} aria-label={`Add ${roster.name} to this chat${counts}`}>
              <Icon icon={UserPlus} size="sm" />
              Add to chat
            </Button>
          ) : null}
          {/* The destructive door keeps a bare name: the counts inform CONSENT to apply, and a delete that
              recited them would read as though it were deleting the members too. */}
          <Button disabled={busy} intent="ghost" size="icon-sm" onClick={(): void => onDelete(roster)} aria-label={`Delete ${roster.name}`}>
            <Icon icon={Trash2} size="sm" />
          </Button>
        </Row>
      </Row>
    </Stack>
  );
}

/** The id the Save button points its `aria-describedby` at — the include-line IS the button's reason,
 *  both when it explains what will ride and when it explains why the button is waiting. */
const INCLUDE_LINE_ID = "roster-rules-include";

/** The include-line — the consent sentence, in ALL FOUR of its arms (side-eye P2-3). The wording of the
 *  populated arm is untouched and must stay: it says "rule" (never bare "preset" — the 2026-08-24
 *  vocabulary ruling), NAMES the rules rather than counting them, and appears BEFORE the save press. It
 *  rides `prose` — the LENGTH modifier, not a taste knob (`rule-preset-picker.tsx`'s precedent for exactly
 *  this class of sentence): this is the one line answering "what will this roster do to my room", it now
 *  carries knob values as well as titles, and at the 10.5px micro step it was the smallest text in the
 *  dialog — below the input's own placeholder. What
 *  it gains is its knob gloss (P2-2 — two rosters carrying one preset at different knobs were byte-identical)
 *  and its three missing states: a room with no enabled rules used to render exactly the same nothing as a
 *  read still in flight and as a read that had FAILED — and since Save waits for the capture, a failed
 *  `automation.listRules` disabled it forever, silently and with no retry. */
function RosterRulesIncludeLine(props: {
  readonly capture: RosterRuleCapture;
  readonly presetOf: (id: CapturedRosterRule["rulePresetId"]) => RulePresetView | undefined;
}): ReactElement {
  const { capture, presetOf } = props;
  if (capture.status === "loading") {
    return (
      <Text voice="gloss" prose={true} data-slot={INCLUDE_LINE_ID} id={INCLUDE_LINE_ID}>
        Checking this room's rules…
      </Text>
    );
  }
  if (capture.status === "error") {
    return (
      <Row align="center" gap="field">
        <Text voice="gloss" prose={true} data-slot={INCLUDE_LINE_ID} id={INCLUDE_LINE_ID}>
          Couldn't check this room's rules.
        </Text>
        <Button intent="ghost" size="sm" onClick={capture.retry}>
          Retry
        </Button>
      </Row>
    );
  }
  if (capture.rules.length === 0) {
    return (
      <Text voice="gloss" prose={true} data-slot={INCLUDE_LINE_ID} id={INCLUDE_LINE_ID}>
        No enabled rules to include.
      </Text>
    );
  }
  return (
    <Text voice="gloss" prose={true} data-slot={INCLUDE_LINE_ID} id={INCLUDE_LINE_ID}>
      Includes {capture.rules.length} enabled rule{capture.rules.length === 1 ? "" : "s"}:{" "}
      {capture.rules.map((rule) => rosterRuleLine(presetOf(rule.rulePresetId), rule.rulePresetId, rule.knobs)).join(", ")}
    </Text>
  );
}

/** The header's author-by-example door — snapshot the OPEN room's roster into a named roster. B10's rules
 *  rider: the room's enabled rule presets ride the save (capture-all — the same author-by-example
 *  semantics as the member snapshot: curate by configuring the room, then save), and the include-line
 *  SHOWS what rides so the later apply's consent is informed (build record §6.5). Save waits for the
 *  capture read — a roster silently missing its rules would be the worse failure — and now SAYS SO, through
 *  the include-line it points `aria-describedby` at. */
function SaveCurrentRoster(props: {
  readonly busy: boolean;
  readonly capture: RosterRuleCapture;
  readonly presetOf: (id: CapturedRosterRule["rulePresetId"]) => RulePresetView | undefined;
  readonly onSave: (name: string) => void;
}): ReactElement {
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const { capture, presetOf } = props;
  return (
    <Stack gap="tight">
      <Row align="center" gap="field">
        <Input
          aria-label="New roster name"
          placeholder="Name this roster…"
          value={name}
          onChange={(e): void => setName(e.target.value)}
          className="min-w-0 flex-1"
        />
        <Button
          aria-describedby={INCLUDE_LINE_ID}
          className="shrink-0"
          disabled={props.busy || trimmed.length === 0 || capture.status !== "ready"}
          intent="outline"
          size="sm"
          onClick={(): void => {
            props.onSave(trimmed);
            setName("");
          }}
        >
          <Icon icon={Users} size="sm" />
          Save this room's roster
        </Button>
      </Row>
      {/* WHY THE BUTTON IS DIM, SAID OUT LOUD (#848). "Save this room's roster" is disabled until the field
          carries a name, and nothing on screen said so — a host read a permanently-dead control beside an
          empty box (side-eye 2026-08-30). The line appears only in the state it explains, and only when
          the OTHER disabling condition (the rules capture still reading) is not the live one, so it can
          never claim the wrong reason. */}
      {trimmed.length === 0 && capture.status === "ready" ? <Text voice="gloss">Name this roster to save it.</Text> : null}
      <RosterRulesIncludeLine capture={capture} presetOf={presetOf} />
    </Stack>
  );
}

export function RosterPicker(): ReactElement {
  const rosters = useSavedRosters();
  const active = useActiveRosterChat();
  const ruleCapture = useRosterRuleCapture(active);
  // The catalogue is a static CODE catalogue and every door in this surface needs it: the include-line's
  // knob gloss, and the apply report's naming of a REFUSED rule (which can happen from the library plane,
  // with no room open at all — so it is not gated on hosting the way the capture read is).
  const catalogue = useRulePresetCatalogue(true);
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreateRosterPreset({ trpc, invalidation });
  const remove = useRemoveRosterPreset({ trpc, invalidation });
  const apply = useApplyRosterPreset({ trpc, invalidation });
  const { startChat, isPending: isStarting } = useStartChat();
  const [confirmDelete, setConfirmDelete] = useState<SavedRosterSummary | null>(null);
  const busy = isStarting || create.isPending || remove.isPending || apply.isPending;

  /** The ONE apply report, said by every door (side-eye P1-2: the Start door applied a roster's rules in
   *  total silence, discarding the `rulesSkipped` REASONS the build record §6.4 requires be reported —
   *  and that is the exact click B10's own acceptance test names). */
  const reportApply = (roster: SavedRosterSummary, result: ApplyRosterPresetResult, started: boolean): void => {
    const notice = applyNotice({ rosterName: roster.name, result, started, ruleTitleOf: catalogue.titleOf });
    notify[notice.channel](notice.line);
  };

  const onStart = (roster: SavedRosterSummary): void => {
    if (isStarting) {
      return; // one creation at a time — a double-fire would mint two rooms for one intent.
    }
    // @orb-waive caught-failure-ownership(startChat): startChat and apply.mutateAsync each carry their own errorToast (use-start-chat.ts, useApplyRosterPreset); the swallow only silences the unhandled-rejection warning, and the picked roster survives for retry. Ends if either mutation stops owning its failure copy.
    startChat({
      characterIds: roster.members.map((m) => m.characterId),
      anchorPersonaId: roster.anchorPersonaId,
      // The room is named after the roster it was started from (side-eye P3-4): the name was discarded the
      // moment it was used, so a room born from "Spire Trio" showed as its character list.
      title: roster.name,
    })
      .then(async (chatId) => {
        closeModal();
        // The POLISH call — knobs + group config + the rules rider onto the fresh room. It REPORTS: a
        // room that silently differs from the roster the host picked is the defect, not the noise.
        reportApply(roster, await apply.mutateAsync({ presetId: roster.id, chatId }), true);
      })
      .catch(() => undefined); // both mutations toast their own failures; the picked state survives for retry.
  };

  const onAddToChat = (roster: SavedRosterSummary): void => {
    if (active === null) {
      return;
    }
    apply
      .mutateAsync({ presetId: roster.id, chatId: active.chatId })
      .then((result) => {
        reportApply(roster, result, false);
        closeModal();
      })
      .catch(() => undefined); // errorToast owns the failure copy.
  };

  const onSave = (name: string): void => {
    if (active === null) {
      return;
    }
    // Author-by-example (§6): the room's PRESENT character seats in roster order, their live knobs, the
    // effective group config, and the anchor persona. flatMap narrows the nullable characterId — a
    // character seat always carries one, but the union type cannot say so.
    const seats = active.detail.participants.flatMap((p) =>
      p.kind === "character" && p.characterId !== null && p.leftSeq === null
        ? [{ characterId: p.characterId, talkativeness: p.talkativeness, disabled: p.disabled }]
        : [],
    );
    if (seats.length === 0) {
      notify.warn("This room has no characters to save yet.");
      return;
    }
    create
      .mutateAsync({
        input: {
          name,
          description: "",
          anchorPersonaId: active.detail.anchorPersonaId,
          groupConfig: active.detail.group,
          members: seats.map((seat, index) => ({
            kind: "character" as const,
            characterId: seat.characterId,
            position: index,
            talkativeness: seat.talkativeness,
            disabled: seat.disabled,
          })),
          // B10's rules rider — the room's enabled rule presets ride the snapshot (the Save button
          // waits for the capture read, so `?? []` only covers the impossible-by-gating mount).
          rules: ruleCapture.rules.map((rule) => ({ rulePresetId: rule.rulePresetId, knobs: rule.knobs })),
        },
      })
      .then((view) =>
        notify.success(
          `Saved “${view.name}” — ${characterCountPhrase(view.members.length)}${view.rules.length > 0 ? `, ${view.rules.length} rule${view.rules.length === 1 ? "" : "s"}` : ""}.`,
        ),
      )
      .catch(() => undefined); // errorToast owns the failure copy (e.g. the duplicate-name conflict).
  };

  // THE LIBRARY LEADS, THE SAVE DOOR FOLLOWS (side-eye P3-1). The door into this surface is the Members
  // toolbar's "Saved rosters…" — an APPLY verb — and it opened onto a name field, so a host who came to add
  // was met with a form for the opposite action. The label is the spec's own,
  // so the ORDER moves rather than the word: the rosters you can add are what a "Saved rosters…" click owes
  // you, and saving the current room stays one glance below (it is authoring, not the errand).
  return (
    <Stack gap="section">
      {rosters.length === 0 ? (
        <EmptyState
          icon={<Icon icon={Users} size="lg" />}
          title="No saved rosters yet"
          description={
            active?.isHost === true
              ? "Save this room's roster below, and it becomes a roster you can drop into any new chat."
              : "Open a chat you host and save it as a roster — then start new rooms from it in one pick."
          }
          // THE EMPTY STATE'S CTA MAY NOT ABANDON THE ROOM IT WAS OPENED FROM (#848). "Start a new chat"
          // was the emphasised action in EVERY empty arm — including the host's, where it closes this
          // modal, closes the room the host is configuring, and offers a different errand entirely, while
          // the thing they CAN do here ("Save this room's roster", one glance below) sat as a dim ghost. A host
          // gets no competing CTA: the description already routes them to the save row below, which is the
          // only action this surface can complete. The NON-host arm keeps it, because there the CTA is
          // honest — saving needs a room you host, and starting one is how you get one.
          {...(active?.isHost === true
            ? {}
            : {
                action: (
                  <Button
                    intent="outline"
                    size="sm"
                    onClick={(): void => {
                      closeModal();
                      openModal("newChat");
                    }}
                  >
                    <Icon icon={MessagesSquare} size="sm" />
                    Start a new chat
                  </Button>
                ),
              })}
        />
      ) : (
        <Stack gap="row">
          {rosters.map((roster) => (
            <RosterRow
              canAddToChat={active?.isHost === true}
              busy={busy}
              key={roster.id}
              onAddToChat={onAddToChat}
              onDelete={setConfirmDelete}
              onStart={onStart}
              roster={roster}
            />
          ))}
        </Stack>
      )}
      {active?.isHost === true ? <SaveCurrentRoster busy={busy} capture={ruleCapture} presetOf={catalogue.presetOf} onSave={onSave} /> : null}
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open): void => {
          if (!open) {
            setConfirmDelete(null);
          }
        }}
        title="Delete this roster?"
        description={confirmDelete === null ? "" : `“${confirmDelete.name}” is a saved template — chats you started from it are untouched.`}
        confirmLabel="Delete"
        onConfirm={(): void => {
          if (confirmDelete !== null) {
            remove.mutate({ presetId: confirmDelete.id });
            setConfirmDelete(null);
          }
        }}
      />
    </Stack>
  );
}
