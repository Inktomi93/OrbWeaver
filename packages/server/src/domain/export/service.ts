// domain/export/service — composition root: wires the verb factories over the DI bundle (zero logic).
// exportCharacter reads the owner's live card off @orb/db directly and emits a V3 card PNG. exportChat is
// host-gated via export's own sanctioned roster read; the pure builders live in #kit/serde/chat.

import type { ExportContext } from "./context.ts";
import type { ExportService } from "./contract/service.ts";
import { createExportCharacter } from "./verbs/export-character.ts";
import { createExportChat } from "./verbs/export-chat.ts";
import { createListHostChats } from "./verbs/list-host-chats.ts";

export function createExportService(ctx: ExportContext): ExportService {
  return {
    exportCharacter: createExportCharacter(ctx),
    exportChat: createExportChat(ctx),
    listHostChats: createListHostChats(ctx),
  };
}
