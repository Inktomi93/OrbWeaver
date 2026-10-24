// One case per env-seam class, through the composed root: a seam row's option reaches the production read, a composed
// row follows what it derives from, a deploy-only row has no door, and a machine-fact row replaces the runner's machine.
// @subject tests/support/node/env-seams.ts
// @subject tests/support/node/corpus.ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { execPath } from "node:process";
import { authConfigSchema } from "@orb/contracts/auth-config";
import type { AgentSdkSpawn } from "@orb/inference";
import { ID_PREFIX } from "@orb/kit/ids";
import { EnvRefusedError } from "@orb/server/foundation/env/refusal";
import { createCas } from "@orb/server/infra/storage/cas";
import { CORPUS_SDK_QUERY } from "./corpus-sdk-protocol.ts";
import { seedCorpusSdkActor } from "./corpus-sdk-sessions.ts";
import { createCorpusSdkExecution } from "./corpus-sdk-wire.ts";
import { createTestEnv } from "./env.ts";
import type { RawEnvInput } from "./env-seams.ts";
import { ENV_SEAMS } from "./env-seams.ts";
import { makeAssetBytes } from "./factories/asset.ts";
import { createCorpusHarness, expect, test } from "./fixtures.ts";
import { createServerHarness, SECRET_BOX_TEST_KEY } from "./server.ts";
import { createTestLogger } from "./test-logger.ts";

const EVERY_INTERFACE = "0.0.0.0";
const PNG = "image/png";
// A value every one of these keys parses, so only the door decides the outcome.
const FORCED_PORT = "1";
const MACHINE_NAME = "orb-seam-machine";
const OK = 200;
const MISDIRECTED_REQUEST = 421;

test("a seam row's option is the record key boot binds by: the parse refuses a public bind the hatch does not open", async () => {
  expect(ENV_SEAMS.BIND_HOST).toMatchObject({ kind: "seam", option: "bindHost" });
  await expect(createServerHarness({ env: { ["AUTH_MODE"]: "local" }, bindHost: EVERY_INTERFACE })).rejects.toBeInstanceOf(EnvRefusedError);
  await using root = await createServerHarness({ env: { ["AUTH_MODE"]: "local" }, bindHost: EVERY_INTERFACE, allowPublicBind: true });
  expect(root.env.BIND_HOST).toBe(EVERY_INTERFACE);
  expect((await root.listen()).address).toBe(EVERY_INTERFACE);
});

test("a machine-fact row reaches the Host allowlist: the root answers to its machine's name on bare metal only", async () => {
  expect(ENV_SEAMS.hostname).toMatchObject({ kind: "seam", option: "hostname" });
  const statusFor = async (root: Awaited<ReturnType<typeof createServerHarness>>): Promise<number> => {
    const response = await root.http.request(`http://${MACHINE_NAME}/healthz`);
    await response.arrayBuffer();
    return response.status;
  };
  await using bareMetal = await createServerHarness({ hostname: MACHINE_NAME });
  expect(await statusFor(bareMetal)).toBe(OK);
  await using container = await createServerHarness({ hostname: MACHINE_NAME, containerMarker: true });
  expect(container.env.INSTALL_KIND).toBe("container");
  expect(await statusFor(container)).toBe(MISDIRECTED_REQUEST);
});

test("a production record binds every interface, which a root refuses unless allowPublicBind says so", async () => {
  const clientDistDir = await mkdtemp(join(tmpdir(), "orb-env-seams-dist-"));
  try {
    await writeFile(join(clientDistDir, "index.html"), "<!doctype html><title>env seams</title>");
    const production = { ["NODE_ENV"]: "production", ["AUTH_MODE"]: "local" } as const;
    await expect(createServerHarness({ env: production, clientDistDir, bindHost: EVERY_INTERFACE })).rejects.toThrow(/allowPublicBind: true/u);
    await using root = await createServerHarness({ env: production, clientDistDir, bindHost: EVERY_INTERFACE, allowPublicBind: true });
    expect((await root.listen()).address).toBe(EVERY_INTERFACE);
  } finally {
    await rm(clientDistDir, { recursive: true, force: true });
  }
});

test("a resumed corpus root's record states the posture its auth config serves", async () => {
  await using root = await createCorpusHarness();
  const served = authConfigSchema.parse(await (await root.http.request("/api/auth/config")).json());
  expect(served.mode).toBe("local");
  expect(root.env.AUTH_MODE).toBe(served.mode);
  expect(root.env.AUTH_FALLBACK).toBe("deny");
});

test("a composed row follows its source: an asset the product stores lands in the record's slot under the parent directory", async () => {
  expect(ENV_SEAMS.DATA_DIR).toMatchObject({ kind: "composed" });
  const parent = await mkdtemp(join(tmpdir(), "orb-env-seams-"));
  try {
    await using root = await createServerHarness({ temporaryParentDir: parent });
    expect(relative(parent, root.env.DATA_DIR).startsWith("..")).toBe(false);
    const principal = await root.principalFor(root.ownerId);
    const stored = await root.services.assets.store({ principal, bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)), kind: "attachment", mime: PNG });
    expect(await createCas(root.env.ASSETS_DIR, createTestLogger()).exists(root.ownerId, stored.hash)).toBe(true);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

// The suite shares one module registry, so a test never writes the process environment (eslint.config.ts). The
// developer's own HOME and PATH are the shell variables the old allowlist copied into every agent child.
test("the developer's shell variables do not reach the agent child: its env is the root's fixed one", async () => {
  const wire = createCorpusSdkExecution({ prompts: [CORPUS_SDK_QUERY] });
  const children: { readonly home: string | undefined; readonly path: string | undefined }[] = [];
  const spawn: AgentSdkSpawn = (options) => {
    children.push({ home: options.env["HOME"], path: options.env["PATH"] });
    return wire.spawn(options);
  };
  await using root = await createServerHarness({ secretBoxKey: SECRET_BOX_TEST_KEY, sdkSpawn: spawn });
  const actor = await seedCorpusSdkActor(root);
  const { resolved } = await root.app.runtime.resolve({ principal: actor.principal, connectionId: actor.connection.id, task: "chat", cachedFacts: true });
  if (resolved.task !== "chat") {
    throw new Error("the shell-isolation control did not resolve its chat task");
  }
  await root.app.runtime.executor.runChatTurn({
    api: "agent-sdk",
    connection: { ...resolved, task: resolved.task },
    params: {},
    prompt: CORPUS_SDK_QUERY,
    systemPrompt: { static: "", dynamic: "" },
  });
  await wire.settle();
  expect(children).toEqual([{ home: undefined, path: dirname(execPath) }]);
});

test("the sign-in source states whether the record set AUTH_MODE, whatever the process that loaded the module had", async () => {
  const signInSource = async (env?: RawEnvInput): Promise<string> => {
    await using root = await createServerHarness(env === undefined ? {} : { env });
    return (await (await root.internalCallerFor(root.ownerId)).share.signInMode()).source;
  };
  expect(await signInSource({ ["AUTH_MODE"]: "local" })).toBe("process-env");
  expect(await signInSource()).toBe("default");
});

test("a deploy-only row has no door: a key forced past the raw env type is refused, never composed", async () => {
  expect(ENV_SEAMS.PORT).toMatchObject({ kind: "deploy-only", reason: "listener" });
  // The cast feeds a key the type refuses, as an untyped script can, to show the reader refuses it.
  await expect(createServerHarness({ env: { ["PORT"]: FORCED_PORT } as RawEnvInput })).rejects.toThrow(/PORT has no raw env door/u);
  // A key with a named option is refused the same way, so the record never lacks a knob its caller set.
  await expect(createServerHarness({ env: { ["DEBUG_TOKEN"]: FORCED_PORT } as RawEnvInput })).rejects.toThrow(/`debugToken` option/u);
  await using root = await createServerHarness({ env: { ["RATE_LIMIT_LOGIN"]: FORCED_PORT } });
  expect(root.env.RATE_LIMIT_LOGIN).toBe(Number(FORCED_PORT));
  expect(root.env.PORT).toBe(createTestEnv().PORT);
});
