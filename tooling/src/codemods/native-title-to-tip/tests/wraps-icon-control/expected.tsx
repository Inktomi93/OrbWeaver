import { Button } from "@orb/ui/button";
import { Icon, X } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { Tip } from "#components";

export function Remove({ label }: { readonly label: string }): ReactElement {
  return (
    <Tip text={label}><Button aria-label={label} intent="ghost">
      <Icon icon={X} size="xs" />
    </Button></Tip>
  );
}
