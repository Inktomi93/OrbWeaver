// DeliveryCluster — the ONE delivery grammar (preset-surface-redesign.md §13, the owner's one-home charge
// made literal): role BESIDE depth, serving BOTH drill-ins — a prompt SECTION's (§5.2) and a guided
// TEMPLATE's (§6.1). Round-3 ruling, verbatim: "depth goes near whatever role it goes in as" — depth is a
// DELIVERY property, so it sits with the role it rides, while ORDER (the within-depth tiebreak) stays in
// the section's Placement cluster. One composite, one grammar; a second spelling of "delivered as" is the
// drift this file exists to prevent.
//
// PREFILL IS A POSITION, NOT A ROLE (§5.0, the ST receipt at `openai.js:1319-1331`): an assistant-role
// message at depth 0 IS the prefill-shaped configuration — a message at the prompt TAIL the model
// continues. So the cluster MARKS that configuration rather than offering a "prefill" role option; the
// role labels stay plain (`MESSAGE_ROLE_ITEMS`, the one vocabulary).
//
// PRESENTATIONAL BY CONSTRUCTION: the two consumers bind DIFFERENT form paths (`sections[i].role` +
// `sections[i].inject.depth` vs `guidedActions.<kind>.role` + `.depth`), and a section's depth is one half
// of an optional `inject` OBJECT (clearing it un-splices the section). Threading typed form paths through
// here would fork the composite per consumer; value+callback keeps it one component and leaves each
// caller's write semantics where they belong — with the caller.

import type { MessageRole } from "@orb/kit/message-role";
import { Field } from "@orb/ui/field";
import { Container, Grid, Stack } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { MESSAGE_ROLE_ITEMS } from "#lib";
import { PRESET_NUMBER_FORMAT } from "../lib/format-count";

/** The depth an absent value means — the TAIL (`guidedActionConfigSchema.depth`'s declared default, and
 *  the assembler's own splice floor). Named so the prefill test below reads as the rule it is. */
const TAIL_DEPTH = 0;

export interface DeliveryClusterProps {
  /** The FIRST track of the role/depth pair grid — the section drill-in's Name field. Templates pass
   *  nothing (a template's name is its registry row's, not the user's), and the pair then starts at Role.
   *  In the grid rather than above it so every control on the surface shares one right edge (F-9). */
  readonly leading?: ReactNode;
  /** `null` ⇒ this slot delivers with no role of its own (the `chat_history` pivot carries the
   *  transcript's own per-message roles), so the role half renders its explainer instead of a control. */
  readonly role: MessageRole | null;
  readonly onRoleChange: (next: MessageRole) => void;
  /** ONE VOCABULARY, BOTH DRILL-INS: "Role" (crunch-list O-10★, owner ruling — "Spoken as" / "Delivered
   *  as" were two names for one field). Still a prop rather than a constant because the ACCESSIBLE name
   *  belongs to the caller's surface, and the cluster is presentational by construction. */
  readonly roleLabel: string;
  /** `null` = unset. For a SECTION that means in-flow (no splice); for a TEMPLATE it means the tail. */
  readonly depth: number | null;
  /** ABSENT ⇒ this slot has no depth AT ALL and the half does not render — a plain-marker CARRIER declares
   *  no `inject` in the schema, so a depth field there would write a shape the contract rejects. The
   *  absence is the answer; never a disabled control. */
  readonly onDepthChange?: ((next: number | null) => void) | undefined;
  readonly depthLabel: string;
  /** What an empty depth means, stated in the field (never a value the field silently writes). */
  readonly depthPlaceholder: string;
  /** The explainer — hover-carried per the §4.1 hint rule: the datum stays visible, the teaching costs
   *  no line. */
  readonly depthHint: string;
  readonly depthMax: number;
}

export function DeliveryCluster({
  leading,
  role,
  onRoleChange,
  roleLabel,
  depth,
  onDepthChange,
  depthLabel,
  depthPlaceholder,
  depthHint,
  depthMax,
}: DeliveryClusterProps): ReactElement {
  // The tail-prefill mark: assistant + depth 0 (absent depth IS the tail). Rendered in ONE place for both
  // drill-ins — the per-wire normalization note is a fact about the wire, not about either surface.
  const tailPrefill = role === "assistant" && (depth ?? TAIL_DEPTH) === TAIL_DEPTH;
  return (
    <Stack gap="field">
      {/* ONE ROW, TWO DELIBERATE HALVES (crunch item 10 + the owner's live report, both drills). The pair
          used to tile on `cols="auto"` — auto-FIT, so the Relative/nudge arm (no depth half) collapsed the
          second track and stretched the Role select to the whole pane. `cols="pair"` holds both halves in
          both arms and stacks them only when the PANE is narrow, which is what the `<Container>` is for.
          The label baselines are the `Field` primitive's job and now hold by construction: its hint trigger
          no longer wears a 34px control box, so a hinted half and a plain one stand the same height.

          `leading` TAKES A PAIR TRACK OF ITS OWN (side-eye F-9): the section drill's Name field used to sit
          FULL-WIDTH above the pair, so one column carried two right edges — Name ending at 884, the selects
          under it at 627 — and the eye had to re-find the column edge on every row. ONE rule now holds for
          the whole preset surface: a labelled control occupies one PAIR TRACK, never the whole column.
          It is its OWN grid row rather than the pair's first cell, because role-BESIDE-depth is the
          round-3 ruling this cluster exists to hold — flowing three children through one pair grid would
          wrap depth onto the next line and split the pair. */}
      <Container>
        <Stack gap="field">
          {leading === undefined ? null : (
            <Grid cols="pair" gap="field">
              {leading}
            </Grid>
          )}
          <Grid cols="pair" gap="field">
            {role === null ? (
              <Text voice="gloss">The transcript carries each message's own speaker — this section has no single role.</Text>
            ) : (
              <Field label={roleLabel} name="delivery-role">
                <Select
                  aria-label={roleLabel}
                  items={MESSAGE_ROLE_ITEMS}
                  onValueChange={(next): void => {
                    if (typeof next === "string" && next !== "") {
                      onRoleChange(next as MessageRole);
                    }
                  }}
                  value={role}
                />
              </Field>
            )}
            {onDepthChange === undefined ? null : (
              <Field hint={depthHint} label={depthLabel} name="delivery-depth">
                <NumberField
                  aria-label={depthLabel}
                  // ONE editable-number grammar for the surface (side-eye F-23). Unformatted, this field's
                  // derived bounds description announced "Between 0 and 100,000" in the same a11y tree as
                  // a knob row's "Between 1 and 64000" — one family, two spellings, and the split was
                  // audible long after the visible deck was unified.
                  format={PRESET_NUMBER_FORMAT}
                  max={depthMax}
                  min={TAIL_DEPTH}
                  onValueChange={onDepthChange}
                  placeholder={depthPlaceholder}
                  size="inline"
                  step={1}
                  value={depth}
                />
              </Field>
            )}
          </Grid>
        </Stack>
      </Container>
      {tailPrefill ? (
        <Text voice="gloss">
          Tail prefill — an assistant message at the very end that the model continues. It is a position, not a role; wires without prefill support get it
          normalized into a plain message.
        </Text>
      ) : null}
    </Stack>
  );
}
