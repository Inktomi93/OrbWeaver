// verb: uiHostCall — the Tier-C client guest's relay into the membrane.
// EVERY test here is about the RE-GATE, because that is the whole verb: the client is untrusted input from a
// realm that also runs plugin code, so what matters is not that a granted read works (it does) but that each
// of the five things a caller can lie about is caught.
//
// THE FIVE LIES, and the test that catches each:
//   "this is my plugin"        → owner scope (leak-free NOT_FOUND on a foreign REAL id)
//   "this plugin is running"   → status (a disabled plugin's UI reaches nothing)
//   "this fn is proxyable"     → the closed tuple (a resident registrar / an authority write is not spellable)
//   "I was granted this"       → the STORED grant on the row, re-read per call
//   "I am in this room"        → resolveChatAuthority (leak-free NOT_FOUND on the CHAT)
//
// The ops are the harness's inert doubles, so a passing call proves the DISPATCH reached the right bridge op
// with the right arguments — the op's own semantics (the D16 viewer clamp, the KV ceilings) are pinned where
// they live, in `substrate/bridge.test.ts` and the storage suites, and are not re-proven here.

import type { Principal } from "@orb/contracts/identity";
import type { PluginCapability } from "@orb/contracts/plugin";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId, Handle, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginNotFoundError } from "@orb/server/domain/plugin";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makeInertOps, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

const ROOM = castId<ChatId>("chat_0000000000000000000001");
const NOT_ENABLED_RE = /not enabled/u;
const NOT_CALLABLE_RE = /not callable from a plugin UI/u;
const NOT_GRANTED_RE = /has not been granted/u;
const NEEDS_SCOPE_RE = /needs a chat scope/u;

/** An enabled plugin owned by `caller`, granted `capabilities`. Enabling runs the fake port's activation, which
 *  is what puts the row in `enabled` — the status gate below reads the REAL column, not a fixture flag. */
async function installEnabled(
  h: ReturnType<typeof makePluginHarness>,
  caller: Principal,
  capabilities: readonly PluginCapability[],
): Promise<{ readonly id: PluginId }> {
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood", capabilities }), grant: capabilities });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  return installed;
}

describe("uiHostCall — the happy path reaches the SAME bridge op a server guest would", () => {
  test("a granted call reaches the right op, under the right SCOPE, and its result crosses as inert JSON", async () => {
    const db = await freshDb();
    const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
    // A RECORDING storage op. This is stronger than a round-trip through a real KV would be: the whole point of
    // the proxy is that the SERVER supplies the scope the guest cannot name, so what has to be observed is the
    // pluginId + ownerId the bridge closed over — a value-returning fake would prove the plumbing and hide that.
    const seen: { pluginId: PluginId; ownerId: string; key: string }[] = [];
    const ops = makeInertOps();
    const recordingOps = {
      ...ops,
      storage: {
        ...ops.storage,
        get: (pluginId: PluginId, ownerId: UserId, key: string): Promise<string | null> => {
          seen.push({ pluginId, ownerId, key });
          return Promise.resolve("v");
        },
      },
    };
    const h = makePluginHarness(db, { ops: recordingOps });
    const installed = await installEnabled(h, caller, ["storage.kv"]);

    const read = await h.service.uiHostCall({ caller, pluginId: installed.id, fn: "storage.get", argsJson: JSON.stringify(["k"]) });

    // The guest named ONLY the key. The plugin partition and the owner came from the row the server loaded —
    // which is what makes a cross-plugin or cross-owner read unspellable from the client.
    expect(seen).toEqual([{ pluginId: installed.id, ownerId: caller.userId, key: "k" }]);
    // The RESULT crosses as a JSON string — the marshal discipline at the second boundary. A raw value here
    // would be the thing this design refuses (nothing live crosses, in either direction).
    expect(JSON.parse(read.resultJson)).toBe("v");
  });

  test("a VOID op answers a literal null rather than a hole", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
    const installed = await installEnabled(h, caller, ["storage.kv"]);
    // `undefined` is not JSON; a guest awaiting `storage.delete` must get a value it can test.
    const result = await h.service.uiHostCall({ caller, pluginId: installed.id, fn: "storage.delete", argsJson: JSON.stringify(["k"]) });
    expect(result.resultJson).toBe("null");
  });
});

describe("uiHostCall — the re-gate", () => {
  test("a foreign REAL pluginId is a leak-free NotFound (no membrane op runs)", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const alpha = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("alpha") }));
    const beta = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("beta") }));
    const alphaPlugin = await installEnabled(h, alpha, ["storage.kv"]);

    await expect(h.service.uiHostCall({ caller: beta, pluginId: alphaPlugin.id, fn: "storage.list", argsJson: "[]" })).rejects.toBeInstanceOf(
      PluginNotFoundError,
    );
    await expect(
      h.service.uiHostCall({ caller: alpha, pluginId: castId<PluginId>("plugin_missing"), fn: "storage.list", argsJson: "[]" }),
    ).rejects.toBeInstanceOf(PluginNotFoundError);
  });

  test("a DISABLED plugin's UI reaches nothing — status is a gate, not decoration", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
    const installed = await installEnabled(h, caller, ["storage.kv"]);
    await h.service.setEnabled({ caller, pluginId: installed.id, enabled: false });

    // The grant is still on the row; what changed is the user's decision to run it. A proxy that ignored status
    // would be a way to keep using a plugin the 3-strike policy had just auto-disabled.
    await expect(h.service.uiHostCall({ caller, pluginId: installed.id, fn: "storage.list", argsJson: "[]" })).rejects.toThrow(NOT_ENABLED_RE);
  });

  test("a NON-PROXYABLE fn is refused however it is spelled — including one the plugin holds the grant for", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
    // The plugin is GRANTED tools.register + chat.variables.write. The refusal below is therefore NOT the grant
    // gate doing the work — it is the closed tuple, which is the property that makes "a client guest cannot
    // register residency or perform an authority write" true of the SET rather than of the caller's manners.
    const installed = await installEnabled(h, caller, ["tools.register", "chat.variables.write", "chat.read"]);

    for (const fn of [
      "tools.register",
      "transforms.register",
      "events.on",
      "ui.register",
      "ui.setState",
      "chat.current",
      "chat.applyVariableOps",
      "net.fetch",
    ]) {
      await expect(h.service.uiHostCall({ caller, pluginId: installed.id, fn, argsJson: "[]" }), fn).rejects.toThrow(NOT_CALLABLE_RE);
    }
    // …and a name that is not a host function at all.
    await expect(h.service.uiHostCall({ caller, pluginId: installed.id, fn: "__proto__", argsJson: "[]" })).rejects.toThrow(NOT_CALLABLE_RE);
  });

  test("a PROXYABLE fn whose capability was never granted is refused", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
    // Granted storage.kv ONLY — so the KV arms work and the global-vars arms do not, off the SAME row.
    const installed = await installEnabled(h, caller, ["storage.kv"]);

    await expect(h.service.uiHostCall({ caller, pluginId: installed.id, fn: "variables.get", argsJson: JSON.stringify(["k"]) })).rejects.toThrow(
      NOT_GRANTED_RE,
    );
    await expect(h.service.uiHostCall({ caller, pluginId: installed.id, fn: "chat.getVariables", argsJson: "[]", chatId: ROOM })).rejects.toThrow(
      NOT_GRANTED_RE,
    );
  });

  test("the grant is re-read PER CALL — narrowing it takes effect on the very next call", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
    const installed = await installEnabled(h, caller, ["storage.kv"]);
    await h.service.uiHostCall({ caller, pluginId: installed.id, fn: "storage.list", argsJson: "[]" });

    // The user withdraws consent. A verb that had cached the grant (per service, per worker, per anything)
    // would keep serving the old one — which is the whole failure mode "re-read per call" exists to prevent.
    await h.service.setGrant({ caller, pluginId: installed.id, grant: [], acknowledgedNetHosts: [] });
    await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
    await expect(h.service.uiHostCall({ caller, pluginId: installed.id, fn: "storage.list", argsJson: "[]" })).rejects.toThrow(NOT_GRANTED_RE);
  });

  test("a chatId the caller cannot READ is a leak-free NotFound on the CHAT — not a membership oracle", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db, { resolveChatAuthority: () => Promise.resolve({ canRead: false, canWrite: false }) });
    const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
    const installed = await installEnabled(h, caller, ["chat.read"]);

    await expect(h.service.uiHostCall({ caller, pluginId: installed.id, fn: "chat.getVariables", argsJson: "[]", chatId: ROOM })).rejects.toBeInstanceOf(
      DomainNotFoundError,
    );
  });

  test("a chat-scoped fn with NO room is a typed refusal, never a silent no-op", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
    const installed = await installEnabled(h, caller, ["chat.read"]);
    // "You did not pass the room" and "you passed a room you cannot read" are genuinely different facts for a
    // plugin author, so they are different errors — the second is the leak-free NOT_FOUND above.
    await expect(h.service.uiHostCall({ caller, pluginId: installed.id, fn: "chat.listMessages", argsJson: "[]" })).rejects.toThrow(NEEDS_SCOPE_RE);
  });
});

describe("uiHostCall — argument validation (the per-fn zod, reused from the membrane's posture)", () => {
  test("non-JSON args are a contained refusal", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
    const installed = await installEnabled(h, caller, ["storage.kv"]);
    await expect(h.service.uiHostCall({ caller, pluginId: installed.id, fn: "storage.list", argsJson: "not json" })).rejects.toThrow(/JSON document/u);
  });

  test("a wrongly-SHAPED argument REJECTS rather than answering empty", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
    const installed = await installEnabled(h, caller, ["storage.kv"]);
    // The distinction that matters to a plugin author debugging a typo: a non-string key must be an ERROR, not
    // a `null` that reads as "no value stored" forever.
    await expect(h.service.uiHostCall({ caller, pluginId: installed.id, fn: "storage.get", argsJson: JSON.stringify([{ evil: true }]) })).rejects.toThrow();
    await expect(h.service.uiHostCall({ caller, pluginId: installed.id, fn: "storage.get", argsJson: JSON.stringify([]) })).rejects.toThrow();
  });

  test("chat.listMessages cannot ask for more than the host-side ceiling", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
    const installed = await installEnabled(h, caller, ["chat.read"]);
    await expect(
      h.service.uiHostCall({ caller, pluginId: installed.id, fn: "chat.listMessages", argsJson: JSON.stringify([{ limit: 5000 }]), chatId: ROOM }),
    ).rejects.toThrow();
  });
});
