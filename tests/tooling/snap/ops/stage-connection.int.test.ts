// @subject tooling/src/snap/ops/stage-connection.ts
// `--stage-connection` against the composed product over real loopback HTTP: a named key becomes the owner's chat
// connection while its value stays out of every surface snap writes, and the local engine is admitted on a stage
// whose allowlist refuses it.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { appendedBy, PUBLIC_PEER_ADDRESS, present } from "@orb/testkit/iso";
import { createServerHarness, SECRET_BOX_TEST_KEY, servePhysicalPeer } from "@orb/testkit/node/composed";
import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "../../../../tooling/src/floor/cli/exit-contract.ts";
import { installOutputSink } from "../../../../tooling/src/floor/cli/log.ts";
import { stageBandPorts } from "../../../../tooling/src/floor/host/ports.ts";
import { connectOrb, stageRefusalReason } from "../../../../tooling/src/floor/http/stage-trpc.ts";
import { withProcessEnv } from "../../../../tooling/src/floor/process/process-env.ts";
import { PRIVATE_MASK } from "../../../../tooling/src/snap/contract/disk-safe-argv.ts";
import type { EnsureStageOps, StageRow } from "../../../../tooling/src/snap/contract/stage.ts";
import type { StageConnectionSeed } from "../../../../tooling/src/snap/contract/stage-connection.ts";
import { STAGE_CONNECTION_LABEL_PREFIX, STAGE_HOSTED_CONNECTIONS } from "../../../../tooling/src/snap/contract/stage-connection.ts";
import { diskSafeArgv } from "../../../../tooling/src/snap/lib/disk-safe-argv.ts";
import { forgetPrivateValues, privateText, scrubPrivateText } from "../../../../tooling/src/snap/lib/private-values.ts";
import { currentSnapStageProvenance } from "../../../../tooling/src/snap/lib/run-provenance.ts";
import { STAGE_ROOT_REL } from "../../../../tooling/src/snap/lib/stage-plan.ts";
import { configureStage } from "../../../../tooling/src/snap/ops/guards.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { seedStageConnection } from "../../../../tooling/src/snap/ops/stage-connection.ts";
import { writeRow } from "../../../../tooling/src/snap/ops/stage-marker.ts";

const KEY_NAME = "OPENROUTER_PROBE_KEY";
/** Planted keys: any surface that holds either string leaked it. The earlier one is what a previous run seeded. */
const SENTINEL = "stgkey-planted-sentinel-6d1f0b9e4a27c3";
const EARLIER = "stgkey-planted-earlier-91c4e07b2d55af";
const ENGINE_MODEL = "stgkey-engine-model";
const CHAT_TASK = "chat";
const LOOPBACK = "127.0.0.1";

function chatConnectionId(bindings: readonly { readonly task: string; readonly binding: { readonly connectionId: string | null } | null }[]): string | null {
  return bindings.find((row) => row.task === CHAT_TASK)?.binding?.connectionId ?? null;
}

test("a named key becomes the owner's chat connection, and its value reaches only the provider", async () => {
  forgetPrivateValues();
  using _forget = { [Symbol.dispose]: forgetPrivateValues };
  const authorizations: string[] = [];
  await using root = await createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
    physicalPeer: () => LOOPBACK,
    secretBoxKey: SECRET_BOX_TEST_KEY,
    // The provider's host resolves to a public peer, so the dial reaches the scripted edge below.
    networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]) },
    providerFetch: (input, init) => {
      authorizations.push(new Request(input, init).headers.get("authorization") ?? "");
      return Promise.resolve(Response.json({ data: { label: "stgkey", usage: 0, limit: null } }));
    },
  });
  const api = connectOrb(`http://${LOOPBACK}:${String((await root.listen()).port)}`);
  const seed: StageConnectionSeed = { kind: "key", name: KEY_NAME, key: privateText(SENTINEL) };

  const earlier = await seedStageConnection(api, { kind: "key", name: KEY_NAME, key: privateText(EARLIER) });
  const seeded = await seedStageConnection(api, seed);

  const connections = await api.connection.list.query();
  const chatId = chatConnectionId(await api.connection.listBindings.query());
  const chat = connections.find((connection) => connection.id === chatId);
  const expected = { label: `${STAGE_CONNECTION_LABEL_PREFIX} ${KEY_NAME}`, ...STAGE_HOSTED_CONNECTIONS[KEY_NAME] };
  expect([earlier, seeded]).toEqual([expected, expected]);
  expect(chat).toMatchObject(expected);
  expect(connections.filter((connection) => connection.label === seeded.label)).toHaveLength(1);
  const credentials = await api.credentials.list.query();
  expect(credentials.filter((credential) => credential.label === seeded.label)).toHaveLength(1);
  if (chat === undefined) {
    throw new Error("the seed bound no chat connection");
  }
  // The positive control: the bound connection dials its provider with the newest planted key, not the earlier one.
  const probed = await appendedBy(authorizations, () => api.connection.probe.mutate({ connectionId: chat.id }));
  expect(probed.entries.map((value) => [value.includes(SENTINEL), value.includes(EARLIER)])).toEqual(probed.entries.map(() => [true, false]));

  // Everything snap prints, writes or reads back from the stage.
  const surfaces = [
    JSON.stringify({ earlier, seeded, seed, connections, credentials }),
    root.observability.logLines().join("\n"),
    root.observability
      .traces(100)
      .map((trace) => JSON.stringify(trace))
      .join("\n"),
  ];
  for (const planted of [SENTINEL, EARLIER]) {
    expect(surfaces.filter((surface) => surface.includes(planted))).toEqual([]);
  }
  // Page text the stage echoes is scrubbed, because sending the key noted it.
  expect(scrubPrivateText(`echo ${SENTINEL} echo`)).toBe(`echo ${PRIVATE_MASK} echo`);
});

test("a key typed where its name belongs never reaches run.json or a refusal line", () => {
  const named = parseSnapArgs(["/", "--stage-connection", KEY_NAME]);
  expect([named.errors, named.stageConnection, named.isolated]).toEqual([[], KEY_NAME, true]);
  expect(diskSafeArgv(["/", "--stage-connection", KEY_NAME])).toEqual(["/", "--stage-connection", KEY_NAME]);

  const pasted = parseSnapArgs(["/", "--stage-connection", SENTINEL]);
  expect(pasted.errors).toHaveLength(1);
  expect(pasted.stageConnection).toBeNull();
  expect(JSON.stringify(pasted)).not.toContain(SENTINEL);
  expect(diskSafeArgv(["/", "--stage-connection", SENTINEL])).toEqual(["/", "--stage-connection", PRIVATE_MASK]);

  // A seed lands in the stage this run boots, so pointing the run at an existing stack refuses.
  expect(parseSnapArgs(["/", "--base", `http://${LOOPBACK}:1`, "--stage-connection", KEY_NAME]).errors).toEqual([
    expect.stringContaining("--stage-connection"),
  ]);
});

/** A serving stage row on the harness's port; the planted census hands it back, so nothing boots. */
function servingRow(serverPort: number): StageRow {
  return {
    band: 0,
    sha: "0".repeat(40),
    dir: "/stgkey/.cache/snap-stage/000000000000",
    serverPort,
    vitePort: stageBandPorts(0).vite,
    checkout: "/stgkey",
    ownerPid: null,
    startedAt: new Date(0).toISOString(),
    lastUsedAt: new Date(0).toISOString(),
    sessions: [],
    dbProvenance: null,
    rsyncs: 0,
    holders: [],
  };
}

test("a seeding run's printed lines and stage provenance hold no key, when it binds and when it refuses", async () => {
  forgetPrivateValues();
  using _forget = { [Symbol.dispose]: forgetPrivateValues };
  const home = mkdtempSync(join(tmpdir(), "stgkey-guards-"));
  using _scratch = { [Symbol.dispose]: (): void => rmSync(home, { recursive: true, force: true }) };
  mkdirSync(join(home, STAGE_ROOT_REL), { recursive: true });
  const lines: string[] = [];
  using _sink = { [Symbol.dispose]: installOutputSink({ line: (line) => lines.push(line), warn: (line) => lines.push(line) }) };
  const exits: (number | null)[] = [];
  const failures: (string | null)[] = [];
  // With storage on the seed binds; with it off the stage refuses the key, which is printed as the run's stage error.
  for (const secretBox of [{ secretBoxKey: SECRET_BOX_TEST_KEY }, {}]) {
    await using root = await createServerHarness({
      env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
      physicalPeer: () => LOOPBACK,
      ...secretBox,
    });
    const serving = servingRow((await root.listen()).port);
    writeRow(home, serving);
    const ops: EnsureStageOps = {
      repoRoot: (): string => serving.checkout,
      resolveRef: (): string => serving.sha,
      markerRoot: (): string => home,
      // The one arm that hands back a serving row without probing it; which arm the allocator picks is not this case's subject.
      acquireStageBand: () => ({ allocation: { kind: "shared-reuse", band: serving.band, row: serving }, views: [] }),
      armStageKeeper: (_home, armed) => armed,
    };
    exits.push(await withProcessEnv(KEY_NAME, SENTINEL, () => configureStage(parseSnapArgs(["/", "--stage-connection", KEY_NAME]), ops)));
    failures.push(currentSnapStageProvenance()?.failure ?? null);
  }

  expect(exits).toEqual([null, EXIT.toolError]);
  // The positive controls: the bind names its connection, and the refusal reaches both the printed line and run.json.
  expect(lines.filter((line) => line.includes(`"${STAGE_CONNECTION_LABEL_PREFIX} ${KEY_NAME}"`))).toHaveLength(1);
  const refusal = present(failures[1]);
  expect(lines.filter((line) => line.includes(refusal))).toHaveLength(1);
  expect([...lines, ...failures].filter((surface) => surface?.includes(SENTINEL))).toEqual([]);
});

test("the local engine is admitted at its own host and port on a stage whose allowlist refuses it", async () => {
  await using engine = await servePhysicalPeer((request) =>
    Promise.resolve(
      new URL(request.url).pathname.endsWith("/models")
        ? Response.json({ object: "list", data: [{ id: ENGINE_MODEL, object: "model" }] })
        : new Response(null, { status: 404 }),
    ),
  );
  // A multi-user deployment's allowlist floor is empty, so a loopback engine is refused until the owner admits it.
  await using root = await createServerHarness({
    env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "owner" },
    physicalPeer: () => LOOPBACK,
    providerFetch: fetch,
  });
  const api = connectOrb(`http://${LOOPBACK}:${String((await root.listen()).port)}`);
  const baseUrl = `${engine.origin}/v1`;
  const before = (await api.settings.getAppSettingsWithOverrides.query()).resolved.privateEndpointAllowlist;
  const refusal = await api.connection.draftCatalogModels.mutate({ providerId: "vllm", baseUrl }).then(
    () => null,
    (error: unknown) => stageRefusalReason(error),
  );
  expect(refusal).toBe(CONNECTION_OP_CODES.baseUrlRefused);

  const seeded = await seedStageConnection(api, { kind: "local", baseUrl });

  const after = (await api.settings.getAppSettingsWithOverrides.query()).resolved.privateEndpointAllowlist;
  expect(after).toEqual([...before, new URL(engine.origin).host]);
  const chatId = chatConnectionId(await api.connection.listBindings.query());
  const chat = (await api.connection.list.query()).find((connection) => connection.id === chatId);
  expect(chat).toMatchObject({ label: seeded.label, providerId: "vllm", baseUrl, model: ENGINE_MODEL });
});
