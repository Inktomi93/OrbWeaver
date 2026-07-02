import type { ReactElement } from "react";
import { useLayoutEffect, useState } from "react";
import { crossfadeImageVariants } from "./variants";

export interface CrossfadeImageProps {
  /** The image to display. `null` renders no image but still reserves the aspect box. */
  readonly src: string | null;
  readonly alt: string;
  /** CSS `aspect-ratio` (e.g. `"16 / 9"` or `1`) — reserves the layout box EVEN when `src` is null. */
  readonly aspectRatio: string | number;
  /**
   * Crossfade duration override, in ms. Unset uses the `--motion-base` token (the same opacity-fade
   * duration as the dialog/toast overlays); this is a caller escape hatch, not a styling default.
   */
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
 * CrossfadeImage — a two-layer CSS opacity crossfade on `src` change: the incoming image fades in
 * over the outgoing one, which is then dropped. Collapses to an instant swap under
 * `prefers-reduced-motion` via the globals.css unlayered floor (transition-duration → 0.01ms) — no
 * JS media-query branching needed. The aspect box is reserved via `aspectRatio` even when `src` is
 * `null` (no layout shift while an image is pending).
 *
 * Usage: `<CrossfadeImage src={char.portraitUrl} alt={char.name} aspectRatio="3 / 4" />`.
 */
export function CrossfadeImage({
  src,
  alt,
  aspectRatio,
  durationMs,
  className,
}: CrossfadeImageProps): ReactElement {
  // Mirrors `src` so a prop change can be detected and reacted to DURING render (the React-endorsed
  // "adjusting state when a prop changes" pattern) instead of a setState-in-effect cascade.
  const [propSrc, setPropSrc] = useState(src);
  const [layers, setLayers] = useState<Layers>(() => initialLayers(src));

  if (src !== propSrc) {
    setPropSrc(src);
    const generation = layers.generation + 1;
    setLayers({
      generation,
      // `src === null`: just clear both layers — no fade-out is specified for removal.
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

  const slots = crossfadeImageVariants();
  const overrideStyle =
    durationMs === undefined ? undefined : { transitionDuration: `${durationMs}ms` };

  return (
    <div className={slots.root({ className })} data-slot="crossfade-image" style={{ aspectRatio }}>
      {layers.previousSrc !== null && (
        <img
          alt={alt}
          className={slots.image()}
          data-slot="crossfade-image-previous"
          src={layers.previousSrc}
        />
      )}
      {layers.top !== null && (
        <img
          alt={alt}
          className={slots.image({ revealed: layers.top.revealed })}
          data-slot="crossfade-image-current"
          key={layers.top.key}
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
