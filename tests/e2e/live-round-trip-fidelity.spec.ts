// E2E (@live) — TASK-24: a THIN real-stack PROOF that the four-layer capture seam works end-to-end with a
// REAL model turn. NOT the authoritative harness — the exhaustive four-layer matrix + all the fidelity
// assertions live in the DETERMINISTIC int test (the wire-capture fidelity suite;
// it drives the real engine + real buildBody + the compose-injected capture sink, no GPU, gates in the
// battery). This leg only confirms that on the OPERATOR-started live stack a real turn is captured and the
// four layers agree, driving ONE representative row (names 'completion') through the stateless (openai-compat)
// wire — where the `name` fingerprint manifests (the agent-sdk path collapses history into a session prompt).
// The preset is a throwaway made active for the run: a stack with no explicit pick runs the built-in, which a write
// forks without activating. Role handling is `none` because a merging level inlines the speaker instead of naming it.
//   1. FE       — the active preset (preset.get) reflects what the harness set.
//   2. ASSEMBLE — chat.getShapeTrace stage counts.
//   3. WIRE     — the captured provider body (/api/_debug/wire/captures).
//   4. DB       — chat.listMessages `model` stamp.
//
// @live: one real turn. Skipped unless E2E_LIVE=1 (the `@live` grepInvert). REQUIRES WIRE_CAPTURE=on, which the
// harness stacks set (support/modes.ts) and an operator-started stack may not. When capture is OFF (empty read), the
// row SKIPS with an explicit message ("the int test is the authoritative harness") — never a false pass. Self-seeds its character and chat (shared-DB
// isolation: never listChats()[0]) and restores the active preset + the prior chat Model role in a finally.

import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { pageArray, pageObject, pageString } from "@orb/tooling/floor/browser/page-validate";
import { expect, test } from "@playwright/test";
import { CASE_LIVE_FOLLOW_UP_MS, WAIT_SURFACE_MS } from "./support/timeouts.ts";
import {
  createPreset,
  deleteChat,
  fetchWireCaptures,
  getActivePreset,
  getShapeTrace,
  getUserSettings,
  listCanon,
  localEngineConnection,
  mintFreshCharacter,
  pinChatToLocalEngine,
  removeCharacter,
  removePreset,
  restoreChatBinding,
  sendTurn,
  startChat,
  updatePresetConfig,
  updateSettingsSection,
} from "./support/trpc.ts";

const CHARACTER_NAME = "Fidelity Probe";
const HANDLE = castId<CharacterHandle>("e2e-live-fidelity");
const PROBE = "Reply with exactly: fidelity-probe-ok";

/** The wire `messages[]` array (openai-compat), typed to the fields the harness reads. */
interface WireMessage {
  readonly role: string;
  readonly content: string;
  readonly name?: string;
}

// The capture body is the backend's own vocabulary, so each non-system message is read field by field.
function nonSystemWireMessages(messages: unknown): readonly WireMessage[] {
  if (messages === undefined) {
    return [];
  }
  return pageArray(messages, "captured wire messages").flatMap((message, index): WireMessage[] => {
    const record = pageObject(message, `captured wire message ${String(index)}`);
    const role = pageString(record["role"], `captured wire message ${String(index)} role`);
    if (role === "system") {
      return [];
    }
    const content = pageString(record["content"], `captured ${role} message ${String(index)} content`);
    const name = record["name"];
    return [{ role, content, ...(typeof name === "string" ? { name } : {}) }];
  });
}

test("TASK-24 four-layer capture works on the live stack (names 'completion', one real turn)", { tag: "@live" }, async () => {
  test.setTimeout(CASE_LIVE_FOLLOW_UP_MS);
  // The STATELESS openai-compat wire is the harness's local-engine connection — the `name` fingerprint this
  // spec reads manifests there (the agent-sdk path collapses history into a session prompt).
  const priorChatBinding = await pinChatToLocalEngine();
  const priorDefaultPresetId = (await getUserSettings()).config.seeds.defaultPresetId;
  const engine = await localEngineConnection();
  const characterId = await mintFreshCharacter(HANDLE, CHARACTER_NAME, "The probe looks up.");
  const chatId = await startChat([characterId]);
  const preset = await createPreset("e2e-fidelity-names");
  try {
    await updatePresetConfig(preset.id, {
      ...preset.config,
      namesBehavior: "completion",
      params: { ...preset.config.params, advanced: { ...preset.config.params.advanced, roleHandling: "none" } },
    });
    await updateSettingsSection("seeds", { defaultPresetId: preset.id });
    await sendTurn(chatId, PROBE);

    const read = await fetchWireCaptures(chatId, "vllm");
    // The AUTHORITATIVE fidelity harness is the deterministic int test — this @live leg only proves the seam
    // works on a REAL stack turn. An operator-started stack may run with WIRE_CAPTURE off; report that evidence as
    // genuinely unavailable rather than passing without assertions. Enabled with no capture already failed the read.
    test.skip(!read.enabled, read.enabled ? "" : read.skipReason);
    if (!read.enabled) {
      throw new Error("Playwright conditional skip returned without stopping the test");
    }
    const wire = read.captures[0].body;

    // FE — the preset resolves to completion (what the harness set).
    expect((await getActivePreset())?.config.namesBehavior).toBe("completion");
    // ASSEMBLE — the name-stamp pass touched rows.
    expect((await getShapeTrace(chatId)).stageCounts.named).toBeGreaterThan(0);
    // WIRE — the user row carries its speaker in `name` (the completion fingerprint) with its content untouched,
    // and no row spells a real author inline. The probe has a colon of its own, so only an author's name counts.
    const msgs = nonSystemWireMessages(wire["messages"]);
    expect(msgs).toContainEqual({ role: "user", content: PROBE, name: DEFAULT_PERSONA_NAME });
    expect(msgs.filter((m) => [CHARACTER_NAME, DEFAULT_PERSONA_NAME].some((author) => m.content.startsWith(`${author}: `)))).toEqual([]);
    // DB — the assistant row is stamped with the local model.
    await expect
      .poll(async () => (await listCanon(chatId)).filter((c) => c.role === "assistant" && c.model !== null).at(-1)?.model ?? null, { timeout: WAIT_SURFACE_MS })
      .toBe(engine.model);
  } finally {
    await updateSettingsSection("seeds", { defaultPresetId: priorDefaultPresetId ?? null });
    await removePreset(preset.id);
    await restoreChatBinding(priorChatBinding);
    await deleteChat(chatId);
    await removeCharacter(characterId);
  }
});
