// One case per env-seam class, through the composed root: a seam row's option reaches the production read, a composed
// row follows what it derives from, and a deploy-only row has no door.
// @subject tests/support/node/env-seams.ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { ID_PREFIX } from "@orb/kit/ids";
import { EnvRefusedError } from "@orb/server/foundation/env/refusal";
import { createCas } from "@orb/server/infra/storage/cas";
import { createTestEnv } from "./env.ts";
import type { RawEnvInput } from "./env-seams.ts";
import { ENV_SEAMS } from "./env-seams.ts";
import { makeAssetBytes } from "./factories/asset.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

const EVERY_INTERFACE = "0.0.0.0";
const PNG = "image/png";
// A value every one of these keys parses, so only the door decides the outcome.
const FORCED_PORT = "1";

test("a seam row's option is the record key boot binds by: the parse refuses a public bind the hatch does not open", async () => {
  expect(ENV_SEAMS.BIND_HOST).toMatchObject({ kind: "seam", option: "bindHost" });
  await expect(createServerHarness({ env: { ["AUTH_MODE"]: "local" }, bindHost: EVERY_INTERFACE })).rejects.toBeInstanceOf(EnvRefusedError);
  await using root = await createServerHarness({ env: { ["AUTH_MODE"]: "local" }, bindHost: EVERY_INTERFACE, allowPublicBind: true });
  expect(root.env.BIND_HOST).toBe(EVERY_INTERFACE);
  expect((await root.listen()).address).toBe(EVERY_INTERFACE);
});

test("a composed row follows its source: an asset the product stores lands in the record's slot under the parent directory", async () => {
  expect(ENV_SEAMS.DATA_DIR).toMatchObject({ kind: "composed" });
  const parent = await mkdtemp(join(tmpdir(), "orb-env-seams-"));
  try {
    await using root = await createServerHarness({ temporaryParentDir: parent });
    expect(relative(parent, root.env.DATA_DIR).startsWith("..")).toBe(false);
    const principal = await root.principalFor(root.ownerId);
    const stored = await root.services.assets.store({ principal, bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)), kind: "attachment", mime: PNG });
    expect(await createCas(root.env.ASSETS_DIR).exists(root.ownerId, stored.hash)).toBe(true);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
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
