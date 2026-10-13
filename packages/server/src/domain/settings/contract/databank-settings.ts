import type { DatabankSettings } from "@orb/contracts/databank";
import type { UserId } from "@orb/kit/ids";
import type { SettingsService } from "./service.ts";

export type GetDatabankSettings = (ownerId: UserId) => Promise<DatabankSettings>;
export type DatabankSettingsLoader = SettingsService["loadUserSettings"];
