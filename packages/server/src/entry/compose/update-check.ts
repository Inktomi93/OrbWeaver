// `probeUpstreamHead` op impl — the network half of Settings → About's "check for updates" button, extracted
// from the composition root so its failure mapping is unit-testable with an injected fetch (the
// `materialize-background.ts` precedent beside it).
//
// IT IS A MANUAL CHECK AND NOTHING ELSE (owner ask 2026-09-18, "stay in sync with github"): ONE click, ONE
// unauthenticated GET of the public branch head. No polling timer, no background job, no persisted state, no
// telemetry — nothing leaves this box but an HTTP GET for a commit sha, and nothing about this box is sent.
// The comparison itself is pure and lives in `@orb/kit/version-identity`.
//
// EGRESS: `safeFetch` with an EXACT host pin. `api.github.com` is public, so the belt's unconditional
// private-range denial admits it with no `ownerConfiguredEndpoint` exemption; the host allowlist is the one
// line that keeps this op from becoming a general-purpose fetcher if its URL ever grows an input.
//
// EVERY FAILURE IS A NAMED REASON, never a throw: offline, rate-limited (GitHub's unauthenticated budget is
// per source IP and this shares it with everything else on the box), a shape the payload did not have. The
// About surface prints the reason under an `unknown` verdict, because "couldn't check" and "you are current"
// must never render the same.

import type { UpstreamHeadProbe, UpstreamProbeResult } from "@orb/kit/version-identity";
import { shortCommit } from "@orb/kit/version-identity";
import { z } from "zod";
import { APP_NAME, APP_URL } from "#foundation/config";
import type { SafeFetchOptions, SafeFetchResult } from "#infra/network";
import { safeFetch } from "#infra/network";

/** The upstream this build is compared against — the repo `APP_URL` already names, on its default branch.
 *  Constants rather than settings: "which GitHub repo is Orbweaver" is not a per-deployment knob, and an
 *  operator-editable upstream would turn a fixed GET into an arbitrary-URL fetcher. */
const UPSTREAM_HOST = "api.github.com";
const UPSTREAM_BRANCH = "main";
const UPSTREAM_URL = `https://${UPSTREAM_HOST}/repos/Inktomi93/orbweaver/commits/${UPSTREAM_BRANCH}`;

const OK_STATUS_MIN = 200;
const OK_STATUS_MAX = 300;
const RATE_LIMITED = 403;
const TOO_MANY_REQUESTS = 429;
/** A commit payload is a few KB; the cap bounds a hostile or redirected body without ever being reached. */
const MAX_BYTES = 200_000;
/** Shorter than the egress default: this fires on a click with a spinner under it, so a wedged connection
 *  must become a printed "couldn't reach GitHub" while the person is still looking at the button. */
const DEADLINE_MS = 8000;

/** The two fields this op reads out of GitHub's commit payload. Everything else it returns is ignored by
 *  construction — `.parse` on a narrow schema means a payload reshuffle degrades to a named `unknown`
 *  verdict instead of an undefined sha rendering as a mismatch. */
const commitPayload = z.object({
  sha: z.string().min(1),
  commit: z.object({ committer: z.object({ date: z.string().min(1) }).partial() }).partial(),
});

export interface UpstreamHeadProbeDeps {
  /** The identity this box reports — its `version` rides the User-Agent so GitHub's logs (and ours) can tell
   *  which build asked. Never a user id, never a deployment identifier. */
  readonly localVersion: () => string;
  /** Test seam; defaults to the real `safeFetch`. */
  readonly fetchImpl?: (url: string, options: SafeFetchOptions) => Promise<SafeFetchResult>;
}

/** Map a non-2xx status onto a reason a person can act on. GitHub answers 403 (with a rate-limit header) or
 *  429 when the unauthenticated budget for this IP is spent — telling someone "try again later" is useful;
 *  telling them "unreachable" would send them to look at their network. */
function statusReason(status: number): string {
  if (status === RATE_LIMITED || status === TOO_MANY_REQUESTS) {
    return "GitHub is rate-limiting this box's anonymous requests — try again in a few minutes";
  }
  return `GitHub answered ${String(status)}`;
}

export function createProbeUpstreamHead(deps: UpstreamHeadProbeDeps): UpstreamHeadProbe {
  const fetchImpl = deps.fetchImpl ?? safeFetch;
  return async (): Promise<UpstreamProbeResult> => {
    let res: SafeFetchResult;
    try {
      res = await fetchImpl(UPSTREAM_URL, {
        allowedHosts: [UPSTREAM_HOST],
        method: "GET",
        headers: {
          accept: "application/vnd.github+json",
          // GitHub refuses an anonymous request with no User-Agent outright, so this is required, not polish.
          "user-agent": `${APP_NAME}/${deps.localVersion()} (+${APP_URL})`,
        },
        maxBytes: MAX_BYTES,
        deadlineMs: DEADLINE_MS,
        allowedContentTypes: ["application/json"],
      });
    } catch {
      // The refusal IS the product: offline, DNS failure, deadline and every egress denial collapse to the
      // one thing the About surface can say, and the belt has already logged its own securityEvent for the
      // denials that matter. No waiver is owed — the owner is machine-visible (the returned typed refusal,
      // which the caller must branch on), which is why the caught-failure gate does not report this site.
      return { ok: false, reason: "couldn't reach GitHub — this box may be offline" };
    }
    if (res.status < OK_STATUS_MIN || res.status >= OK_STATUS_MAX) {
      res.dispose?.();
      return { ok: false, reason: statusReason(res.status) };
    }
    let text: string;
    try {
      text = new TextDecoder().decode(await res.bytes());
    } catch {
      // A body that exceeded the cap or died mid-read is the same "couldn't read the answer" the parse arm
      // below reports; there is no second thing a reader could do with it.
      return { ok: false, reason: "GitHub's answer could not be read" };
    }
    return parseUpstream(text);
  };
}

/** Parse the commit payload into the head, or a named reason. Exported for the spec: this is the arm that
 *  turns a foreign shape into either a comparison input or an honest refusal. */
export function parseUpstream(body: string): UpstreamProbeResult {
  // A non-JSON or reshaped payload becomes a named refusal — the ONLY alternative is pretending to know the
  // upstream head, which is the exact failure this whole check exists to avoid.
  try {
    const parsed = commitPayload.parse(JSON.parse(body));
    return {
      ok: true,
      head: { commit: parsed.sha, short: shortCommit(parsed.sha), committedAt: parsed.commit.committer?.date ?? null },
    };
  } catch {
    return { ok: false, reason: "GitHub's answer was not the commit payload this check expects" };
  }
}
