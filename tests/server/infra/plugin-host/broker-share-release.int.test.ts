// @subject packages/server/src/infra/plugin-host/broker-entry.ts
// A runtime's share of the broker's queues passes to another runtime only once the parent has forgotten the runtime, on
// its last frame (D348): until then every frame charged to it, its last answer included, stays on its own share, and a
// runtime started meanwhile takes another. The first row scripts the parent's half of the inherited channel; the second
// runs the production app, whose forgetting of a finished runtime is what frees the share.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { InvocationChat } from "@orb/contracts/plugin";
import { mintTypeId } from "@orb/kit/ids";
import type { createPluginHost } from "@orb/server/infra/plugin-host";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { formatPluginBrokerArguments } from "#server/infra/plugin-host/process-argv.ts";
import { parsePluginIpcMessage } from "#server/infra/plugin-host/process-channel.ts";
import { pluginBrokerExecArgv } from "#server/infra/plugin-host/process-permission.ts";
import { parseBrokerParentMessage, parseMessageLine, serializeMessage } from "#server/infra/plugin-host/process-protocol.ts";
import { createPluginProcessEdge, NATIVE_TIMEOUT_MS } from "./process-runtime.fixtures.ts";

const BROKER_ENTRY = fileURLToPath(new URL("../../../../packages/server/src/infra/plugin-host/broker-entry.ts", import.meta.url));
const PRIVATE_DIRECTORY_MODE = 0o700;
// Two Workers, so a second runtime can start while the first one's share is still held.
const WORKER_MAXIMUM = 2;

type IpcEnvelope = NonNullable<ReturnType<typeof parsePluginIpcMessage>>;
type SnippetCommandValue = Omit<Parameters<ReturnType<typeof createPluginHost>["runSnippet"]>[0], "bridge" | "owner">;

test("a runtime's last answer stays on its own share, and the share passes on only after the parent forgets the runtime", {
  timeout: NATIVE_TIMEOUT_MS,
}, async ({ importStagingDir, ids }) => {
  const directory = join(importStagingDir, "broker");
  await mkdir(directory, { mode: PRIVATE_DIRECTORY_MODE });
  const generation = ids.uuid();
  const broker = spawn(
    process.execPath,
    [
      ...pluginBrokerExecArgv(),
      BROKER_ENTRY,
      ...formatPluginBrokerArguments({ directory, workerMaximum: WORKER_MAXIMUM, generation, nodeEnvironment: "test", logLevel: "silent" }),
    ],
    // The broker writes its heartbeats on stderr, which only a watchdog reads.
    { cwd: directory, env: { ["NODE_ENV"]: "test" }, stdio: ["ignore", "ignore", "ignore", "ipc"] },
  );
  await using lifetime = new AsyncDisposableStack();
  const exited = once(broker, "exit");
  lifetime.defer(async () => {
    if (broker.exitCode === null && broker.signalCode === null) {
      broker.kill("SIGKILL");
    }
    await exited;
  });

  const ready = Promise.withResolvers<void>();
  // Each command's answer, with the share its envelope was charged to.
  const answers = new Map<string, PromiseWithResolvers<{ readonly ok: boolean; readonly share: string | undefined }>>();
  broker.on("message", (raw: unknown) => {
    const envelope = parsePluginIpcMessage(raw);
    if (envelope?.kind === "ready") {
      ready.resolve();
      return;
    }
    if (envelope?.kind !== "frame") {
      return;
    }
    const frame = parseBrokerParentMessage(parseMessageLine(envelope.frame));
    if (frame?.kind === "response") {
      answers.get(frame.id)?.resolve({ ok: frame.ok, share: envelope.route?.share });
    }
  });
  exited.then(([code]) => ready.reject(new Error(`test: the broker exited before it was ready (${String(code)})`)), ready.reject);
  await ready.promise;

  const send = (frame: Parameters<typeof serializeMessage>[0]): void => {
    broker.send({ kind: "frame", generation, frame: serializeMessage(frame) } satisfies Extract<IpcEnvelope, { readonly kind: "frame" }>);
  };
  const chat: InvocationChat = { chatId: mintTypeId("chat", ids.next), canWrite: false, automationDepth: 0 };
  const value: SnippetCommandValue = { code: "orb.host(1);", grants: [], chat };
  // One snippet on a fresh runtime: its answer and the share that answer was charged to.
  const snippet = async (runtimeId: string): Promise<{ readonly ok: boolean; readonly share: string | undefined }> => {
    const id = ids.uuid();
    const answered = Promise.withResolvers<{ readonly ok: boolean; readonly share: string | undefined }>();
    answers.set(id, answered);
    send({ kind: "command", id, operation: "snippet", runtimeId, authorityId: ids.uuid(), value });
    return await answered.promise;
  };

  const first = ids.uuid();
  const firstAnswer = await snippet(first);
  expect(firstAnswer.ok).toBe(true);
  expect(firstAnswer.share).toBeDefined();

  // The first runtime's Worker has exited, but the parent has not forgotten it: its share is still its own.
  const meanwhile = await snippet(ids.uuid());
  expect(meanwhile.ok).toBe(true);
  expect(meanwhile.share).toBeDefined();
  expect(meanwhile.share).not.toBe(firstAnswer.share);

  // Positive control: once the parent forgets it, the next runtime takes that share.
  send({ kind: "runtime-forgotten", runtimeId: first });
  const after = await snippet(ids.uuid());
  expect(after.share).toBe(firstAnswer.share);
});

test("the app forgets a finished snippet's runtime, so the next snippet takes the same share of the broker's queues", {
  timeout: NATIVE_TIMEOUT_MS,
}, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.startChat({ characterIds: [] })).chat;

  const code = "orb.host(1).log.info('ran');";
  for (let run = 0; run < 2; run += 1) {
    expect(await caller.plugin.runSnippet({ chatId: room.id, code })).toEqual({ logLines: ["[info] ran"] });
  }

  // The share each snippet's answer was charged to, as it reached the app.
  const answeredOn = edge.delivered.flatMap((raw) => {
    const envelope = parsePluginIpcMessage(raw);
    return envelope?.kind === "frame" && parseBrokerParentMessage(parseMessageLine(envelope.frame))?.kind === "response" ? [envelope.route?.share] : [];
  });
  expect(answeredOn).toHaveLength(2);
  expect(answeredOn[0]).toBeDefined();
  expect(answeredOn[1]).toBe(answeredOn[0]);
});
