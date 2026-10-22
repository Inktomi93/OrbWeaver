import type { ImportCardInput } from "./params.ts";
import type { ImportService } from "./service.ts";
export type ImportFile = Pick<ImportCardInput, "bytes" | "filename">;

export interface ImportCardBatchDeps {
  readonly files: readonly ImportFile[];
  readonly service: Pick<ImportService, "importCharacter">;
}
