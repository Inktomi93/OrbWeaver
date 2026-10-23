// Fixed, anonymous GitHub GETs only; safeFetch pins the host on every redirect and bounds the body.
// Foreign payloads and network failures become named refusals, never a guessed upstream.

import { SEMVER_RE } from "@orb/kit/semver";
import type { ReleaseChannel, Upstream, UpstreamOf, UpstreamProbeResult, UpstreamProbes } from "@orb/kit/version-identity";
import { ORBWEAVER_REPO_SLUG, shortCommit } from "@orb/kit/version-identity";
import { z } from "zod";
import { APP_NAME, APP_URL } from "#foundation/config";
import type { SafeFetchResult } from "#infra/network";

import type { UpstreamFetchDeps } from "./contract.ts";

/** The upstream this build is compared against — the repo `APP_URL` already names. Constants rather than
 *  settings: "which GitHub repo is Orbweaver" is not a per-deployment knob, and an operator-editable upstream
 *  would turn a fixed GET into an arbitrary-URL fetcher. */
const UPSTREAM_HOST = "api.github.com";
const UPSTREAM_REPO = `https://${UPSTREAM_HOST}/repos/${ORBWEAVER_REPO_SLUG}`;
/** The one URL each channel asks. `releases/latest` is the newest published, non-draft, non-prerelease
 *  release, which is exactly the set release-please publishes. */
const UPSTREAM_URLS: Record<ReleaseChannel, string> = {
  main: `${UPSTREAM_REPO}/commits/main`,
  stable: `${UPSTREAM_REPO}/releases/latest`,
};

const OK_STATUS_MIN = 200;
const OK_STATUS_MAX = 300;
const RATE_LIMITED = 403;
const NOT_FOUND = 404;
const TOO_MANY_REQUESTS = 429;
/** A commit or release payload is a few KB; the cap bounds a hostile or redirected body without ever being
 *  reached. */
const MAX_BYTES = 200_000;
/** Shorter than the egress default: this fires on a click with a spinner under it, so a wedged connection
 *  must become a printed "couldn't reach GitHub" while the person is still looking at the button. */
const DEADLINE_MS = 8000;
/** The fields this op reads out of GitHub's commit payload. Everything else it returns is ignored by
 *  construction — `.parse` on a narrow schema means a payload reshuffle degrades to a named `unknown`
 *  verdict instead of an undefined sha rendering as a mismatch. */
const commitPayload = z.object({
  sha: z.string().min(1),
  commit: z.object({ committer: z.object({ date: z.string().min(1) }).partial() }).partial(),
});

// GitHub's snake_case wire names for the two release fields this op reads, as computed keys so they need no
// `useNamingConvention` suppression: the tag release-please wrote, and when the release went out.
const TAG_NAME = "tag_name";
const PUBLISHED_AT = "published_at";
const releasePayload = z.object({
  [TAG_NAME]: z.string().min(1),
  [PUBLISHED_AT]: z.string().min(1).nullable().optional(),
});

/** A release tag as release-please spells it: `v` then the plain three-part version. */
const RELEASE_TAG_PREFIX = "v";

function statusReason(channel: ReleaseChannel, status: number): string {
  if (status === RATE_LIMITED || status === TOO_MANY_REQUESTS) {
    return "GitHub is rate-limiting this box's anonymous requests — try again in a few minutes";
  }
  if (channel === "stable" && status === NOT_FOUND) {
    return "no stable release has been published on GitHub yet";
  }
  return `GitHub answered ${String(status)}`;
}

/** Construct the uncached, manual upstream reads for each release channel. */
export function createUpstreamFetches(deps: UpstreamFetchDeps): UpstreamProbes {
  const { fetchImpl } = deps;
  async function fetchUpstream<T extends Upstream>(channel: ReleaseChannel, parse: (body: string) => UpstreamProbeResult<T>): Promise<UpstreamProbeResult<T>> {
    let res: SafeFetchResult;
    try {
      res = await fetchImpl(UPSTREAM_URLS[channel], {
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
      // one thing the update-check surface can say, and the belt has already logged its own securityEvent for the
      // denials that matter. No waiver is owed — the owner is machine-visible (the returned typed refusal,
      // which the caller must branch on), which is why the caught-failure gate does not report this site.
      return { ok: false, reason: "couldn't reach GitHub — this box may be offline" };
    }
    if (res.status < OK_STATUS_MIN || res.status >= OK_STATUS_MAX) {
      res.dispose?.();
      return { ok: false, reason: statusReason(channel, res.status) };
    }
    let text: string;
    try {
      text = new TextDecoder().decode(await res.bytes());
    } catch {
      // A body that exceeded the cap or died mid-read is the same "couldn't read the answer" the parse arm
      // below reports; there is no second thing a reader could do with it.
      return { ok: false, reason: "GitHub's answer could not be read" };
    }
    return parse(text);
  }

  return {
    main: () => fetchUpstream("main", parseMainHead),
    stable: () => fetchUpstream("stable", parseLatestRelease),
  };
}

/** Parse GitHub main into a comparison input or a named refusal. */
export function parseMainHead(body: string): UpstreamProbeResult<UpstreamOf<"main">> {
  // A non-JSON or reshaped payload becomes a named refusal — the ONLY alternative is pretending to know the
  // upstream head, which is the exact failure this whole check exists to avoid.
  try {
    const parsed = commitPayload.parse(JSON.parse(body));
    return {
      ok: true,
      upstream: { channel: "main", commit: parsed.sha, short: shortCommit(parsed.sha), committedAt: parsed.commit.committer?.date ?? null },
    };
  } catch {
    return { ok: false, reason: "GitHub's answer was not the commit payload this check expects" };
  }
}

/** Parse the release payload into the latest stable version, or a named reason. A tag that is not
 *  `v<major>.<minor>.<patch>` is refused rather than compared: ordering a foreign tag would be a guess. */
export function parseLatestRelease(body: string): UpstreamProbeResult<UpstreamOf<"stable">> {
  let parsed: z.infer<typeof releasePayload>;
  // Same posture as the commit parse: a reshaped payload is a named refusal, never a guessed version.
  try {
    parsed = releasePayload.parse(JSON.parse(body));
  } catch {
    return { ok: false, reason: "GitHub's answer was not the release payload this check expects" };
  }
  const tag = parsed[TAG_NAME];
  const version = tag.startsWith(RELEASE_TAG_PREFIX) ? tag.slice(RELEASE_TAG_PREFIX.length) : "";
  if (!SEMVER_RE.test(version)) {
    return { ok: false, reason: `the latest release's tag ${tag} is not a v<major>.<minor>.<patch> version` };
  }
  return { ok: true, upstream: { channel: "stable", version, publishedAt: parsed[PUBLISHED_AT] ?? null } };
}
