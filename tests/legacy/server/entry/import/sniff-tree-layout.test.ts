// entry/import/sniff-tree-layout — the folder-import layout sniff. Pins the fail-closed routing decision the
// ingest boundary depends on: an orb-only entity dir routes to the bundle importer (no prefix); a
// SillyTavern profile (settings.json / User Avatars / a shared characters-or-chats dir) routes to the ST loop
// under a synthetic `profile/` wrapper; a multi-profile ST root routes to the ST loop with no prefix; and an
// unrecognized OR doubly-marked tree is a reject (never a silent guess). Inputs are already wrapper-stripped.

import { sniffTreeLayout } from "@orb/contracts/import";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";

// Every case runs against the default: the full canonical native directory set. The sniff itself excludes
// the names a real SillyTavern profile also carries (`characters`, `chats`, `themes`, `assets`), so an ST
// profile with a `themes/` dir does NOT read as a mixed orb+ST tree.

describe("sniffTreeLayout", () => {
  test("orb bundle: an orb-only entity dir routes to the bundle importer, no prefix", () => {
    const layout = sniffTreeLayout(["characters/Aria.png", "personas/me.json", "presets/rp.json"]);
    expect(layout).toEqual({ kind: "orb", stagePrefix: "" });
  });

  test("orb bundle: characters + an orb-only dir is NOT ambiguous (shared dirs never veto orb)", () => {
    const layout = sniffTreeLayout(["characters/Aria.png", "personas/me.json"]);
    expect(layout.kind).toBe("orb");
  });

  test("ST single profile: settings.json marks a profile → ST loop under a synthetic wrapper", () => {
    const layout = sniffTreeLayout(["characters/Aria.png", "settings.json", "chats/Aria/2024.jsonl"]);
    expect(layout).toEqual({ kind: "st", stagePrefix: "profile/" });
  });

  test("ST single profile: a bare characters/ dir (shared, no orb signal) routes to the ST loop", () => {
    const layout = sniffTreeLayout(["characters/Aria.png"]);
    expect(layout).toEqual({ kind: "st", stagePrefix: "profile/" });
  });

  test("ST single profile: a User Avatars dir is an ST-only marker", () => {
    const layout = sniffTreeLayout(["User Avatars/alex.png", "characters/Aria.png"]);
    expect(layout).toEqual({ kind: "st", stagePrefix: "profile/" });
  });

  test("multi-profile ST root: subdirs each look like a profile → ST loop, no prefix", () => {
    const layout = sniffTreeLayout(["default-user/characters/Aria.png", "default-user/settings.json", "second-user/characters/Bob.png"]);
    expect(layout).toEqual({ kind: "st", stagePrefix: "" });
  });

  test("ambiguous: an orb-only dir AND an ST settings.json at top → reject (never guess)", () => {
    const layout = sniffTreeLayout(["personas/me.json", "settings.json"]);
    expect(layout.kind).toBe("reject");
  });

  test("real ST profile: settings.json + colliding themes/ AND assets/ dirs → ST, NOT ambiguous", () => {
    // Regression: a genuine SillyTavern default-user tree always carries `themes/` (and often `assets/`),
    // whose NAMES collide with orb's theme/asset bundle dirs. Before the fix those collisions made
    // `orbAtTop` true and, with settings.json present, tripped the both-markers ambiguity reject — so NO
    // real ST profile with a themes dir could be imported. They are name collisions, not an orb signal.
    const layout = sniffTreeLayout([
      "settings.json",
      "themes/dark.json",
      "assets/expr.png",
      "characters/Aria.png",
      "chats/Aria/2024.jsonl",
      "worlds/Eldoria.json",
      "User Avatars/alex.png",
    ]);
    expect(layout).toEqual({ kind: "st", stagePrefix: "profile/" });
  });

  test("unrecognized: no orb dir, no ST marker → reject listing what was found", () => {
    const layout = sniffTreeLayout(["notes/todo.txt", "readme.md"]);
    expect(layout).toEqual({ kind: "reject", found: ["notes", "readme.md"] });
  });

  test("empty input → reject", () => {
    const layout = sniffTreeLayout([]);
    expect(layout.kind).toBe("reject");
  });

  test("a nested subdir carrying an orb-only dir is NOT treated as an ST profile", () => {
    // second-user has a `personas/` orb dir → it is not an ST profile, and no top ST marker exists → reject
    // rather than mis-routing a half-orb tree to the ST loop.
    const layout = sniffTreeLayout(["default-user/characters/A.png", "second-user/personas/me.json"]);
    expect(layout.kind).toBe("reject");
  });
});
