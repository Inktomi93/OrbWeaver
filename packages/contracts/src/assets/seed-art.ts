// Assets stores the bundled art through its own guard; character and persona seeders consume these ops.

import type { AssetId, CharacterHandle, CharacterId } from "@orb/kit/ids";
import type { Principal } from "#identity";

/** Stores one seeded character's bundled avatar, or `null` when the pack ships none or the store fails. */
export type StoreSeedCharacterAvatar = (principal: Principal, handle: CharacterHandle) => Promise<AssetId | null>;

/** Seeds one character's starter gallery from its bundled art. */
export type SeedCharacterGallery = (principal: Principal, characterId: CharacterId, handle: CharacterHandle) => Promise<void>;

/** Stores the bundled default-persona avatar, or `null` when the pack ships none or the store fails. */
export type StoreSeedPersonaAvatar = (principal: Principal) => Promise<AssetId | null>;
