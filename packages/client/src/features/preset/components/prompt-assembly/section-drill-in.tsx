// SectionDrillIn — ONE OBJECT, ONE PLACE (preset-surface-redesign.md §5.2, F5 dead). A section used to
// edit in three geographies: its body in the CENTER drill-in, its placement/triggers/locks in the CONTEXT
// inspector, its enable/reorder on the rack row. The inspector and its form bridge are DELETED; this
// drill-in owns the WHOLE section, in the ruled order:
//
//   body (kind-branched — section-body.tsx) → DELIVERY (name · role · inject depth) → PLACEMENT (zone ·
//   order) → TRIGGERS → OVERRIDE LOCKS
//
// Round-3 ruling, verbatim: "depth goes near whatever role it goes in as" — DEPTH is a delivery property
// and rides the shared `DeliveryCluster`; ORDER (the within-depth tiebreak) is arrangement vocabulary and
// stays in Placement beside Zone. They are SEPARATE fields, never the fused `@depth · order` spelling
// (that fusion is legal only as the rack row's read-only CUE).
//
// DEPTH AND ORDER ARE IN-CHAT VOCABULARY (crunch-list O-9★, owner ruling). The zone is the two DELIVERIES
// the assembler performs (`ZONE_ITEMS`): RELATIVE renders into the system block ordered among the prompts
// and has no depth to speak of; IN CHAT splices at a depth. So both fields render ONLY on the In-Chat arm
// — ABSENT, never disabled (the `628a3666` supportsArrangement precedent) — and moving a section back to
// Relative CLEARS its splice, because `injectionDepthFor` honours an explicit `inject.depth` whatever side
// of the pivot the row sits on: leaving one behind would splice a section the editor now calls relative.
//
// SELECT ≠ DRILL (§16 row 19): a rack row CLICK selects (the CONTEXT readout echoes — that echo IS the
// inspect view); the row's chevron / Enter drills HERE. The header's enable Switch is the §16-row-18
// SANCTIONED ECHO of the rack toggle: while drilled the primary home is off-screen, and an editor
// silently editing a disabled section hides the one state that makes every field moot. Both bind the SAME
// `sections[i].enabled` path — one writer by construction.
//
// THE STRUCTURAL SET (§5.2, ST parity): a MARKER's ⋯ menu omits Duplicate and Delete ENTIRELY (never a
// disabled Delete) — its one off-switch is the enable toggle; a LITERAL keeps the full set; the PIVOT
// (`chat_history`) can be neither deleted, disabled, silenced, nor re-zoned, so it offers no menu at all
// and no Placement/Triggers cluster (a trigger filter is silencing by another name).

import type { GenerationType, PromptConfig, PromptSection } from "@orb/contracts/preset";
import { MAX_INJECTION_DEPTH } from "@orb/kit/injection";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { ArrowLeft, Copy, GitFork, Icon } from "@orb/ui/icons";
import { Container, Grid, Row, Section, Stack } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { NumberField } from "@orb/ui/number-field";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef } from "react";
import { RowActionsMenu } from "#components";
import type { AppFormInstance } from "#forms";
import { useFocusOnSwap } from "#lib";
import {
  GENERATION_TYPE_ITEMS,
  hasRoleField,
  headerCopy,
  isPivotSection,
  isStructuralSection,
  isTemplatedMarker,
  OVERRIDABLE_MARKERS,
  sectionGlyphIcon,
  supportsArrangement,
  ZONE_ITEMS,
} from "../../lib/assembly-model";
import { DeliveryCluster } from "../delivery-cluster";
import type { DerivedZones } from "./derive-zones";
import { deriveZones } from "./derive-zones";
import { SectionBody } from "./section-body";

type AssemblyForm = AppFormInstance<PromptConfig>;

/** The assembler's own within-depth default (`injections.ts`) — the ORDER field's blank-means-this text. */
const DEFAULT_INJECT_ORDER = 100;
const DEPTH_HINT = "0 = the tail, right before the reply; N = N turns back from your latest message. Leave it empty and it lands at the tail.";
/** The GHOST an unset In-Chat depth means — the tail, which is exactly what `injectionDepthFor` delivers
 *  for a post-pivot section with no `inject`. Short by construction (crunch item 10): the inline field is
 *  a compact mono cell and a sentence-length ghost clips to "0 — the t…". */
const DEPTH_PLACEHOLDER = "0 · tail";
const ORDER_HINT = "Within one depth: a LOWER order sits higher up; a higher one lands closer to your latest message.";
/** The depth an In-Chat section with no explicit `inject` already lands at (`injectionDepthFor`'s post-pivot
 *  arm) — so setting an ORDER first mints the splice AT the tail rather than inventing a depth. */
const TAIL_DEPTH = 0;

export interface SectionDrillInProps {
  readonly form: AssemblyForm;
  readonly section: PromptSection;
  readonly index: number;
  /** Back to the rack — the drill-in's one exit (Esc stays overlay-only, the house rule). */
  readonly onBack: () => void;
}

export function SectionDrillIn({ form, section, index, onBack }: SectionDrillInProps): ReactElement {
  const { label, oneLiner } = headerCopy(section);
  const pivot = isPivotSection(section);
  // A CARRIER declares no `inject`/`trigger` in the schema, so those clusters are ABSENT for it — never
  // rendered-and-disabled. Zone survives (it is array position, which every section has).
  const arrangeable = supportsArrangement(section);
  // FOCUS LANDS HERE ON DRILL (side-eye F-04): the chevron that opened this editor unmounts with the rack,
  // so focus fell to <body> and the keyboard user restarted at the top of the document. Back-to-rack is
  // the right target — it is the region's first control and it names the way out. The RESTORE half (focus
  // returns to the originating chevron) is the rack's, since the target only exists once the rack is back.
  const backRef = useRef<HTMLButtonElement>(null);
  useFocusOnSwap(backRef);
  return (
    // A region with a name, so the drill-in is reachable by landmark and announces what it edits (ARIA
    // rec 2). `aria-label` is the section's own name — one editor, one object.
    <Stack aria-label={`${label} — section editor`} gap="section" role="region">
      <Row align="center" gap="row" justify="between">
        <Button intent="ghost" onClick={onBack} ref={backRef} size="sm" type="button">
          <Icon icon={ArrowLeft} size="sm" />
          Back to rack
        </Button>
        {pivot ? null : <SectionActionsMenu form={form} index={index} onBack={onBack} section={section} />}
      </Row>

      <Stack gap="tight">
        <Row align="center" gap="row">
          <Icon icon={sectionGlyphIcon(section)} size="sm" />
          <Text voice="label">{label}</Text>
          <Row className="flex-1" />
          {pivot ? null : <EnableEcho form={form} index={index} label={label} />}
        </Row>
        <Text voice="gloss">{oneLiner}</Text>
      </Stack>

      <Section kicker="Body">
        <SectionBody form={form} index={index} section={section} />
      </Section>

      {/* ONE subscription for BOTH clusters: the zone decides whether Delivery even HAS a depth half, so
          Delivery and Placement now read the same derived fact and cannot disagree about it. */}
      <form.Subscribe selector={(state): readonly PromptSection[] => state.values.sections}>
        {(sections): ReactElement => {
          const zones = deriveZones(sections);
          const inChat = zones.zoneOf(index) === "post";
          return (
            <>
              <Section kicker="Delivery">
                <DeliveryFields form={form} inChat={inChat} index={index} section={section} />
              </Section>
              {pivot ? null : (
                <Section kicker="Placement">
                  <PlacementFields form={form} inChat={inChat} index={index} section={section} zones={zones} />
                </Section>
              )}
            </>
          );
        }}
      </form.Subscribe>

      {pivot || !arrangeable ? null : (
        <>
          <Section kicker="Triggers">
            <TriggerFields form={form} index={index} section={section} />
          </Section>
          <OverrideLocks form={form} index={index} section={section} />
        </>
      )}
    </Stack>
  );
}

/** The drilled-in enable echo (§16 row 18) — the SAME `sections[i].enabled` path the rack row's Switch
 *  binds, rendered here because the primary home is off-screen while you edit. Amber-ON like the row it
 *  echoes: an echo that paints a different state grammar from its primary home is a second reading. */
function EnableEcho({ form, index, label }: { readonly form: AssemblyForm; readonly index: number; readonly label: string }): ReactElement {
  return (
    <form.AppField name={`sections[${index}].enabled`}>
      {(field): ReactElement => (
        <Switch aria-label={`${label} enabled`} checked={field.state.value} onCheckedChange={(next): void => field.handleChange(next)} />
      )}
    </form.AppField>
  );
}

interface ClusterProps {
  readonly form: AssemblyForm;
  readonly section: PromptSection;
  readonly index: number;
}

/** The two clusters that branch on the derived zone (O-9★): `inChat` = this section is delivered INTO the
 *  conversation at a depth, which is the only arm where depth and order mean anything. */
interface ZonedClusterProps extends ClusterProps {
  readonly inChat: boolean;
}

/** DELIVERY: the name, then role beside depth through the shared cluster. Writing a depth SPLICES the
 *  section (mints the `inject` object, preserving any order); clearing it drops back to the tail (depth 0,
 *  what an In-Chat section with no explicit depth already gets) — which is why the two halves cannot be
 *  two independent bound fields. The depth half is ABSENT on the Relative arm (O-9★). */
function DeliveryFields({ form, section, index, inChat }: ZonedClusterProps): ReactElement {
  const inject = "inject" in section ? section.inject : undefined;
  const injectName = `sections[${index}].inject` as const;
  const nameField = <form.AppField name={`sections[${index}].name`}>{(field): ReactElement => <field.TextField label="Name" />}</form.AppField>;
  return (
    <DeliveryCluster
      depth={inject?.depth ?? null}
      depthHint={DEPTH_HINT}
      depthLabel="Inject at depth"
      depthMax={MAX_INJECTION_DEPTH}
      depthPlaceholder={DEPTH_PLACEHOLDER}
      leading={nameField}
      onDepthChange={
        inChat && supportsArrangement(section)
          ? (next): void => {
              form.setFieldValue(injectName, next === null ? undefined : { depth: next, ...(inject?.order === undefined ? {} : { order: inject.order }) });
            }
          : undefined
      }
      onRoleChange={(next): void => form.setFieldValue(`sections[${index}].role`, next)}
      role={hasRoleField(section) ? section.role : null}
      roleLabel="Role"
    />
  );
}

/** PLACEMENT: zone + order. ZONE is derived from the position relative to the pivot, so picking one is a
 *  MOVE through the same `moveFieldValues` the drag uses (§16 row 17) — and moving back to RELATIVE also
 *  clears the splice, because a relative section with a stored depth would still be spliced by the
 *  assembler (`injectionDepthFor`) while the editor called it relative. ORDER is In-Chat vocabulary
 *  (O-9★): it is ABSENT on the Relative arm rather than rendered-and-disabled. */
function PlacementFields({ form, section, index, inChat, zones }: ZonedClusterProps & { readonly zones: DerivedZones }): ReactElement {
  const inject = "inject" in section ? section.inject : undefined;
  const zone = zones.zoneOf(index);
  return (
    // THE SAME ROW GRAMMAR AS DELIVERY, one cluster below it (crunch item 10): two deliberate halves that
    // keep their columns on BOTH arms. On `cols="auto"` (auto-fit) the Relative arm — which drops Order —
    // collapsed the second track and stretched the Zone select across the whole pane, so switching zone
    // re-laid-out the row as well as the field.
    <Container>
      <Grid cols="pair" gap="field">
        <Field
          hint={
            zones.missingPivot
              ? "There is no chat-history marker yet, so there is no conversation to splice into — add one on the rack."
              : "How this section is delivered: ordered among the prompts, or spliced into the conversation at a depth. Picking one MOVES the section across the chat-history pivot."
          }
          label="Zone"
          name="section-zone"
        >
          <Select
            aria-label="Zone"
            disabled={zones.missingPivot}
            items={ZONE_ITEMS}
            onValueChange={(next): void => {
              if (typeof next !== "string" || next === zone || zones.missingPivot) {
                return;
              }
              const to = next === "post" ? zones.pivotIndex + 1 : zones.pivotIndex;
              if (next === "setup" && inject !== undefined) {
                form.setFieldValue(`sections[${index}].inject`, undefined);
              }
              form.moveFieldValues("sections", index, to > index ? to - 1 : to);
            }}
            value={zone}
          />
        </Field>
        {inChat && supportsArrangement(section) ? (
          <Field hint={ORDER_HINT} label="Order" name="section-order">
            <NumberField
              aria-label="Order"
              onValueChange={(next): void => {
                const depth = inject?.depth ?? TAIL_DEPTH;
                form.setFieldValue(`sections[${index}].inject`, next === null ? { depth } : { depth, order: next });
              }}
              placeholder={String(DEFAULT_INJECT_ORDER)}
              size="inline"
              step={1}
              value={inject?.order ?? null}
            />
          </Field>
        ) : null}
      </Grid>
    </Container>
  );
}

/** TRIGGERS — the EDITABLE firing gate, and (§5.0) the ONLY place that vocabulary exists: a guided
 *  template's firing condition is the user's click, so Actions carries a descriptive gloss and no control.
 *  No selection = fires on every generation, which is the unset field. */
function TriggerFields({ form, section, index }: ClusterProps): ReactElement {
  const trigger = "trigger" in section ? section.trigger : undefined;
  const name = `sections[${index}].trigger` as const;
  // ALL-SELECTED ≡ NO FILTER (owner rider): a list naming every generation type filters nothing, so it is
  // the same state as the unset field and must READ as it — otherwise the gloss below calls a section
  // "only the selected types" while it fires on all of them (a preset IMPORT can carry that array).
  const everyGeneration = trigger === undefined || trigger.length === 0 || trigger.length === GENERATION_TYPE_ITEMS.length;
  return (
    <Stack gap="field">
      {/* A MULTI-CHECK DROPDOWN, not the segmented strip (crunch-list O-11★, owner ruling — it overrides
          the mock's segmented drawing): six chips in a row is a control the size of the cluster it sits
          in, for an axis that is unset on almost every section. The `multiple` Select IS the house
          multi-check idiom (Base UI renders a Check indicator per selected item and the trigger
          comma-joins their labels), so nothing new is minted here.

          The UNSET field IS the "every generation" state, so deselecting the last option must write
          `undefined` — not an empty array that reads the same but stores differently.

          BOTH EDGES NORMALIZE TO THE ABSENCE (owner rider). Selecting EVERY type is the same no-filter
          state as selecting none: the assembler's gate (`assemble.ts` `sectionTriggers`) keeps a section
          when its list contains the running type, and a list of ALL SIX can never exclude one. The
          contract's canonical spelling of "fires always" is the ABSENT field — which is why the empty
          array is already written as `undefined` — so the all-selected write normalizes there too rather
          than storing a second, longer spelling of one behaviour. It is not only cosmetic: the same file's
          `isSectionDynamic` calls ANY non-empty trigger list dynamic and drops that section out of the
          cached prefix, so the redundant spelling would cost prompt caching for no filtering at all. */}
      <Select
        aria-label="Fires on"
        items={GENERATION_TYPE_ITEMS}
        multiple={true}
        onValueChange={(next): void =>
          form.setFieldValue(name, next.length === 0 || next.length === GENERATION_TYPE_ITEMS.length ? undefined : (next as GenerationType[]))
        }
        placeholder="Every generation"
        value={everyGeneration ? [] : [...trigger]}
      />
      <Text voice="gloss">
        {everyGeneration ? "Nothing selected — this section fires on every generation." : "Only the selected generation types carry this section."}
      </Text>
    </Stack>
  );
}

/** The card/room override locks — always for `main_prompt`/`post_history`, and for any other templated
 *  marker only once a flag is already set (an import can carry one).
 *
 *  THE GATE IS THE SCHEMA ARM, NOT A RUNTIME KEY (crunch-list O-12, the defect this fixes): it read
 *  `"forbidCharacterOverride" in section`, and both flags are OPTIONAL — a section that has never had one
 *  set carries no such key, so the block never rendered for ANY real preset (verified live on the Main
 *  prompt row). `templatedMarkerSection` is the union arm that DECLARES them, and it is spelled exactly
 *  `type === "marker" && isTemplatedMarker(marker)`; the `in` test survives only where it belongs, as the
 *  narrowing that lets the already-set VALUES be read. */
function OverrideLocks({ form, section, index }: ClusterProps): ReactElement | null {
  if (!(section.type === "marker" && isTemplatedMarker(section.marker))) {
    return null;
  }
  const always = OVERRIDABLE_MARKERS.includes(section.marker);
  const anySet = "forbidCharacterOverride" in section && (section.forbidCharacterOverride === true || section.forbidRoomOverride === true);
  if (!(always || anySet)) {
    return null;
  }
  return (
    <Section kicker="Overrides">
      <form.AppField name={`sections[${index}].forbidCharacterOverride`}>
        {(field): ReactElement => (
          <field.SwitchField description="Always use yours, ignoring the character card's replacement." label="Block the character card's override" />
        )}
      </form.AppField>
      <form.AppField name={`sections[${index}].forbidRoomOverride`}>
        {(field): ReactElement => <field.SwitchField description="Independent of the card lock." label="Block the room's override" />}
      </form.AppField>
    </Section>
  );
}

/** The ONE section-actions ⋯ menu. A MARKER gets Move-to-zone ONLY — Duplicate and Delete are OMITTED, not
 *  disabled (§5.2's structural rule: markers are the prompt's fixed anatomy, and the one-way Add door is
 *  deliberate ST parity). A LITERAL keeps the full set, Delete behind the confirm. */
function SectionActionsMenu({ form, section, index, onBack }: ClusterProps & { readonly onBack: () => void }): ReactElement | null {
  const structural = isStructuralSection(section);
  const onDelete = (): void => {
    void form.removeFieldValue("sections", index);
    onBack();
  };
  return (
    <form.Subscribe selector={(state): readonly PromptSection[] => state.values.sections}>
      {(sections): ReactElement | null => {
        const zones = deriveZones(sections);
        const move = zones.missingPivot ? null : <MoveToZoneItem form={form} index={index} zones={zones} />;
        // A MARKER whose only possible item is unavailable has an EMPTY menu — so it renders no ⋯ at all
        // rather than a trigger that opens nothing.
        if (structural && move === null) {
          return null;
        }
        if (structural) {
          return <RowActionsMenu label="Section actions">{move}</RowActionsMenu>;
        }
        return (
          <RowActionsMenu
            destructive={{
              title: "Delete this section?",
              description: "This removes the section from the preset's prompt arrangement. This can't be undone.",
              onConfirm: onDelete,
            }}
            label="Section actions"
          >
            <MenuItem onClick={(): void => duplicate(form, section, index)}>
              <Icon icon={Copy} size="sm" />
              Duplicate
            </MenuItem>
            {move}
          </RowActionsMenu>
        );
      }}
    </form.Subscribe>
  );
}

/** Duplicate the section just below itself with a fresh id (content preserved). The autosave BOUNDARY's
 *  store driver persists it (D78 §3) — no call-site flush. */
function duplicate(form: AssemblyForm, section: PromptSection, index: number): void {
  const clone: PromptSection = { ...section, id: globalThis.crypto.randomUUID() };
  void form.insertFieldValue("sections", index + 1, clone);
}

/** Move-to-zone — the sanctioned no-pointer / zone-jump echo of the drag (§16 row 17): crossing the pivot
 *  is a SEMANTIC move, distinct from positional dragging. Both go through `moveFieldValues`. */
function MoveToZoneItem({ form, index, zones }: { readonly form: AssemblyForm; readonly index: number; readonly zones: DerivedZones }): ReactElement {
  const inSetup = zones.zoneOf(index) === "setup";
  const to = inSetup ? zones.pivotIndex + 1 : zones.pivotIndex;
  return (
    <MenuItem onClick={(): void => form.moveFieldValues("sections", index, to > index ? to - 1 : to)}>
      <Icon icon={GitFork} size="sm" />
      {inSetup ? "Move below the conversation" : "Move above the conversation"}
    </MenuItem>
  );
}
