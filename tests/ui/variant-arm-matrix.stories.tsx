// BROWSER half of the variant-arm matrix (design record: variant-arm-matrix.def.ts).
// This module is bundled into the CT browser (the house `_ct-stories` pattern): the suite mounts ONE
// `<VariantArmCells/>` per (story × theme) with a JSON-serialisable cell plan, and every component
// reference lives HERE so playwright-CT's component transform sees a plain story component.
// NO node-only imports (the plan module rides node:crypto — it must never be imported from here).
//
// CSS LAW: cells receive their tokens/theme through the ONE CT front door (playwright/index.tsx →
// @orb/client/styles); this module authors NO stylesheet, no inline token values — the theme flip is the
// `data-theme` attribute (the card.ct.tsx precedent), hearth being the ABSENCE of the attribute (#875 F2),
// and the wrapper paints the real token background via the `bg-background` utility so backdrop resolution
// lands on the same base pixel the app paints.
//
// RENDERER KEYS: the table `satisfies Record<StoryKey, …>` (variant-arm-matrix.keys.ts), so renderers ↔
// story defs cannot drift — a missing or extra key is a compile error. Each renderer is typed with the
// COMPONENT'S own props; the dispatch narrows the runtime arm record once (`as never`), which is honest
// because every value in it was derived from that component's own tv config (plan module).

import { Badge } from "@orb/ui/badge";
import type { ButtonProps } from "@orb/ui/button";
import { Button } from "@orb/ui/button";
import type { CardProps } from "@orb/ui/card";
import { Card } from "@orb/ui/card";
import type { CheckboxProps } from "@orb/ui/checkbox";
import { Checkbox } from "@orb/ui/checkbox";
import type { EmptyStateProps } from "@orb/ui/empty-state";
import { EmptyState } from "@orb/ui/empty-state";
import type { HighlightedTextProps } from "@orb/ui/highlighted-text";
import { HighlightedText } from "@orb/ui/highlighted-text";
import { Check, Icon } from "@orb/ui/icons";
import type { InputProps } from "@orb/ui/input";
import { Input } from "@orb/ui/input";
import type { KbdProps } from "@orb/ui/kbd";
import { Kbd } from "@orb/ui/kbd";
import type { ListRowProps } from "@orb/ui/list-row";
import { ListRow } from "@orb/ui/list-row";
import type { PickerCellProps } from "@orb/ui/picker-cell";
import { PickerCell } from "@orb/ui/picker-cell";
import type { SelectProps } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import type { SliderProps } from "@orb/ui/slider";
import { Slider } from "@orb/ui/slider";
import type { StatusChipProps } from "@orb/ui/status-chip";
import { StatusChip } from "@orb/ui/status-chip";
import type { SwitchProps } from "@orb/ui/switch";
import { Switch } from "@orb/ui/switch";
import type { TextProps } from "@orb/ui/text";
import { Text } from "@orb/ui/text";
import type { ToggleProps } from "@orb/ui/toggle";
import { Toggle } from "@orb/ui/toggle";
import type { ReactElement } from "react";
import type { StoryKey, ThemeArm } from "./variant-arm-matrix.keys.ts";

type BadgeProps = Parameters<typeof Badge>[0];

/** The serialisable arm assignment crossing the mount boundary — axis picks coerced from the tv config. */
type ArmProps = Readonly<Record<string, string | number | boolean>>;

interface RenderCtx {
  readonly cellId: string;
  readonly disabled: boolean;
}

const SELECT_ITEMS = [
  { label: "Alpha", value: "alpha" },
  { label: "Beta", value: "beta" },
  { label: "Gamma", value: "gamma" },
];

/** Button sizes whose content contract is a GLYPH + accessible name, not a text run. */
const GLYPH_BUTTON_SIZES = new Set(["icon", "icon-sm", "media", "glyph-xs", "glyph-sm", "glyph-md", "glyph-lg"]);

const RENDERERS = {
  badge: (props: BadgeProps): ReactElement => <Badge {...props}>Active</Badge>,
  button: (props: ButtonProps, ctx: RenderCtx): ReactElement =>
    GLYPH_BUTTON_SIZES.has(String(props.size)) ? (
      <Button {...props} aria-label="Save" disabled={ctx.disabled}>
        <Icon icon={Check} />
      </Button>
    ) : (
      <Button {...props} disabled={ctx.disabled}>
        Save changes
      </Button>
    ),
  card: (props: CardProps): ReactElement => <Card {...props}>Quiet island copy</Card>,
  // CHECKED, deliberately: the `tone` axis paints ONLY the checked/indeterminate fill (#1110), so an
  // unchecked cell would render both arms identically and judge the shared rest frame twice.
  checkbox: (props: CheckboxProps, ctx: RenderCtx): ReactElement => (
    <Checkbox {...props} aria-label="Include chats" defaultChecked={true} disabled={ctx.disabled} />
  ),
  "empty-state": (props: EmptyStateProps): ReactElement => <EmptyState {...props} description="Import a character to begin." title="Nothing here yet" />,
  "highlighted-text": (props: HighlightedTextProps): ReactElement => <HighlightedText {...props} ranges={[{ start: 4, end: 9 }]} text="The quick brown fox" />,
  input: (props: InputProps, ctx: RenderCtx): ReactElement => <Input {...props} aria-label="Name" defaultValue="Azarael" disabled={ctx.disabled} />,
  kbd: (props: KbdProps): ReactElement => <Kbd {...props}>⌘K</Kbd>,
  // The tv axis `float` reaches the component as the `actionsFloat` prop — the ONE axis↔prop rename in
  // the storied set; translated here so the plan keeps speaking the tv axis vocabulary.
  "list-row": ({ float, ...props }: ListRowProps & { readonly float?: boolean }): ReactElement => (
    <ListRow {...props} {...(float === undefined ? {} : { actionsFloat: float })} meta="2h" subtitle="Rain again, and she is late" title="Azarael" />
  ),
  "picker-cell": (props: PickerCellProps): ReactElement => (
    <PickerCell {...props} art={<div className="h-full w-full bg-card" />} description="A quiet second line" label="Azarael" />
  ),
  select: (props: SelectProps, ctx: RenderCtx): ReactElement => (
    <Select {...props} aria-label="Model picker" disabled={ctx.disabled} items={SELECT_ITEMS} placeholder="Pick one" />
  ),
  slider: (props: SliderProps, ctx: RenderCtx): ReactElement => (
    <Slider {...props} defaultValue={40} disabled={ctx.disabled} label="Volume" max={100} min={0} />
  ),
  "status-chip": (props: StatusChipProps): ReactElement => <StatusChip {...props} status="running" summary="3 of 5 files" />,
  switch: (props: SwitchProps, ctx: RenderCtx): ReactElement => <Switch {...props} aria-label="Streaming" disabled={ctx.disabled} />,
  // FIXTURE LENGTH IS LOAD-BEARING: the copy stays UNDER the content-length floors of the rider rules
  // (all-caps-body >30 chars, wide/crushed-tracking >20) so the transform=caps × long-sentence cross —
  // an arm×content composition no caller authors — cannot fire content-driven rules against every caps
  // arm. Measured on the first run: a 44-char sentence turned every caps arm into an all-caps-body row.
  text: (props: TextProps): ReactElement => <Text {...props}>A quiet line</Text>,
  toggle: (props: ToggleProps, ctx: RenderCtx): ReactElement => (
    <Toggle {...props} aria-label="Bold" disabled={ctx.disabled}>
      B
    </Toggle>
  ),
} satisfies Record<StoryKey, (props: never, ctx: RenderCtx) => ReactElement>;

export interface VariantArmCellsProps {
  readonly storyKey: StoryKey;
  /** "hearth" mounts WITHOUT data-theme (the base :root palette — #875 F2). */
  readonly theme: ThemeArm;
  readonly cells: readonly { readonly id: string; readonly props: ArmProps }[];
  /** Additionally render a disabled twin of every cell (data-cell-state="disabled"). */
  readonly withDisabled: boolean;
}

/**
 * Mount-root for one (story × theme): every arm cell in one tree, each wrapped in an addressable
 * `[data-cell]` box, on the real token background. Cells stack in normal flow — the judged facts
 * (computed style, box size) do not depend on viewport intersection.
 */
export function VariantArmCells({ storyKey, theme, cells, withDisabled }: VariantArmCellsProps): ReactElement {
  const render = RENDERERS[storyKey] as (props: ArmProps, ctx: RenderCtx) => ReactElement;
  const states: readonly boolean[] = withDisabled ? [false, true] : [false];
  // `text-foreground` beside the background is LOAD-BEARING: the app stamps data-theme on the ROOT
  // (appearance-boot-hint.ts DATA_THEME_ATTR), so the shell's `color: var(--color-foreground)`
  // (client globals.css:20) resolves INSIDE the theme scope. A CT wrapper that only flips the
  // variables leaves `color` inherited from the harness body as an ALREADY-RESOLVED dark-base value —
  // measured on this suite's first light run as a 1.07:1 wall across every `text-current`/inherit arm.
  return (
    <div className="bg-background p-block text-foreground" data-testid="variant-arm-root" {...(theme === "hearth" ? {} : { "data-theme": theme })}>
      {states.map((disabled) =>
        cells.map((cell) => (
          <div data-cell={cell.id} data-cell-state={disabled ? "disabled" : "rest"} key={`${disabled ? "disabled" : "rest"}:${cell.id}`}>
            {render(cell.props, { cellId: cell.id, disabled })}
          </div>
        )),
      )}
    </div>
  );
}

/**
 * PLANTED POSITIVE CONTROL — an arm whose ink IS its backdrop token (`text-background` on
 * `bg-background`): a 1.00:1 pair by construction, through the exact same gather→resolve→judge pipeline
 * as every real arm. If the suite's probe test ever sees ZERO findings from this mount, the instrument
 * has gone blind — that test failing loud is the whole reason this component exists.
 */
export function VariantArmContrastProbe(): ReactElement {
  return (
    <div className="bg-background p-block text-foreground" data-testid="variant-arm-root">
      <div data-cell="probe=fg-eq-bg" data-cell-state="rest">
        <span className="text-background">unreadable probe glyphs</span>
      </div>
      {/* THE ADVISORY'S OWN CONTROL (#1016). The same 1.00:1 pair inside a real `:disabled` control:
          WCAG 1.4.3 exempts it from the AA contrast MINIMUM, so it must NOT be a P1 — but it is far
          under 1.4.11's 3:1 UI-component boundary, so `inactive-control-legibility` owes a P3. That row
          is exactly what the severity floor must keep VISIBLE rather than swallow: a disabled control
          nobody can see is still a defect, it just is not the AA one. A raw <button> (not <Button>) so
          the ink is the token under test and nothing else. */}
      <div data-cell="probe=disabled-invisible" data-cell-state="disabled">
        <button disabled={true} type="button">
          <span className="text-background">unreadable disabled glyphs</span>
        </button>
      </div>
    </div>
  );
}
