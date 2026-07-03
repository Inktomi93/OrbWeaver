// domain/imagery/contract/params — every verb's *Params, declared ONCE (§7.4 — one type home). The wire
// input (`generatePictureRequestSchema`) lives in `@orb/contracts/imagery`; the verb params WRAP it with the
// acting `caller` Principal (resolved at the entry seam — the verb gates on the principal it is handed) and
// the branded chat id. P5 drives `mode:"free"` with a required `prompt`; the extraction modes are Phase 7.

import type { Principal } from "@orb/contracts/identity";
import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { ChatId } from "@orb/kit/ids";

/** `generatePicture` — the orchestrator's params (imagery-design/01 §3.2, MINIMAL free-mode slice).
 *  `caller` is the triggeredBy for spend + the CAS owner; `chatId` is provenance only (optional — chat-less
 *  injectors call with `mode:"free"`); `prompt` is REQUIRED for `free` in P5 (extraction is Phase 7). */
export interface GeneratePictureParams {
  readonly caller: Principal;
  readonly chatId?: ChatId | undefined;
  readonly mode: PromptTemplateMode;
  readonly prompt?: string | undefined;
  readonly n?: number | undefined;
}
