// The HOST-CLAUDE posture resolver (`foundation/env/host-claude.ts`) — the gate that decides whether the
// agent-sdk backend is registered at all, and therefore whether ANYTHING can fork the bundled claude
// runtime. The 2026-09-18 incident it closes: a production container with no Claude credential of any kind
// spawned a `claude` child on every restart (the boot catalog refresh), which could only ever fail.
//
// What these pin, in order of what a regression would cost:
//   1. `auto` + nothing detectable ⇒ NOT registered. This is the incident's arm.
//   2. `off` ⇒ NOT registered even with a credential sitting right there (an explicit knob outranks detection).
//   3. `on`  ⇒ registered with NOTHING detectable — because detection is a HINT: a signed-in macOS box keeps
//      its login in the Keychain, not in `.credentials.json`, and calling that "not signed in" is wrong.
//   4. ANTHROPIC_API_KEY detects but does NOT register (the owner-confirmed fork): the max-pro-sub spawn
//      pins that variable undefined, so registering on it would reproduce the doomed child.
//   5. The config-dir rule (`CLAUDE_CONFIG_DIR` ?? `<home>/.claude`), which three readers share.

import { join } from "node:path";
import type { HostClaudeInput } from "@orb/server/foundation/env";
import { hostClaudeConfigDir, hostClaudeCredentialsPath, hostClaudeNotice, hostClaudeWarnings, resolveHostClaudePosture } from "@orb/server/foundation/env";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const CONFIG_DIR = "/app/data/claude";

/** Nothing set, nothing on disk — the shape a fresh container boots with. */
function input(over: Partial<HostClaudeInput> = {}): HostClaudeInput {
  return {
    posture: undefined,
    anthropicApiKeySet: false,
    oauthTokenSet: false,
    credentialsFileReadable: false,
    configDir: CONFIG_DIR,
    ...over,
  };
}

describe("resolveHostClaudePosture — the registration gate", () => {
  test("auto + NOTHING detectable ⇒ NOT registered (the 2026-09-18 container incident)", () => {
    const posture = resolveHostClaudePosture(input());
    expect(posture.posture, "unset CLAUDE_BACKEND is `auto`").toBe("auto");
    expect(posture.credential).toBeNull();
    expect(posture.registered, "a box with no credential must not register the backend — registration is what spawns").toBe(false);
  });

  test("auto + an OAuth token ⇒ registered via the token (the headless container path)", () => {
    const posture = resolveHostClaudePosture(input({ oauthTokenSet: true }));
    expect(posture.credential).toBe("oauth-token");
    expect(posture.registered).toBe(true);
  });

  test("auto + a readable credentials file ⇒ registered via the file (the `claude login` path)", () => {
    const posture = resolveHostClaudePosture(input({ credentialsFileReadable: true }));
    expect(posture.credential).toBe("config-file");
    expect(posture.registered).toBe(true);
  });

  test("off ⇒ NOT registered even with both subscription credentials present (the knob outranks detection)", () => {
    const posture = resolveHostClaudePosture(input({ posture: "off", oauthTokenSet: true, credentialsFileReadable: true }));
    expect(posture.registered).toBe(false);
    // The detection still REPORTS honestly — an operator who turned it off should still see what is there.
    expect(posture.credential).toBe("oauth-token");
  });

  test("on ⇒ registered with NOTHING detectable (a macOS Keychain login is invisible to a file probe)", () => {
    const posture = resolveHostClaudePosture(input({ posture: "on" }));
    expect(posture.registered).toBe(true);
    expect(posture.credential, "`on` does not fabricate a detection — it overrides the gate, not the facts").toBeNull();
  });

  // THE FORK (owner-confirmed 2026-09-18). ANTHROPIC_API_KEY is the SDK's top-precedence source, but
  // `buildClaudeSdkEnv` pins it `undefined` by design (max-pro-sub is the flat-rate subscription; the
  // metered first-party key belongs to `buildClaudeAnthEnv`). Registering on it would spawn a child that
  // cannot authenticate — the exact failure this gate removes.
  test("auto + ONLY an API key ⇒ reported and warned, but NOT registered", () => {
    const posture = resolveHostClaudePosture(input({ anthropicApiKeySet: true }));
    expect(posture.anthropicApiKeySet).toBe(true);
    expect(posture.credential, "an API key is not a subscription credential — mode-1 pins it undefined").toBeNull();
    expect(posture.registered).toBe(false);
    expect(hostClaudeWarnings(posture).join(" ")).toMatch(/SUBSCRIPTION login, not a metered API key/u);
  });

  test("an API key does not SHADOW a real subscription credential", () => {
    const posture = resolveHostClaudePosture(input({ anthropicApiKeySet: true, oauthTokenSet: true }));
    expect(posture.anthropicApiKeySet).toBe(true);
    // The box is usable, because the mode-1 spawn authenticates with the token it is handed. (This arm is
    // the reason the API key rides a boolean instead of joining the credential precedence: it once won the
    // precedence and turned a perfectly working box into an unregistered one.)
    expect(posture.credential).toBe("oauth-token");
    expect(posture.registered, "a present API key must never suppress a working subscription credential").toBe(true);
    expect(hostClaudeWarnings(posture), "an inert key beside a working credential is not a standing item").toEqual([]);
  });
});

describe("hostClaudeNotice / hostClaudeWarnings — what the operator reads in the boot log", () => {
  test("the not-set-up notice names BOTH fixes and the config dir (a refusal nobody can act on is a wall)", () => {
    const notice = hostClaudeNotice(resolveHostClaudePosture(input()));
    expect(notice).toMatch(/claude setup-token/u);
    expect(notice).toMatch(/CLAUDE_CODE_OAUTH_TOKEN/u);
    expect(notice).toMatch(/claude login/u);
    expect(notice).toContain(CONFIG_DIR);
    // The cross-platform escape hatch, because a signed-in Mac reads as "not detected" here.
    expect(notice).toMatch(/CLAUDE_BACKEND=on/u);
  });

  test("the registered notice names the SOURCE and carries no credential value", () => {
    const notice = hostClaudeNotice(resolveHostClaudePosture(input({ oauthTokenSet: true })));
    expect(notice).toMatch(/REGISTERED via oauth-token/u);
  });

  test("a healthy registered box warns about nothing (a warn must always be a real standing item)", () => {
    expect(hostClaudeWarnings(resolveHostClaudePosture(input({ credentialsFileReadable: true })))).toEqual([]);
    expect(hostClaudeWarnings(resolveHostClaudePosture(input({ posture: "off" })))).toEqual([]);
  });

  test("`on` with nothing detected warns that the first use will find out", () => {
    expect(hostClaudeWarnings(resolveHostClaudePosture(input({ posture: "on" }))).join(" ")).toMatch(/first use/u);
  });
});

describe("the config-dir rule — one home for three readers", () => {
  test("CLAUDE_CONFIG_DIR wins when set; the home dir is the fallback", () => {
    expect(hostClaudeConfigDir(CONFIG_DIR, "/home/node")).toBe(CONFIG_DIR);
    expect(hostClaudeConfigDir(undefined, "/home/node")).toBe(join("/home/node", ".claude"));
  });

  test("an EMPTY or whitespace CLAUDE_CONFIG_DIR is honestly unset, never the process cwd", () => {
    // The container's `*_FILE`-style env plumbing routinely produces empty strings; resolving one to a
    // relative path would put the credentials file somewhere nothing else looks.
    expect(hostClaudeConfigDir("", "/home/node")).toBe(join("/home/node", ".claude"));
    expect(hostClaudeConfigDir("   ", "/home/node")).toBe(join("/home/node", ".claude"));
  });

  test("the credentials path is the SDK's own file inside that dir", () => {
    expect(hostClaudeCredentialsPath(CONFIG_DIR)).toBe(join(CONFIG_DIR, ".credentials.json"));
  });
});
