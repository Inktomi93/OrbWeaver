// The WIRE axis — how bytes are spelled and parsed. The ONLY inference axis that is CODE: one backend per
// member in `@orb/inference`, and a plugin can never add one (F8 — providers are data, wires are not).
// `serves` is the policy CEILING for every provider on the wire (a provider row may narrow it, never
// widen it — pinned by the table test); `deltas` is what a backend on the wire may emit.

import type { ChatApi } from "./apis.ts";
import type { DeltaKind } from "./deltas.ts";
import type { Task } from "./tasks.ts";

export const WIRES = ["openai-compat", "anthropic-messages", "agent-sdk", "local-light"] as const;
export type Wire = (typeof WIRES)[number];

export interface WireDef {
  /** The chat protocols this wire can speak. A provider row lists a SUBSET. */
  readonly apis: readonly ChatApi[];
  /** The tasks a backend for this wire implements — the ceiling `providerTasks` intersects. */
  readonly serves: readonly Task[];
  readonly deltas: readonly DeltaKind[];
}

export const WIRE_DEFS: Record<Wire, WireDef> = {
  // Two transports (`openai-compatible`, `openrouter`), one backend over the Vercel AI SDK (§8.1).
  // `generateImage` rides the row's `features.images` arm, `rerank` the row's `features.rerankPath`,
  // `imageEmbed` a model whose embedding capability declares `input ∋ image` — the wire CAN serve them;
  // `connectionTasks` + `requirementMet` decide per row.
  "openai-compat": {
    apis: ["chat-completions"],
    serves: ["chat", "summarize", "structured", "generateImage", "embed", "imageEmbed", "rerank"],
    deltas: ["text", "reasoning", "image", "tool-call", "citation", "usage"],
  },
  // First-party API key over `@ai-sdk/anthropic` (§8.5). No agent path: the Claude Code loop needs the
  // runtime (STATED CONSEQUENCE, F6).
  "anthropic-messages": {
    apis: ["anthropic-messages"],
    serves: ["chat", "summarize", "structured"],
    deltas: ["text", "reasoning", "tool-call", "citation", "usage"],
  },
  // The subscription's wire and nothing else's (F18). `agent` is served HERE ONLY, by construction.
  "agent-sdk": {
    apis: ["agent-sdk"],
    serves: ["chat", "agent", "summarize", "structured"],
    deltas: ["text", "reasoning", "tool-call", "usage"],
  },
  // In-process ONNX runtime; a generation entry in `curated/local-light.json` + a `chat` method widens it.
  "local-light": {
    apis: [],
    serves: ["embed", "imageEmbed", "rerank"],
    deltas: [],
  },
};
