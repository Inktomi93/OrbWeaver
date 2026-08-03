// substrate: grants — the pure subset math the install/upgrade verbs enforce (02 §2/§4). A grant must be
// ⊆ the manifest's declared capabilities; an upgrade that declares a capability the prior grant never
// confirmed must land disabled for re-grant. No db, no Principal — just set math.

import { describe } from "vitest";
import { newlyDeclaredCapabilities, normalizeGrant, ungrantableCapabilities } from "../../../../../packages/server/src/domain/plugin/substrate/grants.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("ungrantableCapabilities", () => {
  test("a grant ⊆ declared is valid (empty result)", () => {
    expect(ungrantableCapabilities(["chat.read", "net.fetch"], ["chat.read"])).toEqual([]);
    expect(ungrantableCapabilities(["chat.read", "net.fetch"], ["chat.read", "net.fetch"])).toEqual([]);
    expect(ungrantableCapabilities(["chat.read"], [])).toEqual([]);
  });

  test("a requested capability the manifest never declared is returned (the install refusal)", () => {
    expect(ungrantableCapabilities(["chat.read"], ["chat.read", "net.fetch"])).toEqual(["net.fetch"]);
    expect(ungrantableCapabilities([], ["storage.kv"])).toEqual(["storage.kv"]);
  });

  test("duplicates in the request collapse, order follows the request", () => {
    expect(ungrantableCapabilities(["chat.read"], ["net.fetch", "notify", "net.fetch"])).toEqual(["net.fetch", "notify"]);
  });
});

describe("normalizeGrant", () => {
  test("returns the confirmed subset in DECLARATION order, de-duplicated", () => {
    expect(normalizeGrant(["chat.read", "net.fetch", "notify"], ["notify", "chat.read", "chat.read"])).toEqual(["chat.read", "notify"]);
  });

  test("a paranoid owner may confirm nothing", () => {
    expect(normalizeGrant(["chat.read", "net.fetch"], [])).toEqual([]);
  });
});

describe("newlyDeclaredCapabilities", () => {
  test("an upgrade declaring only previously-granted caps needs no re-grant (empty)", () => {
    expect(newlyDeclaredCapabilities(["chat.read"], ["chat.read", "net.fetch"])).toEqual([]);
    expect(newlyDeclaredCapabilities([], ["chat.read"])).toEqual([]);
  });

  test("a capability newly DECLARED but never previously granted forces re-grant", () => {
    expect(newlyDeclaredCapabilities(["chat.read", "net.fetch"], ["chat.read"])).toEqual(["net.fetch"]);
  });

  test("a cap declared before but NOT in the prior grant still counts as newly-declared (re-confirm)", () => {
    // The owner declined `net.fetch` last time (granted only chat.read); re-declaring it must re-prompt.
    expect(newlyDeclaredCapabilities(["chat.read", "net.fetch"], ["chat.read"])).toEqual(["net.fetch"]);
  });
});
