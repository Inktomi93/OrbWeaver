// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome
// forbids exporting a component from a `.ct.tsx`). useId() keeps the shared label/control id
// non-static (gate useUniqueElementIds) while still exercising the real htmlFor/id wiring
// SettingRow relies on.
import { Input } from "@orb/ui/input";
import { SettingRow } from "@orb/ui/setting-row";
import type { ReactElement } from "react";
import { useId } from "react";

export interface AutoSaveRowProps {
  hint?: string;
  disabledReason?: string;
}

export function AutoSaveRow({ hint, disabledReason }: AutoSaveRowProps): ReactElement {
  const id = useId();
  return (
    <SettingRow
      {...(hint === undefined ? {} : { hint })}
      {...(disabledReason === undefined ? {} : { disabledReason })}
      id={id}
      label="Auto-save"
    >
      <Input disabled={disabledReason !== undefined} id={id} />
    </SettingRow>
  );
}
