import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { CtIsolation } from "@orb/testkit/browser";
import { Surface } from "@orb/ui/layout";
import { MessageBubble } from "@orb/ui/message-bubble";
import { ThemeScope } from "@orb/ui/theme-scope";
import { SEED_THEME_VALUE_SETS, TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

const GROUNDS = {
  user: { fill: "color.user-bubble", ink: "color.user-bubble-foreground" },
  assistant: { fill: "color.ai-bubble", ink: "color.ai-bubble-foreground" },
  system: { fill: "color.system-bubble", ink: "color.system-bubble-foreground" },
} as const satisfies Record<(typeof MESSAGE_ROLES)[number], { readonly fill: keyof typeof TOKENS; readonly ink: keyof typeof TOKENS }>;
const STEPS = ["spacing.row", "spacing.block", "radius.base", "radius.card"] as const satisfies readonly (keyof typeof TOKENS)[];

const cssVar = (token: keyof typeof TOKENS): string => `var(${TOKENS[token].cssVar})`;

function Bubbles(): ReactElement {
  return (
    <div style={{ display: "grid", gap: "0.5rem", backgroundColor: "var(--color-background)", color: "var(--color-foreground)" }}>
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

/** Every role's bubble and island box, tier-less and inside an instrument Surface, under a seed palette and an optional custom scope. */
export function MessageBubbleStory({ theme, background }: { readonly theme?: keyof typeof SEED_THEME_VALUE_SETS; readonly background?: string }): ReactElement {
  const ambient = theme === undefined ? undefined : SEED_THEME_VALUE_SETS[theme].vars;
  return (
    <CtIsolation subject="MessageBubble" isolates="Each role's bubble and island box, tier-less and inside an instrument Surface, beside token probes">
      <div data-theme={theme} style={{ backgroundColor: "var(--color-background)", padding: "1rem" }}>
        {background === undefined ? (
          <Bubbles />
        ) : (
          <ThemeScope
            tokens={{ background }}
            {...(ambient === undefined ? {} : { ambientBackground: ambient["--color-background"], ambientAccent: ambient["--color-primary"] })}
          >
            <Bubbles />
          </ThemeScope>
        )}
      </div>
    </CtIsolation>
  );
}
