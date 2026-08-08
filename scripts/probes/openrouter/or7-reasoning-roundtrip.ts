// OR-7 — reasoning round-trip: dropping reasoning blocks on replay is proven safe. Is REPLAYING them a
// hard 400?
//
// We never round-trip reasoning today: `shared.ts:reshapeReasoningDetails` keeps only `type` + `text`
// (drops `signature`), and `ChatContentPart` has no reasoning arm at all, so it cannot be persisted.
// Before anyone builds that contract change, establish what the wire actually accepts — a replay shape
// that 400s is a production outage, not a missed optimization.
//
// One variable moves: the shape of the replayed assistant reasoning. The captured turn, the tool result,
// and the follow-up user message are identical across arms 2-5.
//
//   1 capture             — effort high + a forced tool call -> harvest `reasoning_details` (with signature)
//   2 drop                — replay with NO reasoning_details        (what we ship today)
//   3 verbatim            — replay OR's returned object unchanged
//   4 unsigned            — same object with `signature` deleted    (expect 400)
//   5 st-encrypted        — SillyTavern's rebuilt `reasoning.encrypted` + `data` shape
//
// Evidence: HTTP status + the verbatim error body + usage. A 400 IS the verdict.

import {
  type ArmRowBase,
  OR_MODEL,
  type OrMessage,
  type OrRequestMessage,
  jsonl,
  orCall,
  printTable,
  readEnvKey,
} from "./_kit.ts";

export const id = "or7";
export const title = "reasoning round-trip — is replaying a reasoning block a hard 400?";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "remove_condition",
      description: "Remove a condition from a character.",
      parameters: { type: "object", properties: { target: { type: "string" }, condition: { type: "string" } }, required: ["target", "condition"] },
    },
  },
];

const SYSTEM = "You are the game master of an immersive tabletop role-play. Keep tracked state in sync using the tools, and keep prose to one sentence.";
// Deliberately multi-step: a trivial beat with `tool_choice:"required"` produces ZERO thinking (measured),
// and a turn with no reasoning block has nothing to round-trip.
const USER = `HP 22/30 · conditions: Bleeding (-1), Exhausted (-1), Blessed (+2).
I cauterize the wound with the hot iron — the bleeding stops but it costs me 3 HP — I drink the stamina
draught, and the blessing fades as the last of its light goes out of my blade. Work out every state change,
narrate one sentence, then sync state with the tools.`;
const FOLLOW_UP = "I rest for an hour. Narrate one sentence.";

export async function run() {
  const key = readEnvKey("OPENROUTER_API_KEY");
  const out = jsonl(id);
  const rows: ArmRowBase[] = [];

  const capture = await orCall(
    {
      model: OR_MODEL,
      max_tokens: 512,
      reasoning: { effort: "high" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: USER },
      ],
      tools: TOOLS,
      tool_choice: "auto",
    },
    key,
  );
  const assistant: OrMessage = capture.message ?? {};
  const details = assistant.reasoning_details ?? [];
  const toolCall = assistant.tool_calls?.[0] ?? null;
  out.append({
    kind: "arm",
    probe: id,
    arm: "1-capture",
    status: capture.status,
    reasoningDetailTypes: details.map((d) => d.type),
    hasSignature: details.some((d) => typeof d.signature === "string" && d.signature.length > 0),
    detailKeys: details[0] !== undefined ? Object.keys(details[0]) : [],
    toolCallName: toolCall?.function?.name ?? null,
    ...capture.usage,
    error: capture.error,
    ms: capture.ms,
  });

  if (toolCall === null || details.length === 0) {
    const verdict = {
      kind: "verdict",
      probe: id,
      at: new Date().toISOString(),
      blocked: `capture arm produced toolCall=${toolCall !== null} reasoningDetails=${details.length} — cannot replay`,
    };
    out.append(verdict);
    console.log(`OR-7: BLOCKED — ${verdict.blocked}`);
    return verdict;
  }

  const baseAssistant = { role: "assistant", content: assistant.content ?? "", tool_calls: assistant.tool_calls };
  const stripped = details.map(({ signature: _s, ...rest }) => rest);
  const stEncrypted = details
    .filter((d) => typeof d.signature === "string" && d.signature.length > 0)
    .map((d) => ({ type: "reasoning.encrypted", data: d.signature, id: d.id ?? null, format: d.format ?? "anthropic-claude-v1", index: d.index ?? 0 }));

  const arms: Array<[string, OrRequestMessage]> = [
    ["2-drop", baseAssistant],
    ["3-verbatim", { ...baseAssistant, reasoning_details: details }],
    ["4-unsigned", { ...baseAssistant, reasoning_details: stripped }],
    ["5-st-encrypted", { ...baseAssistant, reasoning_details: stEncrypted }],
  ];

  for (const [arm, assistantMessage] of arms) {
    const result = await orCall(
      {
        model: OR_MODEL,
        max_tokens: 128,
        reasoning: { effort: "high" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: USER },
          assistantMessage,
          { role: "tool", tool_call_id: toolCall.id, content: "ok" },
          { role: "user", content: FOLLOW_UP },
        ],
        tools: TOOLS,
        tool_choice: "auto",
      },
      key,
    );
    const row = {
      kind: "arm",
      probe: id,
      arm,
      status: result.status,
      replayedDetailTypes: (assistantMessage.reasoning_details ?? []).map((d) => d.type).join(","),
      ...result.usage,
      error: result.error,
      ms: result.ms,
    };
    out.append(row);
    rows.push(row);
  }

  const byArm = (arm: string): Partial<ArmRowBase> => rows.find((r) => r["arm"] === arm) ?? {};
  const verdict = {
    kind: "verdict",
    probe: id,
    at: new Date().toISOString(),
    dropStatus: byArm("2-drop").status,
    verbatimStatus: byArm("3-verbatim").status,
    unsignedStatus: byArm("4-unsigned").status,
    unsignedError: byArm("4-unsigned").error,
    stEncryptedStatus: byArm("5-st-encrypted").status,
    replayIsSafeWhenSigned: byArm("3-verbatim").status === 200,
    replayIsFatalWhenUnsigned: byArm("4-unsigned").status !== 200,
  };
  out.append(verdict);
  printTable(rows.map(({ kind: _k, probe: _p, error: _e, ...rest }) => rest));
  console.log(`OR-7: drop=${verdict.dropStatus} verbatim=${verdict.verbatimStatus} unsigned=${verdict.unsignedStatus} st-encrypted=${verdict.stEncryptedStatus}`);
  return verdict;
}
