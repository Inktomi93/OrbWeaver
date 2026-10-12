// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome
// forbids exporting a component from a `.ct.tsx`). Lightbox has no built-in trigger (it's fully
// controlled), so focus-return-to-trigger needs an actual "trigger" element for Base UI's Dialog to
// remember and restore focus to on close.
import { Lightbox } from "@orb/ui/lightbox";
import type { ReactElement } from "react";
import { useState } from "react";

export function LightboxHarness(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={(): void => setOpen(true)}>
        Open lightbox
      </button>
      <Lightbox open={open} onOpenChange={setOpen} src={{ kind: "asset", url: "/blob/a.png" }} media="image" alt="a" />
    </div>
  );
}
