// The Saved-casts modal body (RP2 — docs/design/saved-rosters-build-record.md §3): the owner's cast
// library with the three affordance families the program doc's §6 sketches, in ONE surface:
//   · per row — START a chat from the cast (members in position order + the anchor persona through the
//     REAL `useStartChat`, then the `applyToChat` polish call for knobs + config: two calls is CORRECT,
//     call 1 alone yields a fully valid room and the polish is idempotently retryable);
//   · per row — ADD the cast to the OPEN room (additive `applyToChat`; result toast "Added N…"),
//     rendered only when a room is open (the server's host gate refuses a non-host with chat's own
//     leak-free error — the affordance itself stays capability-quiet rather than lying);
//   · the header — SAVE the open room's CURRENT cast as a new saved cast (author-by-example: present
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
import { useActiveCastChat, useSavedCasts } from "../hooks/use-saved-casts.ts";

/** Derived, not re-minted (no-inline-types): the hook's own return shapes. */
type SavedCastSummary = RosterPresetSummary;
type ActiveCastChat = NonNullable<ReturnType<typeof useActiveCastChat>>;

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

/** One cast row: name + member preview + the row actions. `canAddToChat` = a room is open AND the
 *  viewer HOSTS it (program doc §6 — the add door is capability-driven and HIDDEN for a non-host, the
 *  D16 precedent; the server's own host gate stays the enforcement, this is just not offering a
 *  dead-end). */
function CastRow(props: {
  readonly cast: SavedCastSummary;
  readonly canAddToChat: boolean;
  readonly busy: boolean;
  readonly onStart: (cast: SavedCastSummary) => void;
  readonly onAddToChat: (cast: SavedCastSummary) => void;
  readonly onDelete: (cast: SavedCastSummary) => void;
}): ReactElement {
  const { cast, canAddToChat, busy, onStart, onAddToChat, onDelete } = props;
  const memberNames = cast.members.map((m) => m.name).join(", ");
  return (
    <Row align="center" gap="field" padding="block" className="border-border border-b last:border-b-0" data-slot="cast-row">
      <Stack gap="tight" className="min-w-0 flex-1">
        <Row align="center" gap="field">
          <Text voice="label" className="truncate">
            {cast.name}
          </Text>
          <Badge intent="neutral" tone="soft">
            {cast.memberCount}
          </Badge>
        </Row>
        <Text voice="gloss" className="truncate">
          {memberNames}
        </Text>
      </Stack>
      <Row align="center" gap="tight" className="shrink-0">
        <Button disabled={busy} intent="ghost" size="sm" onClick={(): void => onStart(cast)} aria-label={`Start a chat with ${cast.name}`}>
          <Icon icon={MessagesSquare} size="sm" />
          Start
        </Button>
        {canAddToChat ? (
          <Button disabled={busy} intent="ghost" size="sm" onClick={(): void => onAddToChat(cast)} aria-label={`Add ${cast.name} to this chat`}>
            <Icon icon={UserPlus} size="sm" />
            Add to chat
          </Button>
        ) : null}
        <Button disabled={busy} intent="ghost" size="icon-sm" onClick={(): void => onDelete(cast)} aria-label={`Delete ${cast.name}`}>
          <Icon icon={Trash2} size="sm" />
        </Button>
      </Row>
    </Row>
  );
}

/** The header's author-by-example door — snapshot the OPEN room's cast into a named cast. */
function SaveCurrentCast(props: { readonly active: ActiveCastChat; readonly busy: boolean; readonly onSave: (name: string) => void }): ReactElement {
  const [name, setName] = useState("");
  const trimmed = name.trim();
  return (
    <Row align="center" gap="field">
      <Input aria-label="New cast name" placeholder="Name this cast…" value={name} onChange={(e): void => setName(e.target.value)} className="min-w-0 flex-1" />
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
        Save current cast
      </Button>
    </Row>
  );
}

export function CastPicker(): ReactElement {
  const casts = useSavedCasts();
  const active = useActiveCastChat();
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreateRosterPreset({ trpc, invalidation });
  const remove = useRemoveRosterPreset({ trpc, invalidation });
  const apply = useApplyRosterPreset({ trpc, invalidation });
  const { startChat, isPending: isStarting } = useStartChat();
  const [confirmDelete, setConfirmDelete] = useState<SavedCastSummary | null>(null);
  const busy = isStarting || create.isPending || remove.isPending || apply.isPending;

  const onStart = (cast: SavedCastSummary): void => {
    if (isStarting) {
      return; // one creation at a time — a double-fire would mint two rooms for one intent.
    }
    // @orb-gate-ignore caught-failure-ownership(promise:startChat): startChat and apply.mutateAsync each carry their own errorToast (use-start-chat.ts, useApplyRosterPreset); the swallow only silences the unhandled-rejection warning, and the picked cast survives for retry. Ends if either mutation stops owning its failure copy.
    startChat({ characterIds: cast.members.map((m) => m.characterId), anchorPersonaId: cast.anchorPersonaId })
      .then(async (chatId) => {
        closeModal();
        // The POLISH call — knobs + group config onto the fresh room. Silent on full success (§6);
        // a partial (the delete-mid-apply race) surfaces as words.
        const result = await apply.mutateAsync({ presetId: cast.id, chatId });
        if (result.skipped.length > 0) {
          notify.info(`${result.skipped.length} member${result.skipped.length === 1 ? "" : "s"} skipped — a character was deleted.`);
        }
      })
      .catch(() => undefined); // both mutations toast their own failures; the picked state survives for retry.
  };

  const onAddToChat = (cast: SavedCastSummary): void => {
    if (active === null) {
      return;
    }
    apply
      .mutateAsync({ presetId: cast.id, chatId: active.chatId })
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
      {active?.isHost === true ? <SaveCurrentCast active={active} busy={busy} onSave={onSave} /> : null}
      {casts.length === 0 ? (
        <EmptyState
          icon={<Icon icon={Users} size="lg" />}
          title="No saved casts yet"
          description={
            active?.isHost === true
              ? "Save this room's cast above, and it becomes a cast you can drop into any new chat."
              : "Open a chat you host and save it as a cast — then start new rooms from it in one pick."
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
          {casts.map((cast) => (
            <CastRow
              canAddToChat={active?.isHost === true}
              busy={busy}
              key={cast.id}
              onAddToChat={onAddToChat}
              onDelete={setConfirmDelete}
              onStart={onStart}
              cast={cast}
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
        title="Delete this cast?"
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
