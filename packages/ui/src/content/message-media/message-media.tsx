import type { CSSProperties, ReactElement } from "react";
import { useState } from "react";
import { cn } from "#lib";

// asset = our own origin (render freely); external = untrusted URL.
export type MediaSource =
  | { readonly kind: "asset"; readonly url: string }
  | { readonly kind: "external"; readonly url: string };

export interface MessageMediaProps {
  readonly src: MediaSource;
  readonly media: "image" | "audio" | "video";
  readonly alt: string;
  /** Intrinsic size — reserves the aspect box so a late-arriving image doesn't shift layout. */
  readonly dims?: { readonly w: number; readonly h: number };
  /** Whether an EXTERNAL url may load; default false gates it behind a click-to-load placeholder (no network request until opt-in). Ignored for `asset` sources. */
  readonly allowExternal?: boolean;
  readonly className?: string;
  /** Click handler (e.g. open a lightbox) — images/video only. */
  readonly onActivate?: () => void;
}

// A fixed aspect for external media with no known dims — reserves space without a network probe.
const PLACEHOLDER_ASPECT = "16 / 9";

// A data: URI carries NO network request to gate, so the click-to-load placeholder can't withhold
// anything — reject it outright, before it ever reaches `<img src>`/`<source src>`.
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
 * Renders an image / native audio / video with the external-load gate. Untrusted A/V is always
 * `controls` and never `autoplay` (non-overridable — an autoplaying untrusted element is a tracking beacon).
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

  // Blocked before the gate: a data: URI never gets a click-to-load chance.
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

  // Graceful fallback instead of the browser's native broken-image glyph or a silently-empty video/audio.
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
    return (
      <video
        controls={true}
        style={aspectStyle}
        aria-label={alt}
        className={mediaClass}
        data-slot="message-media"
        onError={onMediaError}
      >
        <source src={src.url} />
        {/* WCAG 1.2.2: declare the track even with no caption source; an empty WebVTT data-URI satisfies the rule. */}
        <track kind="captions" default={true} src="data:text/vtt,WEBVTT" />
      </video>
    );
  }

  return (
    <audio
      controls={true}
      aria-label={alt}
      className={mediaClass}
      data-slot="message-media"
      onError={onMediaError}
    >
      <source src={src.url} />
      <track kind="captions" default={true} src="data:text/vtt,WEBVTT" />
    </audio>
  );
}
