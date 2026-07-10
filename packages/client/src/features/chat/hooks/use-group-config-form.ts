// The group-config autosave form (UI-Primitives §13.4 — "Group-chat create + config →
// createAutosaveEntityForm"). Built on `createAutosaveEntityForm` at MODULE scope (stable hook identity,
// §13.1), the same shape as `use-room-overrides-form.ts` (the sibling Context-panel tab): no module
// `config.save` (the persist fn closes over the live tRPC client, a React-context value unreachable here)
// — the SURFACE supplies `save` at call time. No draft mirror: the immediate-commit chat law persists the
// whole config within the debounce window, so the server row IS the crash mirror (the appearance-form /
// room-overrides precedent; a local mirror would duplicate synced truth).
//
// The PURE wire↔flat mapping (values type · to/from · defaultSpeakerTags · the groupCharacterId
// passthrough) lives in `../lib/group-config-model.ts` (zero react/forms/ui imports — node-lane-testable);
// this file is only the factory wiring + the form-identity prefix.

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { createAutosaveEntityForm } from "#forms";
import type { GroupConfigFormValues } from "../lib/group-config-model";
import { toGroupConfigForm } from "../lib/group-config-model";

/** Group config is one blob per room, so the chat id (committed) / draft key keys the form's remount. */
export const GROUP_CONFIG_ENTITY_PREFIX = "group-config:";

export const useGroupConfigForm = createAutosaveEntityForm<GroupConfigFormValues>({
  defaultValues: toGroupConfigForm(DEFAULT_GROUP_CONFIG),
});
