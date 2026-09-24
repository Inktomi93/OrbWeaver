// foundation/env/allowed-hosts — the names the request guard admits: ALLOWED_HOSTS, the OIDC callback hosts and the
// machine's own name on bare metal. The grammar itself is `@orb/kit/allowed-hosts` (tests/kit/allowed-hosts).

import { machineHostnameFor, resolveAllowedHosts } from "@orb/server/foundation/env";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER_CALLBACK = "https://orbweaver.example.com/api/auth/oidc/callback";

describe("resolveAllowedHosts", () => {
  test("the owner's box: the OIDC callback host is allowed with no ALLOWED_HOSTS entry", () => {
    expect(resolveAllowedHosts({ allowedHosts: undefined, oidcRedirectUris: OWNER_CALLBACK, machineHostname: null })).toEqual(["orbweaver.example.com"]);
  });

  test("configured names come first, callback hosts after, duplicates once", () => {
    expect(
      resolveAllowedHosts({
        allowedHosts: "nas.local,orbweaver.example.com",
        oidcRedirectUris: `${OWNER_CALLBACK}, http://nas.local:8788/api/auth/oidc/callback`,
        machineHostname: null,
      }),
    ).toEqual(["nas.local", "orbweaver.example.com"]);
  });

  test("on bare metal the machine's own name and its .local form pass with ALLOWED_HOSTS unset", () => {
    const input = { allowedHosts: undefined, oidcRedirectUris: undefined, machineHostname: machineHostnameFor(false, "Game-PC") };
    expect(resolveAllowedHosts(input)).toEqual(["game-pc", "game-pc.local"]);
    // macOS may already report the .local form; it is not doubled.
    expect(resolveAllowedHosts({ ...input, machineHostname: machineHostnameFor(false, "Alexs-MBP.local") })).toEqual(["nates-mbp.local"]);
  });

  test("in a container the machine's name (a random id) is not admitted", () => {
    expect(resolveAllowedHosts({ allowedHosts: undefined, oidcRedirectUris: undefined, machineHostname: machineHostnameFor(true, "3f2a9c1d7e44") })).toEqual(
      [],
    );
  });

  test("an unparseable or IPv6-literal callback adds nothing (IP literals pass without an entry)", () => {
    expect(resolveAllowedHosts({ allowedHosts: undefined, oidcRedirectUris: "http://[::1]:8788/cb,not a url", machineHostname: null })).toEqual([]);
  });

  test("a malformed ALLOWED_HOSTS entry is never admitted", () => {
    expect(resolveAllowedHosts({ allowedHosts: "*.example.com,ok.example", oidcRedirectUris: undefined, machineHostname: null })).toEqual(["ok.example"]);
  });
});
