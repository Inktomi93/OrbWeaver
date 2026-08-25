// substrate: grants — the pure REACH math the install/upgrade verbs enforce (02 §2/§4). A grant must be
// ⊆ the manifest's declared capabilities; an upgrade that widens declared reach — a capability the prior grant
// never confirmed, OR a `netHosts` destination the prior manifest never declared — must land disabled for
// re-confirmation. No db, no Principal — just set math.

import { describe } from "vitest";
import {
  newlyDeclaredCapabilities,
  normalizeGrant,
  pendingWidenedNetHosts,
  ungrantableCapabilities,
  widenedNetHosts,
} from "../../../../../packages/server/src/domain/plugin/substrate/grants.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("ungrantableCapabilities", () => {
  test("a grant ⊆ declared is valid (empty result)", () => {
    expect(ungrantableCapabilities(["chat.read", "net.fetch"], ["chat.read"])).toEqual([]);
    expect(ungrantableCapabilities(["chat.read", "net.fetch"], ["chat.read", "net.fetch"])).toEqual([]);
    expect(ungrantableCapabilities(["chat.read"], [])).toEqual([]);
  });

  test("a requested capability the manifest never declared is returned (the install refusal)", () => {
    expect(ungrantableCapabilities(["chat.read"], ["chat.read", "net.fetch"])).toEqual(["net.fetch"]);
    expect(ungrantableCapabilities([], ["storage.kv"])).toEqual(["storage.kv"]);
  });

  test("duplicates in the request collapse, order follows the request", () => {
    expect(ungrantableCapabilities(["chat.read"], ["net.fetch", "notify", "net.fetch"])).toEqual(["net.fetch", "notify"]);
  });
});

describe("normalizeGrant", () => {
  test("returns the confirmed subset in DECLARATION order, de-duplicated", () => {
    expect(normalizeGrant(["chat.read", "net.fetch", "notify"], ["notify", "chat.read", "chat.read"])).toEqual(["chat.read", "notify"]);
  });

  test("a paranoid owner may confirm nothing", () => {
    expect(normalizeGrant(["chat.read", "net.fetch"], [])).toEqual([]);
  });
});

describe("newlyDeclaredCapabilities", () => {
  test("an upgrade declaring only previously-granted caps needs no re-grant (empty)", () => {
    expect(newlyDeclaredCapabilities(["chat.read"], ["chat.read", "net.fetch"])).toEqual([]);
    expect(newlyDeclaredCapabilities([], ["chat.read"])).toEqual([]);
  });

  test("a capability newly DECLARED but never previously granted forces re-grant", () => {
    expect(newlyDeclaredCapabilities(["chat.read", "net.fetch"], ["chat.read"])).toEqual(["net.fetch"]);
  });

  test("a cap declared before but NOT in the prior grant still counts as newly-declared (re-confirm)", () => {
    // The owner declined `net.fetch` last time (granted only chat.read); re-declaring it must re-prompt.
    expect(newlyDeclaredCapabilities(["chat.read", "net.fetch"], ["chat.read"])).toEqual(["net.fetch"]);
  });
});

describe("widenedNetHosts", () => {
  test("a host the prior manifest never declared is a WIDENING (the P3-H re-arm)", () => {
    // The attack this exists for: the capability set is byte-identical, only the destination moved.
    expect(widenedNetHosts(["collector.attacker.example"], ["api.vendor.example"])).toEqual(["collector.attacker.example"]);
    // Additive widening — the old host is kept, a new one is bolted on.
    expect(widenedNetHosts(["api.vendor.example", "collector.attacker.example"], ["api.vendor.example"])).toEqual(["collector.attacker.example"]);
    // The first-ever declaration of a host list is a widening too (nothing was confirmed before).
    expect(widenedNetHosts(["api.vendor.example"], [])).toEqual(["api.vendor.example"]);
  });

  test("an unchanged or strictly NARROWING list is NOT a widening (consent to {A,B} covers {A})", () => {
    expect(widenedNetHosts(["api.vendor.example"], ["api.vendor.example"])).toEqual([]);
    expect(widenedNetHosts(["a.example"], ["a.example", "b.example"])).toEqual([]);
    // `net.fetch` dropped whole — reach shrinks to nothing, nothing to re-confirm.
    expect(widenedNetHosts([], ["a.example", "b.example"])).toEqual([]);
    // Re-ordering is not a change of reach.
    expect(widenedNetHosts(["b.example", "a.example"], ["a.example", "b.example"])).toEqual([]);
  });

  test("case is NOT a widening — it is folded exactly as the enforcer folds it (coupled: egress hostAllowed)", () => {
    // `hostAllowed` lowercases each entry, so these two spellings reach the identical host. Prompting here would
    // be a false re-consent, and false prompts are how a real one stops being read.
    expect(widenedNetHosts(["API.Vendor.Example"], ["api.vendor.example"])).toEqual([]);
    expect(widenedNetHosts(["api.vendor.example"], ["API.VENDOR.EXAMPLE"])).toEqual([]);
  });

  test("a trailing dot IS a different entry — the FQDN form is a fail-closed dud on this tree, both directions prompt", () => {
    // `hostAllowed` lowercases an entry but does NOT strip its trailing dot, while the REQUEST host has its dot
    // stripped — so an `example.com.` entry matches nothing. dud → live is therefore a genuine widening.
    expect(widenedNetHosts(["api.vendor.example"], ["api.vendor.example."])).toEqual(["api.vendor.example"]);
    // live → dud reaches LESS, and this still reports it: the fold is a string identity beyond case, and it does
    // not re-model the enforcer's dud rule in a second place that would have to track it. The cost is one
    // spurious re-consent on a spelling nobody writes; the direction of that error is fail-SAFE, which is the
    // only direction a consent gate may err in.
    expect(widenedNetHosts(["api.vendor.example."], ["api.vendor.example"])).toEqual(["api.vendor.example."]);
  });

  test("duplicates collapse and the reported spelling is the manifest's own", () => {
    expect(widenedNetHosts(["New.Example", "new.example"], [])).toEqual(["New.Example"]);
  });
});

// The DISPLAY half of the same fact — what the re-consent notice marks "New", persisted on the row because
// the comparison is only possible before the upgrade overwrites the prior manifest (#659). `widenedNetHosts`
// answers "what did THIS upgrade add" (the right trigger question); this answers "what is the owner still
// being asked about" (the right display question), and they differ exactly when a widening goes unanswered.
describe("pendingWidenedNetHosts", () => {
  test("with nothing carried it is the plain widening — the ordinary first-refusal case", () => {
    expect(pendingWidenedNetHosts(["api.vendor.example", "collector.attacker.example"], ["api.vendor.example"], [])).toEqual(["collector.attacker.example"]);
    expect(pendingWidenedNetHosts(["api.vendor.example"], ["api.vendor.example"], [])).toEqual([]);
  });

  test("an EARLIER unanswered widening stays marked when a later upgrade adds another", () => {
    // The defect this accumulation exists for. v2 added X (refused, recorded); v3 adds Y. Judged against v2's
    // manifest, v3 widens only Y — so a REPLACE would render X unmarked beside a marked Y, and on a consent
    // surface an unmarked host reads as "carried forward, you already allowed this". X was never allowed.
    expect(
      pendingWidenedNetHosts(
        ["a.vendor.example", "x.attacker.example", "y.attacker.example"],
        ["a.vendor.example", "x.attacker.example"],
        ["x.attacker.example"],
      ),
    ).toEqual(["x.attacker.example", "y.attacker.example"]);
  });

  test("a carried host the new manifest DROPPED is gone — unreachable, so nothing left to consent to", () => {
    expect(pendingWidenedNetHosts(["a.vendor.example"], ["a.vendor.example", "x.attacker.example"], ["x.attacker.example"])).toEqual([]);
  });

  test("a host consented to earlier is NOT marked just because a later upgrade widened elsewhere", () => {
    // The false-badge direction, which is the one that matters most: `a.vendor.example` was in the prior
    // manifest and is not carried, so only the genuinely new destination is marked. An earlier revision of
    // this surface badged EVERY host on a re-consent — that is the lie this whole column exists to retire.
    expect(pendingWidenedNetHosts(["a.vendor.example", "new.attacker.example"], ["a.vendor.example"], [])).toEqual(["new.attacker.example"]);
  });

  test("the result is spelled and ordered as the NEW manifest declares, de-duplicated", () => {
    // The mark is matched against the rendered list by exact string, and the rendered list is this manifest's
    // own `netHosts` — so a carried host the new manifest RE-SPELLS must come back in the new spelling, or the
    // client's membership test silently misses it and the badge vanishes.
    expect(pendingWidenedNetHosts(["X.Attacker.Example", "x.attacker.example"], [], ["x.attacker.example"])).toEqual(["X.Attacker.Example"]);
  });

  test("case is not identity here either — the one fold, shared with the enforcer", () => {
    expect(pendingWidenedNetHosts(["API.Vendor.Example"], ["api.vendor.example"], [])).toEqual([]);
  });
});
