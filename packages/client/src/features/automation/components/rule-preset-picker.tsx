// B2 — the RULE preset PICKER (interaction-direction-spec §7 B2 deliverable 2). An inline popover that
// lists the committed rule presets (`automation.listRulePresets`) and mints one into the chat via
// `automation.createRuleFromPreset`. v1 knob-edit is RE-MINT (no post-mint editing), so the flow is
// pick → set knobs → add; a minted rule is born DISABLED and appears in the list beside hand-authored ones.
//
// VOCABULARY (owner ruling, #599): "preset" bare means a GENERATION preset. These are RULE presets — every
// user-facing string here says "rule" (the trigger is "Add a rule", never "preset picker"). ONE noun, one
// spelling: the trigger and the popover title are the same words (side-eye #621 P3-1 — the concept had
// three names across one popover).
//
// THE FORM'S THREE PARTS LIVE IN THREE FILES, and the split is the `component-size` cap made honest when
// the entityRef arm landed (#630): the per-knob EDITORS are `rule-preset-knob-field.tsx`, the per-knob
// VALUE MODEL (defaults, validity, the mint bag) is `lib/rule-preset-knob-model.ts`, and what stays here is
// the ceremony — catalogue → knob form → mint.
//
// THE BLOCK IS ANNOUNCED, NEVER PRE-ACCUSED (side-eye #621 P1-4). It used to render the issue at FIRST
// PAINT — the catalogue's stated natural-first card ("Auto-add lore entries") opened red-ringed and
// "Required." before the host had typed a character, reading as already-rejected — behind a `disabled` Add
// button that still painted its full primary fill, so the surface looked live and did nothing. Now: issues
// appear per field on first edit, the Add button is REAL (pressing it reveals every issue rather than
// swallowing the press), and the blocking field is named in a line above it.
//
// THE ROW NAMES ITS PRICE (#655). Seven of the eleven committed rule presets commit the host to a RECURRING
// model charge the moment they enable one, and this catalogue said nothing: the word "spend" first appeared
// in a minted row's overflow menu, two clicks past the decision. The signal is a SERVER-DERIVED field
// (`RulePresetView.spends` — `substrate/presets.ts` runs each preset's own builder and tests its arms
// against `SPEND_ARM_TYPES`), because the client has no arms to inspect and a hand-kept list on either side
// would be a lie waiting to happen on a money surface. It rides the same trailing-sentence grammar as
// "Asks before acting.", in both steps.
//
// A typed mint refusal the form CANNOT pre-empt — a lorebook that stopped being attached to this chat
// between the render and the press — rides `mintFailureToast` (`lib/rule-mutations.ts`), so a host reads
// the reason instead of watching a card quietly do nothing.

import type { RulePresetKnobValueInputs, RulePresetView } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, Plus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { useCreateRuleFromPreset } from "../lib/rule-mutations.ts";
import { defaultKnobValues, knobIssue, mintKnobOverrides } from "../lib/rule-preset-knob-model.ts";
import { KnobBlockingLine, KnobField } from "./rule-preset-knob-field.tsx";

/** THE SPEND SENTENCE — the signal this whole surface was missing (#655). Seven of the eleven committed
 *  rule presets commit the host to a RECURRING model charge the moment they enable one ("Periodic pacing
 *  nudge" fires a full turn every 8 beats, forever), and the word "spend" appeared nowhere until the row's
 *  overflow menu, two clicks deep, AFTER the rule was minted. It rides the same trailing-sentence grammar as
 *  "Asks before acting." because a host reads the row as one sentence about what this does to their room —
 *  and it comes FIRST of the two, because a charge is the larger commitment and "asks before acting" is what
 *  qualifies it.
 *
 *  `view.spends` is the server's DERIVED answer (`substrate/presets.ts` runs the preset's own builder and
 *  tests its arms against `SPEND_ARM_TYPES`), never a client guess — the client has no arms to inspect. */
function spendLine(view: RulePresetView): string {
  return view.spends ? " Costs a model call each time it fires." : "";
}

interface RulePresetConfigureProps {
  readonly chatId: ChatId;
  readonly preset: RulePresetView;
  readonly onBack: () => void;
  readonly onDone: () => void;
}

/** The knob form for ONE chosen preset + the mint action. */
function RulePresetConfigure({ chatId, preset, onBack, onDone }: RulePresetConfigureProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const mint = useCreateRuleFromPreset({ trpc, invalidation });
  const [values, setValues] = useState<RulePresetKnobValueInputs>(() => defaultKnobValues(preset.knobs));
  // Which fields may accuse yet: a key lands here on first edit, and pressing a blocked Add reveals them
  // all at once (side-eye #621 P1-4 — the form used to open red before the host had touched anything).
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());

  const blocked = preset.knobs.find((knob) => knobIssue(knob, values[knob.key]) !== null);

  const add = (): void => {
    if (blocked !== undefined) {
      setTouched(new Set(preset.knobs.map((knob) => knob.key)));
      return;
    }
    mint.mutate({ chatId, presetId: preset.id, knobs: mintKnobOverrides(preset.knobs, values) }, { onSuccess: () => onDone() });
  };

  return (
    <Stack gap="block">
      {/* JUST "Back" — the step's own title moved UP into the popover's one heading (#655). This row used
          to carry a second title beside it, so step 2 opened with the preset name on the RIGHT under a
          heading still reading "Add a rule": two titles, in reversed reading order, neither of them the
          one a screen reader announces for the dialog. */}
      <Row gap="block" align="center">
        <Button intent="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </Row>
      <Text voice="gloss" prose={true}>
        {preset.summary}
        {spendLine(preset)}
      </Text>
      {preset.knobs.map((knob) => (
        <KnobField
          key={knob.key}
          knob={knob}
          chatId={chatId}
          value={values[knob.key]}
          showIssue={touched.has(knob.key)}
          onChange={(next): void => {
            setTouched((prev) => new Set(prev).add(knob.key));
            setValues((prev) => ({ ...prev, [knob.key]: next }));
          }}
        />
      ))}
      {/* The blocking reason is SAID, not merely enforced: an amber-filled button that does nothing on
          click is the same dead end whether or not it is `disabled` (side-eye #621 P1-4). Pressing it
          reveals every field's issue instead. */}
      {blocked === undefined ? null : <KnobBlockingLine knob={blocked} chatId={chatId} />}
      <Button intent="primary" size="sm" loading={mint.isPending} onClick={add}>
        {preset.ruleCount > 1 ? `Add ${preset.ruleCount} rules` : "Add rule"}
      </Button>
    </Stack>
  );
}

interface RulePresetListProps {
  readonly presets: readonly RulePresetView[];
  readonly onPick: (preset: RulePresetView) => void;
}

/** The catalogue list — one selectable row per rule preset. */
function RulePresetList({ presets, onPick }: RulePresetListProps): ReactElement {
  return (
    <Stack gap="block">
      {presets.map((preset) => (
        <Button
          key={preset.id}
          aria-label={preset.title}
          intent="ghost"
          // `wrap` is the arm for exactly this: a CHOICE affordance carrying a sentence — the label wraps
          // and the height follows the wrapped text, floored at the `sm` control height (the tap floor).
          // A call-site `h-auto` would defeat the sealed box (`ui-size-via-variant`); the
          // `message-choices-block` chip is the same shape and spells it the same way.
          size="wrap"
          className="justify-start text-left"
          onClick={(): void => onPick(preset)}
        >
          <Stack gap="tight">
            {/* `promoted`, not `label` (#655): this IS the shipped voice for "the name of one item in a
                shelf of items", and with the summary lifted off the 10.5px floor below (see it) a `label`
                title would render name and caption at the SAME 13px step — the exact flattening `promoted`
                was minted to fix. */}
            <Text voice="promoted">{preset.title}</Text>
            {/* `prose` — the LENGTH modifier, not a taste knob. This sentence is the one thing answering
                "what will this do to my room", and it rendered at 10.5px (design-audit `undersized-ui-text`,
                below the 11px functional floor) inside an interactive button. `prose` lifts the gloss voice
                to the label step and relaxes its leading while keeping it unmistakably the same voice. */}
            <Text voice="gloss" prose={true}>
              {preset.summary}
              {spendLine(preset)}
              {preset.confirmFirst ? " Asks before acting." : ""}
            </Text>
          </Stack>
        </Button>
      ))}
    </Stack>
  );
}

interface RulePresetPickerBodyProps {
  readonly chatId: ChatId;
  readonly selected: RulePresetView | null;
  readonly onSelect: (preset: RulePresetView | null) => void;
  readonly onDone: () => void;
}

/** The popover body: the catalogue, then the chosen preset's knob form. Suspends on `listRulePresets`.
 *
 *  The STEP lives one level up (`RulePresetPicker`) rather than here, because the popover's single heading
 *  has to name it and that heading sits OUTSIDE the `QueryBoundary` — the alternative was moving the title
 *  inside the boundary, where a slow catalogue read would paint a titleless dialog. */
function RulePresetPickerBody({ chatId, selected, onSelect, onDone }: RulePresetPickerBodyProps): ReactElement {
  const trpc = useTRPC();
  const { data: presets } = useSuspenseQuery(trpc.automation.listRulePresets.queryOptions());

  if (selected === null) {
    return <RulePresetList presets={presets} onPick={onSelect} />;
  }
  return <RulePresetConfigure chatId={chatId} preset={selected} onBack={(): void => onSelect(null)} onDone={onDone} />;
}

export interface RulePresetPickerProps {
  readonly chatId: ChatId;
}

/** The "Add rule…" inline popover — the picker entry point for the Rules section. */
export function RulePresetPicker({ chatId }: RulePresetPickerProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<RulePresetView | null>(null);
  return (
    <Popover
      open={open}
      onOpenChange={(next): void => {
        setOpen(next);
        // Close returns the popover to its catalogue: re-opening onto the knob form of whatever was picked
        // last time is a surface remembering a decision the host already walked away from.
        if (!next) {
          setSelected(null);
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button intent="secondary" size="sm">
            <Icon icon={Plus} size="sm" />
            Add a rule
          </Button>
        }
      />
      {/* THE RULING SURVIVED A CHALLENGE (#655), THEN GOT ITS FIX (#663). The picker was reported to
          TELEPORT between its two steps ({x:513 y:36 w:384} → {x:929 y:476 w:319}), and both call-site
          levers were tried and MEASURED WRONG. `min-w-cq-sm` forces 24rem even where the positioner has
          less room — the 384px docked pane rendered a 384px popup inside 376.09px of available width.
          `side="top" align="end"` did not pin the anchor either (bottom/right went 311/1019 → 428/1024 at
          a 1024px mount): the positioner is re-solving a genuinely different box, not mis-aligning the
          same one. The honest lever was a WIDTH VARIANT on `PopoverPopup` — `width="stable"` resolves
          `min(cq-sm, --available-width)`, so this two-step body reads as content swapping inside a fixed
          frame instead of the popup itself resizing. No call-site className: the seal is a variant PROP,
          never a call-site utility (`ui-size-via-variant`). */}
      <PopoverPopup width="stable">
        {/* ONE heading, and it names the STEP. Step 2 used to render a second title inside the body while
            this one still said "Add a rule" — so the dialog's accessible name never changed and a sighted
            host read two titles in reversed order. */}
        <PopoverTitle>{selected === null ? "Add a rule" : selected.title}</PopoverTitle>
        <QueryBoundary
          fallback={<SkeletonRows count={3} shape="line" />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="the rules you can add" onRetry={retry} />}
        >
          <RulePresetPickerBody chatId={chatId} selected={selected} onSelect={setSelected} onDone={(): void => setOpen(false)} />
        </QueryBoundary>
      </PopoverPopup>
    </Popover>
  );
}
