// The pure half of `pnpm start`'s setup (tooling/src/stack/lib/setup-plan.ts, through the tool front door):
// when to ask, what the current `.env` offers as each default, which values each answer writes, and the
// in-place `.env` edit that must leave every line it does not own byte-for-byte alone.
import type { NetworkInterfaceInfo, NetworkInterfaceInfoIPv4, NetworkInterfaceInfoIPv6 } from "node:os";
import { parseEnv } from "node:util";
import { ALLOWED_HOSTS_KEY } from "@orb/kit/allowed-hosts";
import type { SetupMachine, SetupValues } from "../../../../tooling/src/stack/index.ts";
import {
  AUTH_MODE_KEY,
  applySetupValues,
  decideSetup,
  isWsl2Kernel,
  openUrls,
  PORT_KEY,
  parseAddressAnswer,
  parseChoiceAnswer,
  parsePortAnswer,
  SETUP_AUDIENCES,
  setupDefaults,
  setupValues,
} from "../../../../tooling/src/stack/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** Env names are SCREAMING_SNAKE, so fixture envs are built from tuples (the house idiom). */
function env(...pairs: readonly (readonly [string, string])[]): Readonly<Record<string, string>> {
  return Object.fromEntries(pairs);
}

const LOCAL: SetupValues = { port: 9100, authMode: "local", ssoPending: false, allowedHosts: null };

test("setup asks only when there is a terminal, and a missing .env with no terminal boots on defaults without writing", () => {
  expect(decideSetup({ envExists: false, setup: false, interactive: true })).toBe("ask");
  expect(decideSetup({ envExists: false, setup: false, interactive: false })).toBe("defaults");
  expect(decideSetup({ envExists: true, setup: false, interactive: true })).toBe("keep");
  expect(decideSetup({ envExists: true, setup: false, interactive: false })).toBe("keep");
  expect(decideSetup({ envExists: true, setup: true, interactive: true })).toBe("ask");
  expect(decideSetup({ envExists: false, setup: true, interactive: true })).toBe("ask");
  // --setup with nobody to ask is refused, never silently skipped: the operator asked for questions.
  expect(decideSetup({ envExists: true, setup: true, interactive: false })).toBe("refuse");
  expect(decideSetup({ envExists: false, setup: true, interactive: false })).toBe("refuse");
});

test("the defaults are the current values: .env first, then the shell, then the built-in port and single-user", () => {
  expect(setupDefaults({}, {})).toEqual({ port: 8788, audience: "just-me", login: "password", allowedHosts: null });
  expect(setupDefaults(env([PORT_KEY, "9000"], [AUTH_MODE_KEY, "local"]), {})).toEqual({
    port: 9000,
    audience: "network",
    login: "password",
    allowedHosts: null,
  });
  expect(setupDefaults(env([AUTH_MODE_KEY, "oidc"]), env([AUTH_MODE_KEY, "local"]))).toMatchObject({ audience: "network", login: "sso", allowedHosts: null });
  expect(setupDefaults({}, env([AUTH_MODE_KEY, "forward-header"], [PORT_KEY, "7000"]))).toEqual({
    port: 7000,
    audience: "network",
    login: "sso",
    allowedHosts: null,
  });
  // A value the server would refuse is not offered back as a default; the answer replaces it.
  expect(setupDefaults(env([AUTH_MODE_KEY, "locall"], [PORT_KEY, "http"]), {})).toEqual({
    port: 8788,
    audience: "just-me",
    login: "password",
    allowedHosts: null,
  });
});

test("each answer writes its mode, and SSO keeps a configured SSO mode or falls back to passwords until one exists", () => {
  expect(setupValues({ port: 8788, audience: "just-me", login: "sso", allowedHosts: null }, "oidc")).toEqual({
    port: 8788,
    authMode: "single-user",
    ssoPending: false,
    allowedHosts: null,
  });
  expect(setupValues({ port: 9100, audience: "network", login: "password", allowedHosts: null }, "oidc")).toEqual(LOCAL);
  expect(setupValues({ port: 8788, audience: "network", login: "sso", allowedHosts: null }, "oidc")).toEqual({
    port: 8788,
    authMode: "oidc",
    ssoPending: false,
    allowedHosts: null,
  });
  expect(setupValues({ port: 8788, audience: "network", login: "sso", allowedHosts: null }, "forward-header")).toMatchObject({
    authMode: "forward-header",
    ssoPending: false,
    allowedHosts: null,
  });
  // No identity provider is configured, and setup never collects its secrets: writing `oidc` here would
  // write a boot-fatal .env, so the box boots with passwords and says what to add.
  expect(setupValues({ port: 8788, audience: "network", login: "sso", allowedHosts: null }, "single-user")).toEqual({
    port: 8788,
    authMode: "local",
    ssoPending: true,
    allowedHosts: null,
  });
  expect(setupValues({ port: 8788, audience: "network", login: "sso", allowedHosts: null }, "local")).toMatchObject({
    authMode: "local",
    ssoPending: true,
    allowedHosts: null,
  });
});

test("a port answer: Enter keeps the default, and anything but a whole TCP port is asked again", () => {
  expect(parsePortAnswer("", 8788)).toEqual({ ok: true, value: 8788 });
  expect(parsePortAnswer("  9000 ", 8788)).toEqual({ ok: true, value: 9000 });
  for (const bad of ["0", "65536", "80.5", "http", "-1", "1e3"]) {
    expect(parsePortAnswer(bad, 8788).ok).toBe(false);
  }
});

test("a choice answer: Enter keeps the default, the number picks, and anything else is asked again", () => {
  expect(parseChoiceAnswer("", SETUP_AUDIENCES, "network")).toEqual({ ok: true, value: "network" });
  expect(parseChoiceAnswer("1", SETUP_AUDIENCES, "network")).toEqual({ ok: true, value: "just-me" });
  expect(parseChoiceAnswer(" 2 ", SETUP_AUDIENCES, "just-me")).toEqual({ ok: true, value: "network" });
  for (const bad of ["0", "3", "yes", "just-me"]) {
    expect(parseChoiceAnswer(bad, SETUP_AUDIENCES, "just-me").ok).toBe(false);
  }
});

test("a first run writes a new .env that holds the owned keys and parses to exactly the chosen values", () => {
  const text = applySetupValues(null, LOCAL);
  expect({ ...parseEnv(text) }).toEqual(env([PORT_KEY, "9100"], [AUTH_MODE_KEY, "local"]));
  // Setup never writes a secret: they are generated as keyfiles beside the database.
  expect(Object.keys(parseEnv(text)).sort()).toEqual([AUTH_MODE_KEY, PORT_KEY].sort());
});

test("an edit changes only the owned values: every other line, comment, blank and CRLF ending survives byte-for-byte", () => {
  const before = [
    "﻿# my notes about this box",
    "OPENROUTER_API_KEY=sk-or-abc   # the cloud key",
    "",
    "#AUTH_MODE=single-user",
    "export PORT=8788 # moved later",
    'AUTH_MODE="single-user"',
    "LOG_LEVEL=debug",
    "",
  ].join("\r\n");
  const after = applySetupValues(before, LOCAL);
  const expected = [
    "﻿# my notes about this box",
    "OPENROUTER_API_KEY=sk-or-abc   # the cloud key",
    "",
    "#AUTH_MODE=single-user",
    "export PORT=9100 # moved later",
    "AUTH_MODE=local",
    "LOG_LEVEL=debug",
    "",
  ].join("\r\n");
  expect(after).toBe(expected);
});

test("an owned key the file lacks is appended once, in the file's own line ending, after a final newline", () => {
  expect(applySetupValues("LOG_LEVEL=debug", LOCAL)).toBe("LOG_LEVEL=debug\nPORT=9100\nAUTH_MODE=local\n");
  expect(applySetupValues("LOG_LEVEL=debug\r\n", LOCAL)).toBe("LOG_LEVEL=debug\r\nPORT=9100\r\nAUTH_MODE=local\r\n");
  // A commented-out line is the operator's comment, not a value: it stays, and the value is appended.
  expect(applySetupValues("#PORT=1\n", LOCAL)).toBe("#PORT=1\nPORT=9100\nAUTH_MODE=local\n");
});

test("every assignment of an owned key is rewritten, so an earlier duplicate cannot come back as the value", () => {
  const after = applySetupValues("PORT=1\nPORT=2\n", LOCAL);
  expect(after).toBe("PORT=9100\nPORT=9100\nAUTH_MODE=local\n");
  expect(parseEnv(after)[PORT_KEY]).toBe("9100");
});

test("an edit is idempotent: the same values applied twice give the same bytes, from a new file or an old one", () => {
  const fresh = applySetupValues(null, LOCAL);
  expect(applySetupValues(fresh, LOCAL)).toBe(fresh);
  const old = "# kept\nPORT=1\nX=y\n";
  const once = applySetupValues(old, LOCAL);
  expect(applySetupValues(once, LOCAL)).toBe(once);
});

test("an address answer adds typed host names to the known ones; an IP, localhost or Enter adds nothing", () => {
  expect(parseAddressAnswer("Orb.Home.Lan", [])).toEqual({ ok: true, value: "orb.home.lan" });
  expect(parseAddressAnswer(" orb.lan, .example.com ", [])).toEqual({ ok: true, value: "orb.lan,.example.com" });
  for (const needsNoEntry of ["192.168.1.20", "[fe80::1]", "fe80::1%eth0", "[fe80::1%eth0]", "::1", "localhost", ""]) {
    expect(parseAddressAnswer(needsNoEntry, [])).toEqual({ ok: true, value: null });
    expect(parseAddressAnswer(needsNoEntry, ["box", "box.local"])).toEqual({ ok: true, value: "box,box.local" });
  }
  expect(parseAddressAnswer("orb.lan, 10.0.0.5, BOX", ["box", "box.local"])).toEqual({ ok: true, value: "box,box.local,orb.lan" });
  // The server's grammar: one trailing dot is dropped, underscores are legal, and *.localhost always passes.
  expect(parseAddressAnswer("Orb.Lan., game_pc, app.localhost", [])).toEqual({ ok: true, value: "orb.lan,game_pc" });
  // A URL, a port, a wildcard or a malformed label is refused, so the question is asked again rather than writing
  // a value the server would refuse at boot.
  for (const bad of ["http://orb.lan", "orb.lan:8788", "orb lan", "-orb.lan", "orb-.lan", "*.orb.lan", "orb..lan", `${"a".repeat(64)}.lan`]) {
    expect(parseAddressAnswer(bad, []).ok).toBe(false);
  }
  // A one-label suffix would admit a whole top-level domain, so it is asked again too.
  expect(parseAddressAnswer(".com", []).ok).toBe(false);
});

/** One `os.networkInterfaces()` entry, as node reports it. */
function nic(address: string, internal = false): NetworkInterfaceInfo {
  const mac = "00:00:00:00:00:00";
  if (address.includes(":")) {
    return { address, netmask: "ffff:ffff:ffff:ffff::", family: "IPv6", mac, internal, cidr: null, scopeid: 0 } satisfies NetworkInterfaceInfoIPv6;
  }
  return { address, netmask: "255.255.255.0", family: "IPv4", mac, internal, cidr: null } satisfies NetworkInterfaceInfoIPv4;
}

test("the URLs to open list LAN IPv4 first, then tailnet, then the .local name, and nothing another device cannot open", () => {
  const machine: SetupMachine = {
    hostname: "BOX",
    interfaces: {
      lo: [nic("127.0.0.1", true), nic("::1", true)],
      eth0: [nic("192.168.1.20"), nic("fe80::1")],
      wlan0: [nic("169.254.10.2")],
      docker0: [nic("172.17.0.1")],
      "br-5f2a": [nic("172.18.0.1")],
      veth12ab: [nic("172.17.0.9")],
      "vEthernet (WSL)": [nic("172.29.160.1")],
      "VirtualBox Host-Only Network": [nic("192.168.56.1")],
      vmnet8: [nic("192.168.155.1")],
      tailscale0: [nic("100.101.102.103")],
    },
    wsl: false,
  };
  expect(openUrls(machine, 9100)).toEqual([
    { url: "http://192.168.1.20:9100", kind: "lan" },
    { url: "http://100.101.102.103:9100", kind: "tailnet" },
    { url: "http://box.local:9100", kind: "mdns" },
  ]);
  // Under WSL2 every address above is the VM's own: none is printed as if another device could open it.
  expect(openUrls({ ...machine, wsl: true }, 9100)).toEqual([]);
});

test("WSL2 is told apart from WSL1 and plain Linux by the kernel's own version line", () => {
  expect(isWsl2Kernel("Linux version 5.15.153.1-microsoft-standard-WSL2 (root@1c0f1e4c) (gcc)")).toBe(true);
  // WSL1 shares Windows' network stack, so its addresses are the LAN's.
  expect(isWsl2Kernel("Linux version 4.4.0-19041-Microsoft (Microsoft@Microsoft.com) (gcc version 5.4.0)")).toBe(false);
  expect(isWsl2Kernel("Linux version 7.0.0-31-generic (buildd@lcy02) (gcc)")).toBe(false);
});

test("ALLOWED_HOSTS is offered back as the default and edited in place like the other owned keys", () => {
  expect(setupDefaults(env([AUTH_MODE_KEY, "local"], [ALLOWED_HOSTS_KEY, "orb.lan"]), {})).toMatchObject({ allowedHosts: "orb.lan" });
  const named: SetupValues = { ...LOCAL, allowedHosts: "orb.lan" };
  expect(applySetupValues("# mine\nALLOWED_HOSTS=old.lan # kept comment\n", named)).toBe(
    "# mine\nALLOWED_HOSTS=orb.lan # kept comment\nPORT=9100\nAUTH_MODE=local\n",
  );
  // No host name to write leaves an existing list exactly as the operator left it.
  expect(applySetupValues("ALLOWED_HOSTS=old.lan\n", LOCAL)).toBe("ALLOWED_HOSTS=old.lan\nPORT=9100\nAUTH_MODE=local\n");
  // "just me" never carries a host list into the values, whatever the default was.
  expect(setupValues({ port: 8788, audience: "just-me", login: "password", allowedHosts: "orb.lan" }, "local").allowedHosts).toBeNull();
  expect(setupValues({ port: 8788, audience: "network", login: "password", allowedHosts: "orb.lan" }, "local").allowedHosts).toBe("orb.lan");
});
