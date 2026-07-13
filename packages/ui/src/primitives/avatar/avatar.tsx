import type {
  AvatarFallbackProps as BaseFallbackProps,
  AvatarImageProps as BaseImageProps,
  AvatarRootProps as BaseRootProps,
} from "@base-ui/react/avatar";
import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import type { ReactElement, ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";
import { avatarFallbackHue } from "./hue";
import { avatarVariants } from "./variants";

export interface AvatarProps
  extends Omit<BaseRootProps, "className">,
    Omit<VariantProps<typeof avatarVariants>, "hue"> {
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
      {/* Decorative visual stand-in for a missing image — aria-hidden so its letters never leak into an accessible name. */}
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
