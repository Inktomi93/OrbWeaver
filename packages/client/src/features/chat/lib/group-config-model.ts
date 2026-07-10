// The PURE group-config model — the wire↔flat mapping for the Group tab's autosave form, with ZERO
// react/forms/ui imports (contracts + kit types only) so node-lane tests can deep-import it without
// dragging the browser primitives the `createAutosaveEntityForm` bound-fields pull in (purity is
// transitive — a hook is not a pure module). `use-group-config-form.ts` wires these into the factory.
//
// THE DU IS A WHOLE-OBJECT WRITE. `GroupConfig` is a discriminated union on `output` (narrator ⇒ one
// merged message, NO per-speaker card-scope · per-speaker ⇒ one message each, carries `cardScope`). The
// form edits a FLAT projection (`GroupConfigFormValues`, a superset of both arms); `toGroupConfigForm`
// projects wire→flat and `fromGroupConfigForm` REBUILDS the whole object onto the correct arm — the
// narrator arm is `.strict()` and carries NO `cardScope`, so a field-patch of the stored union would be an
// invalid blob. `groupCharacterId` (the server-minted synthetic-group-character id, declared on BOTH arms)
// rides through OPAQUELY — a non-editable passthrough the rebuild re-attaches rather than clobbers.

import type { GroupConfig, GroupPolicy, MemberCardVisibility } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";

type GroupOutput = GroupConfig["output"];

/** The flat editing projection the form binds — a superset of both DU arms. `fromGroupConfigForm`
 *  projects it back onto the correct arm so `cardScope` only survives on per-speaker. */
export interface GroupConfigFormValues {
  readonly output: GroupOutput;
  readonly policy: GroupPolicy;
  /** per-speaker only: each character sees only its own card (⇒ wire `cardScope: "scoped"`). */
  readonly scopedCards: boolean;
  readonly speakerTags: boolean;
  readonly groupNudge: boolean;
  readonly autoMode: boolean;
  readonly autoModeMaxTurns: number;
  readonly autoModeDelayMs: number;
  readonly allowSelfResponses: boolean;
  readonly memberCardVisibility: MemberCardVisibility;
  /** The server-minted synthetic-group-character id — a non-editable PASSTHROUGH (NO control): carried
   *  through the form values so the whole-object rebuild RE-ATTACHES it (both DU arms declare it) rather
   *  than clobbering a synced-truth id the user never touched. Absent until the id is minted. */
  readonly groupCharacterId?: CharacterId;
}

/** speakerTags' default coupled to output — narrator labels each line by default; the per-speaker stream
 *  already attributes per message, so tags default off there. Re-derived on a mode switch (the coupling
 *  holds on switch, not just load). */
export function defaultSpeakerTags(output: GroupOutput): boolean {
  return output === "narrator";
}

/** Wire `GroupConfig` → the flat editing projection (an absent per-speaker card-scope ⇒ scopedCards off). */
export function toGroupConfigForm(config: GroupConfig): GroupConfigFormValues {
  return {
    output: config.output,
    policy: config.policy,
    scopedCards: config.output === "per-speaker" ? config.cardScope === "scoped" : false,
    speakerTags: config.speakerTags,
    groupNudge: config.groupNudge,
    autoMode: config.autoMode,
    autoModeMaxTurns: config.autoModeMaxTurns,
    autoModeDelayMs: config.autoModeDelayMs,
    allowSelfResponses: config.allowSelfResponses,
    memberCardVisibility: config.memberCardVisibility,
    // Capture the minted id opaquely (absent ⇒ omit — exactOptional; a room that never minted one stays
    // byte-identical to today).
    ...(config.groupCharacterId === undefined ? {} : { groupCharacterId: config.groupCharacterId }),
  };
}

/** The flat projection → wire `GroupConfig`, REBUILDING the whole object onto the correct discriminated
 *  arm — narrator drops `cardScope` (its `.strict()` arm rejects it). The single owner of the union shape
 *  on the client (the immediate-commit chat law's whole-object write). */
export function fromGroupConfigForm(values: GroupConfigFormValues): GroupConfig {
  const shared = {
    policy: values.policy,
    speakerTags: values.speakerTags,
    groupNudge: values.groupNudge,
    autoMode: values.autoMode,
    autoModeMaxTurns: values.autoModeMaxTurns,
    autoModeDelayMs: values.autoModeDelayMs,
    allowSelfResponses: values.allowSelfResponses,
    memberCardVisibility: values.memberCardVisibility,
    // Re-attach the opaque passthrough onto the rebuilt object (both arms declare it) so a whole-object
    // write never clobbers the minted id. Absent ⇒ omit (byte-identical to today's no-id write).
    ...(values.groupCharacterId === undefined ? {} : { groupCharacterId: values.groupCharacterId }),
  } as const;
  return values.output === "narrator"
    ? { output: "narrator", ...shared }
    : { output: "per-speaker", cardScope: values.scopedCards ? "scoped" : "merged", ...shared };
}
