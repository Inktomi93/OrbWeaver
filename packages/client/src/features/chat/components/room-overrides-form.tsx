// The room-overrides editor (task #28 — the CONTEXT panel's Overrides tab). The per-chat four-field
// host allowlist (`RoomOverrides`: mainPrompt · postHistory · scenario · authorsNote) as an autosave
// form (§13.4 — "flip it and it saves"), the same wiring shape as `appearance-settings-surface.tsx`:
// the module-scope factory hook (`useRoomOverridesForm`) receives its persist fn at CALL time (the
// `useSetRoomOverrides` mutation's `mutateAsync`, which closes over the live tRPC client).
//
// HOST GATE: only the host may write (server enforces `requireHost`; the client mirrors it so members
// see the values but disabled). A non-host mount passes NO `save` — the factory is read-only (its
// documented no-persist shape) — and every field is `disabled`, so there is nothing to submit.
//
// The read is `ChatDetail.roomOverrides` (already on `getChat` — no new query); the surface passes it
// in. Empty ⇒ inherit (the map seam in `use-room-overrides-form.ts` omits empty fields on save).

import type { RoomOverrides } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useSetRoomOverrides } from "../hooks/use-context-panel-mutations";
import type { RoomOverridesFormValues } from "../hooks/use-room-overrides-form";
import {
  fromRoomOverridesForm,
  ROOM_OVERRIDES_ENTITY_PREFIX,
  toRoomOverridesForm,
  useRoomOverridesForm,
} from "../hooks/use-room-overrides-form";

export interface RoomOverridesFormProps {
  readonly chatId: ChatId;
  /** The chat's current overrides (from `ChatDetail.roomOverrides`). */
  readonly roomOverrides: RoomOverrides;
  /** Host → editable + autosaving; member → read-only (disabled fields, no persist). */
  readonly isHost: boolean;
}

/** The Overrides tab body — the four host-allowlist fields as autosaving textareas. */
export function RoomOverridesForm({
  chatId,
  roomOverrides,
  isHost,
}: RoomOverridesFormProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setOverrides = useSetRoomOverrides({ trpc, invalidation });

  const save = (values: RoomOverridesFormValues): Promise<unknown> =>
    setOverrides.mutateAsync({ chatId, overrides: fromRoomOverridesForm(values) });

  const { form, mountKey } = useRoomOverridesForm({
    entityId: `${ROOM_OVERRIDES_ENTITY_PREFIX}${chatId}`,
    serverValues: toRoomOverridesForm(roomOverrides),
    // Non-host: no persist fn ⇒ read-only form (spread, not `undefined` — exactOptionalPropertyTypes).
    ...(isHost ? { save } : {}),
  });

  return (
    <Stack key={mountKey} gap="section">
      <Text size="label" tone="muted">
        {isHost
          ? "Overrides for this chat only. Leave a field empty to inherit from the character or preset. Changes save automatically."
          : "Only the host can edit these overrides. Empty fields inherit from the character or preset."}
      </Text>

      <form.AppField name="mainPrompt">
        {(field): ReactElement => (
          <field.TextareaField
            label="Main prompt"
            description="Replaces the system / main prompt for this chat."
            disabled={!isHost}
            rows={4}
          />
        )}
      </form.AppField>

      <form.AppField name="postHistory">
        {(field): ReactElement => (
          <field.TextareaField
            label="Post-history instructions"
            description="Appended after the chat history (the jailbreak slot)."
            disabled={!isHost}
            rows={3}
          />
        )}
      </form.AppField>

      <form.AppField name="scenario">
        {(field): ReactElement => (
          <field.TextareaField
            label="Scenario"
            description="The shared situation — replaces each character's own scenario for this chat."
            disabled={!isHost}
            rows={3}
          />
        )}
      </form.AppField>

      <form.AppField name="authorsNote">
        {(field): ReactElement => (
          <field.TextareaField
            label="Author's note"
            description="A steering note injected near the end of the prompt."
            disabled={!isHost}
            rows={2}
          />
        )}
      </form.AppField>
    </Stack>
  );
}
