import type {
  AvatarFallbackProps as BaseFallbackProps,
  AvatarImageProps as BaseImageProps,
  AvatarRootProps as BaseRootProps,
} from "@base-ui/react/avatar";
import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import type { ReactElement, ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";
import { avatarVariants } from "./variants";

export interface AvatarProps
  extends Omit<BaseRootProps, "className">,
    VariantProps<typeof avatarVariants> {
  className?: string;
  /** Image source; when it fails to load (or is omitted) the fallback children render instead. */
  src?: string;
  alt?: string;
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
 * ride the control-height tokens; shape is round or square. `fallbackDelay` avoids the initials-flash
 * on a fast load; `onLoadingStatusChange` reports the image's load lifecycle.
 * `<Avatar size="lg" shape="square" src={user.iconUrl} alt={user.name}>NT</Avatar>`
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
    fallbackDelay,
    onLoadingStatusChange,
    ...rest
  } = props;
  const slots = avatarVariants({ size, shape });
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
