// The About SECTION body (Settings → Admin → About this install) — what this box IS, and one button that
// asks GitHub whether it is still current (owner ask 2026-09-18: "a versioning system to stay in sync with
// github and to help with bug reports").
//
// THE VERSION LINE IS THE PRODUCT HERE. Everything else on this section serves it: it is the string a bug
// report quotes, so it is selectable, copyable in one click, and spelled exactly the way the issue form asks
// for it (`v0.0.0 (823d76f4343a, checkout)`). The commit is SHORT (12) because that is what someone pastes
// into `git show`; the full sha rides the copy, never the eye.
//
// THE UPDATE CHECK IS MANUAL, AND THAT IS THE FEATURE. `enabled: false` + an explicit `refetch()` is the
// whole mechanism: no mount-time fetch, no poll, no timer, no persisted verdict. The box talks to GitHub
// when — and only when — a person presses the button, which is the difference between a convenience and a
// phone-home.
//
// AN UNREACHABLE CHECK NEVER READS AS "you are current". The `unknown` arm renders its own reason, because
// the failure mode that matters is someone glancing at a green line and concluding they are up to date on a
// box that could not reach the network at all.

import type { UpdateCheck, VersionIdentity } from "@orb/kit/version-identity";
import { formatVersionIdentity } from "@orb/kit/version-identity";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { CopyButton } from "@orb/ui/copy-button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId, timeLib } from "#lib";
import { configAnchorId } from "#state";
import { ABOUT_SUBCATEGORY } from "../lib/about-nav.ts";

/** The section's own suspense/error boundary — it reads for itself, so it recovers for itself. */
export function AboutSection(): ReactElement {
  return (
    <QueryBoundary
      fallback={<SkeletonRows count={2} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="this install's version" onRetry={retry} />}
      reserveKey="config.admin.about"
    >
      <AboutBody />
    </QueryBoundary>
  );
}

/** What a report should quote, and what the copy button puts on the clipboard: the human line PLUS the full
 *  sha, because the short form is for reading and the long form is for `git show`. */
function reportLine(version: VersionIdentity): string {
  return version.commit === version.short ? formatVersionIdentity(version) : `${formatVersionIdentity(version)}\ncommit: ${version.commit}`;
}

/** Where the identity came from, in a sentence — the half that explains why `builtAt` is present or absent. */
function provenanceLine(version: VersionIdentity): string {
  return version.builtAt === undefined
    ? "Read from this checkout's git refs at startup."
    : `Stamped into the container image when it was built, ${timeLib.formatDateTime(Date.parse(version.builtAt))}.`;
}

function AboutBody(): ReactElement {
  const trpc = useTRPC();
  const { data: version } = useSuspenseQuery(trpc.settings.getVersion.queryOptions());
  // MANUAL by construction (see the header): nothing fetches until the button calls `refetch`.
  const update = useQuery({ ...trpc.settings.checkForUpdate.queryOptions(), enabled: false });

  return (
    <Section className="@container" divider={true} heading={ABOUT_SUBCATEGORY.label} id={configAnchorId("admin", ABOUT_SUBCATEGORY.id)}>
      <Stack gap="field" data-testid={testId("aboutSection")}>
        <Row align="center" gap="row">
          {/* `datum` — this IS a value, and its mono/tabular setting is what makes a sha readable and
              transcribable by eye when someone is reading it off a screen into an issue. */}
          <Text voice="datum" data-testid={testId("aboutVersionLine")}>
            {formatVersionIdentity(version)}
          </Text>
          <CopyButton copiedHint="Paste it into the bug report." intent="ghost" text={reportLine(version)} what="version for a bug report" />
        </Row>
        <Text voice="gloss">{provenanceLine(version)}</Text>

        <Row align="center" gap="row">
          <Button
            intent="secondary"
            size="sm"
            disabled={update.isFetching}
            onClick={(): void => {
              update.refetch().catch(() => undefined); // the verdict slot below renders the failure
            }}
          >
            {update.isFetching ? "Checking…" : "Check for updates"}
          </Button>
          {update.data === undefined ? null : <UpdateVerdict check={update.data} />}
        </Row>
        {update.error === null ? null : (
          <Text voice="label" className="text-destructive">
            Couldn't run the update check — try again in a moment.
          </Text>
        )}
      </Stack>
    </Section>
  );
}

/** One verdict, rendered as a badge plus the sentence that makes it actionable. The THREE arms are visibly
 *  different on purpose: `behind` names the upstream commit and its date so the reader can go look at it. */
function UpdateVerdict({ check }: { readonly check: UpdateCheck }): ReactElement {
  if (check.status === "up-to-date") {
    return (
      <Row align="center" gap="row" data-testid={testId("aboutUpdateVerdict")}>
        <Badge intent="success">Up to date</Badge>
        <Text voice="gloss">This box is on the newest commit on GitHub.</Text>
      </Row>
    );
  }
  if (check.status === "behind") {
    const committed = check.remote?.committedAt;
    return (
      <Row align="center" gap="row" data-testid={testId("aboutUpdateVerdict")}>
        <Badge intent="warning">Update available</Badge>
        <Text voice="gloss">
          GitHub is on {check.remote?.short ?? "a newer commit"}
          {committed === undefined || committed === null ? "" : `, committed ${timeLib.formatDate(Date.parse(committed))}`}. Pull and rebuild to take it.
        </Text>
      </Row>
    );
  }
  return (
    <Row align="center" gap="row" data-testid={testId("aboutUpdateVerdict")}>
      <Badge intent="neutral">Couldn't check</Badge>
      <Text voice="gloss">{check.reason ?? "The upstream head could not be read."}</Text>
    </Row>
  );
}
