// The chat PROTOCOL axis — how a turn is addressed on a wire. Distinct from the wire (how bytes are
// spelled and parsed) and from the provider (who serves them): a wire lists the apis it can speak and a
// provider row lists a subset. Every dispatch switch over `api` uses `assertNever`; a member added here
// fails `tsc` at each one.
//
// THE HOME MOVED HERE from `@orb/contracts/connection` (which re-exports it verbatim until that file is
// deleted with the source axis). `anthropic-messages` RETURNS as a member (F6, owner word 2026-09-19): the
// first-party Anthropic key path is a wire of its own, served by the `anthropic` provider row.
//
// `responses` was RETIRED as a member (owner ruling 2026-09-20). It was a WORKING OpenRouter GA Responses
// turn (`backends/openrouter/runners/chat/responses.ts`, 523 lines over `@openrouter/sdk`) demolished as
// collateral when the `@orb/inference` cut-over dropped that dependency wholesale (`146f71cd5`, §8.2 F9):
// the replacement `@openrouter/ai-sdk-provider` speaks chat-completions only. Listing a member whose only
// possible outcome was a typed refusal at send made the picker a trap. Reviving it means wiring
// `@ai-sdk/openai`'s `.responses()` transport — NOT restoring the deleted runner.

import { z } from "zod";

export const CHAT_APIS = ["chat-completions", "agent-sdk", "anthropic-messages"] as const;
export type ChatApi = (typeof CHAT_APIS)[number];
export const chatApiSchema = z.enum(CHAT_APIS);
