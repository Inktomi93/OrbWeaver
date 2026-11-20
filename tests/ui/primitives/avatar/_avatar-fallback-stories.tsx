import { CtIsolation } from "@orb/testkit/browser";
import type { AvatarProps } from "@orb/ui/avatar";
import { Avatar } from "@orb/ui/avatar";
import { BASE_PALETTE_STAMP, SEED_THEME_NAMES } from "@orb/ui/tokens";
import type { ReactElement } from "react";

/** Every size an avatar takes with no picture, and a card-width portrait, each with its initials. */
export function AvatarFallbackStory({
  sizes,
  cardWidth,
}: {
  readonly sizes: readonly NonNullable<AvatarProps["size"]>[];
  readonly cardWidth: number;
}): ReactElement {
  return (
    <CtIsolation subject="Avatar fallback" isolates="The avatar's own fallback at each size and at a card's width">
      {sizes.map((size) => (
        <Avatar key={size} data-case={size} size={size} hueSeed="Ada">
          AB
        </Avatar>
      ))}
      <div data-case="card-host" style={{ inlineSize: cardWidth }}>
        <Avatar data-case="card" size="fillPortrait" shape="rounded" hueSeed="Ada">
          AB
        </Avatar>
      </div>
    </CtIsolation>
  );
}

/** The fallback fills under each seed palette: the base ramp by its own stamp, the value-set palettes by `data-theme`. */
export function AvatarFallbackThemesStory({ seeds }: { readonly seeds: readonly string[] }): ReactElement {
  const stamps = [{ name: "base", stamp: BASE_PALETTE_STAMP }, ...SEED_THEME_NAMES.map((name) => ({ name, stamp: { "data-theme": name } }))] as const;
  return (
    <CtIsolation subject="Avatar fallback palettes" isolates="The avatar fallback's fill, depth and ink under each seed palette">
      {stamps.map(({ name, stamp }) => (
        <div key={name} data-palette={name} {...stamp}>
          {seeds.map((seed) => (
            <Avatar key={seed} size="lg" hueSeed={seed}>
              {seed.slice(0, 2)}
            </Avatar>
          ))}
        </div>
      ))}
    </CtIsolation>
  );
}
