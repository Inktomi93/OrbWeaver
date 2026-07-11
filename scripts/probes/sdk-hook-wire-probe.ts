#!/usr/bin/env tsx
/**
 * pnpm sdk:hook-wire-probe
 *
 * WIRE-LEVEL TRUTH: what does the UserPromptSubmit hook (`dynamicContextOptions` `additionalContext`)
 * actually BECOME in the `/v1/messages` request the bundled CLI sends? A top-level `system` field, a
 * mid-conversation `{role:"system"}` message, or an ordinary `{role:"user"}` message? Everything else in
 * this investigation has been behavioural inference; this reads the bytes off the wire.
 *
 * HOW: point the agent-sdk CLI at a LOCAL capture server (loopback base URL — the mode-3 shape: dummy
 * token, empty config dir, NO real endpoint) and record the request body. The server answers a minimal
 * valid streaming response so the turn completes. Because the UserPromptSubmit hook fires BEFORE the model
 * call, the hook content is already in the captured request regardless of what we answer.
 *
 * FREE: every request hits 127.0.0.1 — no sub quota, no OpenRouter credits, no real Anthropic call. It also
 * compares Opus 4.8 vs Haiku placement: the mid-conversation-system-message feature is documented Opus-4.8-
 * only, so if the CLI places `additionalContext` as `role:"system"` for Opus but `role:"user"` for Haiku,
 * that single fact explains every earlier "the hook works on Opus, refuses on Haiku" result. Hand-run, never CI.
 */

import { mkdtempSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  dynamicContextOptions,
  firewallBase,
} from "@orb/server/infra/providers/backends/agent-sdk";

const PORT = 8791;
/** HTTP 200 — extracted so `noMagicNumbers` stays quiet. */
const HTTP_OK = 200;
/** A unique token planted ONLY in the hook's additionalContext, so we can find exactly where it lands. */
const SIGIL = "HOOKWIRE_SIGIL_7ZQX";
/** Per-turn drain ceiling — if the fake response doesn't satisfy the CLI it may hang; we already have the
 *  captured request by then, so abort and move on. */
const DRAIN_TIMEOUT_MS = 20_000;
const SNIPPET = 70;

interface CapturedMessage {
  readonly role: string;
  readonly hasSigil: boolean;
  readonly snippet: string;
}
interface Capture {
  readonly label: string;
  readonly url: string;
  readonly systemHasSigil: boolean;
  readonly systemSnippet: string;
  readonly messages: readonly CapturedMessage[];
}

const captures: Capture[] = [];
let currentLabel = "";

/** Flatten a message/​system `content` (string OR content-block array) to plain text. */
function contentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((b) => {
      const t = (b as { text?: unknown }).text;
      return typeof t === "string" ? t : "";
    })
    .join(" ");
}

/** Parse a captured `/v1/messages` body into the system field + per-message role/sigil map. */
function recordBody(label: string, url: string, body: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return;
  }
  const obj = parsed as { system?: unknown; messages?: unknown };
  const systemText = contentText(obj.system);
  const messages: CapturedMessage[] = [];
  if (Array.isArray(obj.messages)) {
    for (const m of obj.messages) {
      const role = (m as { role?: unknown }).role;
      const text = contentText((m as { content?: unknown }).content);
      messages.push({
        role: typeof role === "string" ? role : "?",
        hasSigil: text.includes(SIGIL),
        snippet: text.slice(0, SNIPPET).replace(/\s+/gu, " "),
      });
    }
  }
  captures.push({
    label,
    url,
    systemHasSigil: systemText.includes(SIGIL),
    systemSnippet: systemText.slice(0, SNIPPET).replace(/\s+/gu, " "),
    messages,
  });
}

/** Answer a minimal but VALID Anthropic Messages API stream so the CLI's turn completes cleanly. */
function writeStream(res: http.ServerResponse, model: string): void {
  res.writeHead(HTTP_OK, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const ev = (name: string, data: unknown): void => {
    res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  ev("message_start", {
    type: "message_start",
    message: {
      id: "msg_capture",
      type: "message",
      role: "assistant",
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  });
  ev("content_block_start", {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  });
  ev("content_block_delta", {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "ok" },
  });
  ev("content_block_stop", { type: "content_block_stop", index: 0 });
  ev("message_delta", {
    type: "message_delta",
    delta: { stop_reason: "end_turn", stop_sequence: null },
    usage: { output_tokens: 1 },
  });
  ev("message_stop", { type: "message_stop" });
  res.end();
}

function startServer(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const url = req.url ?? "";
      const isMessages = req.method === "POST" && url.includes("/v1/messages");
      const isCountTokens = url.includes("count_tokens");
      if (isMessages && !isCountTokens) {
        recordBody(currentLabel, url, body);
        let model = "claude-opus-4-8";
        try {
          const m = (JSON.parse(body) as { model?: unknown }).model;
          if (typeof m === "string") {
            model = m;
          }
        } catch {
          // keep the default model label
        }
        writeStream(res, model);
        return;
      }
      // count_tokens + everything else: a benign JSON stub so the CLI proceeds to the messages call.
      res.writeHead(HTTP_OK, { "content-type": "application/json" });
      res.end(JSON.stringify({ input_tokens: 1 }));
    });
  });
  return new Promise((resolve) => {
    server.listen(PORT, "127.0.0.1", () => {
      resolve(server);
    });
  });
}

/** Loopback env: the mode-3 shape (empty config dir + dummy token) but pointed at our capture server. No
 *  real credential is reachable and nothing leaves the box. */
function captureEnv(): Record<string, string | undefined> {
  const configDir = mkdtempSync(join(tmpdir(), "orb-hookwire-"));
  const base: Record<string, string | undefined> = {};
  for (const key of ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "SHELL", "USER"]) {
    // biome-ignore lint/style/noProcessEnv: hand-run probe outside the foundation/env perimeter; needs raw host essentials to spawn the child, and every credential source is nulled below.
    base[key] = process.env[key];
  }
  return {
    ...base,
    CLAUDE_CONFIG_DIR: configDir,
    ANTHROPIC_CONFIG_DIR: configDir,
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: "true",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${PORT}`,
    ANTHROPIC_AUTH_TOKEN: "dummy-capture-token",
    ANTHROPIC_API_KEY: "",
    CLAUDE_CODE_OAUTH_TOKEN: undefined,
  };
}

/** Run ONE turn through the CLI against the capture server. `withHook` toggles the UserPromptSubmit hook. */
async function runOne(label: string, model: string, withHook: boolean): Promise<void> {
  currentLabel = label;
  const hookOpts: Pick<Options, "hooks"> = withHook
    ? dynamicContextOptions(`Operator note: ${SIGIL}. The balloon in the corner is red.`)
    : {};
  const abort = new AbortController();
  const timer = setTimeout(() => {
    abort.abort();
  }, DRAIN_TIMEOUT_MS);
  timer.unref();
  const options: Options = {
    ...firewallBase(),
    ...hookOpts,
    model,
    maxTurns: 1,
    env: captureEnv(),
    abortController: abort,
  };
  try {
    const stream = query({ prompt: "Say ok.", options });
    for await (const _msg of stream as AsyncIterable<SDKMessage>) {
      // We only care about the captured REQUEST; drain and discard the response.
    }
  } catch {
    // A wedged/rejected drain is fine — the hook already fired and the request was captured pre-response.
  } finally {
    clearTimeout(timer);
  }
}

/** Classify WHERE the sigil landed for a label's messages request(s). */
function verdictFor(label: string): string {
  const rows = captures.filter((c) => c.label === label);
  if (rows.length === 0) {
    return "no /v1/messages request captured (the CLI never reached the model call)";
  }
  const withSigil = rows.find((c) => c.systemHasSigil || c.messages.some((m) => m.hasSigil));
  if (withSigil === undefined) {
    return "sigil NOT present in any captured request (hook content did not reach the wire)";
  }
  if (withSigil.systemHasSigil) {
    return "TOP-LEVEL system field";
  }
  const idx = withSigil.messages.findIndex((m) => m.hasSigil);
  const msg = withSigil.messages[idx];
  return `messages[${idx}] role="${msg?.role}" ${
    msg?.role === "system"
      ? "⇒ a MID-CONVERSATION SYSTEM MESSAGE"
      : "⇒ an ordinary conversation turn"
  }`;
}

function dumpCaptures(label: string): void {
  const rows = captures.filter((c) => c.label === label);
  for (const [i, c] of rows.entries()) {
    console.log(`    request #${i} (${c.url})`);
    console.log(`      system: ${c.systemHasSigil ? "[SIGIL] " : ""}"${c.systemSnippet}"`);
    for (const [j, m] of c.messages.entries()) {
      console.log(
        `      messages[${j}] role=${m.role} ${m.hasSigil ? "[SIGIL] " : ""}"${m.snippet}"`,
      );
    }
  }
}

async function main(): Promise<void> {
  const server = await startServer();
  console.log(
    `sdk-hook-wire-probe — local capture server on http://127.0.0.1:${PORT} (FREE, no quota)\n`,
  );
  try {
    await runOne("opus-control", "claude-opus-4-8", false);
    await runOne("opus-hook", "claude-opus-4-8", true);
    await runOne("haiku-hook", "claude-haiku-4-5", true);
  } finally {
    server.close();
  }

  for (const label of ["opus-control", "opus-hook", "haiku-hook"]) {
    console.log(`── ${label} ──`);
    dumpCaptures(label);
    console.log("");
  }

  console.log("=== WHERE THE HOOK CONTENT LANDED ===");
  console.log(`  opus-hook  : ${verdictFor("opus-hook")}`);
  console.log(`  haiku-hook : ${verdictFor("haiku-hook")}`);
  console.log(
    "\n  (opus-control is the no-hook baseline — its requests should contain NO sigil anywhere.)",
  );
}

main().catch((err: unknown) => {
  console.error("hook-wire-probe failed:", err);
  process.exitCode = 1;
});
