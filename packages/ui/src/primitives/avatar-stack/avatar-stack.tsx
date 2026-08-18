import { initialsFor } from "@orb/kit/initials";
import type { ComponentProps, ReactElement } from "react";
import { cn } from "#lib";
import type { AvatarProps } from "#primitives/avatar";
import { Avatar } from "#primitives/avatar";
import { AVATAR_STACK_OVERLAP_PX } from "./geometry.ts";
import { avatarStackVariants } from "./variants.ts";

export interface AvatarStackItem {
  readonly src?: string;
  readonly name: string;
}

type AvatarSize = NonNullable<AvatarProps["size"]>;
type AvatarShape = NonNullable<AvatarProps["shape"]>;

const DEFAULT_MAX = 4;

export interface AvatarStackProps extends Omit<ComponentProps<"div">, "children"> {
  readonly items: readonly AvatarStackItem[];
  /** Avatars shown before the rest collapse into a "+N" overflow chip. @defaultValue 4 */
  readonly max?: number;
  /** Matches `<Avatar size>`'s scale. @defaultValue "md" */
  readonly size?: AvatarSize;
  /**
   * Matches `<Avatar shape>`. @defaultValue "round"
   *
   * A stack is CIRCULAR everywhere it means "these people are in this row" — that is chat-list vocabulary
   * and it must not drift. The opt-in exists for the one register where the faces are ART rather than a
   * roster: home's hearth hero draws its cast at 64px in the mock's rounded-rect PORTRAIT treatment
   * (`home-c-hearth.html` `.fire .faces img{border-radius:var(--radius-base)}`, against the base
   * `.faces img{border-radius:full}` every other strip keeps). Ruled 2026-08-16 on the #102 review.
   */
  readonly shape?: AvatarShape;
}

/** N overlapping `<Avatar>`s plus a "+N" overflow chip, which IS one more Avatar (fallback renders "+N"). */
export function AvatarStack({ className, items, max = DEFAULT_MAX, size = "md", shape = "round", ...rest }: AvatarStackProps): ReactElement {
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
          // THE SEAT IS NAMED ONCE (side-eye 2026-08-16 F5). The seat used to carry its name THREE times —
          // `role="img"`+`aria-label` on the Avatar root AND `alt` on the <img> inside it — so a stack of
          // three inside a named button announced the same person at four nesting levels (measured: the
          // home hero's room name read out 5×). The ROOT keeps the name because it is the arm that works
          // for a portrait-LESS seat too (the fallback initials are aria-hidden by design); the image goes
          // decorative. `hueSeed` is then explicit: the fallback hue defaulted to `alt`, so emptying alt
          // without it would collapse every seat onto one colour.
          alt=""
          aria-label={item.name}
          className={slots.item()}
          data-slot="avatar-stack-item"
          hueSeed={item.name}
          // biome-ignore lint/suspicious/noArrayIndexKey: the item shape ({src?, name}) carries no stable id; render order is positional for a given props.items array.
          key={index}
          role="img"
          shape={shape}
          size={size}
          style={index === 0 ? undefined : { marginInlineStart: -AVATAR_STACK_OVERLAP_PX[size] }}
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
          shape={shape}
          size={size}
          style={{ marginInlineStart: -AVATAR_STACK_OVERLAP_PX[size] }}
        >
          {`+${overflow}`}
        </Avatar>
      ) : null}
    </div>
  );
}
