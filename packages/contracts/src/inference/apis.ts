// The chat PROTOCOL axis — how a turn is addressed on a wire. Distinct from the wire (how bytes are
// spelled and parsed) and from the provider (who serves them): a wire lists the apis it can speak and a
// provider row lists a subset. Every dispatch switch over `api` uses `assertNever`; a member added here
// fails `tsc` at each one.
//
// THE HOME MOVED HERE from `@orb/contracts/connection` (which re-exports it verbatim until that file is
// deleted with the source axis). `anthropic-messages` RETURNS as a member (F6, owner word): the
// first-party Anthropic key path is a wire of its own, served by the `anthropic` provider row.
//
// `responses` was RETIRED as a member (owner ruling) when the OpenRouter GA runner
// (`backends/openrouter/runners/chat/responses.ts`, 523 lines over `@openrouter/sdk`) was demolished as
// collateral in the `@orb/inference` cut-over (§8.2 F9): listing a member whose only possible outcome was
// a typed refusal at send made the picker a trap. The ruling's revival path — `@ai-sdk/openai`'s
// `.responses()` transport, NOT the deleted runner — is now executed: the member returns with a real
// runner (`backends/openai-compat/responses.ts`), first served by the DeepSeek row. Which MODELS serve
// the route is capability data (the api-scoped cells), not a provider branch — and the vendor answers
// `/v1/responses` for every direct id, so the row's `apis` is the picker's ceiling and the cells are
// the truth.

import { z } from "zod";

export const CHAT_APIS = ["chat-completions", "responses", "agent-sdk", "anthropic-messages", "google-generative-ai"] as const;
export type ChatApi = (typeof CHAT_APIS)[number];
export const chatApiSchema = z.enum(CHAT_APIS) satisfies z.ZodType<ChatApi>;

/** Stored encoder fingerprints retain this sentinel for a route without a chat protocol. */
export const ENCODER_IDENTITY_NO_API = "none";
const ENCODER_IDENTITY_APIS = [...CHAT_APIS, ENCODER_IDENTITY_NO_API] as const;
export type EncoderIdentityApi = (typeof ENCODER_IDENTITY_APIS)[number];
