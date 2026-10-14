import type { Task } from "@orb/contracts/inference";
import { declaredCapabilitySchema, taskDef } from "@orb/contracts/inference";
import type { LibSqlWrap } from "@orb/db";
import { closeDb } from "@orb/db";
import type { InferenceDeps, Resolved } from "@orb/inference";
import type { UserCredentialId } from "@orb/kit/ids";
import { jsonValueSchema } from "@orb/kit/json";
import { freshDb } from "@orb/testkit/node/db.ts";
import { TEST_BASE_URL, TEST_PROVIDER_ID } from "@orb/testkit/node/factories/resolved-connection.ts";
import type { AppCaller, Fixtures } from "@orb/testkit/node/fixtures.ts";
import { test as baseTest } from "@orb/testkit/node/fixtures.ts";
import { terminalSseLine } from "@orb/testkit/node/provider-stream.ts";
import type { SdkScriptSpawn } from "@orb/testkit/node/sdk-process.ts";
import { createSdkProcessSpawner } from "@orb/testkit/node/sdk-process.ts";

export { seedRecallRoom as fundingRoom } from "@orb/testkit/node/corpus-seed.ts";

export const FUNDING_MODEL = "funding-model";
export const FUNDING_KEY = "funding-test-key";

export interface FundingProvider {
  readonly calls: string[];
  readonly requests: string[];
  readonly authorizations: (string | null)[];
  readonly requestBodies: string[];
  readonly errors: Error[];
  readonly fetch: typeof fetch;
  readonly span: InferenceDeps["span"];
  reply: (text: string) => void;
  image: (bytes: Uint8Array) => void;
  toolReply: (name: string, argumentsJson: string) => void;
  status: (status: number) => void;
  statusFor: (path: string, status: number, skip?: number) => void;
  wrapFailures: (wrap: boolean) => void;
  cancelFailures: (controller: AbortController | null) => void;
  holdChatStream: () => { readonly fail: (error: Error) => Promise<void> };
  holdAuthenticationFailure: () => { readonly reached: Promise<void>; readonly release: () => void };
}

export interface FundingSdk {
  readonly tokens: (string | undefined)[];
  readonly children: ReturnType<SdkScriptSpawn>[];
  readonly spawn: SdkScriptSpawn;
  readonly onSpawn: (observe: () => void) => void;
}

export interface FundingDriver {
  client: Parameters<LibSqlWrap>[0] | null;
}

function urlOf(input: Parameters<typeof fetch>[0]): URL {
  if (typeof input === "string") {
    return new URL(input);
  }
  return input instanceof URL ? input : new URL(input.url);
}

async function bodyOf(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]): Promise<string | null> {
  if (typeof init?.body === "string") {
    return init.body;
  }
  return input instanceof Request ? await input.clone().text() : null;
}

function authenticationFailure(status: number): Response {
  return Response.json(
    { error: { message: "the scripted provider rejected this request", type: "authentication_error", code: "invalid_api_key" } },
    { status },
  );
}

function embeddingResponse(body: string | null): Response {
  if (body === null) {
    throw new Error("the physical embedding request carried no body");
  }
  const request = jsonValueSchema.parse(JSON.parse(body));
  if (request === null || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("the physical embedding request carried no object body");
  }
  const input = request["input"];
  const messages = request["messages"];
  if (input === undefined && !Array.isArray(messages)) {
    throw new Error("the physical embedding request carried neither text inputs nor multimodal messages");
  }
  const count = Array.isArray(input) ? input.length : 1;
  return Response.json({
    model: FUNDING_MODEL,
    data: Array.from({ length: count }, (_value, index) => ({ index, embedding: [1, 0, 0] })),
    usage: { ["prompt_tokens"]: count, ["total_tokens"]: count },
  });
}

function createFundingProvider(): FundingProvider {
  const calls: string[] = [];
  const requests: string[] = [];
  const authorizations: (string | null)[] = [];
  const requestBodies: string[] = [];
  const errors: Error[] = [];
  let reply = JSON.stringify({ answer: "funded" });
  let image = "AA==";
  let toolReply: { readonly name: string; readonly argumentsJson: string } | null = null;
  let status = 200;
  const pathStatuses = new Map<string, { readonly status: number; skip: number }>();
  let wrap = false;
  let cancellation: AbortController | null = null;
  let heldStream: Response | null = null;
  let heldAuth: { readonly reached: PromiseWithResolvers<void>; readonly reply: PromiseWithResolvers<Response> } | null = null;
  const chatResponse = (body: string | null): Response => {
    if (heldStream !== null) {
      const response = heldStream;
      heldStream = null;
      return response;
    }
    const request = body === null ? null : jsonValueSchema.parse(JSON.parse(body));
    const offered = request !== null && typeof request === "object" && !Array.isArray(request) ? request["tools"] : undefined;
    const hasTool =
      toolReply !== null &&
      Array.isArray(offered) &&
      offered.some((tool) => {
        if (tool === null || typeof tool !== "object" || Array.isArray(tool)) {
          return false;
        }
        const definition = tool["function"];
        return definition !== null && typeof definition === "object" && !Array.isArray(definition) && definition["name"] === toolReply?.name;
      });
    const delta =
      toolReply === null || !hasTool
        ? `{"content":${JSON.stringify(reply)}}`
        : `{"tool_calls":[{"index":0,"id":"funding-tool","type":"function","function":{"name":${JSON.stringify(toolReply.name)},"arguments":${JSON.stringify(toolReply.argumentsJson)}}}]}`;
    const stream = `data: {"id":"funding-response","object":"chat.completion.chunk","model":"${FUNDING_MODEL}","choices":[{"index":0,"delta":${delta}}]}\n\n${terminalSseLine({ finishReason: toolReply === null || !hasTool ? "stop" : "tool_calls", usage: { promptTokens: 1, completionTokens: 1 } })}\n\ndata: [DONE]\n\n`;
    return new Response(stream, { headers: { "content-type": "text/event-stream" } });
  };
  const successResponse = (path: string, body: string | null): Response => {
    if (path.endsWith("/embeddings")) {
      return embeddingResponse(body);
    }
    if (path.endsWith("/rerank")) {
      return Response.json({ results: [{ index: 0, ["relevance_score"]: 1 }], usage: { ["total_tokens"]: 1 } });
    }
    if (path.endsWith("/chat/completions")) {
      return chatResponse(body);
    }
    if (path.endsWith("/images/generations")) {
      return Response.json({ created: 0, data: [{ ["b64_json"]: image }] });
    }
    throw new Error(`unscripted funding provider request: ${path}`);
  };
  const responseFor = (path: string, body: string | null): Promise<Response> => {
    if (heldAuth !== null) {
      const held = heldAuth;
      heldAuth = null;
      held.reached.resolve();
      return held.reply.promise;
    }
    const pathStatus = pathStatuses.get(path);
    const responseStatus = pathStatus === undefined || pathStatus.skip > 0 ? status : pathStatus.status;
    if (pathStatus !== undefined && pathStatus.skip > 0) {
      pathStatus.skip -= 1;
    }
    return Promise.resolve(responseStatus === 200 ? successResponse(path, body) : authenticationFailure(responseStatus));
  };
  return {
    calls,
    requests,
    authorizations,
    requestBodies,
    errors,
    wrapFailures: (next): void => {
      wrap = next;
    },
    cancelFailures: (next): void => {
      cancellation = next;
    },
    holdAuthenticationFailure: (): ReturnType<FundingProvider["holdAuthenticationFailure"]> => {
      const held = { reached: Promise.withResolvers<void>(), reply: Promise.withResolvers<Response>() };
      heldAuth = held;
      return {
        reached: held.reached.promise,
        release: (): void => {
          held.reply.resolve(authenticationFailure(401));
        },
      };
    },
    holdChatStream: (): ReturnType<FundingProvider["holdChatStream"]> => {
      const ready = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();
      const body = new ReadableStream<Uint8Array>({
        start(controller): void {
          controller.enqueue(
            new TextEncoder().encode(
              `data: {"id":"funding-response","object":"chat.completion.chunk","model":"${FUNDING_MODEL}","choices":[{"index":0,"delta":{"content":"partial funding response"}}]}\n\n`,
            ),
          );
          ready.resolve(controller);
        },
      });
      heldStream = new Response(body, { headers: { "content-type": "text/event-stream" } });
      return {
        fail: async (error): Promise<void> => {
          (await ready.promise).error(error);
        },
      };
    },
    span: async <T>(_name: string, run: () => Promise<T> | T): Promise<T> => {
      try {
        return await run();
      } catch (error) {
        cancellation?.abort();
        if (wrap) {
          const outer = new Error("the observed provider span failed", { cause: error });
          errors.push(outer);
          throw outer;
        }
        if (error instanceof Error) {
          errors.push(error);
        }
        throw error;
      }
    },
    reply: (next): void => {
      reply = next;
      toolReply = null;
    },
    image: (bytes): void => {
      image = Buffer.from(bytes).toString("base64");
    },
    toolReply: (name, argumentsJson): void => {
      toolReply = { name, argumentsJson };
    },
    status: (next): void => {
      status = next;
    },
    statusFor: (path, next, skip = 0): void => {
      pathStatuses.set(path, { status: next, skip });
    },
    fetch: async (input, init): Promise<Response> => {
      const url = urlOf(input);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      requests.push(`${method} ${url.href}`);
      if (method === "GET") {
        return url.pathname.endsWith("/models") ? Response.json({ data: [{ id: FUNDING_MODEL }] }) : Response.json({}, { status: 404 });
      }
      calls.push(url.pathname);
      const requestBody = await bodyOf(input, init);
      if (requestBody !== null) {
        requestBodies.push(requestBody);
      }
      authorizations.push(new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get("authorization"));
      return await responseFor(url.pathname, requestBody);
    },
  };
}

export const test = baseTest.extend<
  Pick<Fixtures, "db" | "providerFetch" | "runtimeSpan" | "sdkSpawn" | "networkExecution" | "secretBoxKey"> & {
    fundingProvider: FundingProvider;
    fundingDriver: FundingDriver;
    nativeSdk: FundingSdk;
  }
>({
  fundingProvider: async ({}, use): Promise<void> => {
    await use(createFundingProvider());
  },
  fundingDriver: async ({}, use): Promise<void> => {
    await use({ client: null });
  },
  db: async ({ fundingDriver }, use): Promise<void> => {
    const db = await freshDb((client) => {
      fundingDriver.client = client;
      return client;
    });
    await using lifetime = new AsyncDisposableStack();
    lifetime.defer(() => closeDb(db));
    await use(db);
  },
  providerFetch: async ({ fundingProvider }, use): Promise<void> => {
    await use(fundingProvider.fetch);
  },
  runtimeSpan: async ({ fundingProvider }, use): Promise<void> => {
    await use(fundingProvider.span);
  },
  nativeSdk: async ({}, use): Promise<void> => {
    const tokens: FundingSdk["tokens"] = [];
    const children: FundingSdk["children"] = [];
    const spawn = createSdkProcessSpawner(new URL("../../../../support/node/runtime-funding-sdk.mjs", import.meta.url));
    let observe: (() => void) | undefined;
    await use({
      tokens,
      children,
      onSpawn: (next): void => {
        observe = next;
      },
      spawn: (options) => {
        tokens.push(options.env["CLAUDE_CODE_OAUTH_TOKEN"]);
        observe?.();
        const child = spawn(options);
        children.push(child);
        return child;
      },
    });
  },
  sdkSpawn: async ({ nativeSdk }, use): Promise<void> => {
    await use(nativeSdk.spawn);
  },
  networkExecution: async ({}, use): Promise<void> => {
    const endpoint = new URL(TEST_BASE_URL).hostname;
    await use({
      resolver: (host) => {
        if (host !== endpoint) {
          throw new Error(`unscripted funding DNS lookup: ${host}`);
        }
        return Promise.resolve([endpoint]);
      },
    });
  },
  secretBoxKey: async ({}, use): Promise<void> => {
    await use(Buffer.alloc(32, 1));
  },
});

export async function fundingConnection<T extends Task>(args: {
  readonly ownerCaller: AppCaller;
  readonly harness: Fixtures["harness"];
  readonly task: T;
  readonly allowBackground?: boolean;
  readonly credentialId?: UserCredentialId | null;
  readonly providerId?: string;
  readonly model?: string;
  readonly baseUrl?: string | null;
  readonly cachedFacts?: boolean;
}): Promise<Resolved<T>> {
  const { task } = args;
  const declared = declaredCapabilitySchema.parse({
    kind: taskDef(task).kind,
    generation: { tools: { parallel: false }, output: { structured: true, modalities: ["text", "image"] } },
    embedding: { dims: 3, input: ["text", "image"] },
    rerank: { maxInputTokens: 1024 },
    features: { detectServer: false, rerankPath: "/rerank", images: "images-api" },
  });
  const row = await args.ownerCaller.connection.create({
    providerId: args.providerId ?? TEST_PROVIDER_ID,
    model: args.model ?? FUNDING_MODEL,
    credentialId: args.credentialId ?? null,
    baseUrl: args.baseUrl === undefined ? TEST_BASE_URL : args.baseUrl,
    allowBackground: args.allowBackground ?? true,
    declared,
  });
  const { resolved } = await args.harness.app.runtime.resolve({
    task,
    connectionId: row.id,
    principal: await args.harness.principalFor(args.harness.ownerId),
    ...(args.cachedFacts === undefined ? {} : { cachedFacts: args.cachedFacts }),
  });
  return { ...resolved, task };
}
