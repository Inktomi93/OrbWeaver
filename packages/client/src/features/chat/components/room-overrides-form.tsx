// The room-overrides editor (task #28 — the CONTEXT panel's Overrides tab). The per-chat four-field
// host allowlist (`RoomOverrides`: mainPrompt · postHistory · scenario · authorsNote) as an autosave
// form (§13.4 — "flip it and it saves"), the same wiring shape as `appearance-settings-surface.tsx`.
//
// SOURCE-AGNOSTIC (dual-mode, J2/J3): this editor owns the FORM + the form↔wire mapping, but NOT the
// read or the persist target — the surface supplies `roomOverrides` (the value) + `save` (the persist
// seam). A COMMITTED chat passes the `setRoomOverrides` verb + `ChatDetail.roomOverrides`; a DRAFT passes
// `setDraftRoomOverrides` + `draftConfig.roomOverrides`. Same editor, same look, only the seam differs —
// the "reuse the pluggable save seam" discipline (no parallel draft editor).
//
// HOST GATE: only the host may write. A non-host / read-only mount passes NO `save` — the factory is
// read-only (its documented no-persist shape) — and every field is `disabled`, so nothing submits.
// Empty ⇒ inherit (the map seam in `use-room-overrides-form.ts` omits empty fields on save).

import type { RoomOverrides } from "@orb/contracts/chat";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { RoomOverridesFormValues } from "../hooks/use-room-overrides-form";
import {
  fromRoomOverridesForm,
  toRoomOverridesForm,
  useRoomOverridesForm,
} from "../hooks/use-room-overrides-form";

export interface RoomOverridesFormProps {
  /** The form's stable identity for seed/remount (committed → `room-overrides:${chatId}`; draft →
   *  `room-overrides:draft:${draftKey}`). */
  readonly entityId: string;
  /** The current overrides (committed → `ChatDetail.roomOverrides`; draft → `draftConfig.roomOverrides`). */
  readonly roomOverrides: RoomOverrides;
  /** Host → editable + autosaving; member/read-only → disabled fields, no persist. */
  readonly isHost: boolean;
  /** The persist seam (host only): committed → the `setRoomOverrides` verb, draft → `setDraftRoomOverrides`.
   *  Takes the mapped `RoomOverrides` (the form↔wire mapping stays inside this editor). Absent ⇒ read-only. */
  readonly save?: ((overrides: RoomOverrides) => Promise<unknown>) | undefined;
}

/** The Overrides tab body — the four host-allowlist fields as autosaving textareas. */
export function RoomOverridesForm({
  entityId,
  roomOverrides,
  isHost,
  save,
}: RoomOverridesFormProps): ReactElement {
  // Adapt the surface's overrides-level `save` to the factory's form-values-level persist fn — the
  // form↔wire mapping (`fromRoomOverridesForm`) lives HERE so callers deal in domain `RoomOverrides`.
  const factorySave =
    isHost && save !== undefined
      ? (values: RoomOverridesFormValues): Promise<unknown> => save(fromRoomOverridesForm(values))
      : undefined;

  const { form, mountKey } = useRoomOverridesForm({
    entityId,
    serverValues: toRoomOverridesForm(roomOverrides),
    // Read-only (no persist fn) unless a host save is supplied (spread, not `undefined` — exactOptional).
    ...(factorySave === undefined ? {} : { save: factorySave }),
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
