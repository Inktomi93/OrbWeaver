// The DEV BUG-FOUND BUTTON (#1095) — the owner's one-click capture: click, type what happened, optionally say
// roughly when, submit. Everything else (route, browser facts, appearance carriers, every `__orb` census, a
// console-error ring, and the server's own flight recorders) is collected without being asked for, and lands in
// a durable gitignored file an agent session reads cold at review time.
//
// PLACEMENT — the TOP RAIL, owner-ruled 2026-09-02 ("that feels cleanest"), dev-gated exactly like the rest of
// the dev tooling. It reaches the topbar trail as a registered chrome widget (`lib/bug-report-chrome.tsx`, the
// `fullscreenChrome` idiom): app-shell registers its own chrome through the same door as any feature, so the
// button lands with ZERO edits to `shell-topbar.tsx`.
//
// DEV-GATED VIA THE TYPED `IS_DEV` (lib/dev-flag.ts) at the chrome entry's `useVisible` — never a bare
// `import.meta.env.DEV`, which fails `types:graph` outside main.tsx. CONSEQUENCE FOR TESTS: a playwright CT
// builds with `vite build`, i.e. PRODUCTION mode, so `IS_DEV` is false in every CT and this component is
// unreachable through its chrome entry there. Its CT mounts THIS component directly — that is the sanctioned
// shape, not a workaround.
//
// THE SUBMIT IS A CAPTURE, NOT A FORM POST. The bundle is assembled at click time from live in-page state
// (lib/bug-report-capture.ts), so the popup deliberately has no draft persistence: a report describes the
// moment it was taken.

import { Button } from "@orb/ui/button";
import { Bug, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useState } from "react";
import { captureBugReportBundle, submitBugReport } from "../lib/bug-report-capture.ts";

/** The offered "when did it happen" answers. `null` is "right now / no window" — everything the rings still
 *  hold. The set is coarse on purpose: the ask is a human estimate, and the capture pads it by a minute
 *  (`@orb/kit/evidence-window`), so finer options would promise a precision the input does not have. */
const WHEN_OPTIONS: readonly { readonly value: string; readonly label: string; readonly minutes: number | null }[] = [
  { value: "now", label: "Just now", minutes: null },
  { value: "5", label: "~5 minutes ago", minutes: 5 },
  { value: "15", label: "~15 minutes ago", minutes: 15 },
  { value: "60", label: "~1 hour ago", minutes: 60 },
];

type Status =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | { readonly kind: "saved"; readonly id: string; readonly path: string }
  | { readonly kind: "failed"; readonly reason: string };

/** The failed arm for a thrown value, from either half of the capture (the synchronous assembly or the POST).
 *  A non-Error throw still names itself rather than reading as "undefined" in the status line. */
function failedStatus(error: unknown): Status {
  return { kind: "failed", reason: error instanceof Error ? error.message : String(error) };
}

/** The dev top-rail bug-report affordance. Exported for its chrome entry AND for its CT, which mounts it
 *  directly (a CT's production build cannot reach the dev-gated entry — see the header). */
export function BugReportButton(): ReactElement {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState<string>("now");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // NO ROUTER READ, deliberately: this app has three routes and everything that says WHERE the owner is lives
  // in the shell (`BugReportRoute`'s header states it). The capture reads the location and the shell itself,
  // which is also what lets this component's CT mount it with no provider.
  const capture = (): void => {
    const trimmed = note.trim();
    if (trimmed === "" || status.kind === "saving") {
      return;
    }
    setStatus({ kind: "saving" });
    // THE ASSEMBLY IS INSIDE THE TRY, not just the POST. `captureBugReportBundle` reads the location, the
    // environment and every `__orb` census handle with no catch of its own, so a census provider that throws
    // is a SYNCHRONOUS throw out of this handler — which left the button disabled at "Capturing…" until the
    // page was reloaded. A bug-report button that silently wedges is the one state it must never enter, so
    // both halves report through the same failed arm.
    try {
      const bundle = captureBugReportBundle({
        note: trimmed,
        windowMinutes: WHEN_OPTIONS.find((option) => option.value === when)?.minutes ?? null,
      });
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
    <Popover modal={true} onOpenChange={setOpen} open={open}>
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
          <RadioGroup aria-label="When did it happen?" value={when} onValueChange={(next): void => setWhen(String(next))}>
            {WHEN_OPTIONS.map((option) => (
              <RadioGroupItem key={option.value} value={option.value}>
                <Text as="span" voice="label">
                  {option.label}
                </Text>
              </RadioGroupItem>
            ))}
          </RadioGroup>
          <Row gap="field" align="center" justify="between">
            <Button type="button" intent="primary" size="sm" disabled={note.trim() === "" || status.kind === "saving"} onClick={capture}>
              {status.kind === "saving" ? "Capturing…" : "Capture report"}
            </Button>
          </Row>
          {/* One live region for every outcome — a capture that silently succeeded is indistinguishable from
              one that silently failed, and this button's whole value is the owner trusting it fired. */}
          <Text role="status" voice="quiet" data-slot="bug-report-status">
            {statusLine(status)}
          </Text>
        </Stack>
      </PopoverPopup>
    </Popover>
  );
}

/** The one status sentence. The saved arm names the FILE, because the review ritual is "read the new reports". */
function statusLine(status: Status): string {
  switch (status.kind) {
    case "idle": {
      return "Nothing captured yet.";
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
