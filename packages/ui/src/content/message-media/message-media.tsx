import type { CSSProperties, ReactElement } from "react";
import { useState } from "react";
import { cn } from "#lib";

// A ui-local discriminated source — the structural twin of D44 `MessageContentBlock.media.src`
// (ui cannot import @orb/contracts). asset = our own origin (render freely); external = untrusted URL.
type MediaSource =
  | { readonly kind: "asset"; readonly url: string }
  | { readonly kind: "external"; readonly url: string };

export interface MessageMediaProps {
  readonly src: MediaSource;
  // Union inlined on the property (not a named alias/tuple): the canonical media-kind enum is the
  // wire's @orb/contracts one — ui cannot import it (cake), and a competing ui `as const` tuple would
  // false-collide with it under the no-inline-union gate. This is the one place the inline union is right.
  readonly media: "image" | "audio" | "video";
  readonly alt: string;
  /** Intrinsic size — reserves the aspect box so a late-arriving image doesn't shift layout (§12.7). */
  readonly dims?: { readonly w: number; readonly h: number };
  /**
   * Whether an EXTERNAL url may load. Default false = D44 `forbidExternalMedia` (the load itself is
   * the tracking-pixel/exfil — §12.3): an external source renders a click-to-load placeholder and
   * issues NO network request until the user opts in. Ignored for `asset` sources (own origin).
   */
  readonly allowExternal?: boolean;
  readonly className?: string;
  /** Click handler (e.g. open a lightbox) — images/video only. */
  readonly onActivate?: () => void;
}

// A fixed aspect for external media with no known dims — reserves space without a network probe.
const PLACEHOLDER_ASPECT = "16 / 9";

// D44 §12.3 `allowDataImages:false` — an external `data:` URI carries NO network request to gate (the
// click-to-load placeholder exists to withhold a FETCH), so the fetch-gate model can't handle it at
// all: unblocked, it would render immediately and unconditionally the instant `allowExternal`/click
// bypassed the placeholder. Reject it outright, before it ever reaches `<img src>`/`<source src>`.
const DATA_URI = /^data:/iu;

function isDataUri(url: string): boolean {
  return DATA_URI.test(url.trim());
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "external source";
  }
}

/**
 * `<MessageMedia>` (D44 §12.3) — renders an image / native audio / video with the external-load gate.
 * asset sources render directly (our origin); external sources are gated behind a click-to-load
 * placeholder by default (`allowExternal` defaults false). Untrusted A/V is ALWAYS `controls` +
 * NEVER `autoplay` (non-overridable — an autoplaying untrusted `<audio>` is a tracking beacon).
 *
 * Usage: `<MessageMedia src={{ kind:"external", url }} media="image" alt="" />`.
 * Spec: UI-Theming §12.3 (D44) — the media trust boundary.
 */
export function MessageMedia({
  src,
  media,
  alt,
  dims,
  allowExternal = false,
  className,
  onActivate,
}: MessageMediaProps): ReactElement {
  const isExternal = src.kind === "external";
  const blockedDataUri = isExternal && isDataUri(src.url);
  const [loadRequested, setLoadRequested] = useState(false);
  const [broken, setBroken] = useState(false);
  const gated = isExternal && !blockedDataUri && !allowExternal && !loadRequested;
  const requestLoad = (): void => setLoadRequested(true);
  const onMediaError = (): void => setBroken(true);

  const aspectStyle: CSSProperties = {
    aspectRatio: dims === undefined ? PLACEHOLDER_ASPECT : `${dims.w} / ${dims.h}`,
  };

  const fallbackClass = cn(
    "flex w-full max-w-full items-center justify-center rounded-card border border-border bg-muted p-block text-body text-muted-foreground",
    className,
  );

  // Blocked BEFORE the gate: a data: URI never gets a click-to-load chance (§12.3 above).
  if (blockedDataUri) {
    return (
      <div className={fallbackClass} style={aspectStyle} data-slot="message-media-blocked">
        Media blocked
      </div>
    );
  }

  if (gated) {
    return (
      <button
        type="button"
        onClick={requestLoad}
        className={fallbackClass}
        style={aspectStyle}
        data-slot="message-media-placeholder"
      >
        External media — load from {hostOf(src.url)}?
      </button>
    );
  }

  // Dead/blocked media (network failure, 404, unsupported codec, …) — a graceful fallback instead of
  // the browser's native broken-image glyph or a silently-empty <video>/<audio> (§6.1/§12.3).
  if (broken) {
    return (
      <div className={fallbackClass} style={aspectStyle} data-slot="message-media-broken">
        Media unavailable
      </div>
    );
  }

  const mediaClass = cn("max-w-full rounded-card", className);

  if (media === "image") {
    const img = (
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError is a load-status callback, not a user interaction — the standard React pattern for a broken-image fallback.
      <img
        src={src.url}
        alt={alt}
        loading="lazy"
        style={aspectStyle}
        className={mediaClass}
        data-slot="message-media"
        onError={onMediaError}
      />
    );
    // A clickable image is wrapped in a button (keyboard-operable) — never an onClick on the <img>.
    return onActivate === undefined ? (
      img
    ) : (
      <button
        type="button"
        onClick={onActivate}
        className="block max-w-full"
        data-slot="message-media-zoom"
      >
        {img}
      </button>
    );
  }

  if (media === "video") {
    // Untrusted external video: controls REQUIRED, autoplay FORBIDDEN (non-overridable). Asset video
    // keeps controls on + autoplay off uniformly (no surprise playback).
    return (
      // biome-ignore lint/a11y/useMediaCaption: untrusted external media carries no caption track; captions are a Phase-6 asset-pipeline concern.
      <video
        controls={true}
        style={aspectStyle}
        aria-label={alt}
        className={mediaClass}
        data-slot="message-media"
        onError={onMediaError}
      >
        <source src={src.url} />
      </video>
    );
  }

  return (
    // biome-ignore lint/a11y/useMediaCaption: untrusted external audio carries no caption track (no source of captions for arbitrary media).
    <audio
      controls={true}
      aria-label={alt}
      className={mediaClass}
      data-slot="message-media"
      onError={onMediaError}
    >
      <source src={src.url} />
    </audio>
  );
}
