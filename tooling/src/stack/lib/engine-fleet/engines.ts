// vLLM engine IDENTITY: a zero-import leaf so every part of the subsystem can name an engine without
// importing one another (avoids a client⇄status cycle). Consumers derive the union type locally
// (`type VllmEngine = (typeof VLLM_ENGINES)[number]`) — never an inline re-spell.

/** The three supervised loopback engines. `gen` is the general VL model serving chat + summarize. */
export const VLLM_ENGINES = ["embed", "rerank", "gen"] as const;
