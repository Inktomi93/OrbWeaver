// Web-weave CT stories (Spine-Testing §7 — CT mounts only from a non-test module). The art fills its
// HOST box (§0 container model), so every story provides a real sized container; the veil story
// surfaces its lifecycle (close trigger + exited flag) as DOM the test can drive/assert without
// defining components inside the .ct.tsx.

import type { WebWeaveProps } from "@orb/ui/web-weave";
import { WeaveVeil, WebWeave } from "@orb/ui/web-weave";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { bakeWeaveGlow } from "../../../../packages/ui/src/art/web-weave/web-weave-glow.ts";
import { capturePixelFacts } from "./web-weave-glow-probe.ts";

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

function captureContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("capture probe requires native 2D canvas");
  }
  return ctx;
}

/** Native canvas comparison against the established three-slice capture glow, outside timing windows. */
export function CaptureGlowProbe({
  dpr,
  length,
  angle,
  palette = "var(--color-primary)",
  pressure = false,
}: {
  readonly dpr: number;
  readonly length: number;
  readonly angle: number;
  readonly palette?: string;
  readonly pressure?: boolean;
}): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  const [facts, setFacts] = useState<string>("");
  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) {
      return;
    }
    const ctx = captureContext(canvas);
    canvas.style.color = palette;
    const color = getComputedStyle(canvas).color;
    const paint = bakeWeaveGlow(canvas.ownerDocument, color);
    let composites = 0;
    let detachedComposites = 0;
    const nativeDraw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image: CanvasImageSource, ...coordinates: number[]): void {
      if (this === ctx) {
        composites += 1;
      } else {
        detachedComposites += 1;
      }
      Reflect.apply(nativeDraw, this, [image, ...coordinates]);
    };
    try {
      const origin = { x: 60, y: 60 };
      const end = { x: origin.x + Math.cos(angle) * length, y: origin.y + Math.sin(angle) * length };
      const frame = (alpha: number): Uint8ClampedArray => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = alpha;
        paint(ctx, "capture", origin, end);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      frame(0.6);
      composites = 0;
      for (let i = 0; i < 24; i += 1) {
        frame(0.6);
      }
      const warmComposites = composites;
      const actual = frame(0.6);
      const reference = canvas.ownerDocument.createElement("canvas");
      reference.width = canvas.width;
      reference.height = canvas.height;
      const referenceCtx = captureContext(reference);
      const source = canvas.ownerDocument.createElement("canvas");
      source.width = 68;
      source.height = 36;
      const sourceCtx = captureContext(source);
      sourceCtx.scale(2, 2);
      sourceCtx.strokeStyle = color;
      sourceCtx.lineWidth = 0.8;
      sourceCtx.lineCap = "round";
      sourceCtx.shadowColor = color;
      sourceCtx.shadowBlur = 6;
      sourceCtx.shadowOffsetY = 36;
      sourceCtx.beginPath();
      sourceCtx.moveTo(9, -9);
      sourceCtx.lineTo(25, -9);
      sourceCtx.stroke();
      referenceCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      referenceCtx.globalAlpha = 0.6;
      referenceCtx.translate(origin.x, origin.y);
      referenceCtx.rotate(angle);
      referenceCtx.drawImage(source, 0, 0, 18, 36, -9, -9, 9, 18);
      referenceCtx.drawImage(source, 18, 0, 32, 36, 0, -9, length, 18);
      referenceCtx.drawImage(source, 50, 0, 18, 36, length, -9, 9, 18);
      const previous = referenceCtx.getImageData(0, 0, reference.width, reference.height).data;
      const pixels = capturePixelFacts(actual, previous, frame(0.3));
      let coldAfterPressure = 0;
      let warmAfterPressure = 0;
      if (pressure) {
        for (let i = 0; i <= 1024; i += 1) {
          paint(ctx, "capture", origin, { x: origin.x + 80 + i / 16, y: origin.y });
        }
        detachedComposites = 0;
        frame(0.6);
        coldAfterPressure = detachedComposites;
        detachedComposites = 0;
        frame(0.6);
        warmAfterPressure = detachedComposites;
      }
      setFacts(
        JSON.stringify({
          warmComposites,
          frames: 24,
          ...pixels,
          coldAfterPressure,
          warmAfterPressure,
        }),
      );
    } finally {
      CanvasRenderingContext2D.prototype.drawImage = nativeDraw;
    }
  }, [dpr, length, angle, palette, pressure]);
  return (
    <div>
      <canvas ref={ref} width={200 * dpr} height={200 * dpr} style={{ color: palette, width: 200, height: 200 }} />
      <output>{facts}</output>
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
