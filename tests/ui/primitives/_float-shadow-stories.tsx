import { CtIsolation } from "@orb/testkit/browser";
import { Autocomplete } from "@orb/ui/autocomplete";
import { Combobox } from "@orb/ui/combobox";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@orb/ui/popover";
import { Select } from "@orb/ui/select";
import { TOKENS } from "@orb/ui/tokens";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import type { AnchoredFloat } from "./float-shadow-cases.ts";
import { FLOAT_OPTIONS } from "./float-shadow-cases.ts";

const FLOATS: Record<AnchoredFloat, () => ReactElement> = {
  select: () => <Select aria-label="Pick a palette" defaultOpen={true} items={FLOAT_OPTIONS.map((value) => ({ value, label: value }))} />,
  combobox: () => <Combobox aria-label="Pick keywords" items={FLOAT_OPTIONS} />,
  autocomplete: () => <Autocomplete aria-label="Find a palette" items={FLOAT_OPTIONS} open={true} />,
  popover: () => (
    <Popover defaultOpen={true}>
      <PopoverTrigger>Details</PopoverTrigger>
      <PopoverPopup>
        <PopoverTitle>Palette details</PopoverTitle>
      </PopoverPopup>
    </Popover>
  ),
  menu: () => (
    <Menu defaultOpen={true}>
      <MenuTrigger>More</MenuTrigger>
      <MenuPopup>
        <MenuItem>Rename</MenuItem>
      </MenuPopup>
    </Menu>
  ),
  tooltip: () => (
    <Tooltip defaultOpen={true}>
      <TooltipTrigger>Hint</TooltipTrigger>
      <TooltipPopup>The palette's name</TooltipPopup>
    </Tooltip>
  ),
};

/** One anchored float, open, beside a probe that paints the served float-shadow recipe in the same document. */
export function FloatShadowStory({ float }: { readonly float: AnchoredFloat }): ReactElement {
  const Float = FLOATS[float];
  return (
    <CtIsolation subject="Anchored floats" isolates="Each float primitive's resting shadow against the served recipe, without application state">
      <Float />
      <p data-probe="float-shadow" style={{ boxShadow: `var(${TOKENS["shadow.overlay"].cssVar})` }}>
        Recipe probe
      </p>
    </CtIsolation>
  );
}
