// The identity art a row paints beside or above its text: echo's feathered tile and whisper's band. Each asks for
// the image at the width its slot actually renders, and falls back to the speaker's hue fill and initial when there
// is no image or the image fails to load.

import type { AvatarProps } from "@orb/ui/avatar";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ComponentProps, CSSProperties, ReactElement } from "react";
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

/** A speaker's art as the control that opens it full size. The bare intent: a tint over the art would read as a smudge,
 *  and the press scale already answers a tap. `media` sizes the button from its child, so wrapped art keeps its box. */
export function ArtButton({ view, ...button }: Omit<ComponentProps<typeof Button>, "aria-label" | "onClick"> & { readonly view: ArtView }): ReactElement {
  return <Button {...button} aria-label={view.label} intent="bare" onClick={(event): void => view.open(event.currentTarget)} size="media" />;
}

// Fills the art it sits in, so the whole tile is the control. It is not a tab stop: the speaker's chip beside it
// opens the same image, so keyboard readers get one stop per row.
function ArtViewButton({ view, corner }: { readonly view: ArtView; readonly corner?: "topStart" | "topEnd" | undefined }): ReactElement {
  return <ArtButton view={view} className="absolute inset-0" cardCorners={corner} tabIndex={-1} />;
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
  const letter: CSSProperties = { fontSize: size, lineHeight: 1 };
  return (
    <Stack align="center" aria-hidden="true" className={className} container="size" justify="center">
      <Text as="div" style={letter} tone="onPrimary" voice="monogram">
        {initials}
      </Text>
    </Stack>
  );
}

/** Whisper's band: the hue fill with the initial in its solid top, or the banner image over it, under the feather.
 *  An image that fails to load is treated exactly like no image: the plain feather, the initial, and no tap target. */
export function WhisperBand({
  band,
  view,
  onFailedChange,
}: {
  readonly band: NonNullable<BubbleDecoration["headerBand"]>;
  readonly view: ArtView | null;
  readonly onFailedChange?: ((failed: boolean) => void) | undefined;
}): ReactElement {
  const { attach, url, failed } = useSlotImage(band.image?.urlAt);
  useFailedReport(failed, onFailedChange);
  const showsImage = url !== undefined && !failed;
  const tappable = view !== null && !failed;
  const style: CSSProperties = showsImage
    ? {
        ...band.style,
        backgroundImage: `${band.feather}, url("${url}")`,
        backgroundSize: "100% 100%, cover",
        backgroundPosition: "0 0, top center",
        backgroundRepeat: "no-repeat, no-repeat",
      }
    : { ...band.style, backgroundImage: band.plainFeather, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" };
  return (
    <Stack
      aria-hidden={tappable ? undefined : "true"}
      data-slot="message-band"
      cardCorners="top"
      hoverDim={tappable ? "self" : undefined}
      // Moonlit Echoes' Glimmer preset: the banner is half the card, centred; a phone widens it to 55%.
      className="relative mx-auto inline-1/2 @max-cq-28:inline-11/20"
      ref={attach}
      style={style}
    >
      {band.image === undefined || failed ? (
        <FallbackLetter className="absolute inset-x-0 inset-bs-0 block-3/5" initials={band.fallback} size="70cqmin" />
      ) : null}
      {tappable ? <ArtViewButton view={view} /> : null}
    </Stack>
  );
}

/** Echo's tile: a positioned pane on the role's side (a portrait's height, Moonlit's fixed mobile height on a phone,
 *  never past the card's own foot), cover-cropped and feathered by its own mask. The mask sits on the inner tile
 *  only, so the button over it is an unmasked layer and its focus ring shows. */
export function EchoArtTile({
  art,
  view,
  onFailedChange,
}: {
  readonly art: NonNullable<BubbleDecoration["art"]>;
  readonly view: ArtView | null;
  readonly onFailedChange?: ((failed: boolean) => void) | undefined;
}): ReactElement {
  const { attach, url, failed } = useSlotImage(art.image?.urlAt);
  useFailedReport(failed, onFailedChange);
  const tappable = view !== null && !failed;
  const corner = art.side === "left" ? "topStart" : "topEnd";
  const { width, ...paint } = art.style;
  const paintStyle: CSSProperties = url === undefined || failed ? paint : { ...paint, backgroundImage: `url("${url}")` };
  return (
    <Stack
      aria-hidden={tappable ? undefined : "true"}
      className={cn(
        "absolute inset-bs-0 aspect-(--aspect-portrait) max-block-full @max-cq-28:aspect-auto @max-cq-28:block-(--immersive-echo-art-height-phone)",
        tappable ? undefined : "pointer-events-none",
        art.side === "left" ? "inset-s-0" : "inset-e-0",
      )}
      ref={attach}
      style={{ width }}
    >
      {/* The tile dims with its pane's hover: the button over it takes the pointer, so the tile is never hovered itself. */}
      <Stack data-slot="message-echo-art" cardCorners={corner} hoverDim={tappable ? "parent" : undefined} className="absolute inset-0" style={paintStyle}>
        {art.image === undefined || failed ? <FallbackLetter className="absolute inset-0" initials={art.fallback} /> : null}
      </Stack>
      {tappable ? <ArtViewButton view={view} corner={corner} /> : null}
    </Stack>
  );
}

// Tells the row whether its art failed to load, so the row can drop the letter chip that would repeat the fallback.
function useFailedReport(failed: boolean, onFailedChange: ((failed: boolean) => void) | undefined): void {
  useEffect(() => {
    onFailedChange?.(failed);
  }, [failed, onFailedChange]);
}

/** Ripple's portrait: the Avatar asking for its image at the width its slot renders at (times the pixel ratio),
 *  not a fixed size. With no image the Avatar's own fallback shows. */
export function PortraitAvatar({ urlAt, ...avatar }: AvatarProps & { readonly urlAt: ((cssWidth: number) => string) | undefined }): ReactElement {
  const { attach, url } = useSlotImage(urlAt);
  return <Avatar ref={attach} {...avatar} {...(url === undefined ? {} : { src: url })} />;
}
