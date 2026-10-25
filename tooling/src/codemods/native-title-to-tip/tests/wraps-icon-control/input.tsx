import { Button } from "@orb/ui/button";
import { Icon, X } from "@orb/ui/icons";
import type { ReactElement } from "react";

export function Remove({ label }: { readonly label: string }): ReactElement {
  return (
    <Button aria-label={label} intent="ghost" title={label}>
      <Icon icon={X} size="xs" />
    </Button>
  );
}
