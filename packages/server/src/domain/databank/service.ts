// domain/databank — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The databank store:
// uploaded/authored source documents (a NEW single-owned canon producer, D49 #5) + their derived
// `document_chunks` (a chat_segments twin, written ONLY through the injected `embeddingsStore`), attached at
// the global/chat scopes for retrieval. `DatabankContext` is assembled at the entry root (db + injected
// clock/id + the injected cross-feature ops) and passed in. The chunk→embed ingest subsystem is a SEPARATE
// product (`createDatabankIngest`) the workload runners reach through `env.databank.*` — not on this
// tRPC-facing surface (build-never-blocks: the verb enqueues, the runner ingests).

import type { DatabankContext } from "./context.ts";
import type { DatabankService } from "./contract/service.ts";
import { createAttachGlobal } from "./verbs/attach/attach-global.ts";
import { createAttachToCharacter } from "./verbs/attach/attach-to-character.ts";
import { createAttachToChat } from "./verbs/attach/attach-to-chat.ts";
import { createDetachFromCharacter } from "./verbs/attach/detach-from-character.ts";
import { createDetachFromChat } from "./verbs/attach/detach-from-chat.ts";
import { createDetachGlobal } from "./verbs/attach/detach-global.ts";
import { createListGlobal } from "./verbs/attach/list-global.ts";
import { createCreateFromText } from "./verbs/create-from-text.ts";
import { createGatherRetrieval } from "./verbs/gather-retrieval.ts";
import { createGet } from "./verbs/get.ts";
import { createList } from "./verbs/list.ts";
import { createListActiveForChat } from "./verbs/list-active-for-chat.ts";
import { createListAttachments } from "./verbs/list-attachments.ts";
import { createReindex } from "./verbs/reindex.ts";
import { createRemove } from "./verbs/remove.ts";
import { createRename } from "./verbs/rename.ts";
import { createScrapeWeb } from "./verbs/scrape/scrape-web.ts";
import { createScrapeWiki } from "./verbs/scrape/scrape-wiki.ts";
import { createScrapeYoutube } from "./verbs/scrape/scrape-youtube.ts";
import { createUpload } from "./verbs/upload.ts";

export function createDatabankService(ctx: DatabankContext): DatabankService {
  return {
    upload: createUpload(ctx),
    createFromText: createCreateFromText(ctx),
    scrapeWeb: createScrapeWeb(ctx),
    scrapeYoutube: createScrapeYoutube(ctx),
    scrapeWiki: createScrapeWiki(ctx),
    get: createGet(ctx),
    list: createList(ctx),
    rename: createRename(ctx),
    remove: createRemove(ctx),
    reindex: createReindex(ctx),
    attachGlobal: createAttachGlobal(ctx),
    detachGlobal: createDetachGlobal(ctx),
    listGlobal: createListGlobal(ctx),
    attachToChat: createAttachToChat(ctx),
    detachFromChat: createDetachFromChat(ctx),
    attachToCharacter: createAttachToCharacter(ctx),
    detachFromCharacter: createDetachFromCharacter(ctx),
    listAttachments: createListAttachments(ctx),
    listActiveForChat: createListActiveForChat(ctx),
    gatherRetrieval: createGatherRetrieval(ctx),
  };
}
