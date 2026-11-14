import type { AssetBlobRefHolder } from "@orb/contracts/assets";
import type { AssetId, CharacterId, PersonaId, UserId } from "@orb/kit/ids";

/** The owner reads the co-participant art gate joins with its own room reads. Assets, character and persona each
 *  implement one and answer only for what they are given; the room scope (presence, consent, history floor, pin) is
 *  the gate's, so compose wires them only into its two verbs. */
export interface RoomArtReads {
  /** Each asset row holding the bytes `hash` names, mapped to its owner. CAS dedup is per owner, so one row per owner. */
  readonly loadHashHolders: (hash: string) => Promise<ReadonlyMap<AssetId, UserId>>;
  /** The render ref and owner of each of `assetIds` that exists. */
  readonly loadAssetRefHolders: (assetIds: readonly AssetId[]) => Promise<ReadonlyMap<AssetId, AssetBlobRefHolder>>;
  /** The avatar of each of `characterIds` that has one. */
  readonly loadCharacterAvatars: (characterIds: readonly CharacterId[]) => Promise<ReadonlyMap<CharacterId, AssetId>>;
  /** The avatar of each of `personaIds` that has one. */
  readonly loadPersonaAvatars: (personaIds: readonly PersonaId[]) => Promise<ReadonlyMap<PersonaId, AssetId>>;
}
