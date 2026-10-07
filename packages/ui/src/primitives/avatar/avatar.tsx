import type { AvatarFallbackProps as BaseFallbackProps, AvatarImageProps as BaseImageProps, AvatarRootProps as BaseRootProps } from "@base-ui/react/avatar";
import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import type { ReactElement, ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";
import { variantAttrs } from "#lib";
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
  /** Retain the image while loading or failed; its native hidden state leaves the fallback's box intact. */
  keepMounted?: BaseImageProps["keepMounted"];
  /** Fallback content — typically initials. */
  children?: ReactNode;
}

/** Seals Base UI Avatar (image with automatic fallback-on-error). */
export function Avatar(props: AvatarProps): ReactElement {
  const { className, src, alt = "", children, size, shape, aspect, ring, hueSeed, fallbackDelay, onLoadingStatusChange, keepMounted, ...rest } = props;
  const slots = avatarVariants({ size, shape, aspect, ring });
  const seed = hueSeed ?? alt;
  return (
    // STAMP SITE (#1097): the ROOT. `size` is the only stamped axis this recipe declares and the root is
    // the box it sizes — the element a contrast/geometry census targets; image and fallback are its fill.
    <BaseAvatar.Root className={slots.root({ className })} data-slot="avatar-root" {...variantAttrs(avatarVariants, { size })} {...rest}>
      {src === undefined ? null : (
        // `decoding="async"` is not polish (side-eye corpus re-pass 2026-08-19, C6): a surface that mounts
        // sixty avatars in one frame pays every image decode INSIDE that frame by default, which is part of
        // what a 654ms long frame is made of. Async decoding hands them to the compositor instead — the
        // fallback already covers the gap before an image resolves, so there is nothing to flash.
        <BaseAvatar.Image
          alt={alt}
          className={slots.image()}
          data-slot="avatar-image"
          decoding="async"
          height={1}
          keepMounted={keepMounted}
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
