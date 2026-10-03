// verbs: getVersion + checkForUpdate (owner ask 2026-09-18) — the two deployment-global reads behind
// Settings → This install, through the real service assembly.
//
// Load-bearing here (the pure verdict tables themselves are pinned in tests/kit/version-identity):
//   • `getVersion` reports the INJECTED identity verbatim — no re-derivation, no reshaping.
//   • the build's OWN CHANNEL picks the probe: a main build compares its commit with main's head, a stable
//     build compares its version with the latest release, and neither ever runs the other's probe.
//   • a probe REFUSAL becomes `unknown` CARRYING THE PROBE'S OWN REASON. This is the arm that matters: if
//     the verb swallowed the reason, the About surface would print an unexplained "couldn't check", and if
//     it swallowed the failure entirely it would print "up to date" on an offline box.
//   • neither verb reads the db or takes a principal — the property that makes their cross-tenant-sweep
//     exemption true rather than asserted.

import type { UpstreamOf, UpstreamProbeResult, UpstreamProbes, VersionIdentity } from "@orb/kit/version-identity";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { HARNESS_VERSION, makeHarness } from "../_support.ts";

const MAIN_HEAD = { channel: "main", commit: "f00dcafe1234567890abcdef1234567890abcdef", short: "f00dcafe1234", committedAt: "2026-09-17T12:00:00Z" } as const;
const LATEST_RELEASE = { channel: "stable", version: "0.2.0", publishedAt: "2026-10-01T12:00:00Z" } as const;
const STABLE_BUILD: VersionIdentity = { ...HARNESS_VERSION, version: "0.1.0", channel: "stable" };
const OFFLINE = { ok: false, reason: "GitHub is rate-limiting this box" } as const;

/** Probes that answer as given and record which channel was asked. */
function probes(
  answers: { readonly main?: UpstreamProbeResult<UpstreamOf<"main">>; readonly stable?: UpstreamProbeResult<UpstreamOf<"stable">> },
  asked: string[],
): UpstreamProbes {
  return {
    main: (): Promise<UpstreamProbeResult<UpstreamOf<"main">>> => {
      asked.push("main");
      return Promise.resolve(answers.main ?? OFFLINE);
    },
    stable: (): Promise<UpstreamProbeResult<UpstreamOf<"stable">>> => {
      asked.push("stable");
      return Promise.resolve(answers.stable ?? OFFLINE);
    },
  };
}

describe("getVersion", () => {
  test("reports the injected build identity verbatim — the same block /healthz and a bug bundle carry", async () => {
    const h = makeHarness(await freshDb());
    expect(h.svc.getVersion()).toEqual(HARNESS_VERSION);
  });
});

describe("checkForUpdate on a main build", () => {
  test("main's head MATCHING the local commit is up-to-date, and only the main probe runs", async () => {
    const asked: string[] = [];
    const h = makeHarness(await freshDb(), {
      probeUpstream: probes({ main: { ok: true, upstream: { ...MAIN_HEAD, commit: HARNESS_VERSION.commit, short: HARNESS_VERSION.short } } }, asked),
    });
    const verdict = await h.svc.checkForUpdate();
    expect(verdict.status).toBe("up-to-date");
    expect(verdict.local).toBe(HARNESS_VERSION.commit);
    expect(asked).toEqual(["main"]);
  });

  test("a DIFFERENT head is behind, and the remote rides along so the surface can name it", async () => {
    const h = makeHarness(await freshDb(), { probeUpstream: probes({ main: { ok: true, upstream: MAIN_HEAD } }, []) });
    const verdict = await h.svc.checkForUpdate();
    expect(verdict.status).toBe("behind");
    expect(verdict.remote).toEqual(MAIN_HEAD);
  });

  test("a probe REFUSAL is `unknown` and keeps the probe's own words — never a silent up-to-date", async () => {
    const h = makeHarness(await freshDb(), { probeUpstream: probes({}, []) });
    const verdict = await h.svc.checkForUpdate();
    expect(verdict.status).toBe("unknown");
    expect(verdict.reason).toBe(OFFLINE.reason);
    expect(verdict.remote).toBeNull();
  });

  test("the default harness probes (which refuse) still yield a well-formed verdict — no test reaches the network", async () => {
    const h = makeHarness(await freshDb());
    const verdict = await h.svc.checkForUpdate();
    expect(verdict.status).toBe("unknown");
    expect(verdict.reason).not.toBeNull();
  });
});

describe("checkForUpdate on a stable build", () => {
  test("a newer latest release is behind, compared by VERSION, and only the release probe runs", async () => {
    const asked: string[] = [];
    const h = makeHarness(await freshDb(), {
      versionIdentity: STABLE_BUILD,
      probeUpstream: probes({ stable: { ok: true, upstream: LATEST_RELEASE }, main: { ok: true, upstream: MAIN_HEAD } }, asked),
    });
    const verdict = await h.svc.checkForUpdate();
    expect(verdict).toEqual({ status: "behind", local: "0.1.0", remote: LATEST_RELEASE, reason: null });
    expect(asked).toEqual(["stable"]);
  });

  test("the latest release equal to this build is up-to-date, whatever main's head says", async () => {
    const h = makeHarness(await freshDb(), {
      versionIdentity: { ...STABLE_BUILD, version: LATEST_RELEASE.version },
      probeUpstream: probes({ stable: { ok: true, upstream: LATEST_RELEASE }, main: { ok: true, upstream: MAIN_HEAD } }, []),
    });
    expect((await h.svc.checkForUpdate()).status).toBe("up-to-date");
  });

  test("a failed release lookup is `unknown` with the probe's reason", async () => {
    const h = makeHarness(await freshDb(), {
      versionIdentity: STABLE_BUILD,
      probeUpstream: probes({ stable: { ok: false, reason: "no stable release has been published on GitHub yet" } }, []),
    });
    const verdict = await h.svc.checkForUpdate();
    expect(verdict.status).toBe("unknown");
    expect(verdict.reason).toBe("no stable release has been published on GitHub yet");
  });
});
