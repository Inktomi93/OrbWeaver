// Clear default moves a pointer, and the same menu offers Set as default on its next open, so the clear is one click
// from undone. Its own module so the destructive-confirm exemption covers this item alone, not the switcher row.

import { MenuItem } from "@orb/ui/menu";
import type { ReactElement } from "react";

export function PersonaClearDefaultItem({ onClear }: { readonly onClear: () => void }): ReactElement {
  return <MenuItem onClick={onClear}>Clear default</MenuItem>;
}
