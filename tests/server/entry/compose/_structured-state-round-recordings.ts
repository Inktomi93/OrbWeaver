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

// RECORDED 2026-10-03 by the same probe (PROBE_PATCH=1): the same beat answered in the PATCH-LIST shape, sent
// strict-compatible as the hosted batch sends it — 200, finish `stop`, served by Anthropic. The message content,
// byte for byte. Never hand-edit; re-record with the probe.
export const ANTHROPIC_PATCH_ROUND_200 = {
  status: 200,
  generationId: "gen-1791053289-7QEEexuGCIg6iTdCK5cW",
  content:
    '{"changes":[{"plane":"update_party","field":"targetRef","value":"Mira"},{"plane":"update_party","field":"addCondition","value":"{\\"name\\":\\"Bleeding\\",\\"modifier\\":-1}"},{"plane":"update_party","field":"status","value":"bleeding from a cut arm, fleeing"},{"plane":"update_scene","field":"location","value":"cave by the river"},{"plane":"update_scene","field":"timeOfDay","value":"evening"},{"plane":"update_scene","field":"presentUpsert","value":"[{\\"name\\":\\"Mira\\",\\"emoji\\":\\"🩸\\",\\"mood\\":\\"pained, alert\\",\\"appearance\\":\\"bleeding from a cut on her arm\\",\\"thoughts\\":\\"hoping Corvin lost the trail\\",\\"relationship\\":{\\"kind\\":\\"ally\\",\\"label\\":\\"\\"}},{\\"name\\":\\"Corvin\\",\\"emoji\\":\\"🗡️\\",\\"mood\\":\\"hostile\\",\\"thoughts\\":\\"pursuing the fugitives\\",\\"relationship\\":{\\"kind\\":\\"enemy\\",\\"label\\":\\"attacker at the chapel\\"}}]"},{"plane":"update_scene","field":"recentEvent","value":"Corvin\'s blade cut Mira\'s arm as they fled the chapel; they hid in the riverside cave at dusk"},{"plane":"add_journal_entry","field":"type","value":"combat"},{"plane":"add_journal_entry","field":"title","value":"Flight from the Chapel"},{"plane":"add_journal_entry","field":"content","value":"Corvin\'s blade caught Mira\'s arm as they fled the chapel. They took shelter in the cave by the river as dusk fell."}]}',
} as const;
