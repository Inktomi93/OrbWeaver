// `state/config-link.ts` — the ONE config deep-link grammar (§3.4 row chrome, #866): the row menu's
// "Copy link" FORMATS it, the `/$section` alias route PARSES it, and this mirror pins the round trip so
// neither side can drift into a second spelling. Refusals are LOUD-null (the alias degrades to the bare
// Config section), never a crash or a half-parsed target.

import { formatConfigLink, parseConfigLink } from "@orb/client/state/pure";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

describe("formatConfigLink", () => {
  test("formats group / group.sub / group.sub.setting", () => {
    expect(formatConfigLink("appearance")).toBe("/config?to=appearance");
    expect(formatConfigLink("appearance", "message-style")).toBe("/config?to=appearance.message-style");
    expect(formatConfigLink("appearance", "message-style", "color-quoted-speech")).toBe("/config?to=appearance.message-style.color-quoted-speech");
  });
});

describe("parseConfigLink", () => {
  test("round-trips every arity of its own format", () => {
    expect(parseConfigLink("appearance")).toEqual({ group: "appearance" });
    expect(parseConfigLink("appearance.message-style")).toEqual({ group: "appearance", sub: "message-style" });
    expect(parseConfigLink("appearance.message-style.color-quoted-speech")).toEqual({
      group: "appearance",
      sub: "message-style",
      setting: "color-quoted-speech",
    });
  });

  test("refuses a target that names no real group — the alias degrades to the bare section", () => {
    expect(parseConfigLink("not-a-group")).toBeNull();
    expect(parseConfigLink("not-a-group.sub.setting")).toBeNull();
    expect(parseConfigLink("")).toBeNull();
  });

  test("refuses EXTRA segments — a four-part address is no address, not a truncated one", () => {
    expect(parseConfigLink("appearance.message-style.color-quoted-speech.extra")).toBeNull();
  });

  test("empty middle/tail segments are dropped, not minted as empty strings", () => {
    expect(parseConfigLink("appearance.")).toEqual({ group: "appearance" });
  });
});
