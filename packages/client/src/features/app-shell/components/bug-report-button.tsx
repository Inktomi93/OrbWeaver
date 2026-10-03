// The top-rail "Report a bug" form, in every build. The production path prepares a public summary the user
// reads before it leaves the page, copies it and opens a prefilled GitHub issue, or downloads the same report
// as JSON; nothing is sent anywhere without the user's click. The developer capture to `bug-reports/` (the
// `/api/_debug` flight recorders) rides beside it only when `devCapture` is on, which the chrome entry ties to
// `IS_DEV`. A CT builds in production mode, so its CT mounts this component directly with `devCapture` set.
//
// THE PUBLIC PATH READS NO DEVELOPER RECORDER. Its inputs are the production error ring, device facts and the
// owner-gated `bugReportDiagnostics` read; the `__orb` bridge and the dev rings never reach it.

import { resolveEvidenceWindow } from "@orb/kit/evidence-window";
import { Button } from "@orb/ui/button";
import { Bug, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { useTRPC } from "#data";
import type { BugReportServerFacts, PublicBugReport } from "#lib";
import { buildPublicBugReport, copyWithNotice, downloadJson, IS_DEV, publicBugReportIssueUrl } from "#lib";
import { captureBugReportBundle, submitBugReport } from "../lib/bug-report-capture.ts";
import type { PreparedBugReport } from "../lib/bug-report-public-capture.ts";
import { preparePublicBugReport } from "../lib/bug-report-public-capture.ts";

/** The offered "when did it happen" answers. `null` is "right now / no window" — everything the rings still
 *  hold. The set is coarse on purpose: the ask is a human estimate, and the capture pads it by a minute
 *  (`@orb/kit/evidence-window`), so finer options would promise a precision the input does not have. */
const WHEN_OPTIONS: readonly { readonly value: string; readonly label: string; readonly minutes: number | null }[] = [
  { value: "now", label: "Just now", minutes: null },
  { value: "5", label: "~5 minutes ago", minutes: 5 },
  { value: "15", label: "~15 minutes ago", minutes: 15 },
  { value: "60", label: "~1 hour ago", minutes: 60 },
];

/** The copy-failure toast's next step: the preview field holds the same text. */
const COPY_FALLBACK = "Select the report text in the form and copy it by hand.";

type Status =
  | { readonly kind: "idle" }
  | { readonly kind: "preparing" }
  | { readonly kind: "prepared" }
  | { readonly kind: "opened"; readonly truncated: boolean }
  | { readonly kind: "downloaded" }
  | { readonly kind: "saving" }
  | { readonly kind: "saved"; readonly id: string; readonly path: string }
  | { readonly kind: "failed"; readonly reason: string };

/** The failed arm for a thrown value, from either half of the capture (the synchronous assembly or the POST).
 *  A non-Error throw still names itself rather than reading as "undefined" in the status line. */
function failedStatus(error: unknown): Status {
  return { kind: "failed", reason: error instanceof Error ? error.message : String(error) };
}

interface BugReportButtonProps {
  /** Offer the developer capture to `bug-reports/` beside the public outputs. */
  readonly devCapture: boolean;
  /** Read the server's version and diagnostics. A half that fails resolves to `null`, never a throw. */
  readonly loadServerFacts: () => Promise<BugReportServerFacts>;
}

/** The report for the current form state, or `null` until one is prepared. */
function reportFor(prepared: PreparedBugReport | null, note: string, when: (typeof WHEN_OPTIONS)[number]): PublicBugReport | null {
  if (prepared === null) {
    return null;
  }
  return buildPublicBugReport({
    whatHappened: note,
    when: when.label,
    window: resolveEvidenceWindow(prepared.capturedAt, when.minutes),
    server: prepared.server,
    browser: prepared.browser,
    pathname: prepared.pathname,
    browserErrors: prepared.browserErrors,
  });
}

/** The top-rail bug-report affordance. Its chrome entry below wires the real server reads; the CT mounts it
 *  directly (a CT's production build cannot reach the dev-gated capture — see the header).
 *  @public Test-anchored module surface; the CT fixtures mount it with each `devCapture` arm. */
export function BugReportButton({ devCapture, loadServerFacts }: BugReportButtonProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [whenValue, setWhenValue] = useState<string>("now");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [prepared, setPrepared] = useState<PreparedBugReport | null>(null);

  const when = WHEN_OPTIONS.find((option) => option.value === whenValue) ?? WHEN_OPTIONS[0];
  const hasNote = note.trim() !== "";
  const busy = status.kind === "saving" || status.kind === "preparing";
  const report = hasNote && when !== undefined ? reportFor(prepared, note, when) : null;
  const issue = report === null ? null : publicBugReportIssueUrl(report);

  // Every close path runs through here, so a reopened form prepares fresh reads instead of showing old ones.
  const changeOpen = (next: boolean): void => {
    setOpen(next);
    if (!next) {
      setPrepared(null);
      setStatus({ kind: "idle" });
    }
  };

  const prepare = (): void => {
    if (!hasNote || busy) {
      return;
    }
    setStatus({ kind: "preparing" });
    void loadServerFacts()
      .then((server) => {
        setPrepared(preparePublicBugReport(server));
        setStatus({ kind: "prepared" });
      })
      .catch((error: unknown) => {
        setStatus(failedStatus(error));
      });
  };

  // Copy first, then open: both start inside the click, which is what lets the browser open the tab.
  const share = (): void => {
    if (report === null || issue === null) {
      return;
    }
    copyWithNotice(report.summary, COPY_FALLBACK);
    globalThis.open(issue.url, "_blank", "noopener,noreferrer");
    setStatus({ kind: "opened", truncated: issue.truncated });
  };

  const download = (): void => {
    if (report === null) {
      return;
    }
    downloadJson(`orbweaver-bug-report-${report.bundle.createdAt.replaceAll(":", "-")}.json`, report.bundle);
    setStatus({ kind: "downloaded" });
  };

  // THE DEV CAPTURE'S ASSEMBLY IS INSIDE THE TRY, not just the POST. `captureBugReportBundle` reads the
  // location, the environment and every `__orb` census handle with no catch of its own, so a census provider
  // that throws is a SYNCHRONOUS throw out of this handler — a button that silently wedges at "Capturing…" is
  // the one state it must never enter, so both halves report through the same failed arm.
  const capture = (): void => {
    const trimmed = note.trim();
    if (trimmed === "" || busy) {
      return;
    }
    setStatus({ kind: "saving" });
    try {
      const bundle = captureBugReportBundle({ note: trimmed, windowMinutes: when?.minutes ?? null });
      void submitBugReport(bundle)
        .then((result) => {
          setStatus(result.ok ? { kind: "saved", id: result.id, path: result.json } : { kind: "failed", reason: result.reason });
          if (result.ok) {
            setNote("");
          }
        })
        .catch((error: unknown) => {
          setStatus(failedStatus(error));
        });
    } catch (error: unknown) {
      setStatus(failedStatus(error));
    }
  };

  return (
    <Popover modal={true} onOpenChange={changeOpen} open={open}>
      {/* `modal` — this popover carries INPUT; the rule + its receipt live on `Popover` in @orb/ui's popover.tsx (#2444). */}
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button intent="ghost" size="icon" className="shell-topbar-icon-btn" aria-label="Report a bug">
                  <Icon icon={Bug} size="sm" />
                </Button>
              }
            />
          }
        />
        <TooltipPopup side="bottom">Report a bug</TooltipPopup>
      </Tooltip>
      <PopoverPopup aria-label="Report a bug">
        <Stack gap="row" className="min-w-80">
          <Text voice="label">What happened?</Text>
          <Textarea
            aria-label="What happened?"
            rows={4}
            value={note}
            onChange={(event): void => setNote(event.target.value)}
            placeholder="What you did, and what went wrong."
          />
          <Text voice="label">When?</Text>
          <RadioGroup aria-label="When did it happen?" value={whenValue} onValueChange={(next): void => setWhenValue(String(next))}>
            {WHEN_OPTIONS.map((option) => (
              <RadioGroupItem key={option.value} value={option.value}>
                <Text as="span" voice="label">
                  {option.label}
                </Text>
              </RadioGroupItem>
            ))}
          </RadioGroup>
          <Row gap="field" align="center" className="flex-wrap">
            <Button type="button" intent="primary" size="sm" disabled={!hasNote || busy} onClick={prepare}>
              {status.kind === "preparing" ? "Preparing…" : "Prepare report"}
            </Button>
            {devCapture ? (
              <Button type="button" intent="secondary" size="sm" disabled={!hasNote || busy} onClick={capture}>
                {status.kind === "saving" ? "Capturing…" : "Capture report"}
              </Button>
            ) : null}
          </Row>
          {report === null || issue === null ? null : (
            <Stack gap="row" data-slot="bug-report-public">
              <Text voice="gloss">
                This is everything the report shares. It leaves out your chats, characters, personas, keys and error messages. Read it, then open the issue or
                save the file.
              </Text>
              <Textarea aria-label="Report to share" readOnly={true} rows={8} value={report.summary} />
              <Row gap="field" align="center" className="flex-wrap">
                <Button type="button" intent="primary" size="sm" onClick={share}>
                  Copy and open a GitHub issue
                </Button>
                <Button type="button" intent="secondary" size="sm" onClick={download}>
                  Download diagnostics
                </Button>
              </Row>
            </Stack>
          )}
          {/* One live region for every outcome — a capture that silently succeeded is indistinguishable from
              one that silently failed, and this button's whole value is the user trusting it fired. */}
          <Text role="status" voice="quiet" data-slot="bug-report-status">
            {statusLine(status)}
          </Text>
        </Stack>
      </PopoverPopup>
    </Popover>
  );
}

/** The chrome entry's body: the form wired to the live tRPC reads. Each half resolves to `null` on failure, so
 *  a server that is down still yields a report that says so. `staleTime: 0` on the diagnostics: an error census
 *  from earlier in the session is not the one the user is reporting. */
export function ReportBugChromeButton(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const loadServerFacts = async (): Promise<BugReportServerFacts> => {
    const [version, diagnostics] = await Promise.allSettled([
      queryClient.fetchQuery(trpc.settings.getVersion.queryOptions()),
      queryClient.fetchQuery({ ...trpc.bugReportDiagnostics.queryOptions(), staleTime: 0 }),
    ]);
    return {
      version: version.status === "fulfilled" ? version.value : null,
      diagnostics: diagnostics.status === "fulfilled" ? diagnostics.value : null,
    };
  };
  return <BugReportButton devCapture={IS_DEV} loadServerFacts={loadServerFacts} />;
}

/** The one status sentence. The saved arm names the FILE, because the dev review ritual is "read the new reports". */
function statusLine(status: Status): string {
  switch (status.kind) {
    case "idle": {
      return "Describe what happened, then prepare the report to read it before it goes anywhere.";
    }
    case "preparing": {
      return "Reading this app's version and recent errors…";
    }
    case "prepared": {
      return "Report ready. Nothing has been sent.";
    }
    case "opened": {
      return status.truncated
        ? "Opened a GitHub issue with the report cut to fit the link. The full report is on your clipboard: paste it over the cut text."
        : "Opened a GitHub issue with the report filled in, and copied it too. Nothing is posted until you submit it there.";
    }
    case "downloaded": {
      return "Saved the report as a file. Attach it to your issue if you want to.";
    }
    case "saving": {
      return "Capturing the page and the server's flight recorders…";
    }
    case "saved": {
      return `Captured ${status.id} → ${status.path}`;
    }
    case "failed": {
      return `Capture failed: ${status.reason}`;
    }
  }
}
