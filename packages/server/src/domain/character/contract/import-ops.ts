import type { CharacterDetail, CreateCharacterInput } from "@orb/contracts/character";
import type { CharacterId } from "@orb/kit/ids";
import type {
  AttachImportedArtParams,
  CharacterImportProvenance,
  CreateCharacterParams,
  FindByHandleParams,
  FindByImportHashParams,
  FindByNameParams,
} from "./params.ts";
import type { CharacterRef } from "./results.ts";
import type { CharacterService } from "./service.ts";

/** The import consumer needs identity only; the source signatures remain the actual owner's params. */
export interface ImportCharacterPort extends Pick<CharacterService, "attachImportedArt"> {
  readonly create: (params: CreateCharacterParams) => Promise<Pick<CharacterDetail, "id">>;
  readonly findByImportHash: (params: FindByImportHashParams) => Promise<CharacterRef | null>;
  readonly findByHandle: (params: FindByHandleParams) => Promise<CharacterRef | null>;
  readonly findByName: (params: FindByNameParams) => Promise<readonly CharacterRef[]>;
}
export interface CharacterImportOps {
  readonly createCharacter: (args: {
    readonly input: CreateCharacterInput;
    readonly importedFrom: string | null;
    readonly importHash: string;
    readonly background?: CharacterImportProvenance["background"];
  }) => Promise<CharacterRef>;
  readonly findByImportHash: (args: Pick<FindByImportHashParams, "importHash">) => Promise<CharacterId | null>;
  readonly findByHandle: (args: Pick<FindByHandleParams, "handle">) => Promise<CharacterId | null>;
  readonly findByName: (args: Omit<FindByNameParams, "ownerId">) => Promise<readonly CharacterId[]>;
  readonly attachImportedArt: (args: Omit<AttachImportedArtParams, "ownerId">) => Promise<boolean>;
}
