// The SYSTEM (AppSettings) autosave form (Task #37; UI-Arch §13.4 — a settings panel is a form-factory
// surface). Built on `createAutosaveEntityForm` at MODULE scope (stable hook identity, §13.1), mirroring
// `use-appearance-form`. NO draft mirror: this is an admin-only, server-synced tier (the effective config
// row IS the durable store), so a device-local Zustand crash-mirror would duplicate synced truth.
//
// The `save` seam is supplied at CALL time by the surface (it closes over the live tRPC client — a React-
// context value unreachable at module scope), same as the appearance form. `defaultValues` is a TYPE-level
// fallback only: the pane renders inside a `<QueryBoundary>` AFTER `getAppSettings` resolves, so
// `serverValues` (the projected effective config) always fully overrides these seeds — they exist because
// the factory requires a concrete default and the effective-config shape has no exported all-defaults
// constant to derive from.

import {
  DEFAULT_ALLOW_NON_OWNER_LOCAL_COMPUTE,
  DEFAULT_ALLOW_NON_OWNER_MAX_PRO_SUB,
  DEFAULT_DISCREET_LOGIN,
  DEFAULT_LOCAL_MULTI_USER,
  DEFAULT_MAX_IMAGE_BYTES,
} from "@orb/contracts/settings";
import { createAutosaveEntityForm } from "#forms";
import type { SystemSettingsForm } from "../lib/system-settings-model";
import { BYTES_PER_MB } from "../lib/system-settings-model";

/** The singleton entity id — AppSettings is one process-wide row, so a fixed key (stable `mountKey`). */
export const SYSTEM_SETTINGS_ENTITY_ID = "system";

/** Type-level fallback only (see the file header — `serverValues` always overrides it). Uses the exported
 *  born-in-DB floor constants where they exist; the env-mirrored fields carry harmless placeholders. */
const DEFAULT_SYSTEM_SETTINGS_FORM: SystemSettingsForm = {
  corpusAutoindex: false,
  logLevel: "info",
  forbidExternalMedia: true,
  trustHtml: false,
  maxImageMb: DEFAULT_MAX_IMAGE_BYTES / BYTES_PER_MB,
  vllmEmbedConcurrency: 1,
  vllmSummarizeConcurrency: 1,
  allowNonOwnerLocalCompute: DEFAULT_ALLOW_NON_OWNER_LOCAL_COMPUTE,
  nonOwnerLocalComputeBudget: null,
  allowNonOwnerMaxProSub: DEFAULT_ALLOW_NON_OWNER_MAX_PRO_SUB,
  localMultiUser: DEFAULT_LOCAL_MULTI_USER,
  discreetLogin: DEFAULT_DISCREET_LOGIN,
};

export const useSystemSettingsForm = createAutosaveEntityForm<SystemSettingsForm>({
  defaultValues: DEFAULT_SYSTEM_SETTINGS_FORM,
});
