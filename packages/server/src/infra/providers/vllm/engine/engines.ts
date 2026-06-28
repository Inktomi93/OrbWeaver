// infra/providers/vllm/engine/engines — vLLM engine IDENTITY: the family's leaf.
//
// The three supervised loopback engines, named as a ZERO-IMPORT leaf so every part of the subsystem (the
// HTTP client, the status + control registries, the supervisor, the surfaces) can refer to an engine
// without importing one another. In neo this lived in client.ts, which forced the status registry to
// import UP into the HTTP client purely to name an engine (a client ⇄ status cycle). The identity is the
// one thing they all share, so it gets its own leaf.
//
// ONE HOME / derive-don't-respell: the canonical form is the `as const` tuple; the union TYPE is derived
// file-locally per consumer (`type VllmEngine = (typeof VLLM_ENGINES)[number]`). An exported `type X =
// union` is a boundary leak the `no-inline-types` gate forbids outside a type home, so the tuple is what
// is exported and the consumers derive — never an inline re-spell of the three names.

/** The three supervised loopback engines. `gen` is the general VL model serving chat + summarize. */
export const VLLM_ENGINES = ["embed", "rerank", "gen"] as const;
