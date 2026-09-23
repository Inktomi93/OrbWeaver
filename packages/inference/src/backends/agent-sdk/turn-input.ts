// The Agent SDK's projection of a backend-neutral chat turn (`ChatTurnInput`) onto its own request arm. The
// stateful backend wants a session SEED (the transcript before this turn) plus a PROMPT (the trailing user
// rows); with both it resumes its cached session and reseeds on divergence, so history rides the session
// instead of being re-sent flattened every turn. Tool and system rows ride the seed as their own frames
// (#1593), a history with NO trailing user row seeds everything and asks the host-authored continuation stub
// (#1607), and a paired tool exchange rides as real `tool_use`/`tool_result` blocks (#1605). The caller's tools
// mount as an in-process MCP server whose handlers run the caller's `execute` — the SDK owns the loop, the
// caller keeps every decision about the call. These are this backend's representation rules; the caller hands
// over one neutral shape and never learns them (`docs/design/inference-tool-delivery.md`).

import type { AgentToolServer } from "../../contract/agent.ts";
import type { AgentSdkChatRequest, AgentSeedBlock, AgentSeedTurn, ChatHistoryMessage, ChatToolOffer, ChatTurnInput } from "../../contract/chat.ts";
import { AGENT_CONTINUATION_PROMPT_STUB, AGENT_PROMPT_TAIL_JOINER, deltaSubscriptionOf } from "../../contract/chat.ts";
import type { AgentToolSpec } from "./index.ts";
import { createAgentToolServer } from "./index.ts";

/**
 * One part of a history row — DERIVED from the request contract's row, never re-spelled: this module maps
 * the parts it is handed onto seed frames, and this alias is the type of what is already in its hand.
 */
type HistoryPart = ChatHistoryMessage["content"][number];

/**
 * What a NON-TEXT content part leaves behind in a seed frame's text — TOTAL over the part union, because the
 * honest answer is per-KIND (#1606). It used to be one literal `[Image]` for every part, so a real `tool` row —
 * which carries a `tool-result` part and no text (the caller's tool loop materializes it) — announced itself to
 * the model as `Tool result: [Image]`: a false statement about the transcript, and one that hides the drop (the
 * model cannot tell that bytes it was told about are missing).
 *
 * NAMES THE KIND, NEVER THE PAYLOAD. Emitting a tool result's bytes here would widen what the request carries —
 * the separate structural arm (#1605), not a rendering decision. The wording follows the house drop vocabulary
 * (`[<kind> omitted]`).
 *
 * A MAPPED RECORD, not a switch (§5.5 admits both, and only one of them lints): a `switch` over a value typed
 * `Exclude<HistoryPart, {type:"text"}>` makes biome's type service call EVERY case unreachable
 * (`lint/suspicious/noUnnecessaryConditions` — the computed-type sibling of the cross-module-union and
 * intersection cases). The Record keeps the enforcement identical: a new content-part member is a missing
 * property here and fails `tsc`.
 */
const DROPPED_PART_TEXT: Record<Exclude<HistoryPart, { type: "text" }>["type"], string> = {
  image: "[image omitted]",
  video: "[video omitted]",
  // The Agent SDK is a subprocess with no reasoning-replay channel, so a replayed thinking part cannot ride
  // here. Named rather than blank for the same reason as the rest: a silent drop tells the model the turn had
  // no reasoning, which is a false statement about the transcript.
  reasoning: "[reasoning omitted]",
  "tool-call": "[tool call omitted]",
  "tool-result": "[tool result omitted]",
};

/**
 * One rendered row: a non-text part leaves the marker naming its own kind ({@link DROPPED_PART_TEXT}); the wire
 * `name` label is stamped into the text (seed frames carry no `name` field).
 *
 * `parts` defaults to the whole row and is narrowed by the seed builder, which lifts the parts that ride as
 * REAL SDK blocks (#1605) out first and renders only what is left. An EMPTY render takes no name stamp: an
 * empty row is not a turn, and `Alice: ` is not a truer statement of that than an empty string is.
 */
function agentRowText(m: ChatHistoryMessage, parts: readonly HistoryPart[] = m.content): string {
  const text = parts.map((c) => (c.type === "text" ? c.text : DROPPED_PART_TEXT[c.type])).join("");
  if (text.length === 0) {
    return "";
  }
  return m.name !== undefined && m.name.length > 0 ? `${m.name}: ${text}` : text;
}

/**
 * Lift the capability-kept `system` rows near the tail (depth-0 mid-conversation system injections — the chat
 * engine emits them only when `turns.midConversationSystem`) off the history. On this backend the honest
 * system-authority channel at the tail is the `UserPromptSubmit` hook, not a transcript row: the projection
 * carries the extracted text as `tailSystem`, and the remaining history keeps a clean user prompt — the
 * volatile injection never enters the recorded transcript, so the session↔seed comparator still matches next
 * turn (resume, not reseed).
 *
 * NOT strictly tail-FINAL (F3 fix): the engine appends the group/CONTINUATION nudge as a trailing USER row AFTER
 * the depth-0 system row, so the real shape is `[…canon…, system, user-nudge]` — a system row with a nudge tail
 * AFTER it, not a tail-final run. A pure trailing-run scan misses it and leaves the reminder to fall bare into the
 * prompt tail (unframed system-authority text reaching the model as user content + entering the transcript →
 * reseed churn). So this scans for a contiguous SYSTEM run and lifts it even when NON-system (nudge) rows trail
 * it; those trailing rows stay in `rows` (the nudge is a legitimate user turn — only the system row folds into
 * the hook). A system run inside canon is NOT reachable here — the engine only ever emits depth-0 system
 * at/after the last canon assistant, so the run found is always the injection band.
 *
 * THAT LAST CLAIM IS CAPABILITY-CONDITIONAL, and the condition holds on this wire (#201). The engine can also
 * emit a MID-ARRAY system row — a depth \> 0 system injection — gated on `turns.historySystemRows`, which no
 * agent-sdk capability cell declares (only a live probe may flip one). This walk-back would lift a mid-array run
 * out of position if one ever reached it, so a future cell declaring `historySystemRows` on this wire MUST come
 * here first — the enforcer is the capability cell, and this is the coupling it protects.
 */
export function extractTrailingSystemRows(history: readonly ChatHistoryMessage[]): {
  readonly rows: readonly ChatHistoryMessage[];
  readonly systemText: string | null;
} {
  // Walk back past a trailing NON-system tail (the appended nudge — at most a short user run) to find the end
  // of the system band, then past the system run to its start. `[…, system, user-nudge]` → sysStart..sysEnd
  // brackets the system rows; everything else (canon head + the nudge tail) stays in `rows`.
  let sysEnd = history.length;
  while (sysEnd > 0 && history[sysEnd - 1]?.role !== "system") {
    sysEnd -= 1; // skip the trailing nudge (non-system) rows
  }
  let sysStart = sysEnd;
  while (sysStart > 0 && history[sysStart - 1]?.role === "system") {
    sysStart -= 1; // the contiguous system run
  }
  if (sysStart === sysEnd) {
    return { rows: history, systemText: null }; // no system rows to lift
  }
  const text = history
    .slice(sysStart, sysEnd)
    .map((m) => agentRowText(m))
    .filter((t) => t.length > 0)
    .join(AGENT_PROMPT_TAIL_JOINER);
  // Drop the system band; keep the canon head AND the nudge tail (the nudge is a real user turn).
  const rows = [...history.slice(0, sysStart), ...history.slice(sysEnd)];
  return { rows, systemText: text.length > 0 ? text : null };
}

/**
 * The turn label a history row announces itself with. TOTAL over `HistoryRole`, and that is the security
 * property, not a tidiness one (#1457): it used to be a `Partial<Record<…>>` with a `?? "User"` default, so every
 * tool RESULT rendered as `User: <tool output>` — promoting attacker-influenced bytes (a fetched page, a databank
 * row, a search hit) from DATA the model may reason about to an INSTRUCTION apparently authored by the human,
 * which is the confusion role separation exists to prevent. TOTAL, not defaulted, so the recurrence is a COMPILE
 * error: a new `HISTORY_ROLES` member with no label here fails `tsc` instead of silently inheriting the user's
 * voice (the §5.5 mapped-Record dispatch shape).
 *
 * The labels announce a SEED FRAME rather than a line in a flattened blob (#1607 deleted the blob), so a label is
 * no longer a boundary anything could forge — but it is still the only thing that says whose voice a
 * `user`-framed row speaks in, which is the whole of #1457.
 */
const AGENT_ROW_LABELS: Record<ChatHistoryMessage["role"], string> = { user: "User", assistant: "Assistant", system: "System", tool: "Tool result" };

/**
 * How each history role rides the SESSION SEED. TOTAL, and both facts are load-bearing: `frame` is the SDK frame
 * role (the seed vocabulary has exactly two — {@link AgentSeedTurn}), and `announce` says whether the frame's text
 * must carry its own label. A role with no native frame (`tool`, `system`) can only ride as a `user` frame, so it
 * MUST announce itself or it wears the human's voice — #1457's confusion, relocated. A new `HISTORY_ROLES` member
 * fails `tsc` here instead of silently inheriting `user`.
 *
 * `announce` governs the TEXT half only. A tool exchange that rides as real `tool_use`/`tool_result` blocks
 * (#1605) needs no label at all — the wire carries the role — and {@link seedBlocksFor} stamps one only on what is
 * left as prose. The `tool` row's `user` frame is therefore the CARRIER of the blocks, not a claim about who
 * spoke.
 */
const AGENT_SEED_FRAMES: Record<ChatHistoryMessage["role"], { readonly frame: AgentSeedTurn["role"]; readonly announce: boolean }> = {
  user: { frame: "user", announce: false },
  assistant: { frame: "assistant", announce: false },
  system: { frame: "user", announce: true },
  tool: { frame: "user", announce: true },
};

/**
 * Split the history into the session seed + the prompt this turn queries with. TOTAL — every history reaches the
 * SDK as frames plus one prompt, and there is no other agent-sdk turn shape (#1607).
 *
 * THIS IS THE STRUCTURAL ARM (#1593, completed by #1607). The seed is not a nicety —
 * `session/frames.ts::buildSeedFrames` emits ONE `SessionStoreEntry` per seed turn, so a turn boundary here is a
 * JSON frame and content inside a frame cannot create another frame. A `tool` row therefore never forces a flat
 * string: it rides as an ANNOUNCED `user` frame instead.
 *
 * THE TAIL IS THE TRAILING RUN OF `user` ROWS, never "everything after the last assistant". The two rules agree on
 * every tool-free history (system rows near the tail are lifted by {@link extractTrailingSystemRows} first), and
 * they differ exactly where it matters: a `tool` row after the last assistant would otherwise become the QUERY
 * PROMPT — tool output handed to the model as the human's own message, #1457 arriving by the other door. The tail
 * carries NO host labels, so there is nothing in it for content to imitate.
 *
 * NO TAIL ⇒ THE HOST-AUTHORED {@link AGENT_CONTINUATION_PROMPT_STUB}, and the WHOLE history seeds. That case is
 * live, not theoretical: a tool exchange leaves `[…, assistant, tool]` on a recursion's next request, and a turn
 * whose verb appends no user row ends on an assistant. It used to flatten the entire transcript into one prompt
 * string with a text turn boundary; the stub deletes that string, so the paragraph-collapse fence #1593 had to
 * install is gone too (rows keep their bytes — they are separate frames).
 *
 * AN EMPTY-TEXT ROW IS NOT A TURN and never becomes a frame: `message.content: [{type:"text", text:""}]` is a
 * body the Anthropic wire rejects, which would fail every later turn on that lineage rather than this one.
 */
export function splitAgentHistory(history: readonly ChatHistoryMessage[]): { readonly seed: readonly AgentSeedTurn[]; readonly prompt: string } {
  let tailStart = history.length;
  while (tailStart > 0 && history[tailStart - 1]?.role === "user") {
    tailStart -= 1;
  }
  const tail = history
    .slice(tailStart)
    .map((m) => agentRowText(m))
    .filter((t) => t.length > 0)
    .join(AGENT_PROMPT_TAIL_JOINER);
  // An empty tail means the trailing user run said nothing (or there was none): the whole history seeds and the
  // stub is the query. Never a blank prompt, and never a bare tool row promoted to one.
  const seedRows = tail.length > 0 ? history.slice(0, tailStart) : history;
  return { seed: seedTurnsFor(seedRows), prompt: tail.length > 0 ? tail : AGENT_CONTINUATION_PROMPT_STUB };
}

/**
 * The tool-call ids whose exchange may ride the seed STRUCTURALLY — both halves present AND ADJACENT: a
 * `tool-call` part on an assistant row, answered by a `tool-result` with the same id in the tool run that
 * immediately follows it.
 *
 * THE ADJACENCY IS A FAIL-CLOSED RULE, not tidiness. The Anthropic wire requires every `tool_use` to be answered
 * by a `tool_result` in the very next message and refuses an orphan in either direction, so a seed that emits
 * half a pair is not a degraded turn — it is a 400 on EVERY later turn of that lineage. A history can arrive
 * half-paired for ordinary reasons (a context-window slide cuts between the call and its result, an assembly
 * materializes a recorded-but-unexecuted call), so the unpaired half degrades to the announced text it rode as
 * before #1605 and the turn still runs.
 *
 * PARSEABILITY IS PART OF THE SAME QUESTION. The wire's `tool_use.input` is an OBJECT and `arguments` is the RAW
 * model-emitted string, so a blob that is not a JSON object cannot become a valid `tool_use` — and the decision
 * has to be made HERE, with the pair, or the frame builder would drop one half of a pair this function had
 * already blessed and mint the orphan itself.
 */
function pairedToolCallIds(history: readonly ChatHistoryMessage[]): ReadonlySet<string> {
  const paired = new Set<string>();
  history.forEach((row, index) => {
    if (row.role !== "assistant") {
      return;
    }
    const answered = answeredIdsAfter(history, index);
    for (const part of row.content) {
      if (part.type === "tool-call" && answered.has(part.toolCallId) && isJsonObject(part.arguments)) {
        paired.add(part.toolCallId);
      }
    }
  });
  return paired;
}

/** The tool-call ids answered by the run of `tool` rows IMMEDIATELY following `index` — the only place the wire
 *  accepts an answer, so a result further down the transcript does not count as one. */
function answeredIdsAfter(history: readonly ChatHistoryMessage[], index: number): ReadonlySet<string> {
  const answered = new Set<string>();
  for (let j = index + 1; j < history.length && history[j]?.role === "tool"; j += 1) {
    for (const part of history[j]?.content ?? []) {
      if (part.type === "tool-result") {
        answered.add(part.toolCallId);
      }
    }
  }
  return answered;
}

/** Does this raw model-emitted argument blob parse to a JSON OBJECT — the only thing the wire's `tool_use.input`
 *  may be? `JSON.parse`, never an object literal: `parse` defines a `__proto__` key as an OWN property where a
 *  literal would set the prototype. */
function isJsonObject(raw: string): boolean {
  let parsed: unknown;
  // @orb-waive caught-failure-ownership(catch): CLASSIFIER, not a failure — "does this model-emitted blob parse to an object" is the question, and `false` IS the answer (the pair degrades to announced text, which the caller renders). Reporting it would raise a user-facing error for a turn that runs correctly. Ends if this ever gates something other than the structural-vs-text choice.
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
}

/** Is this part riding as a REAL SDK block rather than as announced text? Only a tool part, and only when its
 *  other half is present and adjacent ({@link pairedToolCallIds}). */
function ridesAsBlock(part: HistoryPart, paired: ReadonlySet<string>): part is Extract<AgentSeedBlock, { type: "tool-call" | "tool-result" }> {
  return (part.type === "tool-call" || part.type === "tool-result") && paired.has(part.toolCallId);
}

/**
 * One history row's seed blocks: the rendered text (label- and name-stamped) FIRST, then the structural tool
 * blocks in their own order — the shape a tool loop actually produces (`[text?, tool-call…]` on the assistant
 * row, `[tool-result]` on each tool row).
 *
 * A STRUCTURAL BLOCK TAKES NO LABEL, and that is the point of the arm: `Tool result:` is a host claim the model
 * has to believe, where a `tool_result` block is a role the wire itself carries. The label survives for
 * everything that still rides as text — a degraded pair, a system row — so nothing ever wears the human's voice
 * by default (#1457).
 */
function seedBlocksFor(m: ChatHistoryMessage, paired: ReadonlySet<string>): AgentSeedBlock[] {
  const structural: AgentSeedBlock[] = [];
  const rendered: HistoryPart[] = [];
  for (const part of m.content) {
    if (ridesAsBlock(part, paired)) {
      structural.push(part);
    } else {
      rendered.push(part);
    }
  }
  const text = agentRowText(m, rendered);
  const labelled = text.length > 0 && AGENT_SEED_FRAMES[m.role].announce ? `${AGENT_ROW_LABELS[m.role]}: ${text}` : text;
  return [...(labelled.length > 0 ? [{ type: "text", text: labelled } as const] : []), ...structural];
}

/**
 * The seed: one turn per history row, EXCEPT that a contiguous run of `tool` rows folds into ONE `user` turn. The
 * fold is required by the same wire rule the pairing check serves — every `tool_result` answering one assistant
 * message must ride in a SINGLE following user message, and a tool loop emits one `tool` row per executed call,
 * so a row-per-turn seed would split a two-call batch across two user messages and 400.
 *
 * A row that renders to nothing contributes NO frame: `content: [{type:"text", text:""}]` is a body the Anthropic
 * wire rejects, and an empty frame is not a turn anyone took.
 */
function seedTurnsFor(rows: readonly ChatHistoryMessage[]): AgentSeedTurn[] {
  const paired = pairedToolCallIds(rows);
  const seed: AgentSeedTurn[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row === undefined) {
      i += 1;
      continue;
    }
    if (row.role === "tool") {
      const run = foldToolRun(rows, i, paired);
      if (run.content.length > 0) {
        seed.push({ role: AGENT_SEED_FRAMES.tool.frame, content: run.content });
      }
      i = run.next;
      continue;
    }
    const content = seedBlocksFor(row, paired);
    if (content.length > 0) {
      seed.push({ role: AGENT_SEED_FRAMES[row.role].frame, content });
    }
    i += 1;
  }
  return seed;
}

/** The blocks of the whole contiguous `tool` run starting at `start`, plus the index after it. */
function foldToolRun(rows: readonly ChatHistoryMessage[], start: number, paired: ReadonlySet<string>): { content: AgentSeedBlock[]; next: number } {
  const content: AgentSeedBlock[] = [];
  let i = start;
  while (i < rows.length) {
    const row = rows[i];
    if (row === undefined || row.role !== "tool") {
      break;
    }
    content.push(...seedBlocksFor(row, paired));
    i += 1;
  }
  return { content, next: i };
}

/**
 * The caller's executable tools as the in-process MCP server this backend mounts. Each handler hands ONE call to
 * the caller's `execute` and maps its outcome onto the MCP `CallToolResult`; the caller decides everything that
 * happens after a call (validation, permission, the record it keeps).
 *
 * THE CALL ID IS SYNTHESIZED HERE, because only this backend lacks one: the SDK owns the loop and does not hand a
 * provider tool-call id to a wrapped handler. The id is a stable per-server ordinal (`mcp_<name>_<n>`, counted
 * across every tool on the server), minted once per mount so a turn's records are distinguishable; nothing reads
 * it beyond the record.
 */
function mountToolOffer(offer: ChatToolOffer): AgentToolServer {
  let ordinal = 0;
  const tools: readonly AgentToolSpec[] = offer.definitions.map((definition) => ({
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputShape,
    handler: async (args: Record<string, unknown>) => {
      ordinal += 1;
      const outcome = await offer.execute({ toolCallId: `mcp_${definition.name}_${ordinal}`, name: definition.name, arguments: JSON.stringify(args) });
      return {
        content: [{ type: "text", text: outcome.text }],
        ...(outcome.isError ? { isError: true } : {}),
      };
    },
  }));
  return createAgentToolServer({ tools });
}

/**
 * The neutral turn → this backend's request arm. Trailing depth-0 system rows are lifted out of the transcript
 * ({@link extractTrailingSystemRows}) into `tailSystem`, because the SDK delivers mid-conversation system
 * authority through the `UserPromptSubmit` hook rather than as history rows; the system prompt keeps only the
 * system-region halves. The history then splits into
 * seed frames + a prompt ({@link splitAgentHistory}); the executable tools mount as an MCP server
 * ({@link mountToolOffer}) with the offer's round ceiling; the terminal tools ride their own channel, which the
 * runner mounts deny-on-use (`terminal-tools.ts`). The array-wire knobs (`cacheBreakpointDepth`,
 * `reasoningTags`) have no slot here — the SDK owns the wire body — and are dropped.
 */
export function toAgentSdkChatRequest(input: ChatTurnInput): AgentSdkChatRequest {
  const extract = extractTrailingSystemRows(input.history);
  const split = splitAgentHistory(extract.rows);
  const offer = input.tools?.offer;
  const terminal = input.tools?.terminal;
  return {
    api: "agent-sdk",
    // The WHOLE resolved connection rides the request (§8.4-3): provider row, credential, folded features,
    // extras and capability — the runtime picks the wire off it; nothing here re-derives a routing fact.
    connection: input.connection,
    params: input.params,
    systemPrompt: input.systemPrompt,
    ...(extract.systemText !== null ? { tailSystem: extract.systemText } : {}),
    ...(offer !== undefined ? { toolServer: mountToolOffer(offer), toolTurnLimit: offer.turnLimit } : {}),
    // responseFormat rides the SDK's own outputFormat (json_schema) — never silently dropped.
    ...(input.responseFormat !== undefined ? { responseFormat: input.responseFormat } : {}),
    // The TERMINAL channel (D112 R1): the runner mounts these as its own deny-on-use MCP server and hands the
    // co-emitted calls back on `result.toolCalls` — the SAME field the array wires report.
    ...(terminal !== undefined ? { terminalTools: terminal } : {}),
    ...(input.onEvent !== undefined ? { onEvent: input.onEvent } : {}),
    ...deltaSubscriptionOf(input),
    seed: split.seed,
    prompt: split.prompt,
    signal: input.signal,
  };
}
