// The identity art a row paints beside or above its text: echo's feathered tile and whisper's band. Each asks for
// the image at the width its slot actually renders, and falls back to the speaker's hue fill and initial when there
// is no image or the image fails to load.

import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import type { CSSProperties, ReactElement } from "react";
import { useEffect, useLayoutEffect, useState } from "react";
import { cn } from "#lib";
import type { BubbleDecoration } from "../lib/art-decorations.ts";

/** A speaker's art as the tap target that opens it full size: `open` receives the button so focus can return to it. */
export interface ArtView {
  readonly label: string;
  readonly open: (opener: HTMLElement) => void;
}

// Slot widths snap up to this step so a resize does not refetch the image for every pixel.
const WIDTH_STEP_PX = 16;

// The slot's measured CSS width, the URL asked at that width, and whether that image failed to load.
function useSlotImage(urlAt: ((cssWidth: number) => string) | undefined): {
  /** A callback ref for the slot's element; its measured width drives the request. */
  readonly attach: (element: HTMLDivElement | null) => void;
  readonly url: string | undefined;
  readonly failed: boolean;
} {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const wantsImage = urlAt !== undefined;
  useLayoutEffect(() => {
    if (!wantsImage || element === null) {
      return;
    }
    const measure = (): void => setWidth(Math.ceil(element.getBoundingClientRect().width / WIDTH_STEP_PX) * WIDTH_STEP_PX);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return (): void => observer.disconnect();
  }, [wantsImage, element]);
  const url = urlAt === undefined || width <= 0 ? undefined : urlAt(width);
  useEffect(() => {
    if (url === undefined) {
      return;
    }
    const probe = new Image();
    probe.onerror = (): void => setFailedUrl(url);
    probe.src = url;
    return (): void => {
      probe.onerror = null;
    };
  }, [url]);
  return { attach: setElement, url, failed: url !== undefined && failedUrl === url };
}

// Fills the art it sits in, so the whole tile is the control. The ghost-fill hover is dropped: a tint over the
// art itself would read as a smudge, and the press scale already answers a tap. It is not a tab stop: the
// speaker's chip beside it opens the same image, so keyboard readers get one stop per row.
function ArtViewButton({ view, rounding = "" }: { readonly view: ArtView; readonly rounding?: string }): ReactElement {
  return (
    <Button
      aria-label={view.label}
      className={cn("absolute inset-0 cursor-pointer hover:bg-transparent active:bg-transparent", rounding) ?? ""}
      intent="ghost"
      tabIndex={-1}
      onClick={(event): void => view.open(event.currentTarget)}
      size="media"
    />
  );
}

// The initial in the avatar fallback's own ink, sized by its slot (a size container, so the letter scales with the
// art instead of staying a chip-sized glyph). The art is decorative, so it is hidden from the tree.
export function FallbackLetter({
  initials,
  className,
  size = "50cqmin",
}: {
  readonly initials: string;
  readonly className: string;
  readonly size?: string;
}): ReactElement {
  const sized: CSSProperties = { containerType: "size" };
  const letter: CSSProperties = { fontSize: size, lineHeight: 1 };
  return (
    <Stack align="center" aria-hidden="true" className={className} justify="center" style={sized}>
      <Stack className="font-medium text-primary-foreground uppercase" style={letter}>
        {initials}
      </Stack>
    </Stack>
  );
}

/** Whisper's band: the hue fill with the initial in its solid top, or the banner image over it, under the feather. */
export function WhisperBand({ band, view }: { readonly band: NonNullable<BubbleDecoration["headerBand"]>; readonly view: ArtView | null }): ReactElement {
  const { attach, url, failed } = useSlotImage(band.image?.urlAt);
  const style: CSSProperties =
    url === undefined
      ? { ...band.style, backgroundImage: band.feather, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }
      : {
          ...band.style,
          backgroundImage: `${band.feather}, url("${url}")`,
          backgroundSize: "100% 100%, cover",
          backgroundPosition: "0 0, top center",
          backgroundRepeat: "no-repeat, no-repeat",
        };
  return (
    <Stack
      aria-hidden={view === null ? "true" : undefined}
      data-slot="message-band"
      className={cn("relative rounded-t-card", view !== null && "hover:opacity-80", band.className)}
      ref={attach}
      style={style}
    >
      {band.image === undefined || failed ? <FallbackLetter className="absolute inset-x-0 top-0 h-3/5" initials={band.fallback} size="70cqmin" /> : null}
      {view === null ? null : <ArtViewButton view={view} />}
    </Stack>
  );
}

/** Echo's tile: a positioned pane on the role's side (a portrait's height, Moonlit's fixed mobile height on a phone,
 *  never past the card's own foot), cover-cropped and feathered by its own mask. The mask sits on the inner tile
 *  only, so the button over it is an unmasked layer and its focus ring shows. */
export function EchoArtTile({ art, view }: { readonly art: NonNullable<BubbleDecoration["art"]>; readonly view: ArtView | null }): ReactElement {
  const { attach, url, failed } = useSlotImage(art.image?.urlAt);
  const rounding = art.side === "left" ? "rounded-tl-card" : "rounded-tr-card";
  const { width, ...paint } = art.style;
  const paintStyle: CSSProperties = url === undefined ? paint : { ...paint, backgroundImage: `url("${url}")` };
  return (
    <Stack
      aria-hidden={view === null ? "true" : undefined}
      className={cn(
        "absolute top-0 aspect-(--aspect-portrait) max-h-full @max-md:aspect-auto @max-md:h-(--immersive-echo-art-height-phone)",
        view === null ? "pointer-events-none" : "group/art",
        art.side === "left" ? "left-0" : "right-0",
      )}
      ref={attach}
      style={{ width }}
    >
      <Stack
        data-slot="message-echo-art"
        className={cn("absolute inset-0 bg-center bg-cover bg-no-repeat", view !== null && "group-hover/art:opacity-80", rounding)}
        style={paintStyle}
      >
        {art.image === undefined || failed ? <FallbackLetter className="absolute inset-0" initials={art.fallback} /> : null}
      </Stack>
      {view === null ? null : <ArtViewButton view={view} rounding={rounding} />}
    </Stack>
  );
}
