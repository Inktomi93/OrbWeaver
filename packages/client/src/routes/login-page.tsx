import { Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";

// STUB — the /login surface moves to features/auth once that feature is built; the beforeLoad
// reverse-gate (already-authed → redirect to /) lands with it (UI-Lib-TanStack-Router.md steal-list #2).
export function LoginPage(): ReactElement {
  return (
    <Stack
      align="center"
      justify="center"
      gap="block"
      className="min-h-dvh bg-background text-foreground"
    >
      <Heading level={1}>sign in</Heading>
      <Text size="label" tone="muted">
        auth isn’t wired yet.
      </Text>
    </Stack>
  );
}
