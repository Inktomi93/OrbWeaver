// domain/export — COMPOSITION ROOT: wires the verb factories over the DI bundle (zero logic). The bulk
// card serializer (4c W3): `exportCharacter` reads the owner's live card off `@orb/db` directly and emits a
// V3 card PNG. The `ExportContext` (db + the infra `cas` / `imageTransform` handles) is assembled at the
// entry root and passed in; export sideways-imports none of those (domain-no-cross-feature).
//
// `exportChat` (PD-42): the chat transcript OUT (ST JSONL / TXT) — HOST-gated (D29) via export's own
// sanctioned roster read; the pure builders live in the ONE chat serde core `#kit/serde/chat` (W0a).

import type { ExportContext, ExportService } from "./contract/service";
import { createExportCharacter } from "./verbs/export-character";
import { createExportChat } from "./verbs/export-chat";

export function createExportService(ctx: ExportContext): ExportService {
  return {
    exportCharacter: createExportCharacter(ctx),
    exportChat: createExportChat(ctx),
  };
}
