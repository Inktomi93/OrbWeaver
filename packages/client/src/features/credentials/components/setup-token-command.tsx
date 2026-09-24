// The Claude-subscription paste step's command (inference program §5.3a: "the paste step carries a copyable
// `claude setup-token` plus 'run this on the machine you use Claude Code on'"; drawn in the connections
// editor mock, Board F). The copy result and its manual-copy fallback are `CopyButton`'s.

import { CopyButton } from "@orb/ui/copy-button";
import { Kbd } from "@orb/ui/kbd";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { CLAUDE_SETUP_TOKEN_COMMAND, CLAUDE_SETUP_TOKEN_COPY_SUBJECT } from "../lib/add-connection-form-model.ts";

export function SetupTokenCommand(): ReactElement {
  return (
    <Stack data-slot="setup-token-command" gap="tight">
      <Text className="max-w-(--reading-measure-prose)" prose={true} voice="gloss">
        Run this on the machine you use Claude Code on, then paste what it prints.
      </Text>
      <Row align="baseline" gap="field">
        {/* A command the user types: `<kbd>` is its element, and the chip marks where it starts and ends. */}
        <Kbd size="command">{CLAUDE_SETUP_TOKEN_COMMAND}</Kbd>
        <CopyButton copiedHint="Paste it into a terminal on that machine." text={CLAUDE_SETUP_TOKEN_COMMAND} what={CLAUDE_SETUP_TOKEN_COPY_SUBJECT} />
      </Row>
    </Stack>
  );
}
