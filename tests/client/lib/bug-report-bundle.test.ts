// The bug-report bundle's ROUTE reduction (#1535) — the security half of this module.
//
// A bug-report artifact is a durable file the owner attaches to an issue or hands to an agent, and the only
// scrub the server applies to it is BY VALUE over env-derived secret literals
// (`foundation/observability/debug/bug-report.ts::secretLiterals`), which cannot see a credential that arrived
// in a URL. So a report taken on an OAuth callback would have written `?code=…` into the artifact verbatim —
// the same class #1473 already fixed for the client-error TELEMETRY line, missed on the artifact.
//
// Driven through `bugReportRouteFrom` rather than `readRoute`: the reducer takes the `Location` slice INCLUDING
// the parts it drops, precisely so a node lane can hand it a hostile URL. `readRoute` is the DOM read on top of
// it and adds no decision. Imported by deep path — the bundle builder is deliberately NOT in the lib barrel
// (it is a dev-instrument internal), the `render-stats.test.ts` posture.

import { bugReportRouteFrom, buildBugReportClientBundle } from "../../../packages/client/src/lib/bug-report-bundle.ts";
import { expect, test } from "../../support/fixtures.ts";

/** A real OAuth-callback location: the authorization CODE and the CSRF `state` in the query, plus a token in
 *  the fragment (the implicit-flow shape). Nothing here is a real credential — the assertions are by value, so
 *  the literals only have to be findable. */
const OAUTH_CALLBACK = {
  origin: "https://orb.example",
  pathname: "/login",
  search: "?code=authz-code-do-not-ship-9f3a&state=csrf-state-do-not-ship-71bc",
  hash: "#access_token=implicit-token-do-not-ship-5e20",
} as const;

const LEAKED_LITERALS = ["authz-code-do-not-ship-9f3a", "csrf-state-do-not-ship-71bc", "implicit-token-do-not-ship-5e20"] as const;

test("bugReportRouteFrom keeps origin + path and drops the query string and the fragment", () => {
  const route = bugReportRouteFrom({ location: OAUTH_CALLBACK, section: "Login", shell: null });

  expect(route).toEqual({ origin: "https://orb.example", pathname: "/login", section: "Login", shell: null });
  // The route object is the whole surface — no `href`/`search`/`hash` field survives for a query to ride in.
  expect(Object.keys(route).toSorted()).toEqual(["origin", "pathname", "section", "shell"]);
});

// THE ARTIFACT-LEVEL PIN, and the one that would have caught the defect: the reduction is worthless if some
// other field on the bundle carries the same bytes. Serialize the assembled bundle exactly as `submitBugReport`
// does and search it for each literal by value.
test("an OAuth code/state/fragment token never reaches the serialized bundle", () => {
  const bundle = buildBugReportClientBundle({
    note: "the login button did nothing",
    window: { requestedFromAt: 1000, fromAt: 900, padMs: 100, capturedAt: 2000, requestedMinutes: 5 },
    route: bugReportRouteFrom({ location: OAUTH_CALLBACK, section: "Login", shell: { room: null } }),
    environment: {
      userAgent: "test-agent",
      viewport: { width: 1280, height: 800 },
      devicePixelRatio: 1,
      maxTouchPoints: 0,
      prefersReducedMotion: false,
      appearance: {},
    },
    slices: {},
    checkpointTotals: { bridge: false },
  });

  const serialized = JSON.stringify(bundle);
  for (const literal of LEAKED_LITERALS) {
    expect(serialized, literal).not.toContain(literal);
  }
  // …and the diagnostic value the reduction is NOT allowed to cost: which route the owner was on.
  expect(bundle.route.pathname).toBe("/login");
  expect(bundle.route.origin).toBe("https://orb.example");
});

// The reducer must not "helpfully" reconstruct a full URL, and must not care whether the hostile parts are
// present at all — a clean location reduces to the same two fields.
test("a location with no query or fragment reduces to the same two fields", () => {
  const route = bugReportRouteFrom({
    location: { origin: "http://localhost:5173", pathname: "/", search: "", hash: "" },
    section: null,
    shell: null,
  });
  expect(route).toEqual({ origin: "http://localhost:5173", pathname: "/", section: null, shell: null });
});
