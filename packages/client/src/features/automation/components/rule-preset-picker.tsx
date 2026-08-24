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
import { defaultKnobValues, knobBlockingLine, knobIssue, mintKnobOverrides } from "../lib/rule-preset-knob-model.ts";
import { KnobField } from "./rule-preset-knob-field.tsx";

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
      <Row gap="block" align="center" justify="between">
        <Button intent="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Text voice="label">{preset.title}</Text>
      </Row>
      <Text voice="gloss">{preset.summary}</Text>
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
      {blocked === undefined ? null : <Text voice="gloss">{knobBlockingLine(blocked)}</Text>}
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
            <Text voice="label">{preset.title}</Text>
            <Text voice="gloss">
              {preset.summary}
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
  readonly onDone: () => void;
}

/** The popover body: the catalogue, then the chosen preset's knob form. Suspends on `listRulePresets`. */
function RulePresetPickerBody({ chatId, onDone }: RulePresetPickerBodyProps): ReactElement {
  const trpc = useTRPC();
  const { data: presets } = useSuspenseQuery(trpc.automation.listRulePresets.queryOptions());
  const [selected, setSelected] = useState<RulePresetView | null>(null);

  if (selected === null) {
    return <RulePresetList presets={presets} onPick={setSelected} />;
  }
  return <RulePresetConfigure chatId={chatId} preset={selected} onBack={(): void => setSelected(null)} onDone={onDone} />;
}

export interface RulePresetPickerProps {
  readonly chatId: ChatId;
}

/** The "Add rule…" inline popover — the picker entry point for the Rules section. */
export function RulePresetPicker({ chatId }: RulePresetPickerProps): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button intent="secondary" size="sm">
            <Icon icon={Plus} size="sm" />
            Add a rule
          </Button>
        }
      />
      {/* No call-site width: the popup slot already seals its own box (`max-w-cq-sm` + the
          `max-h-(--available-height)` cap, capped-and-scrollable) — a `w-80` here would fight that seal
          rather than express anything the primitive does not already own (`ui-size-via-variant`). */}
      <PopoverPopup>
        <PopoverTitle>Add a rule</PopoverTitle>
        <QueryBoundary
          fallback={<SkeletonRows count={3} shape="line" />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="the rules you can add" onRetry={retry} />}
        >
          <RulePresetPickerBody chatId={chatId} onDone={(): void => setOpen(false)} />
        </QueryBoundary>
      </PopoverPopup>
    </Popover>
  );
}
