// domain/databank — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The databank store:
// uploaded/authored source documents (a NEW single-owned canon producer, D49 #5) + their derived
// `document_chunks` (a chat_segments twin, written ONLY through the injected `embeddingsStore`), attached at
// the global/chat scopes for retrieval. `DatabankContext` is assembled at the entry root (db + injected
// clock/id + the injected cross-feature ops) and passed in. The chunk→embed ingest subsystem is a SEPARATE
// product (`createDatabankIngest`) the workload runners reach through `env.databank.*` — not on this
// tRPC-facing surface (build-never-blocks: the verb enqueues, the runner ingests).

import type { DatabankContext } from "./context";
import type { DatabankService } from "./contract/service";
import { createAttachGlobal } from "./verbs/attach/attach-global";
import { createAttachToCharacter } from "./verbs/attach/attach-to-character";
import { createAttachToChat } from "./verbs/attach/attach-to-chat";
import { createDetachFromCharacter } from "./verbs/attach/detach-from-character";
import { createDetachFromChat } from "./verbs/attach/detach-from-chat";
import { createDetachGlobal } from "./verbs/attach/detach-global";
import { createListGlobal } from "./verbs/attach/list-global";
import { createCreateFromText } from "./verbs/create-from-text";
import { createGatherRetrieval } from "./verbs/gather-retrieval";
import { createGet } from "./verbs/get";
import { createList } from "./verbs/list";
import { createListActiveForChat } from "./verbs/list-active-for-chat";
import { createListAttachments } from "./verbs/list-attachments";
import { createReindex } from "./verbs/reindex";
import { createRemove } from "./verbs/remove";
import { createRename } from "./verbs/rename";
import { createScrapeWeb } from "./verbs/scrape/scrape-web";
import { createScrapeWiki } from "./verbs/scrape/scrape-wiki";
import { createScrapeYoutube } from "./verbs/scrape/scrape-youtube";
import { createUpload } from "./verbs/upload";

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
