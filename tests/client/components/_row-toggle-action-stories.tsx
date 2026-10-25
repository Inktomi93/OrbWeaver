import { RowToggleAction } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser";
import { Star } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { useState } from "react";

export function RowToggleActionStory({ label }: { readonly label: string }): ReactElement {
  const [pressed, setPressed] = useState(false);
  return (
    <CtIsolation subject="RowToggleAction" isolates="The toggle's pressed state and accessible name need no application services.">
      <RowToggleAction icon={Star} label={label} onToggle={(): void => setPressed((value) => !value)} pressed={pressed} rest="always" />
    </CtIsolation>
  );
}
