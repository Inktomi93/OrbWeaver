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

// RECORDED 2026-10-03 by the same probe (PROBE_PATCH=1): the same beat answered in the PATCH-LIST shape (v2:
// `{plane, call, field, item, value}`), sent strict-compatible as the hosted batch sends it — 200, finish `stop`,
// served by Anthropic. The message content, byte for byte. Never hand-edit; re-record with the probe.
export const ANTHROPIC_PATCH_ROUND_200 = {
  status: 200,
  generationId: "gen-1791055321-U39Cm09OGOn1nAO0TmDx",
  content:
    '{"changes":[{"plane":"update_party","call":1,"field":"targetRef","item":0,"value":"Mira"},{"plane":"update_party","call":1,"field":"addCondition.name","item":0,"value":"Bleeding"},{"plane":"update_party","call":1,"field":"addCondition.modifier","item":0,"value":"-1"},{"plane":"update_party","call":1,"field":"status","item":0,"value":"bleeding from arm, fleeing"},{"plane":"update_scene","call":2,"field":"location","item":0,"value":"cave by the river"},{"plane":"update_scene","call":2,"field":"timeOfDay","item":0,"value":"evening"},{"plane":"update_scene","call":2,"field":"presentUpsert.name","item":1,"value":"Mira"},{"plane":"update_scene","call":2,"field":"presentUpsert.mood","item":1,"value":"pained, alert"},{"plane":"update_scene","call":2,"field":"presentUpsert.thoughts","item":1,"value":"worried Corvin will pursue them"},{"plane":"update_scene","call":2,"field":"presentUpsert.relationship.kind","item":1,"value":"ally"},{"plane":"update_scene","call":2,"field":"presentUpsert.relationship.label","item":1,"value":""},{"plane":"update_scene","call":2,"field":"recentEvent","item":0,"value":"Corvin\'s blade cut Mira\'s arm as they fled the chapel into a riverside cave at dusk"},{"plane":"add_journal_entry","call":3,"field":"type","item":0,"value":"combat"},{"plane":"add_journal_entry","call":3,"field":"title","item":0,"value":"Escape from the Chapel"},{"plane":"add_journal_entry","call":3,"field":"content","item":0,"value":"Corvin\'s blade cut Mira\'s arm as they fled the chapel. They took shelter in the cave by the river at dusk."}]}',
} as const;
