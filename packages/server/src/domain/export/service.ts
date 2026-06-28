// domain/export — COMPOSITION ROOT: wires the verb factories over the DI bundle (zero logic). The bulk
// card serializer (4c W3): `exportCharacter` reads the owner's live card off `@orb/db` directly and emits a
// V3 card PNG. The `ExportContext` (db + the infra `cas` / `imageTransform` handles) is assembled at the
// entry root and passed in; export sideways-imports none of those (domain-no-cross-feature).
//
// FLAG[PD-42]: `exportChat` (transcript → ST JSONL / TXT) joins this spread when the chat domain lands
// in P5 (D16) — see contract/service.ts. Until then the service has the single character verb.

import type { ExportContext, ExportService } from "./contract/service";
import { createExportCharacter } from "./verbs/export-character";

export function createExportService(ctx: ExportContext): ExportService {
  return {
    exportCharacter: createExportCharacter(ctx),
  };
}
