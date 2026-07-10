import type {
  AvatarFallbackProps as BaseFallbackProps,
  AvatarImageProps as BaseImageProps,
  AvatarRootProps as BaseRootProps,
} from "@base-ui/react/avatar";
import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import type { ReactElement, ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";
// The seed→hue math lives in `hue.ts` (EXPORTED for features painting fallback art outside this seal —
// the immersive tiles); this seal consumes the SAME function so the two can never drift (§13.7).
import { avatarFallbackHue } from "./hue";
import { avatarVariants } from "./variants";

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
 * round, square, or `rounded` (a softer rounded-rect, §B.3); `aspect` is `square` (default) or
 * `portrait` (2:3, the VN/immersive-mode presence lever); `ring` is `none` (default) or `accent` (a
 * `--color-primary` ring, reuse-ready for a future active-speaker highlight). The initials fallback
 * gets a deterministic per-entity color hashed from `hueSeed ?? alt`. `fallbackDelay` avoids the
 * initials-flash on a fast load; `onLoadingStatusChange` reports the image's load lifecycle.
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
    aspect,
    ring,
    hueSeed,
    fallbackDelay,
    onLoadingStatusChange,
    ...rest
  } = props;
  const slots = avatarVariants({
    size,
    shape,
    aspect,
    ring,
    hue: avatarFallbackHue(hueSeed ?? alt),
  });
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
      {/* The initials fallback is a DECORATIVE visual stand-in for a missing image — it is `aria-hidden`
          so its letters never leak into an accessible name (a chat row announced "UC Untitled chat…",
          a message row "N Niko"). The real identity is always adjacent text or, when an image loads,
          the `Image` `alt` (untouched). An avatar that IS the sole label of a control must carry its own
          `aria-label` — initials were never a usable name anyway. */}
      <BaseAvatar.Fallback
        className={slots.fallback()}
        data-slot="avatar-fallback"
        delay={fallbackDelay}
        aria-hidden={true}
      >
        {children}
      </BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
