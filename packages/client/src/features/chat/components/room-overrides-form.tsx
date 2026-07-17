// The room-overrides editor (task #28 — the CONTEXT panel's Overrides tab). The per-chat four-field
// host allowlist (`RoomOverrides`: mainPrompt · postHistory · scenario · authorsNote) as an autosave
// form (§13.4 — "flip it and it saves"), the same wiring shape as `appearance-settings-surface.tsx`.
// `authorsNote` is the shared at-depth injection directive (task #22): its textarea gains a depth
// (NumberField) + role (SelectField) beside it, mirroring the injections-manager/persona-editor controls,
// with the assistant@depth-0 prefill warning (the server `roomAuthorsNoteSchema` guard is the enforcer).
//
// SOURCE-AGNOSTIC (dual-mode, J2/J3): this editor owns the FORM + the form↔wire mapping, but NOT the
// read or the persist target — the surface supplies `roomOverrides` (the value) + `save` (the persist
// seam). A COMMITTED chat passes the `setRoomOverrides` verb + `ChatDetail.roomOverrides`; a DRAFT passes
// `setDraftRoomOverrides` + `draftConfig.roomOverrides`. Same editor, same look, only the seam differs —
// the "reuse the pluggable save seam" discipline (no parallel draft editor).
//
// HOST GATE: only the host may write. A non-host / read-only mount passes NO `save` — the factory is
// read-only (its documented no-persist shape) — and every field is `disabled`, so nothing submits.
// Empty ⇒ inherit (the map seam in `room-overrides-form-model.ts` omits empty fields on save).

import type { RoomOverrides } from "@orb/contracts/chat";
import { Icon, Info } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { createAutosaveEntityForm } from "#forms";
import { ASSISTANT_PREFILL_WARNING, MESSAGE_ROLE_ITEMS } from "#lib";
import type { RoomOverridesFormValues } from "../lib/room-overrides-form-model";
import { EMPTY_ROOM_OVERRIDES_FORM, fromRoomOverridesForm, isAuthorsNotePrefill, toRoomOverridesForm } from "../lib/room-overrides-form-model";

// The session-boundary autosave form (D78 L3). Built at MODULE scope (stable component identity, §13.1) —
// the boundary OWNS the entity key: it keys its private Session by `entityId`, so a chat switch with the
// Overrides tab open (this editor mounts under `ContextTabsPanel`, which keys by TAB id only) is a full
// teardown/remount seeded from the new chat's server row. Wrong key placement is unspellable — the lane-h
// wrapper-split that hand-keyed `RoomOverridesFormBody` is superseded (autosave-form-doctrine.md §1, §8).
// No module `config.save`: the persist fn closes over the live tRPC client (a React-context value
// unreachable here) — the SURFACE supplies `save` per-instance. No draft mirror (the server row is the
// durable store; a crash-mirror would duplicate synced truth — the appearance-form precedent).
const RoomOverridesFormBoundary = createAutosaveEntityForm<RoomOverridesFormValues>({
  defaultValues: EMPTY_ROOM_OVERRIDES_FORM,
});

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

/**
 * The Overrides tab body. The boundary owns identity: it keys its private Session by `entityId`, so the
 * whole form (its FormApi + this render-prop body) dies + is reborn when the chat identity changes — this
 * editor mounts under `ContextTabsPanel`, which keys by TAB id only, so without the boundary a chat switch
 * with the tab open would keep the SAME FormApi and its frozen seed, and one keystroke could autosave chat
 * A's overrides into chat B. The boundary keys by `entityId` regardless of mount site, so BOTH mount arms
 * (the committed Overrides tab and the draft arm in `draft-context-tabs.tsx`) are protected.
 */
export function RoomOverridesForm({ entityId, roomOverrides, isHost, save }: RoomOverridesFormProps): ReactElement {
  // Adapt the surface's overrides-level `save` to the boundary's form-values-level persist fn — the
  // form↔wire mapping (`fromRoomOverridesForm`) lives HERE so callers deal in domain `RoomOverrides`.
  // Read-only (no persist fn) unless a host save is supplied.
  const factorySave = isHost && save !== undefined ? (values: RoomOverridesFormValues): Promise<unknown> => save(fromRoomOverridesForm(values)) : undefined;

  return (
    // `save` spread, not passed as `undefined` — exactOptionalPropertyTypes; absent ⇒ the boundary is read-only.
    <RoomOverridesFormBoundary
      entityId={entityId}
      serverValues={toRoomOverridesForm(roomOverrides)}
      {...(factorySave === undefined ? {} : { save: factorySave })}
    >
      {({ form }): ReactElement => (
        <Stack gap="section">
          {/* ONE intro line (N4): per-field guidance moved to a `?` hint tooltip on each label. */}
          <Row gap="field" align="center">
            <Text as="span" tone="muted">
              <Icon icon={Info} size="xs" />
            </Text>
            <Text size="micro" tone="muted">
              {isHost
                ? "Empty fields inherit from the character or preset. Saved automatically."
                : "Only the host can edit these overrides. Empty fields inherit from the character or preset."}
            </Text>
          </Row>

          <form.AppField name="mainPrompt">
            {(field): ReactElement => (
              <field.TextareaField label="Main prompt" hint="Replaces the system / main prompt for this chat." disabled={!isHost} rows={4} />
            )}
          </form.AppField>

          <form.AppField name="postHistory">
            {(field): ReactElement => (
              <field.TextareaField label="Post-history instructions" hint="Appended after the chat history (the jailbreak slot)." disabled={!isHost} rows={3} />
            )}
          </form.AppField>

          <form.AppField name="scenario">
            {(field): ReactElement => (
              <field.TextareaField
                label="Scenario"
                hint="The shared situation — replaces each character's own scenario for this chat."
                disabled={!isHost}
                rows={3}
              />
            )}
          </form.AppField>

          <Stack gap="field">
            <form.AppField name="authorsNote">
              {(field): ReactElement => (
                <field.TextareaField
                  label="Author's note"
                  hint="A steering note spliced into the chat history at the depth + role below."
                  disabled={!isHost}
                  rows={2}
                />
              )}
            </form.AppField>
            <Row gap="field">
              <form.AppField name="authorsNoteDepth">
                {(field): ReactElement => (
                  <field.NumberField label="Depth" hint="0 = at the tail (just before the new turn); higher = further back." min={0} disabled={!isHost} />
                )}
              </form.AppField>
              <form.AppField name="authorsNoteRole">
                {(field): ReactElement => <field.SelectField label="Role" items={MESSAGE_ROLE_ITEMS} disabled={!isHost} />}
              </form.AppField>
            </Row>
            <form.Subscribe selector={(state): boolean => isAuthorsNotePrefill(state.values)}>
              {(prefill): ReactElement | null =>
                prefill ? (
                  <Text size="micro" tone="warning">
                    {ASSISTANT_PREFILL_WARNING}
                  </Text>
                ) : null
              }
            </form.Subscribe>
          </Stack>
        </Stack>
      )}
    </RoomOverridesFormBoundary>
  );
}
