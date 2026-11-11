// The CONTENT pane's identity row for one subject, and for a drilled member: its Back, its name, the state marks beside it and
// its own verbs. One template serves both, because both draw one role and differ only in how they stand down where the shell's
// narrow topbar already prints the name and the way back: the Back and the visible name wear the shell's identity defer mark,
// and the shell's stylesheet hides them there (`features/app-shell/surfaces/shell/chrome.css`). The heading stays in the outline
// and the verbs stay on screen at every width.
//
// A drilled member's Back sits outside the member's suspense boundary: its host draws this row with the Back alone while the
// member's read is pending or failed, so the exit is never missing. No lifecycle chrome on the row (D212): Delete stays on the
// list row's kebab, and the Back is the answer to that kebab being off-screen while drilled.
//
// Homed client-shared, not `@orb/ui`: a composite of existing primitives with a workspace-shaped grammar (§13.9's litmus), drawn
// by member surfaces in several features, which `client-features-no-cross` keeps from sharing any other home.

import { Button } from "@orb/ui/button";
import { ArrowLeft, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { DrillBack } from "#lib";

/** `title`: a document's or a member's name. `masthead`: a workbench's one opening statement, at the display step. */
const NAME_VOICE = { title: "promoted", masthead: "masthead" } as const;

const SHELL_IDENTITY_DEFER = "defer";

export interface DetailHeaderProps {
  /** The subject's name: the pane's `h2` and its visible name. Omitted only while there is no subject to name: a drilled
   *  member whose read is pending or failed, or one deleted elsewhere while open. */
  readonly title?: string;
  readonly step?: keyof typeof NAME_VOICE;
  /** A drilled member's way back to the list it was opened from, leading the row. */
  readonly back?: DrillBack;
  /** A caps label above the name naming the kind of surface. */
  readonly kicker?: string;
  /** State that travels with the name on its line: chips, a census, a status. Never a verb. */
  readonly meta?: ReactNode;
  /** The subject's own verbs, at the row's trailing edge. */
  readonly actions?: ReactNode;
  /** The visible name and the Back stand down where the shell's narrow topbar already prints them. */
  readonly deferToShell?: boolean;
  /** Lines under the name: a gloss, a remedy, a credit. */
  readonly children?: ReactNode;
}

/** The name as the outline's `h2` and, hidden from assistive technology so the subject is named once, as the visible line. */
function DetailName({
  title,
  step,
  defer,
}: {
  readonly title: string;
  readonly step: keyof typeof NAME_VOICE;
  readonly defer: typeof SHELL_IDENTITY_DEFER | undefined;
}): ReactElement {
  return (
    <>
      <Heading className="sr-only" level={2}>
        {title}
      </Heading>
      <Text
        aria-hidden="true"
        as="span" // A title-step name truncates so its verbs keep its line; a masthead never truncates, so its verbs close its line.
        className="min-inline-0"
        wrap={step === "title" ? undefined : "word"}
        truncate={step === "title"}
        data-shell-identity={defer}
        voice={NAME_VOICE[step]}
      >
        {title}
      </Text>
    </>
  );
}

/** `[back] [kicker] name meta … actions` over the subject's own lines. */
export function DetailHeader({ title, step = "title", back, kicker, meta, actions, deferToShell = true, children }: DetailHeaderProps): ReactElement {
  const defer = deferToShell ? SHELL_IDENTITY_DEFER : undefined;
  const drilled = back !== undefined;
  const verbs =
    actions === undefined ? null : (
      <Row
        align="center"
        cap={step === "masthead" ? undefined : "fit"}
        wrap={true}
        className={step === "masthead" ? undefined : "min-inline-0"}
        data-slot={drilled ? "config-member-verbs" : undefined}
        grow={step === "masthead"}
        gap="field"
        justify="end"
      >
        {actions}
      </Row>
    );
  return (
    <Row align="center" className="min-inline-0" data-slot={drilled ? "config-drill-header" : undefined} wrap={true} gap="field" justify="between">
      <Stack className="min-inline-0" floor="title" grow={true} gap="tight">
        {kicker === undefined ? null : <Text voice="kicker">{kicker}</Text>}
        <Row align="baseline" className="min-inline-0" wrap={true} gap="row">
          {back === undefined ? null : (
            <Button className="shrink-0" data-shell-identity={defer} variant="ghost" onClick={back.onClick} size="sm" wrap={true} type="button">
              <Icon icon={ArrowLeft} size="sm" />
              {back.label}
            </Button>
          )}
          {title === undefined ? null : <DetailName defer={defer} step={step} title={title} />}
          {meta}
          {step === "masthead" ? verbs : null}
        </Row>
        {children}
      </Stack>
      {step === "title" ? verbs : null}
    </Row>
  );
}
