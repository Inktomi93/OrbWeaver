import { initialsFor } from "@orb/kit/initials";
import type { ComponentProps, ReactElement } from "react";
import { cn } from "#lib";
import type { AvatarProps } from "#primitives/avatar";
import { Avatar } from "#primitives/avatar";
import { avatarStackVariants } from "./variants.ts";

export interface AvatarStackItem {
  readonly src?: string;
  readonly name: string;
}

type AvatarSize = NonNullable<AvatarProps["size"]>;

const DEFAULT_MAX = 4;

// Per-item overlap offset by size — rides as inline style rather than a class (geometry, not a styling axis).
const OVERLAP_PX: Record<AvatarSize, number> = { sm: 12, md: 14, lg: 18, hero: 28 };

export interface AvatarStackProps extends Omit<ComponentProps<"div">, "children"> {
  readonly items: readonly AvatarStackItem[];
  /** Avatars shown before the rest collapse into a "+N" overflow chip. @defaultValue 4 */
  readonly max?: number;
  /** Matches `<Avatar size>`'s scale. @defaultValue "md" */
  readonly size?: AvatarSize;
}

/** N overlapping `<Avatar>`s plus a "+N" overflow chip, which IS one more Avatar (fallback renders "+N"). */
export function AvatarStack({ className, items, max = DEFAULT_MAX, size = "md", ...rest }: AvatarStackProps): ReactElement {
  const count = items.length;
  // `max` is the TOTAL slot budget (real avatars + overflow chip), not the real-avatar count.
  const visibleCount = count > max ? Math.max(max - 1, 0) : count;
  const overflow = count - visibleCount;
  const visible = items.slice(0, visibleCount);
  const slots = avatarStackVariants();

  return (
    // biome-ignore lint/a11y/useSemanticElements: <fieldset> is a form-grouping control (needs a <legend>) — semantically wrong for a decorative avatar cluster; role="group" has no native element equivalent here.
    <div
      // The default accessible name sits BEFORE the spread ON PURPOSE (ui-accname-survives-spread): JSX
      // later-wins, so a caller-passed aria-label ("N characters") beats this generic fallback.
      aria-label={`${count} ${count === 1 ? "person" : "people"}`}
      {...rest}
      className={cn(slots.root(), className)}
      data-slot="avatar-stack-root"
      role="group"
    >
      {visible.map((item, index) => (
        <Avatar
          {...(item.src === undefined ? {} : { src: item.src })}
          alt={item.name}
          aria-label={item.name}
          className={slots.item()}
          data-slot="avatar-stack-item"
          // biome-ignore lint/suspicious/noArrayIndexKey: the item shape ({src?, name}) carries no stable id; render order is positional for a given props.items array.
          key={index}
          role="img"
          size={size}
          style={index === 0 ? undefined : { marginInlineStart: -OVERLAP_PX[size] }}
        >
          {initialsFor(item.name)}
        </Avatar>
      ))}
      {overflow > 0 ? (
        <Avatar
          aria-label={`${overflow} more`}
          className={slots.item()}
          data-slot="avatar-stack-overflow"
          role="img"
          size={size}
          style={{ marginInlineStart: -OVERLAP_PX[size] }}
        >
          {`+${overflow}`}
        </Avatar>
      ) : null}
    </div>
  );
}
