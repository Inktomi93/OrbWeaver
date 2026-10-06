import type { RpgActorView, RpgConfigView, RpgTrackerView } from "@orb/contracts/rpg";
import { RPG_PROFILE_D20, rpgConfigViewSchema } from "@orb/contracts/rpg";
import { castId } from "@orb/kit/ids";

export const FIRST_SESSION_USER = castId<import("@orb/kit/ids").UserId>("user_ct_first_session");

export function firstSessionConfig(): RpgConfigView {
  return rpgConfigViewSchema.parse({
    statProfile: RPG_PROFILE_D20,
    ruleset: "d20",
    gmPresetId: null,
    steeringNote: "Keep the mystery.",
    presetMacroNames: [],
    trackers: [],
    userMacros: [],
  });
}

function firstSessionActor(attributes: Readonly<Record<string, number>> = {}): RpgActorView {
  return {
    actorRef: { kind: "user", userId: FIRST_SESSION_USER },
    name: "Player",
    presence: true,
    identity: null,
    sheet: { className: "", flavor: "", level: null, attributes: { ...attributes }, trackerGrants: [], trackerRevokes: [] },
    volatile: null,
    trackers: [],
  };
}

export function firstSessionTracker(attributes: Readonly<Record<string, number>> = {}): RpgTrackerView {
  return {
    ambient: null,
    actors: [firstSessionActor(attributes)],
    cast: [],
    trackerDefs: [],
    gameTrackers: [],
    quests: [],
    plot: null,
    recentBeats: [],
    trackersReadOnly: false,
    trackerOrbs: [],
    lockedPaths: [],
  };
}
