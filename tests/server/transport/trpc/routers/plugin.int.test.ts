// The plugin transport chunk, COMPOSED-REAL (D46, P4). Drives the plugin router over the REAL composed graph
// (the `ownerCaller` fixture = createServices → the real `createPluginHost` runtime over QuickJS-ng WASM), so
// this proves the P3-uncomposed state is DEAD: the service composes, the router reaches it, and a plugin's
// whole lifecycle round-trips through the REAL sandbox. Enabling runs `main.js` in-WASM under the invocation
// budget; the activation log ring is captured by the real port and read back via `getLog`. The host-fn CALL
// surface + tool invocation + event delivery ride P4b (the realm exposes the determinism floor this slice —
// pinned by realm.test); this test exercises the composed lifecycle, not the membrane call surface.

// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/composed-real.ts).
import "../../../../support/composed-real.ts";
import { describe } from "vitest";
import { expect, OTHER_USER_ID, OWNER_USER_ID, test } from "../../../../support/fixtures.ts";
import { seedChat, seedParticipant } from "../../../domain/chat/_support.ts";
import { makeBundle } from "../../../domain/plugin/_support.ts";

/** base64 the bundle bytes the way the router's input carries them. */
function bundleBase64(mainJs: string): string {
  return Buffer.from(makeBundle({ id: "hello-plugin", capabilities: [] }, mainJs)).toString("base64");
}

// Enabling boots QuickJS-ng WASM (a one-time process load) + runs main.js — well past the 5 s default.
const WASM_LIFECYCLE_TIMEOUT_MS = 30_000;

test("composed-real: install → enable (runs main.js in WASM) → getLog → disable → uninstall over the real runtime", {
  timeout: WASM_LIFECYCLE_TIMEOUT_MS,
}, async ({ ownerCaller }) => {
  const installed = await ownerCaller.plugin.install({ bundleBase64: bundleBase64("orb.host(1).log.info('activated'); 'ok';"), grant: [] });
  expect(installed.slug).toBe("hello-plugin");
  expect(installed.status).toBe("disabled");
  expect(installed.origin).toBe("upload");

  // list shows the newly-installed (disabled) plugin.
  const afterInstall = await ownerCaller.plugin.list();
  expect(afterInstall.find((p) => p.id === installed.id)?.status).toBe("disabled");

  // Enable ⇒ the REAL sandbox boots + runs main.js under the injected determinism floor; its log is captured.
  await ownerCaller.plugin.setEnabled({ pluginId: installed.id, enabled: true });
  const enabled = await ownerCaller.plugin.list();
  expect(enabled.find((p) => p.id === installed.id)?.status).toBe("enabled");

  // getLog returns the activation-run host.log line (read through the real port's ring snapshot).
  const log = await ownerCaller.plugin.getLog({ pluginId: installed.id });
  expect(log.some((line) => line.message === "activated" && line.level === "info")).toBe(true);

  // Disable ⇒ dispose the resident instance; uninstall ⇒ row + bundle asset gone.
  await ownerCaller.plugin.setEnabled({ pluginId: installed.id, enabled: false });
  await ownerCaller.plugin.uninstall({ pluginId: installed.id });
  const afterUninstall = await ownerCaller.plugin.list();
  expect(afterUninstall.find((p) => p.id === installed.id)).toBeUndefined();
});

test("composed-real: a main.js that throws lands the row `errored` (contained — the host process survives)", {
  timeout: WASM_LIFECYCLE_TIMEOUT_MS,
}, async ({ ownerCaller }) => {
  const installed = await ownerCaller.plugin.install({ bundleBase64: bundleBase64("throw new Error('boom at activation');"), grant: [] });
  // Enabling a plugin whose main.js throws surfaces as a contained failure (PluginCrashedError → the router
  // maps it), NOT a process crash; the row lands `errored`.
  await expect(ownerCaller.plugin.setEnabled({ pluginId: installed.id, enabled: true })).rejects.toThrow();
  const listed = await ownerCaller.plugin.list();
  expect(listed.find((p) => p.id === installed.id)?.status).toBe("errored");
  await ownerCaller.plugin.uninstall({ pluginId: installed.id });
});

// The inline mode (03 §1) end-to-end over the REAL graph: the transport verb → the domain snippet gate
// (`resolveChatAuthority` = the real `loadPresentRole`) → the REAL sandbox running as the caller under the
// fixed profile ∩ authority → SnippetResult echoed back. The host-caller write reaches the REAL chat variable
// store (read back inside the same run); a member's write is host-refused; a non-member is NOT_FOUND leak-free.
describe("runSnippet — inline mode over the real graph", () => {
  test("a HOST caller's snippet writes then reads a chat variable through the real store", { timeout: WASM_LIFECYCLE_TIMEOUT_MS }, async ({
    db,
    ownerCaller,
  }) => {
    const chatId = await seedChat(db, "snippet_host");
    await seedParticipant(db, { chatId, key: "sh_h", userId: OWNER_USER_ID, role: "host" });
    const code = `
      const h = orb.host(1);
      (async () => {
        await h.chat.applyVariableOps(h.chat.current(), [{ op: "set", key: "mood", value: "bright" }]);
        const v = await h.chat.getVariables(h.chat.current());
        h.log.info("mood:" + v.mood);
      })();`;
    const result = await ownerCaller.plugin.runSnippet({ chatId, code });
    expect(result.error).toBeUndefined();
    expect(result.logLines).toContain("[info] mood:bright");
  });

  test("a MEMBER (non-host) caller's variable write is refused; the read half still works", { timeout: WASM_LIFECYCLE_TIMEOUT_MS }, async ({
    db,
    ownerCaller,
    otherCaller,
  }) => {
    void ownerCaller; // seeds OWNER_USER_ID (the host) so the participant FKs resolve
    const chatId = await seedChat(db, "snippet_member");
    await seedParticipant(db, { chatId, key: "sm_h", userId: OWNER_USER_ID, role: "host" });
    await seedParticipant(db, { chatId, key: "sm_m", userId: OTHER_USER_ID, role: "member" });
    // ONE awaited chain (the snippet's completion value) so the run waits for settlement: read succeeds, then
    // the host-gated write rejects and the guest catches it — a member reads but cannot write.
    const code = `
      const h = orb.host(1);
      h.chat.getVariables(h.chat.current())
        .then(() => h.log.info("read-ok"))
        .then(() => h.chat.applyVariableOps(h.chat.current(), [{ op: "set", key: "x", value: "1" }]))
        .catch((e) => h.log.error("w:" + e.message));`;
    const result = await otherCaller.plugin.runSnippet({ chatId, code });
    expect(result.error).toBeUndefined(); // the guest caught the refusal — not a crash
    expect(result.logLines).toContain("[info] read-ok");
    // A non-host snippet never receives the chat.variables.write GRANT (the profile adds it only when canWrite),
    // so the write is refused by the capability gate — the doctrine "write requires canWrite" enforced via the
    // grant set, no snippet-special path.
    expect(result.logLines.some((l) => l.includes("chat.variables.write"))).toBe(true);
  });

  test("a non-member caller is refused NOT_FOUND (leak-free — the snippet never runs)", { timeout: WASM_LIFECYCLE_TIMEOUT_MS }, async ({
    db,
    ownerCaller,
    otherCaller,
  }) => {
    void ownerCaller;
    const chatId = await seedChat(db, "snippet_foreign");
    await seedParticipant(db, { chatId, key: "sf_h", userId: OWNER_USER_ID, role: "host" });
    await expect(otherCaller.plugin.runSnippet({ chatId, code: "orb.host(1).log.info('should never run');" })).rejects.toThrow();
  });
});
