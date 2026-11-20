// The SillyTavern profile export's shapes: what the plan reads and the plan it returns.

import type { StExportFile, StExportReport } from "@orb/contracts/import";
import type { PortableExportNotes, PortableFile, PortableKind } from "@orb/contracts/portability";
import type { ChatId } from "@orb/kit/ids";
import type { ExportedText, HostChatRef } from "./results.ts";

/** What the plan reads: the library backup's per-kind streams, the hosted chats, the ST transcript of one, and each
 *  persona's avatar content hash by persona name (null for a persona with no image), which the backup's persona
 *  file does not carry. */
export interface StProfileSource {
  readonly files: (kind: PortableKind, note: PortableExportNotes) => AsyncIterable<PortableFile>;
  readonly listHostChats: () => Promise<readonly HostChatRef[]>;
  readonly exportChat: (chatId: ChatId) => Promise<ExportedText | null>;
  readonly personaArt: () => Promise<ReadonlyMap<string, string | null>>;
}

/** One file of the profile tree. A transcript reads its bytes only when the zip writes it. */
export interface StProfileEntry extends StExportFile {
  readonly bytes: () => Promise<Uint8Array>;
}

export interface StProfilePlan {
  readonly entries: readonly StProfileEntry[];
  readonly report: StExportReport;
}
