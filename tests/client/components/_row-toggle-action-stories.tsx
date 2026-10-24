import { RowToggleAction } from "@orb/client/components";
import { Star } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { useState } from "react";

export function RowToggleActionStory({ label }: { readonly label: string }): ReactElement {
  const [pressed, setPressed] = useState(false);
  return <RowToggleAction icon={Star} label={label} onToggle={(): void => setPressed((value) => !value)} pressed={pressed} rest="always" />;
}
