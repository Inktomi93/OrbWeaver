// The shared discovery character avatar — a hue-seeded fallback avatar over the CAS blob (when a hash is
// present), with the name initials as the fallback glyph. The ONE home for the discovery rows' avatar
// (dossier · neighbors · browse · search hits · home gems · visuals), so the blobUrl/initials/hueSeed
// wiring can't drift (derive-modernization §W5). NOT the app-wide Avatar+initials idiom — that stays a
// separate tier-2 decision.
import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import type { ReactElement } from "react";

interface CharacterAvatarProps {
  readonly id: CharacterId;
  readonly name: string;
  readonly hash: string | null;
  /** Display size — the rows use `sm`; the dossier hero uses `lg`. @defaultValue "sm" */
  readonly size?: "sm" | "lg";
}

export function CharacterAvatar({ id, name, hash, size = "sm" }: CharacterAvatarProps): ReactElement {
  const avatarSrc = hash === null ? {} : { src: blobUrl(hash) };
  return (
    <Avatar fallbackDelay={0} hueSeed={id} size={size} {...avatarSrc}>
      {initialsFor(name)}
    </Avatar>
  );
}
