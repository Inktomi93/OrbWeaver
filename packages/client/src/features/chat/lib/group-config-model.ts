// The pure group-config model — the wire<->flat mapping for the Group tab's autosave form, zero
// react/forms/ui imports. GroupConfig is a discriminated union on output (narrator has no per-speaker
// cardScope); the form edits a flat superset projection, and fromGroupConfigForm rebuilds the whole
// object onto the correct arm since the narrator arm is strict and rejects cardScope. BOTH arms are strict,
// so the rebuild may carry no stray key: the flat projection is exactly the editable knobs, with no opaque
// passthrough field (the synthetic group character is resolved by HANDLE server-side and never rode this
// form — that retired key died 2026-08-08).

import type { GroupConfig, GroupPolicy, MemberCardVisibility } from "@orb/contracts/chat";

type GroupOutput = GroupConfig["output"];

/** Group config is one blob per room, so the chat id (committed) / draft key keys the form's remount. */
export const GROUP_CONFIG_ENTITY_PREFIX = "group-config:";

export interface GroupConfigFormValues {
  readonly output: GroupOutput;
  readonly policy: GroupPolicy;
  /** per-speaker only: each character sees only its own card (=\> wire cardScope: "scoped"). */
  readonly scopedCards: boolean;
  readonly speakerTags: boolean;
  readonly groupNudge: boolean;
  readonly autoMode: boolean;
  readonly autoModeMaxTurns: number;
  readonly autoModeDelayMs: number;
  readonly allowSelfResponses: boolean;
  readonly memberCardVisibility: MemberCardVisibility;
}

export function defaultSpeakerTags(output: GroupOutput): boolean {
  return output === "narrator";
}

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
  };
}

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
  } as const;
  return values.output === "narrator"
    ? { output: "narrator", ...shared }
    : { output: "per-speaker", cardScope: values.scopedCards ? "scoped" : "merged", ...shared };
}
