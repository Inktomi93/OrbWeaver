// A menu item whose detail line is visible copy: a disabled item's reason, or an enabled item's helper. The
// label names the item and the detail describes it, so a touch user reads what a hover never shows them.

import type { LucideIcon } from "@orb/ui/icons";
import { Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import type { ComponentProps, ReactElement } from "react";
import { useId } from "react";

export interface DescribedMenuItemProps extends Omit<ComponentProps<typeof MenuItem>, "aria-describedby" | "aria-labelledby" | "children" | "label"> {
  readonly icon?: LucideIcon;
  /** The item's name, also its typeahead text. */
  readonly label: string;
  /** `undefined` renders the bare item. */
  readonly detail: string | undefined;
}

export function DescribedMenuItem({ icon, label, detail, ...props }: DescribedMenuItemProps): ReactElement {
  const labelId = useId();
  const detailId = useId();
  const glyph = icon === undefined ? null : <Icon icon={icon} size="sm" />;
  if (detail === undefined) {
    return (
      <MenuItem label={label} {...props}>
        {glyph}
        {label}
      </MenuItem>
    );
  }
  return (
    <MenuItem aria-describedby={detailId} aria-labelledby={labelId} label={label} {...props}>
      {glyph}
      <Stack gap="tight">
        <span id={labelId}>{label}</span>
        <Text id={detailId} voice="gloss">
          {detail}
        </Text>
      </Stack>
    </MenuItem>
  );
}
