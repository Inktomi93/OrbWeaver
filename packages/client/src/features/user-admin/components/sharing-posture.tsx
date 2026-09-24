// The READ-ONLY sharing panel in the Multi-user section. Whether other devices can sign in is the auth mode,
// a boot fact the server reads from the environment once; the panel states it, names how to change it, and
// offers nothing to toggle. A runtime switch would make the one boot invariant every auth rule keys on mutable.

import type { AuthMode } from "@orb/contracts/identity";
import { Kbd } from "@orb/ui/kbd";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useAuthConfig } from "#data";
import { testId } from "#lib";

interface SharingPosture {
  readonly posture: string;
  /** The command that shares the box, or the running mode's own env line. */
  readonly line: string;
  readonly instruction: string;
}

/** The launcher command that asks the setup questions again (`tooling/src/stack/lib/setup-plan.ts`, which the
 *  client cannot import). */
const SETUP_COMMAND = "pnpm start --setup";

const CHANGE_MODE = `To change it, stop the server and run ${SETUP_COMMAND}. In Docker, set AUTH_MODE in the environment: block of docker-compose.yaml.`;

const SHARING_POSTURE: Record<AuthMode, SharingPosture> = {
  "single-user": {
    posture: "Only this machine can use this server: single-user mode has no login, so the server listens on this machine only.",
    line: SETUP_COMMAND,
    instruction:
      'To let other devices sign in, stop the server, run this command and choose "people on my network". In Docker, set AUTH_MODE: local, AUTH_FALLBACK: deny and an empty AUTH_FALLBACK_TRUSTED_PEERS in the environment: block of docker-compose.yaml, then publish the port (docker/README.md).',
  },
  local: {
    posture: "Other devices can sign in with a handle and password stored by this server.",
    line: "AUTH_MODE=local",
    instruction: `${CHANGE_MODE} Over plain http a sign-in travels in clear; put HTTPS in front.`,
  },
  oidc: {
    posture: "People sign in through your identity provider.",
    line: "AUTH_MODE=oidc",
    instruction: CHANGE_MODE,
  },
  "forward-header": {
    posture: "Your reverse proxy signs people in and tells this server who they are.",
    line: "AUTH_MODE=forward-header",
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
      <Text voice="label">Who can sign in</Text>
      <Text voice="gloss">{sharing.posture}</Text>
      <Kbd size="command" data-testid={testId("adminSharingLine")}>
        {sharing.line}
      </Kbd>
      <Text voice="gloss">{sharing.instruction}</Text>
    </Stack>
  );
}
