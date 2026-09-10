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

/** Two same-seed inert canvases painted on the same browser frames. A mouse tape crosses only the first,
 *  while the second measures the ambient glint/dew/spider motion over that exact elapsed interval. */
export function WeaveInertTwinBox(): ReactElement {
  return (
    <div style={{ display: "flex" }}>
      <div data-testid="ct-weave-inert-target">
        <WeaveBox width={320} state="settled" />
      </div>
      <div data-testid="ct-weave-inert-reference">
        <WeaveBox width={320} state="settled" />
      </div>
    </div>
  );
}

/** The scroll-fence story: an INTERACTIVE weave full-bleed behind a tall scrollable column. The web is
 *  backdrop decoration, so a vertical thumb drag started on the silk must still scroll the column —
 *  the fence against "fix touch by taking the gesture" (a blanket `touch-action: none`). */
export function WeaveScrollBox(): ReactElement {
  return (
    <div data-testid="ct-weave-scroller" style={{ width: 640, height: 420, overflowY: "auto", position: "relative" }}>
      <div style={{ position: "sticky", top: 0, height: 420 }}>
        <WebWeave interactive={true} state="settled" />
      </div>
      <div style={{ height: 2000 }} />
    </div>
  );
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
