// The CONTENT pane's identity row for one subject: its name, the state marks beside it and its own verbs.
// The heading stays in the outline while the visible name defers to the shell's narrow topbar, which already
// prints it; `MemberDrillHeader` is the drilled-member variant with its Back on the same row.

import { Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

/** `title`: a document's or a member's name. `masthead`: a workbench's one opening statement, at the display step. */
const NAME_VOICE = { title: "promoted", masthead: "masthead" } as const;

export interface DetailHeaderProps {
  /** The subject's name: the pane's `h2` and its visible name. */
  readonly title: string;
  readonly step?: keyof typeof NAME_VOICE;
  /** A caps label above the name naming the kind of surface. */
  readonly kicker?: string;
  /** State that travels with the name on its line: chips, a census, a status. Never a verb. */
  readonly meta?: ReactNode;
  /** The subject's own verbs, at the row's trailing edge. */
  readonly actions?: ReactNode;
  /** The visible name stands down where the shell's narrow topbar already prints it. */
  readonly deferToShell?: boolean;
  /** Lines under the name: a gloss, a remedy, a credit. */
  readonly children?: ReactNode;
}

/** `[kicker] name meta … actions` over the subject's own lines. */
export function DetailHeader({ title, step = "title", kicker, meta, actions, deferToShell = true, children }: DetailHeaderProps): ReactElement {
  const verbs =
    actions === undefined ? null : (
      <Row
        align="center"
        cap={step === "masthead" ? undefined : "fit"}
        wrap={true}
        className={step === "masthead" ? undefined : "min-inline-0"}
        grow={step === "masthead"}
        gap="field"
        justify="end"
      >
        {actions}
      </Row>
    );
  return (
    <Row align="center" className="min-inline-0" wrap={true} gap="field" justify="between">
      <Stack className="min-inline-0" floor="title" grow={true} gap="tight">
        {kicker === undefined ? null : <Text voice="kicker">{kicker}</Text>}
        <Row align="baseline" className="min-inline-0" wrap={true} gap="row">
          {/* The visible name is hidden from assistive technology so the heading names the subject once. */}
          <Heading className="sr-only" level={2}>
            {title}
          </Heading>
          <Text
            aria-hidden="true"
            as="span" // A title-step name truncates so its verbs keep its line; a masthead never truncates, so its verbs close its line.
            className="min-inline-0"
            wrap={step === "title" ? undefined : "word"}
            truncate={step === "title"}
            data-shell-identity={deferToShell ? "defer" : undefined}
            voice={NAME_VOICE[step]}
          >
            {title}
          </Text>
          {meta}
          {step === "masthead" ? verbs : null}
        </Row>
        {children}
      </Stack>
      {step === "title" ? verbs : null}
    </Row>
  );
}
