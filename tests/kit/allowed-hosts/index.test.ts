// @orb/kit/allowed-hosts — the ALLOWED_HOSTS grammar the server's env parse and the setup wizard share. A malformed
// entry must be caught: it would match nothing, so the name the operator meant would be refused on every request.

import {
  isAllowedHostEntry,
  isAlwaysAllowedHost,
  isHostname,
  isTopLevelSuffix,
  machineHostNames,
  parseAllowedHosts,
  splitHostList,
  withoutTrailingDot,
} from "@orb/kit/allowed-hosts";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

describe("splitHostList", () => {
  test("unset, empty, comma-only and dot-only values are all empty", () => {
    for (const raw of [undefined, null, "", " , ,", "."]) {
      expect(splitHostList(raw), String(raw)).toEqual([]);
    }
  });

  test("entries are trimmed, lower-cased (NetBIOS names arrive upper-case) and lose one trailing dot", () => {
    expect(splitHostList(" GAME_PC , .Example.COM., nas.local.")).toEqual(["game_pc", ".example.com", "nas.local"]);
  });
});

describe("parseAllowedHosts", () => {
  test("names and dot-led suffixes are kept", () => {
    expect(parseAllowedHosts("NAS.local, .Example.COM., my_box, orbweaver.example.com")).toEqual({
      hosts: ["nas.local", ".example.com", "my_box", "orbweaver.example.com"],
      malformed: [],
    });
  });

  test("a scheme, port, path, wildcard, bracketed IP, empty label or edge hyphen is malformed, each named", () => {
    const malformed = ["https://a.example", "a.example:8788", "a.example/app", "*.example.com", "[::1]", "a..example", "-a.example", "a b"];
    expect(parseAllowedHosts(["ok.example", ...malformed].join(","))).toEqual({ hosts: ["ok.example"], malformed });
  });

  test("a label over 63 characters is malformed; 63 is not", () => {
    expect(parseAllowedHosts(`${"a".repeat(64)}.example`).malformed).toHaveLength(1);
    expect(parseAllowedHosts(`${"a".repeat(63)}.example`).malformed).toEqual([]);
  });
});

test("a dot-led entry over one label would admit a whole top-level domain and is malformed; an exact one-label name is not", () => {
  expect(parseAllowedHosts(".com, .local, .lan, .example.com, nas.local, game_pc")).toEqual({
    hosts: [".example.com", "nas.local", "game_pc"],
    malformed: [".com", ".local", ".lan"],
  });
  expect(isTopLevelSuffix(".com")).toBe(true);
  expect(isTopLevelSuffix(".example.com")).toBe(false);
  expect(isTopLevelSuffix("nas.local")).toBe(false);
});

test("the machine's names are lower-cased with one .local form, whatever each OS reports", () => {
  // Windows reports the NetBIOS name in upper case; Linux may report a domain; macOS may already report `.local`.
  expect(machineHostNames("DESKTOP-7Q2K")).toEqual(["desktop-7q2k", "desktop-7q2k.local"]);
  expect(machineHostNames("box.home.example.com")).toEqual(["box.home.example.com", "box.local"]);
  expect(machineHostNames("Nates-MacBook-Pro.local")).toEqual(["nates-macbook-pro.local"]);
  expect(machineHostNames("game_pc")).toEqual(["game_pc", "game_pc.local"]);
  // A name outside the grammar is never admitted or offered.
  expect(machineHostNames("my box")).toEqual([]);
  expect(machineHostNames("")).toEqual([]);
});

test("isHostname takes a bare name only; isAllowedHostEntry also takes a dot-led suffix", () => {
  expect(isHostname("nas.local")).toBe(true);
  expect(isHostname(".nas.local")).toBe(false);
  expect(isAllowedHostEntry(".nas.local")).toBe(true);
  expect(isAllowedHostEntry(".")).toBe(false);
});

test("the always-allowed rule: localhost, *.localhost and IP literals (bare or bracketed) need no entry", () => {
  for (const host of ["localhost", "app.localhost", "127.0.0.1", "100.101.102.103", "::1", "[::1]", "::ffff:127.0.0.1", "fe80::1%eth0", "[fe80::1%25eth0]"]) {
    expect(isAlwaysAllowedHost(host), host).toBe(true);
  }
  for (const host of ["nas.local", "localhost.attacker.example", "evil-localhost", "0x7f000001", "[nas.local]", "1:2:3:4:5:6:7:8::9"]) {
    expect(isAlwaysAllowedHost(host), host).toBe(false);
  }
});

test("withoutTrailingDot drops exactly one dot", () => {
  expect(withoutTrailingDot("example.com.")).toBe("example.com");
  expect(withoutTrailingDot("example.com")).toBe("example.com");
});
