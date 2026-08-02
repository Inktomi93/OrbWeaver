// The guided-template / nudge DRILL-IN — a template's ONE editing home (preset-surface-redesign.md §6.1,
// audit §16 row 23). The round-4 inline accordion is DEAD (owner: "that's a no-two-homes thing"): template
// rows speak the §5.0 ONE-LIST-GRAMMAR exactly as rack rows do — the name selects, the chevron drills, and
// every editor is a drill-in with a back row. Same SHAPE as the section drill-in, fewer clusters.
//
// CAPABILITY-DRIVEN, NOT A HARDCODED LAYOUT (owner-ratified: "flexible and extendable so it's not a bitch
// and a half"): the editor maps the def's `caps` through an exhaustive
// `Record<TemplateCapability["kind"], …>` — the house Record-not-switch dispatch. A NEW capability kind
// fails `tsc` at that Record until its renderer exists, and a def declaring NO capabilities renders
// text-only BY DERIVATION (which is why the nudges need no branch on their name).
//
// WHAT NEVER RENDERS HERE (§5.0, and the §16 row-31 absence the audit pins): zone, splice ORDER, triggers,
// override locks. Those are ARRANGEMENT vocabulary — a section's. A guided template's firing condition is
// the user's CLICK, so `fires` is a descriptive gloss and never a control.

import type { PromptConfig, TemplateCapability } from "@orb/contracts/preset";
import { MAX_INJECTION_DEPTH } from "@orb/kit/injection";
import type { MessageRole } from "@orb/kit/message-role";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { AlertTriangle, ArrowLeft, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef } from "react";
import type { AppFormInstance } from "#forms";
import { useFocusOnSwap } from "#lib";
import { GUIDED_INPUT_TOKEN } from "../lib/assembly-model";
import type { TemplateRow } from "../lib/template-rows";
import { DeliveryCluster } from "./delivery-cluster";
import { PresetMacroSuggestions } from "./preset-macro-suggestions";

type PresetForm = AppFormInstance<PromptConfig>;

const DEPTH_HINT = "0 = the tail, right before the reply; N = N turns back from your latest message. Blank means the tail.";
/** The GHOST an unset depth means. Short by construction (crunch item 10 / O-14): the inline NumberField is
 *  a `--width-number-inline` (5rem) mono cell, and the old "0 — the tail" clipped to "0 — the t…" — the one
 *  datum the ghost exists to state was the half that got cut. Same string in the section drill-in. */
const DEPTH_PLACEHOLDER = "0 · tail";

export interface TemplateDrillInProps {
  readonly form: PresetForm;
  readonly row: TemplateRow;
  readonly onBack: () => void;
}

export function TemplateDrillIn({ form, row, onBack }: TemplateDrillInProps): ReactElement {
  const { def } = row;
  // Focus lands on the way OUT, not on <body> (side-eye F-04) — the chevron that opened this editor is
  // gone with the list. The RESTORE half is the list's (`actions-view.tsx`).
  const backRef = useRef<HTMLButtonElement>(null);
  useFocusOnSwap(backRef);
  return (
    <Stack aria-label={`${def.label} — template editor`} gap="section" role="region">
      <Row align="center" gap="row">
        <Button intent="ghost" onClick={onBack} ref={backRef} size="sm" type="button">
          <Icon icon={ArrowLeft} size="sm" />
          Back to actions
        </Button>
      </Row>

      <Stack gap="tight">
        <Row align="center" gap="field">
          <Text voice="label">{def.label}</Text>
          {/* The SAME chip the list row wears (crunch items 7/14) — outlined neutral, one kind vocabulary
              drawn one way on both surfaces. */}
          <Badge intent="neutral" size="sm" tone="ghost">
            {def.kind}
          </Badge>
        </Row>
        {/* DESCRIPTIVE ONLY — never a control (§5.0, owner-ratified). */}
        <Text voice="gloss">{def.fires}</Text>
      </Stack>

      {/* NO "Template" kicker over a field ALSO labelled "Template" (side-eye F-32): the drill-in header
          names the template, the field label names the slot — two levels, not three. */}
      <TemplateBody form={form} row={row} />

      <CapabilityFields form={form} row={row} />
    </Stack>
  );
}

/** The template text — ONE field, ghosting the PROSE-1 default when empty. Clearing IS the reset (§16 row
 *  24 — the same grammar the section bodies now speak).
 *
 *  NO FIELD LABEL (side-eye F-32): the drill-in header already names the template and the cluster kicker
 *  already says "Template", so a third label on the textarea was the same word at three levels. The
 *  accessible name moves to `aria-label` — the datum reaches AT, the eye stops reading it twice. */
function TemplateBody({ form, row }: { readonly form: PresetForm; readonly row: TemplateRow }): ReactElement {
  const { def, guidedKind, factoryDefault } = row;
  const placeholder = factoryDefault === "" ? "Blank — nothing is emitted until you write something here." : factoryDefault;
  const label = "Template";
  return (
    <PresetMacroSuggestions form={form}>
      {(suggestions): ReactElement =>
        guidedKind === undefined ? (
          <form.AppField name={`formatStrings.${def.id}` as "formatStrings.continueNudge"}>
            {(field): ReactElement => <field.MacroField label={label} placeholder={placeholder} rows={4} suggestions={suggestions} />}
          </form.AppField>
        ) : (
          <form.AppField name={`guidedActions.${guidedKind}.prompt`}>
            {(field): ReactElement => <field.MacroField label={label} placeholder={placeholder} rows={4} suggestions={suggestions} />}
          </form.AppField>
        )
      }
    </PresetMacroSuggestions>
  );
}

/** THE CAPABILITY DISPATCH (§6.6). Exhaustive over `TemplateCapability["kind"]` by construction: a new
 *  member is a `tsc` error HERE until it has a renderer, which is what keeps "a new template = one enum
 *  member + one def row" true without the editor forking per template. */
const CAPABILITY_RENDERERS: Record<TemplateCapability["kind"], (props: CapabilityProps) => ReactElement | null> = {
  // role + depth are ONE composite (the shared DeliveryCluster), so the ROLE renderer draws the pair and
  // the DEPTH renderer draws nothing — declaring `depth` without `role` is not a shape any def has, and
  // splitting one control across two renderers would be the two-homes defect in miniature.
  role: (props) => <DeliveryFields {...props} />,
  depth: () => null,
  tokens: (props) => <TokenVocabulary {...props} />,
};

interface CapabilityProps {
  readonly form: PresetForm;
  readonly row: TemplateRow;
  readonly capability: TemplateCapability;
}

function CapabilityFields({ form, row }: { readonly form: PresetForm; readonly row: TemplateRow }): ReactElement | null {
  const rendered = row.def.caps.map((capability, at) => {
    const render = CAPABILITY_RENDERERS[capability.kind];
    const node = render({ form, row, capability });
    return node === null ? null : <Stack key={`${capability.kind}-${String(at)}`}>{node}</Stack>;
  });
  if (rendered.every((node) => node === null)) {
    return null;
  }
  return <>{rendered}</>;
}

/** The `role` capability — the SHARED DeliveryCluster, the same grammar a section's drill-in speaks, with
 *  the conditional tail-prefill mark rendered in its one home. */
function DeliveryFields({ form, row }: CapabilityProps): ReactElement | null {
  const guidedKind = row.guidedKind;
  if (guidedKind === undefined) {
    return null;
  }
  return (
    <Section kicker="Delivery">
      <form.Subscribe
        selector={(state): { role: MessageRole; depth: number | null } => ({
          role: state.values.guidedActions?.[guidedKind].role ?? "system",
          depth: state.values.guidedActions?.[guidedKind].depth ?? null,
        })}
      >
        {({ role, depth }): ReactElement => (
          <DeliveryCluster
            depth={depth}
            depthHint={DEPTH_HINT}
            depthLabel="At depth"
            depthMax={MAX_INJECTION_DEPTH}
            depthPlaceholder={DEPTH_PLACEHOLDER}
            onDepthChange={(next): void => form.setFieldValue(`guidedActions.${guidedKind}.depth`, next ?? undefined)}
            onRoleChange={(next): void => form.setFieldValue(`guidedActions.${guidedKind}.role`, next)}
            role={role}
            roleLabel="Role"
          />
        )}
      </form.Subscribe>
    </Section>
  );
}

/** The `tokens` capability — the substitution vocabulary this template may use, plus the ONE lint that
 *  bites: a NON-EMPTY template that dropped `{{input}}` really does throw the steer away (an EMPTY one is
 *  the ghosted default, where the bare input is exactly what lands). */
function TokenVocabulary({ form, row, capability }: CapabilityProps): ReactElement | null {
  if (capability.kind !== "tokens") {
    return null;
  }
  const { def, guidedKind } = row;
  const tokens = capability.tokens;
  return (
    // THE CHIPS ARE A NAMED LIST, not two floating glyphs (side-eye F-17). They sat 30px under DELIVERY
    // with no kicker and no role, so nothing on screen said what they were or whether they were pressable —
    // and in the a11y tree they were bare text CONCATENATED into the preceding NumberField's bounds hint
    // ("Between 0 and 100,000 {{input}} {{person}}"), i.e. a screen-reader user heard them as part of a
    // number range. A `Section` kicker names them, and `list`/`listitem` gives the run a boundary and a
    // count so they can never fuse into a neighbour's description again. They stay NON-interactive on
    // purpose (§5.0: this is a reference vocabulary, not an insert palette) — which is exactly why the
    // structure has to say so instead of leaving a reader to guess.
    <Section kicker="Macros this template can use">
      {/* MACRO PILLS ARE MONO NEUTRAL (crunch item 14): a row of bright-blue `{{input}}`/`{{person}}`
          pills was the loudest thing in the editor for what is a reference LIST — you read it once. The
          mocks paint the substitution vocabulary as quiet outlined chips, and the mono face is what says
          "this is a literal you type", which the colour was standing in for. */}
      <Row align="center" gap="field" role="list">
        {tokens.map((token) => (
          <Badge className="font-mono" intent="neutral" key={token} role="listitem" size="sm" tone="ghost">
            {token}
          </Badge>
        ))}
      </Row>
      {guidedKind === undefined || !tokens.includes(GUIDED_INPUT_TOKEN) ? null : (
        <form.Subscribe selector={(state): string => state.values.guidedActions?.[guidedKind].prompt ?? ""}>
          {(prompt): ReactElement | null =>
            prompt.trim() === "" || prompt.includes(GUIDED_INPUT_TOKEN) ? null : (
              // The warning SIGNAL rides the band + the glyph, never a `tone` prop on Text — type colour
              // belongs to the four-voice grammar (§2).
              <Row align="center" className="rounded-base border border-warning bg-warning/10 text-warning" gap="field" padding="row">
                <Icon icon={AlertTriangle} size="sm" />
                <Text voice="label">
                  No {GUIDED_INPUT_TOKEN} — what you type when you fire {def.label} will not land anywhere.
                </Text>
              </Row>
            )
          }
        </form.Subscribe>
      )}
    </Section>
  );
}
