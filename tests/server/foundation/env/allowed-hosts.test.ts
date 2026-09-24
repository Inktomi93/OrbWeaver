// foundation/env/allowed-hosts — the ALLOWED_HOSTS grammar and the names the request guard admits. A malformed
// entry must be caught here: it would match nothing, so the name the operator meant would be refused silently.

import { parseAllowedHosts, resolveAllowedHosts } from "@orb/server/foundation/env";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER_CALLBACK = "https://orbweaver.inktomi.tech/api/auth/oidc/callback";

describe("parseAllowedHosts", () => {
  test("unset, empty and comma-only values are all unset", () => {
    for (const raw of [undefined, "", " , ,"]) {
      expect(parseAllowedHosts(raw), String(raw)).toEqual({ hosts: [], malformed: [] });
    }
  });

  test("names and dot-led suffixes are kept, lower-cased, with one trailing dot dropped", () => {
    expect(parseAllowedHosts(" NAS.local , .Example.COM., my_box, orbweaver.example.com").hosts).toEqual([
      "nas.local",
      ".example.com",
      "my_box",
      "orbweaver.example.com",
    ]);
  });

  test("a scheme, port, path, wildcard, bracketed IP or empty label is malformed, each named", () => {
    const malformed = ["https://a.example", "a.example:8788", "a.example/app", "*.example.com", "[::1]", "a..example", ".", "-a.example", "a b"];
    expect(parseAllowedHosts(["ok.example", ...malformed].join(","))).toEqual({ hosts: ["ok.example"], malformed });
  });

  test("a label over 63 characters is malformed", () => {
    expect(parseAllowedHosts(`${"a".repeat(64)}.example`).malformed).toHaveLength(1);
    expect(parseAllowedHosts(`${"a".repeat(63)}.example`).malformed).toEqual([]);
  });
});

describe("resolveAllowedHosts", () => {
  test("the owner's box: the OIDC callback host is allowed with no ALLOWED_HOSTS entry", () => {
    expect(resolveAllowedHosts({ allowedHosts: undefined, oidcRedirectUris: OWNER_CALLBACK })).toEqual(["orbweaver.inktomi.tech"]);
  });

  test("configured names come first, callback hosts after, duplicates once", () => {
    expect(
      resolveAllowedHosts({
        allowedHosts: "nas.local,orbweaver.inktomi.tech",
        oidcRedirectUris: `${OWNER_CALLBACK}, http://nas.local:8788/api/auth/oidc/callback`,
      }),
    ).toEqual(["nas.local", "orbweaver.inktomi.tech"]);
  });

  test("an unparseable or IPv6-literal callback adds nothing (IP literals pass without an entry)", () => {
    expect(resolveAllowedHosts({ allowedHosts: undefined, oidcRedirectUris: "http://[::1]:8788/cb,not a url" })).toEqual([]);
  });

  test("a malformed ALLOWED_HOSTS entry is never admitted", () => {
    expect(resolveAllowedHosts({ allowedHosts: "*.example.com,ok.example", oidcRedirectUris: undefined })).toEqual(["ok.example"]);
  });
});
