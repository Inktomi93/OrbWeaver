// Contract tests for @orb/contracts/plugin/manifest: the install-time trust edge. The
// capability axis (the pinned 15-member closed list, confirm-dialog order), the manifest matrix (every refusal
// typed — bad slug, malformed hostVersion, bad semver, wrong entry, the netHosts ⟺ net.fetch biconditional,
// netHosts SSRF regex, caps superset), and the OPTIONAL builtAgainst provenance block. Mirror of manifest.ts.

import {
  NET_HOSTS_MAX,
  PLUGIN_CAPABILITIES,
  PLUGIN_PROVIDERS_MAX,
  PLUGIN_SLUG_MAX,
  PLUGIN_TOOL_NAME_LOCAL_MAX,
  PLUGIN_TOOL_NAME_RE,
  PLUGIN_TOOL_WIRE_NAME_MAX,
  pluginManifestSchema,
  pluginToolWireName,
} from "@orb/contracts/plugin";
import { expect, test } from "../../support/fixtures.ts";

const BASE = {
  id: "my-plugin",
  name: "My Plugin",
  version: "1.0.0",
  hostVersion: 1 as const,
  entry: "main.js" as const,
  description: "does a thing",
  capabilities: ["chat.read"] as const,
};

// THE ORDER IS THE CONFIRM-DIALOG DISPLAY ORDER (`manifest.ts` says so), so this `toEqual` is not a count pin
// wearing a list's clothes — it is the consent screen's reading order, and the client's `CAPABILITY_COPY_ROWS`
// is written to match it. `llm.quiet` sits at position 13: it is SPEND class, and the three spend capabilities
// (`turn.trigger`, `imagery.generate`, `llm.quiet`) sit adjacent so the "Costs money" badge and the reading
// order reinforce each other on a screen whose scan question is "what can this cost me". The two spend/benign
// bands are unchanged by #788, which inserted THREE BENIGN READ capabilities in the read band (`worldinfo.read`
// before its write, `assets.read` + `search.query` after `storage.kv`) — reads that reach nothing outside their
// own sandbox, so they belong before the risk/spend rows and do NOT split the three adjacent spend rows (now at
// positions 14-16, shifted +3 by the three inserted reads). `ui.surface` (#679) reads in the benign band — after `notify`,
// BEFORE the spend block — deliberately: it renders only for the installer, house-drawn, cannot impersonate host
// chrome. `ui.frame` (U7) follows it and that adjacency is the point: it is the ESCALATION of the row above it
// (the same "may this plugin draw" question, answered with an isolated frame that can beacon over a channel no
// policy closes), so a reader weighing one has the other in the same glance. It is RISK class where `ui.surface`
// is not — the only UI capability that reaches past the plugin's own sandbox. Moving a member is a UX decision.
test("PLUGIN_CAPABILITIES is the pinned 24-member axis (02 §1; ui.surface + ui.frame #679; U8 ingest pair + card_state + plugin_events; #788 worldinfo.read + assets.read + search.query; #798 net.fetch_asset) in confirm-dialog order", () => {
  expect(PLUGIN_CAPABILITIES).toEqual([
    "chat.read",
    "chat.variables.write",
    "chat.quick_reply",
    "chat.transform",
    // #788 F12 — the benign world-info READ half, placed before its write (read then write, benign before risk).
    "worldinfo.read",
    "worldinfo.write",
    "global_vars",
    "storage.kv",
    // #788 seam-11 — the benign CAS asset READ, placed after `storage.kv` (both "read your own private data").
    "assets.read",
    // #788 F1 — the benign first-party RETRIEVAL read, placed beside `assets.read` (both "read your own library").
    "search.query",
    "notify",
    "ui.surface",
    "ui.frame",
    "turn.trigger",
    "imagery.generate",
    "llm.quiet",
    // U8 seams 15/17 — the two CANON-WRITE-INTO-YOUR-OWN-LIBRARY capabilities. Placed directly AFTER the spend
    // block deliberately: they are not `net.fetch`/`llm.quiet`-class SPEND (no paid credential, no external
    // host — only the box's own local write + derived-index compute, so no hourly floor, the `storage.kv`
    // posture), but they DO cost compute and mint durable rows, so a reader scanning "what can this do to my
    // stuff" meets them right after the money block and before the passive `events.subscribe`. Each is its OWN
    // consent line (a canon write is a distinct reach), which is exactly what the HOST_FUNCTION_CAPABILITY 1:1
    // keys and the coverage loop below make checkable.
    "databank.ingest",
    "character.ingest",
    // U8 D148 — per-card plugin state (the ST `writeExtensionField` parity arm). Its OWN consent line ("store its
    // own data on your characters"), placed right after the two library-write capabilities: a reader scanning
    // "what can this do to my characters" meets all three together. BENIGN band and even cheaper than the ingest
    // pair (owner-scoped metadata to an EXISTING owned character, no re-embed — D148 clause d).
    "character.card_state",
    "events.subscribe",
    // U8 §5a — the private plugin-event plane. BENIGN band (neither spend nor risk — installer-scoped, no
    // chat/other-user/internet reach), placed beside `events.subscribe` (both are event reach).
    "plugin_events",
    "tools.register",
    "net.fetch",
    // #798 (plugin-remote-image) — the remote-image-into-CAS capability, placed right after `net.fetch`: both
    // reach the open internet through the same manifest allowlist + the same hourly egress belt (egress delta
    // zero), so a reader weighing "what can this fetch" meets them together. RISK (it reaches the internet AND
    // writes a durable asset into your library), not SPEND (no paid credential — the CAS write is local storage).
    "net.fetch_asset",
  ]);
});

test("pluginManifestSchema accepts ui.frame, and it carries no netHosts coupling (a frame has no network of its own)", () => {
  const parsed = pluginManifestSchema.parse({ ...BASE, capabilities: ["ui.surface", "ui.frame"] });
  expect(parsed.capabilities).toEqual(["ui.surface", "ui.frame"]);
  expect(parsed.netHosts).toBeUndefined();
  // ui.frame is INDEPENDENT of ui.surface: a plugin whose only UI is a frame declares only the frame. If these
  // were ever coupled, the hatch's louder consent line would ride along with every declarative panel.
  expect(pluginManifestSchema.safeParse({ ...BASE, capabilities: ["ui.frame"] }).success).toBe(true);
});

test("pluginManifestSchema accepts the ui.surface capability (a plugin may declare its own surfaces)", () => {
  const parsed = pluginManifestSchema.parse({ ...BASE, capabilities: ["ui.surface"] });
  expect(parsed.capabilities).toEqual(["ui.surface"]);
  // ui.surface carries no netHosts coupling — it is not a network grant.
  expect(parsed.netHosts).toBeUndefined();
});

test("pluginManifestSchema accepts a minimal well-formed manifest", () => {
  const parsed = pluginManifestSchema.parse(BASE);
  expect(parsed.id).toBe("my-plugin");
  expect(parsed.capabilities).toEqual(["chat.read"]);
  expect(parsed.netHosts).toBeUndefined();
});

const PROVIDER = {
  id: "plugin:my-plugin/acme",
  label: "Acme",
  wire: "openai-compat",
  dialect: "openai-compatible",
  auth: "endpoint",
  apis: ["chat-completions"],
  catalog: "url",
  metered: false,
} as const;

const FIXED_PROVIDER = {
  ...PROVIDER,
  auth: "apiKey",
  baseUrl: "https://api.example.com/v1",
} as const;

test("provider contributions are namespace-bound, unique, bounded, and use the closed wire axis", () => {
  expect(pluginManifestSchema.parse({ ...BASE, providers: [PROVIDER] }).providers).toEqual([PROVIDER]);
  expect(pluginManifestSchema.safeParse({ ...BASE, providers: [{ ...PROVIDER, id: "plugin:other/acme" }] }).success).toBe(false);
  expect(pluginManifestSchema.safeParse({ ...BASE, providers: [PROVIDER, PROVIDER] }).success).toBe(false);
  expect(pluginManifestSchema.safeParse({ ...BASE, providers: [{ ...PROVIDER, wire: "guest-backend" }] }).success).toBe(false);
  const atCap = Array.from({ length: PLUGIN_PROVIDERS_MAX }, (_, index) => ({ ...PROVIDER, id: `plugin:my-plugin/p${index}` }));
  expect(pluginManifestSchema.safeParse({ ...BASE, providers: atCap }).success).toBe(true);
  expect(pluginManifestSchema.safeParse({ ...BASE, providers: [...atCap, { ...PROVIDER, id: "plugin:my-plugin/over" }] }).success).toBe(false);
});

test("fixed provider egress requires an egress capability and its normalized host in netHosts", () => {
  expect(pluginManifestSchema.safeParse({ ...BASE, providers: [FIXED_PROVIDER] }).success).toBe(false);
  expect(
    pluginManifestSchema.safeParse({
      ...BASE,
      capabilities: ["net.fetch"],
      netHosts: ["other.example.com"],
      providers: [FIXED_PROVIDER],
    }).success,
  ).toBe(false);
  expect(
    pluginManifestSchema.safeParse({
      ...BASE,
      capabilities: ["net.fetch"],
      netHosts: ["API.Example.com"],
      providers: [FIXED_PROVIDER],
    }).success,
  ).toBe(true);
  expect(pluginManifestSchema.safeParse({ ...BASE, providers: [PROVIDER] }).success).toBe(true);
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

// #1803 — the slug cap is judged against the CONSTANT, never a literal (the same discipline the netHosts
// cap test above already applies): at-cap is the accepted control, one-over is refused. A literal `20`
// here would silently stop tracking `PLUGIN_SLUG_MAX` if the budget ever moved.
test("manifest matrix — the slug is capped at PLUGIN_SLUG_MAX (#1803 wire-mint budget), at-cap accepted", () => {
  const atCap = `a${"a".repeat(PLUGIN_SLUG_MAX - 1)}`;
  const overCap = `a${"a".repeat(PLUGIN_SLUG_MAX)}`;
  expect(atCap).toHaveLength(PLUGIN_SLUG_MAX);
  expect(pluginManifestSchema.safeParse({ ...BASE, id: atCap }).success).toBe(true);
  expect(pluginManifestSchema.safeParse({ ...BASE, id: overCap }).success).toBe(false);
});

// #1803 — the whole point of the budget: no combination of an admitted slug (≤ PLUGIN_SLUG_MAX, hyphens
// DOUBLED by the mint) and an admitted guest-local tool name (≤ PLUGIN_TOOL_NAME_LOCAL_MAX,
// `PLUGIN_TOOL_NAME_RE`, the membrane's own trust-boundary grammar) can ever mint a wire name past
// `PLUGIN_TOOL_WIRE_NAME_MAX` — the registry's `TOOL_NAME_RE` bound this is pinned to
// (`domain/tool-use/contract/params.ts`, verified by exact-value equality below since contracts cannot
// import server). The adversarial worst case (an all-hyphen slug at the cap + a name at the cap) lands
// EXACTLY on the ceiling, never over it.
test("#1803: an admitted slug + an admitted tool name can never mint past the registry's 64-byte cap", () => {
  expect(PLUGIN_TOOL_WIRE_NAME_MAX).toBe(64); // the server TOOL_NAME_RE tie this constant exists to pin
  const worstSlug = `a${"-".repeat(PLUGIN_SLUG_MAX - 1)}`; // max length, all hyphens after the first char
  expect(worstSlug).toHaveLength(PLUGIN_SLUG_MAX);
  expect(pluginManifestSchema.safeParse({ ...BASE, id: worstSlug }).success).toBe(true);
  const worstName = `a${"a".repeat(PLUGIN_TOOL_NAME_LOCAL_MAX - 1)}`; // max length
  expect(worstName).toHaveLength(PLUGIN_TOOL_NAME_LOCAL_MAX);
  expect(PLUGIN_TOOL_NAME_RE.test(worstName)).toBe(true);
  const mint = pluginToolWireName(worstSlug, worstName);
  expect(mint).toHaveLength(PLUGIN_TOOL_WIRE_NAME_MAX);
  // One byte over EITHER input busts the mint past the ceiling — proving the split is exact, not padded.
  const oneByteOverName = `${worstName}a`;
  expect(pluginToolWireName(worstSlug, oneByteOverName)).toHaveLength(PLUGIN_TOOL_WIRE_NAME_MAX + 1);
});

test("manifest matrix — hostVersion is structurally valid before the lifecycle checks whether it is served", () => {
  // A future major is a well-formed manifest value. The server's bundle funnel must see it so it can raise the
  // caller-distinguishable HostVersionUnservedError instead of collapsing compatibility into schema failure.
  expect(pluginManifestSchema.safeParse({ ...BASE, hostVersion: 2 }).success).toBe(true);

  // Shape failures remain schema failures; compatibility widening must not admit non-major values.
  expect(pluginManifestSchema.safeParse({ ...BASE, hostVersion: 0 }).success).toBe(false);
  expect(pluginManifestSchema.safeParse({ ...BASE, hostVersion: 1.5 }).success).toBe(false);
  expect(pluginManifestSchema.safeParse({ ...BASE, hostVersion: "2" }).success).toBe(false);
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

test("#798: the netHosts biconditional generalizes over EVERY egress capability — net.fetch_asset counts too", () => {
  // net.fetch_asset is a NEW egress capability: it needs the SAME allowlist net.fetch needs.
  expect(pluginManifestSchema.parse({ ...BASE, capabilities: ["net.fetch_asset"], netHosts: ["img.example.com"] }).netHosts).toEqual(["img.example.com"]);
  // Declared but no hosts / an empty list → refused (fail-closed, the net.fetch posture).
  expect(pluginManifestSchema.safeParse({ ...BASE, capabilities: ["net.fetch_asset"] }).success).toBe(false);
  expect(pluginManifestSchema.safeParse({ ...BASE, capabilities: ["net.fetch_asset"], netHosts: [] }).success).toBe(false);
  // netHosts is satisfied by EITHER egress capability — a dangling allowlist needs one of them, and net.fetch_asset
  // alone is enough (so the "hosts require the net.fetch capability" test above is not weakened into a hole).
  expect(pluginManifestSchema.safeParse({ ...BASE, capabilities: ["net.fetch_asset"], netHosts: ["img.example.com"] }).success).toBe(true);
  // Both egress capabilities together share the one allowlist.
  expect(pluginManifestSchema.safeParse({ ...BASE, capabilities: ["net.fetch", "net.fetch_asset"], netHosts: ["img.example.com"] }).success).toBe(true);
});

test("manifest matrix — netHosts refuses wildcards, schemes, and over-count (the SSRF posture)", () => {
  const withNet = { ...BASE, capabilities: ["net.fetch"] as const };
  expect(pluginManifestSchema.safeParse({ ...withNet, netHosts: ["*.example.com"] }).success).toBe(false);
  expect(pluginManifestSchema.safeParse({ ...withNet, netHosts: ["https://example.com"] }).success).toBe(false);
  // Over-count is judged against the CONSTANT, never a literal — the cap moved 8→16 with hub v1.2 (80908a0d8) and a
  // literal 9 silently flipped this pin from "refused" to "accepted". At-cap is the accepted control.
  const hosts = (n: number): string[] => Array.from({ length: n }, (_, i) => `h${i}.example.com`);
  expect(pluginManifestSchema.safeParse({ ...withNet, netHosts: hosts(NET_HOSTS_MAX) }).success).toBe(true);
  expect(pluginManifestSchema.safeParse({ ...withNet, netHosts: hosts(NET_HOSTS_MAX + 1) }).success).toBe(false);
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
