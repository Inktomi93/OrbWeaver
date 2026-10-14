import type { ChatRequest, ChatResult } from "./chat.ts";
import type { InferenceLog } from "./runtime.ts";
import type { NormalizeImageBytes } from "./wire.ts";

/** What the loop needs from the backend that serves the task. */
export interface SideGenDeps {
  /** The wire's own chat turn. */
  readonly runChatTurn: (req: ChatRequest) => Promise<ChatResult>;
  /** How many items run at once. */
  readonly concurrency: number;
  readonly normalize: NormalizeImageBytes;
  readonly log: InferenceLog;
  readonly now: () => number;
}

/** One side-generation item as a chat turn's inputs: its two prompts and its images as URLs or data URLs. */
export interface SideGenItem {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly images?: readonly string[] | undefined;
}
