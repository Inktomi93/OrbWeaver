// The lifecycle round-trip through the REAL P1 `infra/plugin-host` Sandbox (04 §P3 checkpoint, determinism-
// floor depth — the deep host-fn round-trip is P4). install → enable (runs `main.js` in the sandbox under the
// injected determinism seams) → getLog surfaces the activation-run host.log → disable (disposes) → uninstall
// leaves zero rows, zero bundle bytes. Also pins the determinism floor: two activations with the SAME seams
// produce byte-identical logs (the guest's only clock is `host.clock`, injected — never ambient `Date`).

import { FROZEN_AT_MS } from "../../../support/clock.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures";
import type { HostSeams } from "./_support.ts";
import { makeBundle, makePluginHarness, makeSandboxPort, ownerPrincipalFor, seedUser } from "./_support.ts";

/** Deterministic injected seams — a frozen clock + a counter PRNG + a counter id factory. */
function seeds(): HostSeams {
  let r = 0;
  let n = 0;
  return {
    nowEpochMs: (): number => FROZEN_AT_MS,
    nextRandom: (): number => {
      r += 1;
      return r / 100;
    },
    mintId: (): string => {
      n += 1;
      return `id_${n}`;
    },
  };
}

const LOGGING_MAIN = "const h = orb.host(1); h.log.info('activated at ' + h.clock.nowEpochMs());";

test("install → enable → getLog → disable → uninstall: full lifecycle through the real Sandbox", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: makeSandboxPort(seeds()) });
  const owner = await seedUser(db, { handle: "owner" });

  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "roundtrip" }, LOGGING_MAIN), grant: [] });
  expect(installed.status).toBe("disabled");

  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });
  const [enabled] = await h.service.list({ caller: ownerPrincipalFor(owner) });
  expect(enabled?.status).toBe("enabled");

  // The activation-run host.log surfaced through the port, with the INJECTED clock (never ambient Date).
  const log = await h.service.getLog({ caller: ownerPrincipalFor(owner), pluginId: installed.id });
  expect(log).toEqual([{ level: "info", message: `activated at ${FROZEN_AT_MS}`, at: FROZEN_AT_MS }]);

  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: false });
  expect(await h.service.getLog({ caller: ownerPrincipalFor(owner), pluginId: installed.id })).toEqual([]); // no resident → no ring

  await h.service.uninstall({ caller: ownerPrincipalFor(owner), pluginId: installed.id });
  expect(await h.service.list({ caller: ownerPrincipalFor(owner) })).toEqual([]);
  expect(h.storedBytes.size).toBe(0); // bundle asset reaped
});

test("a main.js that throws at activation lands the row errored, host process healthy (contained)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: makeSandboxPort(seeds()) });
  const owner = await seedUser(db, { handle: "owner" });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "boom" }, "throw new Error('activation boom');"),
    grant: [],
  });

  await expect(h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true })).rejects.toThrow();
  const [view] = await h.service.list({ caller: ownerPrincipalFor(owner) });
  expect(view?.status).toBe("errored");
  expect(view?.lastError).toContain("activation boom");
});

test("determinism floor: two activations with the same seams produce byte-identical logs", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: makeSandboxPort(seeds()) });
  const owner = await seedUser(db, { handle: "owner" });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "determ" }, LOGGING_MAIN), grant: [] });

  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });
  const first = await h.service.getLog({ caller: ownerPrincipalFor(owner), pluginId: installed.id });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: false });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });
  const second = await h.service.getLog({ caller: ownerPrincipalFor(owner), pluginId: installed.id });

  expect(second).toEqual(first);
});
