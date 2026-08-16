import type { AvatarFallbackProps as BaseFallbackProps, AvatarImageProps as BaseImageProps, AvatarRootProps as BaseRootProps } from "@base-ui/react/avatar";
import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import type { ReactElement, ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";
import { avatarFallbackHue, avatarFallbackHueColor } from "./hue.ts";
import { avatarVariants } from "./variants.ts";

export interface AvatarProps extends Omit<BaseRootProps, "className">, VariantProps<typeof avatarVariants> {
  className?: string;
  /** Image source; when it fails to load (or is omitted) the fallback children render instead. */
  src?: string;
  alt?: string;
  /** Stable identity to hash for the deterministic fallback hue. Defaults to `alt`. */
  hueSeed?: string;
  /** Delay in ms before the fallback appears, to avoid an initials-flash on a fast load. @defaultValue 0 */
  fallbackDelay?: BaseFallbackProps["delay"];
  onLoadingStatusChange?: BaseImageProps["onLoadingStatusChange"];
  /** Fallback content — typically initials. */
  children?: ReactNode;
}

/** Seals Base UI Avatar (image with automatic fallback-on-error). */
export function Avatar(props: AvatarProps): ReactElement {
  const { className, src, alt = "", children, size, shape, aspect, ring, hueSeed, fallbackDelay, onLoadingStatusChange, ...rest } = props;
  const slots = avatarVariants({ size, shape, aspect, ring });
  const seed = hueSeed ?? alt;
  return (
    <BaseAvatar.Root className={slots.root({ className })} data-slot="avatar-root" {...rest}>
      {src === undefined ? null : (
        <BaseAvatar.Image
          alt={alt}
          className={slots.image()}
          data-slot="avatar-image"
          height={1}
          onLoadingStatusChange={onLoadingStatusChange}
          src={src}
          width={1}
        />
      )}
      {/* Decorative visual stand-in for a missing image — aria-hidden so its letters never leak into an accessible name.
          `data-hue` is the bucket as a DOM datum (what a CT/snap asserts on); the fill itself is the derived
          relative-color expression, which is on-token by construction (it names `--color-primary` and nothing
          else) and must be inline so it resolves against the ThemeScope in effect HERE (hue.ts header). */}
      <BaseAvatar.Fallback
        className={slots.fallback()}
        data-slot="avatar-fallback"
        data-hue={avatarFallbackHue(seed)}
        delay={fallbackDelay}
        aria-hidden={true}
        style={{ backgroundColor: avatarFallbackHueColor(seed) }}
      >
        {children}
      </BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
