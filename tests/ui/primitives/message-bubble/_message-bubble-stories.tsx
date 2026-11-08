import { MESSAGE_ROLES } from "@orb/kit/message-role";
import type { SeedScopeProps } from "@orb/testkit/browser";
import { CtIsolation, cssVar, SeedScope } from "@orb/testkit/browser";
import { Surface } from "@orb/ui/layout";
import { MessageBubble } from "@orb/ui/message-bubble";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

const GROUNDS = {
  user: { fill: "color.user-bubble", ink: "color.user-bubble-foreground" },
  assistant: { fill: "color.ai-bubble", ink: "color.ai-bubble-foreground" },
  system: { fill: "color.system-bubble", ink: "color.system-bubble-foreground" },
} as const satisfies Record<(typeof MESSAGE_ROLES)[number], { readonly fill: keyof typeof TOKENS; readonly ink: keyof typeof TOKENS }>;
const STEPS = ["spacing.row", "spacing.block", "radius.base", "radius.card"] as const satisfies readonly (keyof typeof TOKENS)[];

function Bubbles(): ReactElement {
  return (
    <div
      style={{
        display: "grid",
        gap: "0.5rem",
        backgroundColor: `var(${TOKENS["color.background"].cssVar})`,
        color: `var(${TOKENS["color.foreground"].cssVar})`,
      }}
    >
      {MESSAGE_ROLES.map((role) => (
        <div key={role} data-role-row={role} style={{ display: "grid", gap: "0.5rem" }}>
          <MessageBubble data-case="bubble" messageRole={role} shape="bubble">
            {`${role} bubble`}
          </MessageBubble>
          <MessageBubble data-case="island" messageRole={role}>
            {`${role} island`}
          </MessageBubble>
          <Surface tier="instrument">
            <MessageBubble data-case="tier-island" messageRole={role}>
              {`${role} island in a tier`}
            </MessageBubble>
            <MessageBubble data-case="tier-transcript" ownSlot="message-bubble" messageRole={role}>
              {`${role} in the transcript slot`}
            </MessageBubble>
          </Surface>
          <span data-probe="fill" style={{ color: cssVar(GROUNDS[role].fill) }} />
          <span data-probe="ink" style={{ color: cssVar(GROUNDS[role].ink) }} />
        </div>
      ))}
      {STEPS.map((step) => (
        <span key={step} data-probe={step} style={{ display: "block", paddingBlockStart: cssVar(step), borderStartStartRadius: cssVar(step) }} />
      ))}
    </div>
  );
}

export function MessageBubbleStory(props: SeedScopeProps): ReactElement {
  return (
    <CtIsolation subject="MessageBubble" isolates="Each role's bubble and island box, tier-less and inside an instrument Surface, beside token probes">
      <SeedScope {...props}>
        <Bubbles />
      </SeedScope>
    </CtIsolation>
  );
}
