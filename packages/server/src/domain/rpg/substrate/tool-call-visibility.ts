// domain/rpg/substrate/tool-call-visibility — the hidden-span belt for the RECORDED TOOL CALLS (#1690, the
// #1528 class). Zero-I/O, principal-free: the CALLER owns the authority gate and threads the verdict as data
// (D106-F1), this owns only the transform.
//
// WHY THIS ISN'T `stripHiddenForViewer` OVER THE SAME BYTES. A recorded call's `args` is the RAW JSON STRING
// the model sent, deliberately kept unparsed so a call that did not parse is still visible
// (`contracts/rpg/extraction.ts` — TOOLDROP-BLIND). Running the span strip over that ENCODED form does not
// half-work: it is a SILENT FALSE CLEAN. Measured 2026-09-05 against the live recognizer —
//
//   stripHiddenSpans('{"location":"hall <lie truth=\\"trapped\\"/> ok"}')
//     → content UNCHANGED, hadHidden: FALSE      (the truth ships, and the belt reports it did not)
//   stripHiddenSpans('hall <lie truth="trapped"/> ok')
//     → 'hall  ok',        hadHidden: true
//
// — because the tokenizer walks an attr value from its opening `"` with `\` escapes, and JSON has already
// turned that quote into `\"`, so the tag never validates and never registers as hidden. DECODE FIRST, walk
// the parsed leaves, re-encode. The same trap applies to an issue line's model-SENT value, which is a JSON
// literal embedded in prose.
//
// THE UNPARSEABLE ARM IS A WITHHOLD, and that is the product decision this file records (#1690): args that do
// not parse cannot be decoded, so the belt cannot be applied to them, and the fail-closed answer for a viewer
// who does not read hidden is to serve NONE of the bytes plus a typed reason
// (`RPG_TOOL_CALL_WITHHOLD_REASONS`) the panel states out loud. Pass-through was rejected: the calls most
// likely to be malformed are exactly the ones a model garbled mid-emission, which is where a half-written
// `<lie truth="…` lands. The reader loses nothing they could act on — the call's NAME, its `not recorded`
// verdict and the `arguments: not valid JSON` issue all still ship.
//
// A HOST READS BOTH VERBATIM (identity, not a walk): the truth is the host's plane (parity-plus §3.6).

import type { RpgRecordedToolCall, RpgToolCallDisclosure } from "@orb/contracts/rpg";
import { parseToolCallArgs, projectIssueSentValue, RPG_STATE_ROUND_FAILED_SUMMARY } from "@orb/contracts/rpg";
import { stripHiddenDeep } from "./hidden-spans.ts";

/** One JSON payload with every leaf string's hidden spans removed, re-encoded — or `null` when the input is
 *  not readable at all (the withhold arm; see the header).
 *
 *  The decode is `parseToolCallArgs`, the SAME one the fold's own drop verdict uses — not a second
 *  `JSON.parse` + catch here, which would be a second, differently-owned answer to "is this payload
 *  readable". Its `null` also covers a literal `null` payload, which is the same verdict: nothing to belt and
 *  nothing a reader can act on. */
function stripHiddenInJson(raw: string): string | null {
  const parsed = parseToolCallArgs(raw);
  return parsed === null ? null : JSON.stringify(stripHiddenDeep(parsed));
}

/** One issue line with its model-SENT value re-rendered through the belt; a value that cannot be decoded
 *  (the 80-char truncation `malformedToolCallDetails` applies, or the `(absent)` marker) is DROPPED, leaving
 *  the actionable `<path>: <message>` half. The `<path>` half is derived from the schema, never from model
 *  bytes, so it is safe by construction. */
function stripHiddenInIssue(issue: string): string {
  return projectIssueSentValue(issue, (sent) => stripHiddenInJson(sent));
}

/** The member-facing projection of one recorded call. `readsHidden` is chat's ONE `viewerReadsHidden` verdict,
 *  threaded in by the verb — never re-derived here (there is no principal in this file). */
function projectToolCallForViewer(call: RpgRecordedToolCall, readsHidden: boolean): RpgToolCallDisclosure {
  if (readsHidden) {
    return { name: call.name, args: call.args, verdict: call.verdict, issues: call.issues, withheld: null };
  }
  const args = stripHiddenInJson(call.args);
  return {
    name: call.name,
    args: args ?? "",
    verdict: call.verdict,
    issues: call.issues.map(stripHiddenInIssue),
    withheld: args === null ? "unparseable" : null,
  };
}

/** {@link projectToolCallForViewer} across one turn's calls — the shape `listTurnToolCalls` serves. */
export function projectToolCallsForViewer(calls: readonly RpgRecordedToolCall[], readsHidden: boolean): readonly RpgToolCallDisclosure[] {
  return calls.map((call) => projectToolCallForViewer(call, readsHidden));
}

/** The member-facing projection of a FAILED round's reason (#1468 item 2). The stored sentence is
 *  `<summary>: <the vehicle's own error>`; the tail is a provider diagnostic (endpoint, model id, whatever the
 *  backend put in its error body) and this read is MEMBER-gated, so only a hidden-reading viewer — the host,
 *  who is also the person who can DO something about a broken connection — gets it. Everyone else is told the
 *  thing they can act on: their turn did not record, and it was not their doing.
 *
 *  It rides `readsHidden` rather than a second axis for the same reason the args do: this file has exactly one
 *  viewer verdict, threaded in as data by the verb, and a second one would be a second answer to "who is
 *  privileged here" that could drift from it. */
export function projectFailureForViewer(failure: string | null, readsHidden: boolean): string | null {
  if (failure === null) {
    return null;
  }
  return readsHidden ? failure : RPG_STATE_ROUND_FAILED_SUMMARY;
}
