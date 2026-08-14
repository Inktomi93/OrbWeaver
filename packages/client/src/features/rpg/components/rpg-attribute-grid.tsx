// The ATTRIBUTES plane of the character takeover — the game's stat-profile vocabulary rendered as one cell
// per attribute. Extracted from `rpg-character-detail.tsx` when that file crossed the component-size cap: the
// plane is a coherent unit (the vocabulary, the clamp band, and the clear door travel together) and it is the
// only part of the takeover with a value CONTRACT of its own, so it reads better with its rule beside it.
//
// TWO RULES LIVE HERE, both paid for by RPG-STAT-CLOBBER (owner live repro 2026-08-13, "type 20 into strength,
// click out, it reverts to 1"):
//   • AN UNSET ATTRIBUTE IS AN EM-DASH, NOT THE RANGE FLOOR. This grid used to render
//     `attributes[key] ?? profile.range.min`, which is a SYNTHESIZED READING — the thing the tracker block kit
//     forbids in its own header, and what the sheet contract already ruled against ("a sheet read treats a
//     MISSING key as absent", `contracts/rpg/sheet.ts`). The floor fallback is what disguised the defect: a
//     server-side wipe of a typed `20` came back as a confident `1`, so DATA LOSS read as an edit that
//     "reverted". With the honest arm the same wipe would have read as "the value is gone".
//   • A NUMBER IS CLAMPED INTO THE PROFILE BAND; A CLEAR IS NOT. `null` is the [merge-clear] clear (the verb
//     drops the key), and it has no band to sit in — clamping it would resurrect the floor-value invention.

import type { RpgActorView, RpgStatProfile } from "@orb/contracts/rpg";
import { Grid, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { StatCell } from "#components";
import { RpgDoorwayLine } from "./rpg-doorway-line.tsx";
import { Kicker } from "./rpg-kicker.tsx";

/** The attributes plane — the profile vocabulary as stat cells (hint on title). A profile with NO attributes
 *  says so and points at where they are authored (the Game tab's Stat profile section — RV-4/RV-12). */
export function AttributeGrid({
  profile,
  actor,
  onEditAttribute,
}: {
  readonly profile: RpgStatProfile;
  readonly actor: RpgActorView;
  readonly onEditAttribute?: (key: string, next: number | null) => void;
}): ReactElement {
  return (
    <Stack gap="field">
      <Kicker>Attributes</Kicker>
      {profile.attributes.length === 0 ? (
        <RpgDoorwayLine>No attributes in this game yet — the host adds them in the Game tab's Stat profile.</RpgDoorwayLine>
      ) : (
        <Grid cols="tile" gap="field">
          {profile.attributes.map((def) => (
            <StatCell
              key={def.key}
              label={def.label}
              value={actor.sheet.attributes[def.key] ?? null}
              {...(def.hint === "" ? {} : { hint: def.hint })}
              {...(onEditAttribute === undefined
                ? {}
                : {
                    onEditValue: (next: number | null): void =>
                      onEditAttribute(def.key, next === null ? null : Math.min(profile.range.max, Math.max(profile.range.min, next))),
                  })}
            />
          ))}
        </Grid>
      )}
    </Stack>
  );
}
