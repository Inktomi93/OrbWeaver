// The System (AppSettings) autosave form, mounted through the D78 session boundary (`SystemSettingsForm`)
// at module scope — the boundary owns the (constant) entity key (autosave-form-doctrine.md §1/§8, D78 L4).
// No draft mirror: this is an admin-only, server-synced tier. `defaultValues` is a type-level fallback
// only — the pane renders inside a QueryBoundary after getAppSettings resolves, so serverValues always
// fully overrides these seeds.

import {
  DEFAULT_ALLOW_NON_OWNER_LOCAL_COMPUTE,
  DEFAULT_ALLOW_NON_OWNER_MAX_PRO_SUB,
  DEFAULT_DISCREET_LOGIN,
  DEFAULT_LOCAL_MULTI_USER,
  DEFAULT_MAX_IMAGE_BYTES,
} from "@orb/contracts/settings";
import { createAutosaveEntityBoundary } from "#forms";
import type { SystemSettingsForm } from "../lib/system-settings-model";
import { BYTES_PER_MB } from "../lib/system-settings-model";

/** The singleton entity id — AppSettings is one process-wide row, so a fixed key. */
export const SYSTEM_SETTINGS_ENTITY_ID = "system";

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

export const SystemSettingsAutosaveForm = createAutosaveEntityBoundary<SystemSettingsForm>({
  defaultValues: DEFAULT_SYSTEM_SETTINGS_FORM,
});
