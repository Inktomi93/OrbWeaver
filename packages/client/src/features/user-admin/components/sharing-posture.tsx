// The READ-ONLY sharing panel in the Multi-user section. Whether other devices can sign in is the auth mode,
// a boot fact the server reads from the environment once; the panel states it, names how to change it, and
// offers nothing to toggle, only a copy of the line. A runtime switch would make the one boot invariant every
// auth rule keys on mutable. The container's switch lives once, on the Share card's mode row below this panel.

import type { AuthMode } from "@orb/contracts/identity";
import { SETUP_COMMAND } from "@orb/contracts/identity";
import { CopyButton } from "@orb/ui/copy-button";
import { Kbd } from "@orb/ui/kbd";
import { Stack } from "@orb/ui/layout";
import { Heading } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useAuthConfig } from "#data";
import { testId } from "#lib";
import { ShareProse } from "./share-prose.tsx";

interface SharingPosture {
  readonly posture: string;
  /** The command that shares the box, or the running mode's own env line. */
  readonly line: string;
  /** What `line` is, for the copy button's name: `Copy <lineNoun> <line>`. */
  readonly lineNoun: string;
  readonly instruction: ReactNode;
}

// A command, key or file named inside a sentence reads as code, the way the copyable line above it does.
function Code({ children }: { readonly children: string }): ReactElement {
  return <Kbd size="command">{children}</Kbd>;
}

const CHANGE_MODE = (
  <>
    To change it, stop the server and run <Code>{SETUP_COMMAND}</Code>. In Docker, set <Code>AUTH_MODE</Code> in the <Code>environment:</Code> block of{" "}
    <Code>docker-compose.yaml</Code>.
  </>
);

const ENV_LINE = "the environment line";

const SHARING_POSTURE: Record<AuthMode, SharingPosture> = {
  "single-user": {
    posture: "Only this machine can use this server: single-user mode has no login, so the server listens on this machine only.",
    line: SETUP_COMMAND,
    lineNoun: "the command",
    instruction: 'To let other devices sign in, stop the server, run this command and choose "people on my network".',
  },
  local: {
    posture: "Other devices can sign in with a handle and password stored by this server.",
    line: "AUTH_MODE=local",
    lineNoun: ENV_LINE,
    instruction: <>{CHANGE_MODE} Over plain http a sign-in travels in clear; put HTTPS in front.</>,
  },
  oidc: {
    posture: "People sign in through your identity provider.",
    line: "AUTH_MODE=oidc",
    lineNoun: ENV_LINE,
    instruction: CHANGE_MODE,
  },
  "forward-header": {
    posture: "Your reverse proxy signs people in and tells this server who they are.",
    line: "AUTH_MODE=forward-header",
    lineNoun: ENV_LINE,
    instruction: CHANGE_MODE,
  },
};

export function SharingPosturePanel(): ReactElement | null {
  const config = useAuthConfig().data;
  if (config === undefined) {
    return null;
  }
  const sharing = SHARING_POSTURE[config.mode];
  return (
    <Stack gap="tight" data-auth-mode={config.mode} data-testid={testId("adminSharingPanel")}>
      <Heading level={4} voice="label">
        Who can sign in
      </Heading>
      <ShareProse>{sharing.posture}</ShareProse>
      <CopyButton text={sharing.line} what={`${sharing.lineNoun} ${sharing.line}`}>
        <Kbd size="command" data-testid={testId("adminSharingLine")}>
          {sharing.line}
        </Kbd>
      </CopyButton>
      <ShareProse>{sharing.instruction}</ShareProse>
    </Stack>
  );
}
