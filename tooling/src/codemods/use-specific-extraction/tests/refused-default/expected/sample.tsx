import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";

// Each site leaves `variant` to Button's default, the focal solid primary, and the target's default differs, so the
// move would change emphasis silently: InlineAction defaults to ghost and PictureButton draws no style.
export function Sample(): ReactElement {
  return (
    <div>
      <Button size="inline">Bruised knuckles</Button>
      <Button size="inline-body">Try again</Button>
      <Button size="media">portrait</Button>
    </div>
  );
}
