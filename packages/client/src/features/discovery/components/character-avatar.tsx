// The shared discovery character avatar — a hue-seeded fallback avatar over the CAS blob (when a hash is
// present), with the name initials as the fallback glyph. The ONE home for the discovery rows' avatar
// (dossier · neighbors · browse · search hits · home gems · visuals), so the blobUrl/initials/hueSeed
// wiring can't drift (derive-modernization §W5). NOT the app-wide Avatar+initials idiom — that stays a
// separate tier-2 decision.
//
// IT ASKS FOR A RUNG, NOT THE ORIGINAL (C6, side-eye corpus re-pass 2026-08-19). These rows drew
// `blobUrl(hash)` — the FULL-SIZE original — into a 24px box: measured on the live corpus surface, sixty
// 1840x2752 card PNGs decoded for 24x24 CSS, a contributor to the surface's 654ms mount long frame. The
// resize pipeline the fix needs already exists (`/api/blob/:hash?w=<px>` serves a webp off the fixed
// `BLOB_WIDTHS` ladder, `entry/http/blob.ts`); nothing on this surface was asking it for anything. The
// widths below are the DEVICE pixels for each display size at 2x — the ladder's first rung covers the
// 24px row avatar, the third covers the 40px dossier hero — so the served bytes are a thumbnail and the
// picture is still sharp on a retina panel. A blob whose bytes cannot be resized degrades to the
// unresized original server-side, i.e. to exactly the behaviour this replaces.
import { blobIconUrl } from "@orb/contracts/assets";
import type { CharacterId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import type { ReactElement } from "react";

/** Display size → the requested variant width, in DEVICE pixels (the CSS box at 2x, snapped to the
 *  server's ladder: `sm` 24px→48, `lg` 40px→80 which the ladder serves as its 96 rung). */
const VARIANT_WIDTH = { sm: 48, lg: 80 } as const;

interface CharacterAvatarProps {
  readonly id: CharacterId;
  readonly name: string;
  readonly hash: string | null;
  /** Display size — the rows use `sm`; the dossier hero uses `lg`. @defaultValue "sm" */
  readonly size?: "sm" | "lg";
}

export function CharacterAvatar({ id, name, hash, size = "sm" }: CharacterAvatarProps): ReactElement {
  const avatarSrc = hash === null ? {} : { src: blobIconUrl(hash, VARIANT_WIDTH[size]) };
  return (
    <Avatar fallbackDelay={0} hueSeed={id} size={size} {...avatarSrc}>
      {initialsFor(name)}
    </Avatar>
  );
}
