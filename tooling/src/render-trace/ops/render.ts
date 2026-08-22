// The render op: read a RequestTrace JSON from stdin or a file path, print the waterfall. Accepts
// both a bare trace and a `{traces:[...]}` list response — the list endpoint strips `spans`
// (summary rows); only a full trace renders a waterfall.
import { readFileSync } from "node:fs";
import process from "node:process";
import type { RequestTrace } from "@orb/server/foundation/observability";
import { instrumentError } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { UsageError } from "../../_shared/run-tool.ts";
import { emptySpansGap } from "../lib/evidence.ts";
import { renderTrace } from "../lib/render.ts";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export async function renderOp(arg: string | undefined): Promise<number> {
  let raw: string;
  if (arg === undefined || arg === "-") {
    if (process.stdin.isTTY === true) {
      throw new UsageError("usage: pnpm trace:render <file>  |  curl … | pnpm trace:render");
    }
    raw = await readStdin();
  } else {
    raw = readFileSync(arg, "utf-8");
  }
  const parsed: unknown = JSON.parse(raw);
  if (parsed !== null && typeof parsed === "object" && "spans" in parsed) {
    return renderOne(parsed as RequestTrace);
  }
  if (parsed !== null && typeof parsed === "object" && "traces" in parsed) {
    return renderList((parsed as { traces: RequestTrace[] }).traces);
  }
  // The input parsed as JSON but is neither shape: the CALLER handed the wrong file/endpoint —
  // misuse, not a verdict (stated exit-convergence deviation from the pre-move `exit 1`).
  throw new UsageError("input doesn't look like a RequestTrace or a traces list");
}

function renderOne(trace: RequestTrace): number {
  // ZERO HYGIENE (#409): a recorded trace ALWAYS carries its root span, so an empty span list means the
  // tracer captured nothing for this request. Rendering the header alone read exactly like a successful
  // waterfall — a waterfall with no rows is absent evidence, not a fast request.
  if (trace.spans.length === 0) {
    return instrumentError(emptySpansGap(trace.requestId));
  }
  process.stdout.write(`${renderTrace(trace)}\n`);
  return EXIT.clean;
}

function renderList(list: readonly RequestTrace[]): number {
  // The NUANCE arm (#409): an empty ring is a REAL answer from a healthy endpoint — a freshly booted
  // server has recorded nothing, so this is not a tool error. It is a LINE, because printing absolutely
  // nothing and exiting 0 is indistinguishable from a successful render.
  if (list.length === 0) {
    process.stdout.write("0 traces in the input — the ring is empty (a healthy endpoint with nothing recorded yet), so nothing was rendered\n");
    return EXIT.clean;
  }
  for (const t of list) {
    if (Array.isArray(t.spans)) {
      process.stdout.write(`${renderTrace(t)}\n\n`);
    } else {
      process.stdout.write(
        `${t.rootName}  ${t.status}  ${Math.round(t.durationMs)}ms  req ${t.requestId}  (summary row — fetch /api/_debug/traces/${t.requestId} for the waterfall)\n`,
      );
    }
  }
  return EXIT.clean;
}
