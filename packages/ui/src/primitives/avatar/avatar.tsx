import type {
  AvatarFallbackProps as BaseFallbackProps,
  AvatarImageProps as BaseImageProps,
  AvatarRootProps as BaseRootProps,
} from "@base-ui/react/avatar";
import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import type { ReactElement, ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";
import { avatarVariants } from "./variants";

// The 5 fallback hue buckets (the tuned chart-1..5 ramp) — the axis declared ONCE (Spine §7.5), the
// string keys matching the `hue` variant in variants.ts.
const AVATAR_HUES = ["1", "2", "3", "4", "5"] as const;
type AvatarHue = (typeof AVATAR_HUES)[number];
const HUE_BUCKETS = AVATAR_HUES.length;
const DJB2_SEED = 5381;
const DJB2_MULT = 33;
// Reduce each step mod (2^31 - 1) so the running hash stays a bounded, exact integer (no bitwise ops,
// no float-precision drift) while remaining well-mixed across the 5 buckets.
const HASH_MOD = 2_147_483_647;

/**
 * Deterministic per-entity fallback hue (D62): hash the stable seed → one of the 5 chart hues, so a
 * given character/persona ALWAYS resolves to the same fallback color. A tiny djb2-style polynomial
 * string hash — pure and deterministic (no PRNG, no bitwise, gate-clean) — folded into the 5-bucket
 * range. An empty seed still resolves stably (bucket 1), so a fallback is never uncolored.
 */
function hashHue(seed: string): AvatarHue {
  let h = DJB2_SEED;
  for (const ch of seed) {
    h = (h * DJB2_MULT + ch.charCodeAt(0)) % HASH_MOD;
  }
  return String((h % HUE_BUCKETS) + 1) as AvatarHue;
}

export interface AvatarProps
  extends Omit<BaseRootProps, "className">,
    Omit<VariantProps<typeof avatarVariants>, "hue"> {
  className?: string;
  /** Image source; when it fails to load (or is omitted) the fallback children render instead. */
  src?: string;
  alt?: string;
  /**
   * Stable identity to hash for the deterministic fallback hue — pass a character/persona id when the
   * display name isn't stable. Defaults to `alt`, so the fallback color is stable per name out of the
   * box. Only affects the initials fallback; a loaded image covers it.
   */
  hueSeed?: string;
  /**
   * Delay in ms before the fallback appears — set a small value (e.g. 600) to avoid an
   * initials-flash on a fast image load (Base UI `Avatar.Fallback` `delay`). @defaultValue 0
   */
  fallbackDelay?: BaseFallbackProps["delay"];
  /** Notified as the image moves through idle → loading → loaded → error (Base UI `Avatar.Image`). */
  onLoadingStatusChange?: BaseImageProps["onLoadingStatusChange"];
  /** Fallback content — typically initials. `<Avatar src={url} alt="Alex">NT</Avatar>` */
  children?: ReactNode;
}

/**
 * Avatar — seals Base UI Avatar (image with automatic fallback-on-error). Size variants sm/md/lg
 * ride the DISPLAY-avatar tokens (24/30/34px — decoupled from control heights, D62 §4.2); shape is
 * round or square. The initials fallback gets a deterministic per-entity color hashed from
 * `hueSeed ?? alt`. `fallbackDelay` avoids the initials-flash on a fast load; `onLoadingStatusChange`
 * reports the image's load lifecycle.
 * `<Avatar size="lg" shape="square" src={user.iconUrl} alt={user.name} hueSeed={user.id}>NT</Avatar>`
 * Spec: ui-package-design §6.1 dictate — Base UI Avatar, image + fallback initials (D54).
 */
export function Avatar(props: AvatarProps): ReactElement {
  const {
    className,
    src,
    alt = "",
    children,
    size,
    shape,
    hueSeed,
    fallbackDelay,
    onLoadingStatusChange,
    ...rest
  } = props;
  const slots = avatarVariants({ size, shape, hue: hashHue(hueSeed ?? alt) });
  return (
    <BaseAvatar.Root className={slots.root({ className })} data-slot="avatar-root" {...rest}>
      {src === undefined ? null : (
        <BaseAvatar.Image
          alt={alt}
          className={slots.image()}
          data-slot="avatar-image"
          onLoadingStatusChange={onLoadingStatusChange}
          src={src}
        />
      )}
      <BaseAvatar.Fallback
        className={slots.fallback()}
        data-slot="avatar-fallback"
        delay={fallbackDelay}
      >
        {children}
      </BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
