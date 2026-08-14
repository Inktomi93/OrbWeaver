// Web-weave CT stories (Spine-Testing §7 — CT mounts only from a non-test module). The art fills its
// HOST box (§0 container model), so every story provides a real sized container; the veil story
// surfaces its lifecycle (close trigger + exited flag) as DOM the test can drive/assert without
// defining components inside the .ct.tsx.

import type { WebWeaveProps } from "@orb/ui/web-weave";
import { WeaveVeil, WebWeave } from "@orb/ui/web-weave";
import type { ReactElement } from "react";
import { useState } from "react";

export interface WeaveBoxProps extends WebWeaveProps {
  readonly width?: number;
  readonly height?: number;
}

/** A sized host box around the weave (the art is size-full — the box decides). */
export function WeaveBox({ width = 640, height = 420, ...weave }: WeaveBoxProps): ReactElement {
  return (
    <div style={{ width, height, position: "relative" }}>
      <WebWeave {...weave} />
    </div>
  );
}

/** The interactive story: the same box, with a target the test can aim a pointer at (the weave fills
 *  it, so a click anywhere inside is a click on the web). */
export function WeaveTouchBox(props: WeaveBoxProps): ReactElement {
  return <WeaveBox {...props} interactive={true} />;
}

/** The veil lifecycle story: a close trigger floated ABOVE the veil + the exited flag as DOM. */
export function VeilStory(): ReactElement {
  const [open, setOpen] = useState(true);
  const [exited, setExited] = useState(false);
  return (
    <div style={{ width: 640, height: 420 }}>
      <button type="button" data-testid="ct-veil-close" style={{ position: "fixed", zIndex: 100, top: 4, left: 4 }} onClick={(): void => setOpen(false)}>
        close veil
      </button>
      {exited ? <p data-testid="ct-veil-exited">veil exited</p> : null}
      <WeaveVeil open={open} onExited={(): void => setExited(true)} label="Loading">
        <p>veiled content</p>
      </WeaveVeil>
    </div>
  );
}
