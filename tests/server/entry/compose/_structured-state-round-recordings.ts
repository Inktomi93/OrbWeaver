// RECORDED 2026-10-03 by scripts/probes/rpg-extraction/structured-state-round.ts (PROBE_LIVE=1): OpenRouter
// anthropic/claude-sonnet-5.5 pinned to Anthropic, answering the structured state round's union schema sent as
// `response_format`. The upstream Anthropic error bodies, byte for byte (OpenRouter's envelope and account id
// dropped). Never hand-edit; re-record with the probe.

export const ANTHROPIC_STATE_ROUND_400S = {
  asProjected: {
    status: 400,
    body: '{"type":"error","error":{"type":"invalid_request_error","message":"Schemas contains too many optional parameters (41), which would make grammar compilation inefficient. Reduce the number of optional parameters in your tool schemas (limit: 24)."},"request_id":"req_011CffjcY1wYWAdWZwDY7zPs"}',
  },
  strictCompatible: {
    status: 400,
    body: '{"type":"error","error":{"type":"invalid_request_error","message":"Schemas contains too many parameters with union types (41 parameters with type arrays or anyOf). This causes exponential compilation cost. Reduce the number of nullable or union-typed parameters (limit: 16 parameters with unions)."},"request_id":"req_011CffjcWiZm184n3SZN3B1A"}',
  },
} as const;
