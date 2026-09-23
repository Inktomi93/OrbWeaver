// The Claude-subscription paste step's command (inference program §5.3a: "the paste step carries a copyable
// `claude setup-token` plus 'run this on the machine you use Claude Code on'"; drawn in
// `docs/design/mocks/connections/editor.html` Board F). The command is shown as text a user can read or select
// by hand AND carries a real button that copies it.
//
// THE COPY RESULT IS SPOKEN IN PLACE. A toast is off to the side and gone in seconds; the status line under the
// button is always mounted (`role="status"`), so its text change is announced and stays readable. A failed
// copy (no clipboard permission, an insecure origin) says so and points at the text beside the button.

import { Button } from "@orb/ui/button";
import { Kbd } from "@orb/ui/kbd";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { CLAUDE_SETUP_TOKEN_COMMAND } from "../lib/add-connection-form-model.ts";

/** The copy button's states; the status line speaks each one. */
export const COPY_OUTCOMES = ["idle", "copied", "failed"] as const;
type CopyOutcome = (typeof COPY_OUTCOMES)[number];

const COPY_OUTCOME_COPY: Record<CopyOutcome, string> = {
  idle: "",
  copied: "Copied. Paste it into a terminal on that machine.",
  failed: "Couldn't copy — select the command and copy it by hand.",
};

export function SetupTokenCommand(): ReactElement {
  const [outcome, setOutcome] = useState<CopyOutcome>("idle");
  const copy = (): void => {
    navigator.clipboard.writeText(CLAUDE_SETUP_TOKEN_COMMAND).then(
      () => setOutcome("copied"),
      () => setOutcome("failed"),
    );
  };
  return (
    <Stack data-slot="setup-token-command" gap="tight">
      <Text className="max-w-(--reading-measure-prose)" prose={true} voice="gloss">
        Run this on the machine you use Claude Code on, then paste what it prints.
      </Text>
      <Row align="center" gap="field">
        {/* A command the user types: `<kbd>` is its element, and the chip marks where it starts and ends. */}
        <Kbd size="command">{CLAUDE_SETUP_TOKEN_COMMAND}</Kbd>
        <Button aria-label={`Copy the command ${CLAUDE_SETUP_TOKEN_COMMAND}`} intent="secondary" onClick={copy} size="sm">
          Copy
        </Button>
      </Row>
      <Text className={outcome === "failed" ? "text-warning" : undefined} prose={true} role="status" voice="gloss">
        {COPY_OUTCOME_COPY[outcome]}
      </Text>
    </Stack>
  );
}
