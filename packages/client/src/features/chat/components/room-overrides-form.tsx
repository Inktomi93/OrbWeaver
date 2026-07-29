// The room-overrides editor (task #28 — the CONTEXT panel's "This chat" tab, Field-overrides section).
// The per-chat four-field host allowlist (`RoomOverrides`: mainPrompt · postHistory · scenario ·
// authorsNote) as an autosave form (§13.4 — "flip it and it saves"), the same wiring shape as
// `appearance-settings-surface.tsx`.
//
// COLLAPSE-UNTIL-NEEDED (panel-redesign): the default per-chat state is zero overrides, so each field is a
// COMPACT collapse row (`Collapsible`) — muted "inheriting" when empty — rather than a wall of empty
// textareas. Clicking a row expands it into its editor; a SET field carries an ember left-edge accent + a
// one-line snippet + a Clear affordance so an override is legible at a glance while collapsed. `authorsNote`
// is the shared at-depth injection directive (task #22): its expanded editor gains a depth (NumberField) +
// role (SelectField, all three `MessageRole`s) beside it, with the assistant@depth-0 prefill warning (the
// server `roomAuthorsNoteSchema` guard is the enforcer). Empty ⇒ inherit (the map seam in
// `room-overrides-form-model.ts` omits empty fields on save; D108 merge-clear).
//
// SOURCE-AGNOSTIC (dual-mode, J2/J3): this editor owns the FORM + the form↔wire mapping, but NOT the
// read or the persist target — the surface supplies `roomOverrides` (the value) + `save` (the persist
// seam). A COMMITTED chat passes the `setRoomOverrides` verb + `ChatDetail.roomOverrides`; a DRAFT passes
// `setDraftRoomOverrides` + `draftConfig.roomOverrides`. Same editor, same look, only the seam differs —
// the "reuse the pluggable save seam" discipline (no parallel draft editor).
//
// HOST GATE: only the host may write. A non-host / read-only mount passes NO `save` — the factory is
// read-only (its documented no-persist shape) — and every field is `disabled` (no Clear affordance), so
// nothing submits.

import type { RoomOverrides } from "@orb/contracts/chat";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Eraser, Icon, Info } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import type { AutosaveSession } from "#forms";
import { createAutosaveEntityForm } from "#forms";
import { ASSISTANT_PREFILL_WARNING, MESSAGE_ROLE_ITEMS } from "#lib";
import type { RoomOverridesFormValues } from "../lib/room-overrides-form-model";
import { EMPTY_ROOM_OVERRIDES_FORM, fromRoomOverridesForm, isAuthorsNotePrefill, toRoomOverridesForm } from "../lib/room-overrides-form-model";

// The session-boundary autosave form (D78 L3). Built at MODULE scope (stable component identity, §13.1) —
// the boundary OWNS the entity key: it keys its private Session by `entityId`, so a chat switch with the
// tab open (this editor mounts under `ContextTabsPanel`, which keys by TAB id only) is a full
// teardown/remount seeded from the new chat's server row. Wrong key placement is unspellable — the lane-h
// wrapper-split that hand-keyed `RoomOverridesFormBody` is superseded (autosave-form-doctrine.md §1, §8).
// No module `config.save`: the persist fn closes over the live tRPC client (a React-context value
// unreachable here) — the SURFACE supplies `save` per-instance. No draft mirror (the server row is the
// durable store; a crash-mirror would duplicate synced truth — the appearance-form precedent).
const RoomOverridesFormBoundary = createAutosaveEntityForm<RoomOverridesFormValues>({
  defaultValues: EMPTY_ROOM_OVERRIDES_FORM,
});

// The boundary render-prop's form handle (the autosave `AppFormInstance` minus `reset`) — the shape the
// row components take to subscribe/clear their field.
type RoomOverridesFormApi = AutosaveSession<RoomOverridesFormValues>["form"];

// The presentational collapse card: the field name + inherit/override status live in the trigger (so a
// collapsed field is legible without mounting its editor), a one-line snippet + ember accent mark a SET
// field, and the editor + Clear live in the panel. Base UI's `Collapsible.Trigger` owns `aria-expanded`.
interface OverrideCollapseCardProps {
  readonly label: string;
  readonly isSet: boolean;
  readonly snippet: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onClear: () => void;
  /** No `save` seam (member / read-only): fields render disabled and the Clear affordance is omitted. */
  readonly disabled: boolean;
  /** Extra controls rendered in the panel footer beside Clear (author's-note depth + role). */
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}

function OverrideCollapseCard({ label, isSet, snippet, open, onOpenChange, onClear, disabled, footer, children }: OverrideCollapseCardProps): ReactElement {
  return (
    // padding="none" on the Card so the block padding lives on the trigger instead — the whole ~49px row is
    // then one tap target (WCAG 2.5.8), not a ~23px band with dead padding above/below. The snippet + panel
    // carry their own horizontal + bottom padding (the trigger's pad only reaches its own row).
    <Card padding="none" className={isSet ? "border-l-2 border-l-primary" : undefined}>
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger className="w-full p-block" aria-label={`${label}, ${isSet ? "overridden" : "inheriting"}`}>
          <Row align="center" gap="field" justify="between" className="flex-1">
            <Text weight="medium">{label}</Text>
            <Text size="micro" tone="muted">
              {isSet ? "overridden" : "inheriting"}
            </Text>
          </Row>
        </CollapsibleTrigger>
        {isSet && !open ? (
          <Text size="micro" tone="muted" className="line-clamp-1 px-block pb-block">
            {snippet}
          </Text>
        ) : null}
        <CollapsiblePanel>
          <Stack gap="field" className="px-block pb-block">
            {children}
            <Row align="center" gap="field">
              {footer}
              {disabled ? null : (
                <Button intent="ghost" size="sm" onClick={onClear}>
                  <Icon icon={Eraser} size="xs" />
                  Clear
                </Button>
              )}
            </Row>
          </Stack>
        </CollapsiblePanel>
      </Collapsible>
    </Card>
  );
}

interface OverrideRowProps {
  readonly form: RoomOverridesFormApi;
  readonly name: "mainPrompt" | "postHistory" | "scenario";
  readonly label: string;
  readonly rows: number;
  readonly disabled: boolean;
}

// A plain single-textarea override field. The row subscribes to its own value to drive the set/snippet
// state; the editor is a bare `Textarea` bound to the field (no repeated visible label — the trigger names
// it; `aria-label` carries the accessible name into the panel).
function OverrideRow({ form, name, label, rows, disabled }: OverrideRowProps): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <form.Subscribe selector={(state): string => state.values[name]}>
      {(value): ReactElement => (
        <OverrideCollapseCard
          label={label}
          isSet={value.trim() !== ""}
          snippet={value}
          open={open}
          onOpenChange={setOpen}
          onClear={(): void => form.setFieldValue(name, "")}
          disabled={disabled}
        >
          <form.AppField name={name}>
            {(field): ReactElement => (
              <Textarea
                aria-label={label}
                value={field.state.value}
                onChange={(e): void => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                rows={rows}
                disabled={disabled}
              />
            )}
          </form.AppField>
        </OverrideCollapseCard>
      )}
    </form.Subscribe>
  );
}

interface AuthorsNoteRowProps {
  readonly form: RoomOverridesFormApi;
  readonly disabled: boolean;
}

// The author's-note override — a textarea PLUS the at-depth directive controls (depth + role) and the
// assistant@depth-0 prefill warning, all inside the expanded panel.
function AuthorsNoteRow({ form, disabled }: AuthorsNoteRowProps): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <form.Subscribe selector={(state): string => state.values.authorsNote}>
      {(value): ReactElement => (
        <OverrideCollapseCard
          label="Author's note"
          isSet={value.trim() !== ""}
          snippet={value}
          open={open}
          onOpenChange={setOpen}
          onClear={(): void => form.setFieldValue("authorsNote", "")}
          disabled={disabled}
          footer={
            <>
              <form.AppField name="authorsNoteDepth">
                {(field): ReactElement => (
                  <field.NumberField label="Depth" hint="0 = at the tail (just before the new turn); higher = further back." min={0} disabled={disabled} />
                )}
              </form.AppField>
              <form.AppField name="authorsNoteRole">
                {(field): ReactElement => <field.SelectField label="Role" items={MESSAGE_ROLE_ITEMS} disabled={disabled} />}
              </form.AppField>
            </>
          }
        >
          <form.AppField name="authorsNote">
            {(field): ReactElement => (
              <Textarea
                aria-label="Author's note"
                value={field.state.value}
                onChange={(e): void => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                rows={2}
                disabled={disabled}
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(state): boolean => isAuthorsNotePrefill(state.values)}>
            {(prefill): ReactElement | null =>
              prefill ? (
                <Text size="micro" tone="warning">
                  {ASSISTANT_PREFILL_WARNING}
                </Text>
              ) : null
            }
          </form.Subscribe>
        </OverrideCollapseCard>
      )}
    </form.Subscribe>
  );
}

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
 * The Field-overrides section body. The boundary owns identity: it keys its private Session by `entityId`,
 * so the whole form (its FormApi + this render-prop body) dies + is reborn when the chat identity changes —
 * this editor mounts under `ContextTabsPanel`, which keys by TAB id only, so without the boundary a chat
 * switch with the tab open would keep the SAME FormApi and its frozen seed, and one keystroke could
 * autosave chat A's overrides into chat B. The boundary keys by `entityId` regardless of mount site, so
 * BOTH mount arms (the committed tab and the draft arm in `draft-context-tabs.tsx`) are protected.
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
        <Stack gap="field">
          {/* ONE intro line (N4): the fields self-describe via their collapse rows. */}
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

          <OverrideRow form={form} name="mainPrompt" label="Main prompt" rows={4} disabled={!isHost} />
          <OverrideRow form={form} name="postHistory" label="Post-history" rows={3} disabled={!isHost} />
          <OverrideRow form={form} name="scenario" label="Scenario" rows={3} disabled={!isHost} />
          <AuthorsNoteRow form={form} disabled={!isHost} />
        </Stack>
      )}
    </RoomOverridesFormBoundary>
  );
}
