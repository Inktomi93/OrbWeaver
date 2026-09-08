// The room-overrides editor (task #28 — the CONTEXT panel's "This chat" tab, Field-overrides section).
// The per-chat THREE-field host allowlist (`RoomOverrides`: mainPrompt · postHistory · scenario) as an
// autosave form (§13.4 — "flip it and it saves"), the same wiring shape as a settings SECTION
// (`appearance-message-style-section.tsx` and its siblings; SET-SEAMS decomposed the appearance surface
// this used to cite into those).
//
// NO author's-note field (owner ruling 2026-08-01): it was a SECOND home for the concept the Injections
// section beside this one already owns — both landed as the identical `in_chat` at-depth splice, so a
// system injection at depth 4 IS the author's note. These three fields are section-TEXT overrides only.
//
// COLLAPSE-UNTIL-NEEDED: the default per-chat state is zero overrides, so each field is a
// COMPACT collapse row (`Collapsible`) — muted "inheriting" when empty — rather than a wall of empty
// textareas. Clicking a row expands it into its editor; a SET field carries an ember left-edge accent + a
// one-line snippet + a Clear affordance so an override is legible at a glance while collapsed.
// Empty ⇒ inherit (the map seam in `room-overrides-form-model.ts` omits empty fields on save; D108
// merge-clear).
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
import type { AutosaveSession } from "#forms/editor";
import { createAutosaveEntityForm } from "#forms/editor";
import type { RoomOverridesFormValues } from "../lib/room-overrides-form-model.ts";
import { EMPTY_ROOM_OVERRIDES_FORM, fromRoomOverridesForm, toRoomOverridesForm } from "../lib/room-overrides-form-model.ts";

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
  readonly children: ReactNode;
}

function OverrideCollapseCard({ label, isSet, snippet, open, onOpenChange, onClear, disabled, children }: OverrideCollapseCardProps): ReactElement {
  return (
    // `!p-0` so the block padding lives on the trigger instead — the whole ~49px row is then one tap target
    // (WCAG 2.5.8), not a ~23px band with dead padding above/below. The snippet + panel carry their own
    // horizontal + bottom padding (the trigger's pad only reaches its own row). A className, not the retired
    // `padding` prop: island padding is tier-resolved now (density-pass §4.3, D7), and "this island delegates
    // its padding to its own trigger" is a composition fact, not a density step. The `!` is load-bearing:
    // the tier map is UNLAYERED, so a plain `p-0` utility (layer `utilities`) loses to it inside a Surface —
    // proven by this component's own CT (the card's top edge must hit the trigger, not dead padding).
    <Card className={isSet ? "!p-0 border-l-2 border-l-primary" : "!p-0"}>
      <Collapsible open={open} onOpenChange={onOpenChange}>
        {/* `size="control"` pins the pointer-conditional `--spacing-control-sm` floor (44px coarse / 32px
            fine). MEASURED at 411×40 under a coarse pointer with `::after` resolving `inset: auto` — no
            touch layer in play at all — and `elementFromPoint` ±3px outside the box resolving to something
            else, i.e. a real 40px hit area against the 44px floor, on the tab's first three controls
            (side-eye 2026-08-30 §5-P2, #822). The rule row's fire-log disclosure took the same arm for the
            same reason; growing the floor on the VARIANT rather than with a call-site height is what keeps
            it pointer-conditional (a fine pointer's 32px is under the shipped 40px, so the desktop box is
            unchanged) and inside the `ui-size-via-variant` seal. */}
        <CollapsibleTrigger className="w-full p-block" size="control" aria-label={`${label}, ${isSet ? "overridden" : "inheriting"}`}>
          <Row align="center" gap="field" justify="between" className="flex-1">
            <Text voice="label">{label}</Text>
            <Text voice="gloss">{isSet ? "overridden" : "inheriting"}</Text>
          </Row>
        </CollapsibleTrigger>
        {isSet && !open ? (
          // The padding lives on the WRAPPER, not on the clamped run (#847) — `line-clamp-1` clamps the
          // CONTENT box while `overflow: hidden` clips at the PADDING box, so a `pb-block` on the clamped
          // element is ~12px of visible area below the clamp point that the clamped-away line 2 paints
          // into. The injections-manager site carries the full derivation.
          <Stack className="px-block pb-block">
            <Text voice="gloss" className="line-clamp-1">
              {snippet}
            </Text>
          </Stack>
        ) : null}
        <CollapsiblePanel>
          <Stack gap="field" className="px-block pb-block">
            {children}
            <Row align="center" gap="field">
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
    // The seam is DECLARED, never omitted (client-forms-01): a host persists, a member mount says
    // `readOnly` — so the boundary itself refuses to autosave rather than relying on every field below
    // remembering `disabled={!isHost}`.
    <RoomOverridesFormBoundary
      entityId={entityId}
      serverValues={toRoomOverridesForm(roomOverrides)}
      {...(factorySave === undefined ? ({ readOnly: true } as const) : { save: factorySave })}
    >
      {({ form }): ReactElement => (
        <Stack gap="field">
          {/* ONE intro line (N4): the fields self-describe via their collapse rows. */}
          <Row gap="field" align="center">
            <Text as="span" voice="gloss">
              <Icon icon={Info} size="xs" />
            </Text>
            <Text voice="gloss">
              {isHost
                ? "Empty fields inherit from the character or preset. Saved automatically."
                : "Only the host can edit these overrides. Empty fields inherit from the character or preset."}
            </Text>
          </Row>

          <OverrideRow form={form} name="mainPrompt" label="Main prompt" rows={4} disabled={!isHost} />
          <OverrideRow form={form} name="postHistory" label="Post-history" rows={3} disabled={!isHost} />
          <OverrideRow form={form} name="scenario" label="Scenario" rows={3} disabled={!isHost} />
        </Stack>
      )}
    </RoomOverridesFormBoundary>
  );
}
