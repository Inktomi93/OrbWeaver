import type { ReactElement } from "react";
import { useLayoutEffect, useState } from "react";
import { Icon, ImageOff } from "#primitives/icons";
import { crossfadeImageVariants } from "./variants";

export interface CrossfadeImageProps {
  /** The image to display. `null` renders no image but still reserves the aspect box. */
  readonly src: string | null;
  readonly alt: string;
  /** CSS `aspect-ratio` — reserves the layout box even when `src` is null. */
  readonly aspectRatio: string | number;
  /** `object-fit` inside the aspect box. `cover` (default) fills + crops; `contain` letterboxes. */
  readonly fit?: "cover" | "contain";
  /** Crossfade duration override, in ms. Unset uses the `--motion-base` token. */
  readonly durationMs?: number;
  readonly className?: string;
}

interface TopLayer {
  readonly key: number;
  readonly src: string;
  readonly revealed: boolean;
}

interface Layers {
  /** Monotonic counter — also the next `top.key`, forcing a fresh `<img>` node per src change. */
  readonly generation: number;
  readonly previousSrc: string | null;
  readonly top: TopLayer | null;
}

function initialLayers(src: string | null): Layers {
  return {
    generation: 0,
    previousSrc: null,
    top: src === null ? null : { key: 0, src, revealed: true },
  };
}

/**
 * Two-layer CSS opacity crossfade on `src` change. Collapses to an instant swap under
 * `prefers-reduced-motion` via the globals.css unlayered floor — no JS media-query branching needed.
 * A failing `src` swaps to a styled broken-image fallback instead of the browser's native glyph.
 */
export function CrossfadeImage({
  src,
  alt,
  aspectRatio,
  fit,
  durationMs,
  className,
}: CrossfadeImageProps): ReactElement {
  // Mirrors `src` so a prop change is detected and reacted to DURING render, not a setState-in-effect cascade.
  const [propSrc, setPropSrc] = useState(src);
  const [layers, setLayers] = useState<Layers>(() => initialLayers(src));
  // A fresh `src` gets a fresh generation key, so this never needs clearing on success.
  const [brokenKey, setBrokenKey] = useState<number | null>(null);

  if (src !== propSrc) {
    setPropSrc(src);
    const generation = layers.generation + 1;
    setLayers({
      generation,
      previousSrc: src === null ? null : (layers.top?.src ?? null),
      top: src === null ? null : { key: generation, src, revealed: false },
    });
  }

  // Flip the fresh top layer to revealed on the next frame so the opacity transition actually
  // plays (mounting already-revealed would skip the 0→1 transition entirely).
  useLayoutEffect((): (() => void) | undefined => {
    if (layers.top === null || layers.top.revealed) {
      return;
    }
    const revealKey = layers.top.key;
    const frame = requestAnimationFrame((): void => {
      setLayers((state) =>
        state.top !== null && state.top.key === revealKey
          ? { ...state, top: { ...state.top, revealed: true } }
          : state,
      );
    });
    return (): void => cancelAnimationFrame(frame);
  }, [layers.top]);

  const slots = crossfadeImageVariants({ fit });
  const overrideStyle =
    durationMs === undefined ? undefined : { transitionDuration: `${durationMs}ms` };

  const topIsBroken = layers.top !== null && layers.top.key === brokenKey;

  return (
    <div className={slots.root({ className })} data-slot="crossfade-image" style={{ aspectRatio }}>
      {layers.previousSrc !== null && !topIsBroken && (
        <img
          alt={alt}
          className={slots.image()}
          data-slot="crossfade-image-previous"
          src={layers.previousSrc}
        />
      )}
      {layers.top !== null && topIsBroken && (
        <div className={slots.fallback()} data-slot="crossfade-image-fallback">
          <Icon icon={ImageOff} label={`${alt} failed to load`} size="md" />
        </div>
      )}
      {layers.top !== null && !topIsBroken && (
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError is a load-failure callback, not a user interaction — the standard broken-image-fallback wiring for a non-interactive <img>.
        <img
          alt={alt}
          className={slots.image({ revealed: layers.top.revealed })}
          data-slot="crossfade-image-current"
          key={layers.top.key}
          onError={(): void => {
            if (layers.top === null) {
              return;
            }
            setBrokenKey(layers.top.key);
            setLayers((state) => ({ ...state, previousSrc: null }));
          }}
          onTransitionEnd={(event): void => {
            if (event.propertyName === "opacity") {
              setLayers((state) => ({ ...state, previousSrc: null }));
            }
          }}
          src={layers.top.src}
          style={overrideStyle}
        />
      )}
    </div>
  );
}
