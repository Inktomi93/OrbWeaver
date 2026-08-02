// Contract tests for @orb/contracts/plugin/manifest (plugin-design P2 §1): the install-time trust edge. The
// capability axis (the pinned 13-member closed list, confirm-dialog order), the manifest matrix (every refusal
// typed — bad slug, unserved hostVersion, bad semver, wrong entry, the netHosts ⟺ net.fetch biconditional,
// netHosts SSRF regex, caps superset), and the OPTIONAL builtAgainst provenance block. Mirror of manifest.ts.

import { PLUGIN_CAPABILITIES, pluginManifestSchema } from "@orb/contracts/plugin";
import { expect, test } from "../../support/fixtures";

const BASE = {
  id: "my-plugin",
  name: "My Plugin",
  version: "1.0.0",
  hostVersion: 1 as const,
  entry: "main.js" as const,
  description: "does a thing",
  capabilities: ["chat.read"] as const,
};

test("PLUGIN_CAPABILITIES is the pinned 13-member axis (02 §1) in confirm-dialog order", () => {
  expect(PLUGIN_CAPABILITIES).toEqual([
    "chat.read",
    "chat.variables.write",
    "chat.quick_reply",
    "chat.transform",
    "worldinfo.write",
    "global_vars",
    "storage.kv",
    "notify",
    "turn.trigger",
    "imagery.generate",
    "events.subscribe",
    "tools.register",
    "net.fetch",
  ]);
});

test("pluginManifestSchema accepts a minimal well-formed manifest", () => {
  const parsed = pluginManifestSchema.parse(BASE);
  expect(parsed.id).toBe("my-plugin");
  expect(parsed.capabilities).toEqual(["chat.read"]);
  expect(parsed.netHosts).toBeUndefined();
});

test("pluginManifestSchema accepts net.fetch WITH a bounded netHosts allowlist", () => {
  const parsed = pluginManifestSchema.parse({ ...BASE, capabilities: ["net.fetch"], netHosts: ["api.example.com"] });
  expect(parsed.netHosts).toEqual(["api.example.com"]);
});

test("builtAgainst provenance is OPTIONAL; when present engineVersion is required, engineCommit optional", () => {
  // Absent block — a trivial hand-authored plugin is valid.
  expect(pluginManifestSchema.parse(BASE).builtAgainst).toBeUndefined();
  // engineVersion only (what any author can declare).
  const declared = pluginManifestSchema.parse({ ...BASE, builtAgainst: { engineVersion: "0.1.0" } });
  expect(declared.builtAgainst).toEqual({ engineVersion: "0.1.0" });
  // engineVersion + best-effort engineCommit (our build tooling).
  expect(pluginManifestSchema.parse({ ...BASE, builtAgainst: { engineVersion: "0.1.0", engineCommit: "abc1234" } }).builtAgainst?.engineCommit).toBe("abc1234");
  // A builtAgainst block WITHOUT engineVersion is refused (the one required field).
  expect(pluginManifestSchema.safeParse({ ...BASE, builtAgainst: { engineCommit: "abc1234" } }).success).toBe(false);
  expect(pluginManifestSchema.safeParse({ ...BASE, builtAgainst: { engineVersion: "" } }).success).toBe(false);
});

test("manifest matrix — bad slug is refused (uppercase, leading dash, single char, too long, underscore)", () => {
  expect(pluginManifestSchema.safeParse({ ...BASE, id: "MyPlugin" }).success).toBe(false);
  expect(pluginManifestSchema.safeParse({ ...BASE, id: "-plugin" }).success).toBe(false);
  expect(pluginManifestSchema.safeParse({ ...BASE, id: "a" }).success).toBe(false);
  expect(pluginManifestSchema.safeParse({ ...BASE, id: "a".repeat(65) }).success).toBe(false);
  expect(pluginManifestSchema.safeParse({ ...BASE, id: "under_score" }).success).toBe(false);
});

test("manifest matrix — an unserved hostVersion is refused before any code runs (01 §3)", () => {
  expect(pluginManifestSchema.safeParse({ ...BASE, hostVersion: 2 }).success).toBe(false);
  expect(pluginManifestSchema.safeParse({ ...BASE, hostVersion: 0 }).success).toBe(false);
});

test("manifest matrix — a non-semver version and a non-main.js entry are refused", () => {
  expect(pluginManifestSchema.safeParse({ ...BASE, version: "1.0" }).success).toBe(false);
  expect(pluginManifestSchema.safeParse({ ...BASE, version: "v1.0.0" }).success).toBe(false);
  expect(pluginManifestSchema.safeParse({ ...BASE, entry: "index.js" }).success).toBe(false);
});

test("manifest matrix — the netHosts ⟺ net.fetch biconditional is enforced both ways", () => {
  // net.fetch declared but no hosts → refused.
  expect(pluginManifestSchema.safeParse({ ...BASE, capabilities: ["net.fetch"] }).success).toBe(false);
  // net.fetch declared with an EMPTY host list → refused (an empty allowlist is not a valid net grant).
  expect(pluginManifestSchema.safeParse({ ...BASE, capabilities: ["net.fetch"], netHosts: [] }).success).toBe(false);
  // hosts declared WITHOUT net.fetch → refused (a meaningless dangling allowlist).
  expect(pluginManifestSchema.safeParse({ ...BASE, netHosts: ["api.example.com"] }).success).toBe(false);
});

test("manifest matrix — netHosts refuses wildcards, schemes, and over-count (the SSRF posture)", () => {
  const withNet = { ...BASE, capabilities: ["net.fetch"] as const };
  expect(pluginManifestSchema.safeParse({ ...withNet, netHosts: ["*.example.com"] }).success).toBe(false);
  expect(pluginManifestSchema.safeParse({ ...withNet, netHosts: ["https://example.com"] }).success).toBe(false);
  expect(pluginManifestSchema.safeParse({ ...withNet, netHosts: Array.from({ length: 9 }, (_, i) => `h${i}.example.com`) }).success).toBe(false);
});

// THE HOLE THIS CLOSED (2026-08-02): `hostAllowed` (server/src/infra/network/egress.ts) treats a LEADING-DOT
// allowlist entry as a SUFFIX WILDCARD — `.com` matches every `.com` host. The old charset regex
// `/^[a-z0-9.-]+$/` accepted leading dots, so a manifest declaring `netHosts: [".com"]` passed install
// validation and then reached the entire TLD, against this field's documented "exact hostname, no wildcards"
// contract. `z.hostname()` refuses every leading-dot form. If this test ever goes green-by-deletion, the SSRF
// allowlist is wildcard-able again.
test("manifest matrix — netHosts refuses the LEADING-DOT suffix wildcard (the `.com` reaches-every-host hole)", () => {
  const withNet = { ...BASE, capabilities: ["net.fetch"] as const };
  for (const entry of [".com", ".example.com", ".", "..com", "example..com"]) {
    expect(pluginManifestSchema.safeParse({ ...withNet, netHosts: [entry] }).success).toBe(false);
  }
  // …while the exact hostname the wildcard was masquerading as still installs.
  expect(pluginManifestSchema.safeParse({ ...withNet, netHosts: ["example.com"] }).success).toBe(true);
});

test("manifest matrix — netHosts refuses malformed host grammar the old charset regex let through", () => {
  const withNet = { ...BASE, capabilities: ["net.fetch"] as const };
  for (const entry of ["-.-", "...", "-", "-example.com", "example-.com", `${"a".repeat(64)}.com`]) {
    expect(pluginManifestSchema.safeParse({ ...withNet, netHosts: [entry] }).success).toBe(false);
  }
});

// The ONE acceptance widening of the z.hostname() swap, pinned as DELIBERATE: hostnames are case-insensitive
// and the enforcer normalizes (`hostAllowed` lowercases every entry against a lowercased request host), so an
// uppercase entry reaches exactly the host its lowercase spelling would — no new host is reachable.
test("manifest matrix — netHosts accepts a mixed-CASE hostname (egress `hostAllowed` lowercases both sides)", () => {
  const withNet = { ...BASE, capabilities: ["net.fetch"] as const };
  expect(pluginManifestSchema.safeParse({ ...withNet, netHosts: ["API.Example.com"] }).success).toBe(true);
});

test("manifest matrix — a capabilities SUPERSET (more entries than the axis) is refused", () => {
  const tooMany = Array.from({ length: PLUGIN_CAPABILITIES.length + 1 }, () => "chat.read");
  expect(pluginManifestSchema.safeParse({ ...BASE, capabilities: tooMany }).success).toBe(false);
});
