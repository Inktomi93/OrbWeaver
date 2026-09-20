// The chat PROTOCOL axis — how a turn is addressed on a wire. Distinct from the wire (how bytes are
// spelled and parsed) and from the provider (who serves them): one wire may speak several apis
// (`openai-compat` speaks `chat-completions` and, where the provider row says so, `responses`).
// Every dispatch switch over `api` uses `assertNever`; a member added here fails `tsc` at each one.
//
// THE HOME MOVED HERE from `@orb/contracts/connection` (which re-exports it verbatim until that file is
// deleted with the source axis). `anthropic-messages` RETURNS as a member (F6, owner word 2026-09-19): the
// first-party Anthropic key path is a wire of its own, served by the `anthropic` provider row.

import { z } from "zod";

export const CHAT_APIS = ["chat-completions", "responses", "agent-sdk", "anthropic-messages"] as const;
export type ChatApi = (typeof CHAT_APIS)[number];
export const chatApiSchema = z.enum(CHAT_APIS);
