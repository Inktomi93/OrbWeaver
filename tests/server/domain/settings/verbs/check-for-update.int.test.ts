// verbs: getVersion + checkForUpdate (owner ask 2026-09-18) — the two deployment-global reads behind
// Settings → About, through the real service assembly.
//
// Load-bearing here (the pure verdict table itself is pinned in tests/kit/version-identity):
//   • `getVersion` reports the INJECTED identity verbatim — no re-derivation, no reshaping.
//   • the verdict COMPARES THE LOCAL COMMIT to what the injected probe returned — the wiring, which the
//     pure engine's spec cannot see.
//   • a probe REFUSAL becomes `unknown` CARRYING THE PROBE'S OWN REASON. This is the arm that matters: if
//     the verb swallowed the reason, the About surface would print an unexplained "couldn't check", and if
//     it swallowed the failure entirely it would print "up to date" on an offline box.
//   • neither verb reads the db or takes a principal — the property that makes their cross-tenant-sweep
//     exemption true rather than asserted.

import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { HARNESS_VERSION, makeHarness } from "../_support.ts";

const UPSTREAM = { commit: "f00dcafe1234567890abcdef1234567890abcdef", short: "f00dcafe1234", committedAt: "2026-09-17T12:00:00Z" };

describe("getVersion", () => {
  test("reports the injected build identity verbatim — the same block /healthz and a bug bundle carry", async () => {
    const h = makeHarness(await freshDb());
    expect(h.svc.getVersion()).toEqual(HARNESS_VERSION);
  });
});

describe("checkForUpdate", () => {
  test("the upstream head MATCHING the local commit is up-to-date", async () => {
    const h = makeHarness(await freshDb(), {
      probeUpstreamHead: () => Promise.resolve({ ok: true, head: { ...UPSTREAM, commit: HARNESS_VERSION.commit, short: HARNESS_VERSION.short } }),
    });
    const verdict = await h.svc.checkForUpdate();
    expect(verdict.status).toBe("up-to-date");
    expect(verdict.local).toBe(HARNESS_VERSION.commit);
  });

  test("a DIFFERENT upstream head is behind, and the remote rides along so the surface can name it", async () => {
    const h = makeHarness(await freshDb(), { probeUpstreamHead: () => Promise.resolve({ ok: true, head: UPSTREAM }) });
    const verdict = await h.svc.checkForUpdate();
    expect(verdict.status).toBe("behind");
    expect(verdict.remote).toEqual(UPSTREAM);
  });

  test("a probe REFUSAL is `unknown` and keeps the probe's own words — never a silent up-to-date", async () => {
    const h = makeHarness(await freshDb(), { probeUpstreamHead: () => Promise.resolve({ ok: false, reason: "GitHub is rate-limiting this box" }) });
    const verdict = await h.svc.checkForUpdate();
    expect(verdict.status).toBe("unknown");
    expect(verdict.reason).toBe("GitHub is rate-limiting this box");
    expect(verdict.remote).toBeNull();
  });

  test("the default harness probe (which refuses) still yields a well-formed verdict — no test reaches the network", async () => {
    const h = makeHarness(await freshDb());
    const verdict = await h.svc.checkForUpdate();
    expect(verdict.status).toBe("unknown");
    expect(verdict.reason).not.toBeNull();
  });
});
