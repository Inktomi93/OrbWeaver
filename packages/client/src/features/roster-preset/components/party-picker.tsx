// The Saved-parties modal body (RP2 — docs/design/saved-rosters-build-record.md §3): the owner's party
// library with the three affordance families the program doc's §6 sketches, in ONE surface:
//   · per row — START a chat from the party (members in position order + the anchor persona through the
//     REAL `useStartChat`, then the `applyToChat` polish call for knobs + config: two calls is CORRECT,
//     call 1 alone yields a fully valid room and the polish is idempotently retryable);
//   · per row — ADD the party to the OPEN room (additive `applyToChat`; result toast "Added N…"),
//     rendered only when a room is open (the server's host gate refuses a non-host with chat's own
//     leak-free error — the affordance itself stays capability-quiet rather than lying);
//   · the header — SAVE the open room's CURRENT cast as a new party (author-by-example: present
//     character seats + their live knobs + the room's effective group config + the anchor persona),
//     rendered only when the viewer HOSTS the open room.
//
// All three states ship (features/README §4.6): the designed EMPTY state (with the save-current action
// when hosting), the shape-matched skeleton (the modal def's QueryBoundary), and QueryBoundary's error
// arm. Freshness is bus-driven end to end: `rosterPresetsChanged` covers the list, `chatUpdated` covers
// the room the apply mutated.

import type { RosterPresetSummary } from "@orb/contracts/roster-preset";
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
import { useActivePartyChat, useSavedParties } from "../hooks/use-saved-parties.ts";

/** Derived, not re-minted (no-inline-types): the hook's own return shapes. */
type SavedPartySummary = RosterPresetSummary;
type ActivePartyChat = NonNullable<ReturnType<typeof useActivePartyChat>>;

/** The apply outcome, said as one short sentence (the §6 result toast). */
function applySentence(result: {
  readonly added: readonly unknown[];
  readonly alreadyPresent: readonly unknown[];
  readonly skipped: readonly unknown[];
}): string {
  const parts = [`Added ${result.added.length}`];
  if (result.alreadyPresent.length > 0) {
    parts.push(`${result.alreadyPresent.length} already here`);
  }
  if (result.skipped.length > 0) {
    parts.push(`${result.skipped.length} skipped`);
  }
  return parts.join(" · ");
}

/** One party row: name + member preview + the row actions. `canAddToChat` = a room is open AND the
 *  viewer HOSTS it (program doc §6 — the add door is capability-driven and HIDDEN for a non-host, the
 *  D16 precedent; the server's own host gate stays the enforcement, this is just not offering a
 *  dead-end). */
function PartyRow(props: {
  readonly party: SavedPartySummary;
  readonly canAddToChat: boolean;
  readonly busy: boolean;
  readonly onStart: (party: SavedPartySummary) => void;
  readonly onAddToChat: (party: SavedPartySummary) => void;
  readonly onDelete: (party: SavedPartySummary) => void;
}): ReactElement {
  const { party, canAddToChat, busy, onStart, onAddToChat, onDelete } = props;
  const memberNames = party.members.map((m) => m.name).join(", ");
  return (
    <Row align="center" gap="field" padding="block" className="border-border border-b last:border-b-0" data-slot="party-row">
      <Stack gap="tight" className="min-w-0 flex-1">
        <Row align="center" gap="field">
          <Text voice="label" className="truncate">
            {party.name}
          </Text>
          <Badge intent="neutral" tone="soft">
            {party.memberCount}
          </Badge>
        </Row>
        <Text voice="gloss" className="truncate">
          {memberNames}
        </Text>
      </Stack>
      <Row align="center" gap="tight" className="shrink-0">
        <Button disabled={busy} intent="ghost" size="sm" onClick={(): void => onStart(party)} aria-label={`Start a chat with ${party.name}`}>
          <Icon icon={MessagesSquare} size="sm" />
          Start
        </Button>
        {canAddToChat ? (
          <Button disabled={busy} intent="ghost" size="sm" onClick={(): void => onAddToChat(party)} aria-label={`Add ${party.name} to this chat`}>
            <Icon icon={UserPlus} size="sm" />
            Add to chat
          </Button>
        ) : null}
        <Button disabled={busy} intent="ghost" size="icon-sm" onClick={(): void => onDelete(party)} aria-label={`Delete ${party.name}`}>
          <Icon icon={Trash2} size="sm" />
        </Button>
      </Row>
    </Row>
  );
}

/** The header's author-by-example door — snapshot the OPEN room's cast into a named party. */
function SaveCurrentParty(props: { readonly active: ActivePartyChat; readonly busy: boolean; readonly onSave: (name: string) => void }): ReactElement {
  const [name, setName] = useState("");
  const trimmed = name.trim();
  return (
    <Row align="center" gap="field">
      <Input
        aria-label="New party name"
        placeholder="Name this party…"
        value={name}
        onChange={(e): void => setName(e.target.value)}
        className="min-w-0 flex-1"
      />
      <Button
        className="shrink-0"
        disabled={props.busy || trimmed.length === 0}
        intent="outline"
        size="sm"
        onClick={(): void => {
          props.onSave(trimmed);
          setName("");
        }}
      >
        <Icon icon={Users} size="sm" />
        Save current party
      </Button>
    </Row>
  );
}

export function PartyPicker(): ReactElement {
  const parties = useSavedParties();
  const active = useActivePartyChat();
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreateRosterPreset({ trpc, invalidation });
  const remove = useRemoveRosterPreset({ trpc, invalidation });
  const apply = useApplyRosterPreset({ trpc, invalidation });
  const { startChat, isPending: isStarting } = useStartChat();
  const [confirmDelete, setConfirmDelete] = useState<SavedPartySummary | null>(null);
  const busy = isStarting || create.isPending || remove.isPending || apply.isPending;

  const onStart = (party: SavedPartySummary): void => {
    if (isStarting) {
      return; // one creation at a time — a double-fire would mint two rooms for one intent.
    }
    startChat({ characterIds: party.members.map((m) => m.characterId), anchorPersonaId: party.anchorPersonaId })
      .then(async (chatId) => {
        closeModal();
        // The POLISH call — knobs + group config onto the fresh room. Silent on full success (§6);
        // a partial (the delete-mid-apply race) surfaces as words.
        const result = await apply.mutateAsync({ presetId: party.id, chatId });
        if (result.skipped.length > 0) {
          notify.info(`${result.skipped.length} member${result.skipped.length === 1 ? "" : "s"} skipped — a character was deleted.`);
        }
      })
      .catch(() => undefined); // both mutations toast their own failures; the picked state survives for retry.
  };

  const onAddToChat = (party: SavedPartySummary): void => {
    if (active === null) {
      return;
    }
    apply
      .mutateAsync({ presetId: party.id, chatId: active.chatId })
      .then((result) => {
        notify.success(applySentence(result));
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
      notify.warn("This room has no character cast to save yet.");
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
        },
      })
      .then((view) => notify.success(`Saved “${view.name}” — ${view.members.length} member${view.members.length === 1 ? "" : "s"}.`))
      .catch(() => undefined); // errorToast owns the failure copy (e.g. the duplicate-name conflict).
  };

  return (
    <Stack gap="section">
      {active?.isHost === true ? <SaveCurrentParty active={active} busy={busy} onSave={onSave} /> : null}
      {parties.length === 0 ? (
        <EmptyState
          icon={<Icon icon={Users} size="lg" />}
          title="No saved parties yet"
          description={
            active?.isHost === true
              ? "Save this room's cast above, and it becomes a party you can drop into any new chat."
              : "Open a chat you host and save its cast as a party — then start new rooms from it in one pick."
          }
          action={
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
          }
        />
      ) : (
        <Stack gap="row">
          {parties.map((party) => (
            <PartyRow
              canAddToChat={active?.isHost === true}
              busy={busy}
              key={party.id}
              onAddToChat={onAddToChat}
              onDelete={setConfirmDelete}
              onStart={onStart}
              party={party}
            />
          ))}
        </Stack>
      )}
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open): void => {
          if (!open) {
            setConfirmDelete(null);
          }
        }}
        title="Delete this party?"
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
