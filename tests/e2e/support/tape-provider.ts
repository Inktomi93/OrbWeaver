// A loopback OpenAI-compatible peer that plays a recorded provider tape, one step per chat request, in journey order.
// With E2E_TAPE_RECORD=1 it forwards each request to the upstream provider instead and writes the tape at disposal.
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { isPlainObject } from "@orb/kit/guards";
import type { ProviderTape, ProviderTapeStep } from "@orb/testkit/node/helpers";
import { providerTapeLeaks, readProviderTape, scrubTapeFrame, writeProviderTape } from "@orb/testkit/node/helpers";
import { E2E_TAPE_RECORD_DIR, E2E_TAPE_RECORD_KEY, E2E_TAPE_RECORDING, E2E_TAPE_UPSTREAM_API_KEY_ENV, E2E_TAPE_UPSTREAM_URL } from "./modes.ts";

const RECORD_UPSTREAM = E2E_TAPE_UPSTREAM_URL ?? "https://openrouter.ai/api/v1";
// The model every tape is recorded from (owner policy: local vLLM or OpenRouter Sonnet 5 for live turns).
const TAPE_RECORD_MODEL = "anthropic/claude-sonnet-5";
// The upstream refuses a request whose output ceiling the account cannot cover, and a product turn asks for the
// model's whole window. A recorded turn is short synthetic prose, so the recorder lowers the ceiling it forwards.
const RECORD_OUTPUT_CEILING = 1024;
const OUTPUT_CEILING_KEYS = ["max_tokens", "max_completion_tokens"] as const;

function withRecordCeiling(body: string): string {
  const parsed: unknown = JSON.parse(body);
  if (!isPlainObject(parsed)) {
    return body;
  }
  const lowered = Object.fromEntries(
    OUTPUT_CEILING_KEYS.flatMap((key) => {
      const ceiling = parsed[key];
      return typeof ceiling === "number" && ceiling > RECORD_OUTPUT_CEILING ? [[key, RECORD_OUTPUT_CEILING] as const] : [];
    }),
  );
  return JSON.stringify({ ...parsed, ...lowered });
}

const CHAT_PATH = "/chat/completions";
const MODELS_PATH = "/models";
const SSE_DATA = "data:";
const SSE_DONE = "[DONE]";
const SSE_HEADERS = { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } as const;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE = 422;

export interface TapeProvider extends AsyncDisposable {
  /** The `/v1` base URL a connection names. */
  readonly baseUrl: string;
  /** The model id the tape was recorded from; the connection must name the same one. */
  readonly model: string;
}

interface StepPlayer {
  readonly serve: (index: number, body: string, res: ServerResponse) => Promise<void>;
  readonly settle: () => void;
}

function requestToolNames(body: string): readonly string[] {
  const parsed: unknown = JSON.parse(body);
  const tools = isPlainObject(parsed) && Array.isArray(parsed["tools"]) ? parsed["tools"] : [];
  return tools
    .map((tool: unknown) => (isPlainObject(tool) && isPlainObject(tool["function"]) ? tool["function"]["name"] : undefined))
    .filter((name): name is string => typeof name === "string")
    .toSorted();
}

function refuse(res: ServerResponse, message: string): void {
  res.writeHead(HTTP_UNPROCESSABLE, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { message } }));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (part: string) => {
      body += part;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function replayPlayer(name: string, tape: ProviderTape, failures: string[]): StepPlayer {
  let served = 0;
  return {
    serve: (index, body, res): Promise<void> => {
      const step = tape.steps[index];
      if (step === undefined) {
        failures.push(`provider tape "${name}" holds ${String(tape.steps.length)} steps; the journey sent request ${String(index + 1)}`);
        refuse(res, failures.at(-1) ?? "");
        return Promise.resolve();
      }
      const tools = requestToolNames(body);
      if (tools.join(",") !== step.tools.join(",")) {
        failures.push(`provider tape "${name}" step "${step.step}" was recorded with tools [${step.tools.join(", ")}]; the request sent [${tools.join(", ")}]`);
        refuse(res, failures.at(-1) ?? "");
        return Promise.resolve();
      }
      served += 1;
      res.writeHead(HTTP_OK, SSE_HEADERS);
      for (const frame of step.frames) {
        res.write(`${SSE_DATA} ${frame}\n\n`);
      }
      res.end(`${SSE_DATA} ${SSE_DONE}\n\n`);
      return Promise.resolve();
    },
    settle: (): void => {
      if (served < tape.steps.length) {
        failures.push(`provider tape "${name}" left ${String(tape.steps.length - served)} of its steps unplayed`);
      }
    },
  };
}

function framesOf(text: string): readonly string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith(SSE_DATA))
    .map((line) => line.slice(SSE_DATA.length).trim())
    .filter((payload) => payload !== SSE_DONE && payload.length > 0);
}

function recordPlayer(name: string, steps: readonly string[], failures: string[]): StepPlayer {
  const key = E2E_TAPE_RECORD_KEY;
  if (key === undefined || key === "") {
    throw new Error(`recording provider tape "${name}" needs ${E2E_TAPE_UPSTREAM_API_KEY_ENV} in the environment`);
  }
  const recorded: (ProviderTapeStep | undefined)[] = [];
  const toolCallIds = new Map<string, string>();
  return {
    serve: async (index, body, res): Promise<void> => {
      const step = steps[index];
      if (step === undefined) {
        failures.push(`recording provider tape "${name}": the journey declares ${String(steps.length)} steps and sent request ${String(index + 1)}`);
        refuse(res, failures.at(-1) ?? "");
        return;
      }
      const upstream = await fetch(`${RECORD_UPSTREAM}${CHAT_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: withRecordCeiling(body),
      });
      const text = await upstream.text();
      if (!upstream.ok) {
        failures.push(`recording provider tape "${name}" step "${step}": upstream answered ${String(upstream.status)}`);
        res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json" });
        res.end(text);
        return;
      }
      const frames = framesOf(text).map((frame) => scrubTapeFrame(frame, TAPE_RECORD_MODEL, toolCallIds));
      // By arrival index, not completion order: a slow step must not swap places with a later one.
      recorded[index] = { step, tools: [...requestToolNames(body)], frames };
      res.writeHead(HTTP_OK, SSE_HEADERS);
      for (const frame of frames) {
        res.write(`${SSE_DATA} ${frame}\n\n`);
      }
      res.end(`${SSE_DATA} ${SSE_DONE}\n\n`);
    },
    settle: (): void => {
      if (failures.length > 0) {
        return;
      }
      const sent = recorded.filter((step): step is ProviderTapeStep => step !== undefined);
      if (sent.length !== steps.length) {
        failures.push(`recording provider tape "${name}": the journey declares ${String(steps.length)} steps and sent ${String(sent.length)}`);
        return;
      }
      const tape = { model: TAPE_RECORD_MODEL, steps: sent };
      const leaks = providerTapeLeaks(tape);
      if (leaks.length > 0) {
        failures.push(`recording provider tape "${name}" refused: it holds ${leaks.join(", ")}`);
        return;
      }
      writeProviderTape(name, tape, E2E_TAPE_RECORD_DIR);
    },
  };
}

/** Serve `name` for a journey that sends exactly `steps`, in order. A refused or unplayed step fails at disposal.
 *  A journey that declares no steps needs no tape file: any request it sends fails the case. */
export function startTapeProvider(name: string, steps: readonly string[]): Promise<TapeProvider> {
  const failures: string[] = [];
  let model = TAPE_RECORD_MODEL;
  let player: StepPlayer;
  if (steps.length === 0) {
    player = replayPlayer(name, { model, steps: [] }, failures);
  } else if (E2E_TAPE_RECORDING) {
    player = recordPlayer(name, steps, failures);
  } else {
    const tape = readProviderTape(name);
    const recordedSteps = tape.steps.map((step) => step.step);
    if (recordedSteps.join("\n") !== steps.join("\n")) {
      throw new Error(`provider tape "${name}" holds steps [${recordedSteps.join(", ")}]; the journey declares [${steps.join(", ")}]: re-record it`);
    }
    model = tape.model;
    player = replayPlayer(name, tape, failures);
  }
  let requests = 0;
  const server: Server = createServer((req, res) => {
    if (req.method === "GET" && req.url?.endsWith(MODELS_PATH) === true) {
      res.writeHead(HTTP_OK, { "content-type": "application/json" });
      // biome-ignore lint/style/useNamingConvention: `owned_by` is the OpenAI model-list wire field.
      res.end(JSON.stringify({ object: "list", data: [{ id: model, object: "model", created: 0, owned_by: "tape" }] }));
      return;
    }
    if (req.method !== "POST" || req.url?.endsWith(CHAT_PATH) !== true) {
      res.writeHead(HTTP_NOT_FOUND, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "tape-provider: only POST .../chat/completions is served" } }));
      return;
    }
    const index = requests;
    requests += 1;
    readBody(req)
      .then((body) => player.serve(index, body, res))
      .catch((error: unknown) => {
        failures.push(`provider tape "${name}" request ${String(index + 1)} failed: ${String(error)}`);
        res.destroy();
      });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("tape-provider: no TCP address"));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${String(address.port)}/v1`,
        model,
        [Symbol.asyncDispose]: async (): Promise<void> => {
          await new Promise<void>((done) => {
            server.close(() => done());
            server.closeAllConnections();
          });
          player.settle();
          if (failures.length > 0) {
            throw new Error(failures.join("\n"));
          }
        },
      });
    });
  });
}
