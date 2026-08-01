// The chat-transcript import POST. Raw fetch, not tRPC — the route is a Hono multipart handler (the
// `importCharacters` sibling's shape exactly). Accepts one-or-many `.jsonl` files under the repeated `file`
// field. The route answers 200 for an accepted batch even when every transcript inside it failed (per-file
// isolation), so this helper hands back the real per-file outcome and the caller's summary derives from
// THAT, never from the uploaded filenames. A non-200 (whole-batch rejection) throws.

import { CSRF_HEADER } from "@orb/contracts/identity";
import { throwHttpError } from "./http-error";

const IMPORT_URL = "/api/import/chat";
const IMPORT_FIELD = "file";

/** One imported (or deduped) transcript — `created:false` marks a re-import of a chat already present. */
interface ImportedChatResult {
  readonly filename: string;
  readonly created: boolean;
}

/** One transcript the server could not import (unparseable, or naming a character this account lacks). */
interface FailedChatResult {
  readonly filename: string;
  readonly error: string;
}

/** The `POST /api/import/chat` response body (the server's `ChatImportResult`): the REAL per-file outcome. */
export interface ChatImportResult {
  readonly imported: readonly ImportedChatResult[];
  readonly failed: readonly FailedChatResult[];
}

/** POST picked `.jsonl` transcripts to the chat-import route and return the server's real per-file result.
 *  Throws on a non-OK response (a whole-batch rejection); per-file failures ride back in the 200 body. */
export async function importChats(files: readonly File[]): Promise<ChatImportResult> {
  const form = new FormData();
  for (const file of files) {
    form.append(IMPORT_FIELD, file);
  }
  const response = await fetch(IMPORT_URL, {
    method: "POST",
    body: form,
    headers: { [CSRF_HEADER]: "1" },
  });
  if (!response.ok) {
    await throwHttpError("importChats", response);
  }
  return (await response.json()) as ChatImportResult;
}
