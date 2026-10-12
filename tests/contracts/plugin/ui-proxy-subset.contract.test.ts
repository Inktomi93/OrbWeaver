// Contract tests for @orb/contracts/plugin/ui — the Tier C proxyable host-function subset and its exclusions.

import { HOST_FUNCTION_CAPABILITY, isUiProxyableHostFunction, UI_PROXYABLE_HOST_FUNCTIONS } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

// ── Tier C (U4, §4.6) — the PROXY SUBSET, pinned by VALUE ────────────────────────────────────────────────────
// `satisfies readonly HostFunctionRef[]` makes every member a real host function at compile time, but it says
// nothing about which ones are in the set — and the membership IS the security property (§9's "capability
// escalation" row). An ordered `toEqual` is what makes ADDING a member a deliberate, reviewable act rather than
// a one-line diff nobody notices, which is exactly the reason `PLUGIN_CAPABILITIES` carries the same pin.

test("UI_PROXYABLE_HOST_FUNCTIONS is the pinned U4 subset — reads + the two KV planes, and nothing else", () => {
  expect(UI_PROXYABLE_HOST_FUNCTIONS).toEqual([
    "chat.listMessages",
    "chat.getVariables",
    "variables.get",
    "variables.set",
    "variables.delete",
    "storage.get",
    "storage.set",
    "storage.delete",
    "storage.list",
    // #1442 — the ATOMIC KV write. IN, and the classification is forced rather than preferred: it is a
    // `storage.kv`-plane DATA op whose reach is strictly NARROWER than `storage.set` two lines up (same grant,
    // same owner scope, a precondition added, no new ownership check, no compute cost). Excluding it would
    // leave a scripted surface — which does the same read-modify-write on the same keys the server guest does
    // — with no lost-update-free write at all, which is the defect rather than a limit.
    "storage.compareAndSet",
  ]);
});

test("the EXCLUSIONS are excluded — residency, authority writes, spend, and egress are unspellable from a client guest", () => {
  // Named individually rather than asserted as "not in the list", because each is a different refusal with a
  // different reason recorded at the tuple, and a future widening should have to delete a NAMED line here.
  const excluded = [
    // Resident registrations — process-lifetime state owned by the SERVER guest (§4.6 names the first three).
    "tools.register",
    "transforms.register",
    // U6 resident registrations — a DISPLAY transform (seam 14) and a macro (`macros.register`) are the same
    // process-lifetime, server-guest-owned class as the four around them: a client UI guest holds `orb.ui(1)`,
    // not `orb.host(1)`, and could no more register a resident than it could register a tool.
    "transforms.registerDisplay",
    "macros.register",
    "events.on",
    "ui.register",
    "ui.setState",
    // U5/U7 resident registrations — a COMMAND (the `register` mirror) and the `ui.frame` ESCAPE-HATCH door are
    // the same process-lifetime, server-guest-owned class: a client UI guest holds `orb.ui(1)`, not
    // `orb.host(1)`, and could no more register a command or mint a frame than register a tool.
    "ui.registerCommand",
    "ui.registerFrame",
    // U5 HOST-MEDIATED affordances (§4.5a) — `toast`/`openDialog` are UI EFFECTS the SERVER mediates (the outbox
    // stamps the plugin name and drains onto a client round-trip), not DATA the client guest lacks. The relay
    // exists for server-owned data (chat/vars/storage); routing a toast through it would be a round-trip for an
    // effect the server pushes back to the SAME client, contradicting the Tier-C ZERO-NETWORK property. If a
    // scripted surface should ever raise one, that is a CLIENT UI-plane affordance (an `orb.ui(1)` method wired
    // to the client host), a deliberate §5a enablement — never a free proxyable-tuple entry.
    "ui.toast",
    "ui.openDialog",
    // No invocation to resolve.
    "chat.current",
    // The AUTHORITY-WRITE class — each gated on `InvocationChat.canWrite`, whose sanctioned client-side route is
    // the S4 propose/confirm posture, never a direct proxy.
    "chat.applyVariableOps",
    "chat.surfaceQuickReply",
    "chat.requestTurn",
    "worldInfo.upsertEntry",
    "imagery.generatePicture",
    "llm.quiet",
    "notifications.post",
    // STRUCTURAL, not a judgment call: the fetch is not on the `PluginBridge` at all (infra performs it behind
    // the SSRF guard; the bridge carries only the hourly admission), so proxying it would require a SECOND
    // egress path. See the tuple's header.
    "net.fetch",
    // #798 — the remote-image fetch-into-CAS is OUT for the SAME structural reason as `net.fetch`: infra performs
    // the fetch behind the SSRF guard + the image guard, so a proxy would need a second egress+CAS-write path.
    "net.fetchAsset",
    // U8 CANON-WRITE class — OUT. Not room-authority writes (no `canWrite` gate — a library write is the
    // installer's own), but WRITES all the same that mint durable rows + kick derived-index compute; the Tier-C
    // tuple is deliberately reads + the two KV planes (§4.6 bought LATENCY for local-immediate interaction,
    // which needs reads). A scripted surface that wants an ingest fires an `actionId` round-trip whose SERVER
    // handler holds the grant — the plugin's server guest ingests under the same grant, nothing is lost.
    "databank.ingest",
    "character.ingest",
    // #798 — the remote-image "summon with art" arm is a CANON WRITE (a character import), the `character.ingest`
    // class, so it is OUT for the same reason: a scripted surface fires an `actionId` round-trip whose server
    // guest holds the grant, never a direct proxy.
    "character.ingestAsset",
    // U8 D148 per-card state — BOTH OUT. `setCardData` is a WRITE (the canon-write class above). `getCardData` IS
    // a read, but its owner-scope is per-CHARACTER and a proxied call names a `characterId` the server would owe an
    // ownership check on (the `chat.current`/row-777 shape, one plane over) — a gate that does not exist yet, so it
    // is a PRICED widening, never a free proxyable entry (the tuple header states this).
    "character.setCardData",
    "character.getCardData",
    // U8 §5a PRIVATE-EVENT plane — OUT. `pubsub.on` is a RESIDENT registration (a subscriber owned by the server
    // guest, the `events.on` class); `pubsub.emit` is an EFFECT fanning out to resident server guests. Neither is
    // server-owned DATA a client guest lacks — the private-event plane is a server-guest composition primitive,
    // not something a browser worker relays through the read tuple.
    "pubsub.emit",
    "pubsub.on",
    // #788 the READ gaps — ALL FOUR OUT, each a PRICED widening (never a free entry), for the reasons the tuple
    // header records. `chat.listCharacters` is the strongest future candidate (same class as the proxyable
    // `listMessages` — a chat-scoped read a surface renders from, self-gating membership), but adding a member is
    // a deliberate ordered-pin edit, not a lane's side effect. `worldInfo.listBooks`/`listEntries` are chat-scoped
    // reads whose consumer is server-side indexing, weak latency want. `assets.read` is the `character.getCardData`
    // shape one plane over — its owner-scope is per-ASSET, and a proxied call names an id the server would owe an
    // ownership check on, a gate not built here.
    "chat.listCharacters",
    "worldInfo.listBooks",
    "worldInfo.listEntries",
    "assets.read",
    // #788 F1 — first-party retrieval. An owner-scoped read (needs no new ownership gate to proxy), but every
    // call runs a query embedding (possibly through a paid hosted provider), so it is the COMPUTE-COST class the read tuple keeps out
    // (§4.6 bought latency over cheap reads, not per-keystroke retrieval). Priced widening, never a free entry.
    "search.documents",
  ];
  for (const fn of excluded) {
    expect(isUiProxyableHostFunction(fn), fn).toBe(false);
  }
  // Together with the ordered pin above, these two tests are exhaustive over `HOST_FUNCTION_CAPABILITY`: 10 in,
  // 33 out, 43 total (#798 added `net.fetchAsset` + `character.ingestAsset`, both OUT; #1442 added
  // `storage.compareAndSet`, IN).
  expect(UI_PROXYABLE_HOST_FUNCTIONS.length + excluded.length).toBe(Object.keys(HOST_FUNCTION_CAPABILITY).length);
});

test("every proxyable fn names a capability — the re-gate has something to check", () => {
  // The `uiHostCall` grant rung is `HOST_FUNCTION_CAPABILITY[fn] ∈ the stored grant`. A member with no row in
  // that map would make the lookup `undefined` and the `includes` check silently false-y — this pins that the
  // situation cannot arise.
  for (const fn of UI_PROXYABLE_HOST_FUNCTIONS) {
    expect(HOST_FUNCTION_CAPABILITY[fn], fn).toBeDefined();
  }
});
