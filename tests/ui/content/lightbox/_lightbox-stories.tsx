import { CtIsolation } from "@orb/testkit/browser";
import { Lightbox } from "@orb/ui/lightbox";
import type { ComponentProps, ReactElement } from "react";
import { useState } from "react";

const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";

export function LightboxCloseStory(): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <CtIsolation subject="Lightbox close" isolates="The viewer's own way out, without the message transcript that opens it">
      <Lightbox open={open} onOpenChange={setOpen} src={{ kind: "asset", url: PIXEL }} media="image" alt="A single pixel" />
    </CtIsolation>
  );
}

export function LightboxNameStory({ media, alt }: Pick<ComponentProps<typeof Lightbox>, "media" | "alt">): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <CtIsolation subject="Lightbox name" isolates="The viewer's accessible name, without the message transcript that opens it">
      <Lightbox open={open} onOpenChange={setOpen} src={{ kind: "asset", url: PIXEL }} media={media} alt={alt} />
    </CtIsolation>
  );
}
