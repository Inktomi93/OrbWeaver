// The READ-ONLY sharing panel in the Multi-user section. Whether other devices can sign in is the auth mode,
// a boot fact the server reads from the environment once; the panel states it and gives the exact `.env`
// line, and offers nothing to toggle. A runtime switch would make the one boot invariant every auth rule keys
// on mutable, for a change an operator makes once.

import type { AuthMode } from "@orb/contracts/identity";
import { Kbd } from "@orb/ui/kbd";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useAuthConfig } from "#data";
import { testId } from "#lib";

interface SharingPosture {
  readonly posture: string;
  /** The `.env` line to show: the line that shares the box, or the running mode's own line. */
  readonly envLine: string;
  readonly instruction: string;
}

const SHARING_POSTURE: Record<AuthMode, SharingPosture> = {
  "single-user": {
    posture: "Only this machine can use this server: single-user mode has no login, so the server listens on this machine only.",
    envLine: "AUTH_MODE=local",
    instruction:
      "To let other devices sign in, add this line to .env and restart the server. In docker, set it in docker/orbweaver.local.env with AUTH_FALLBACK=deny and an empty AUTH_FALLBACK_TRUSTED_PEERS, then publish the port (docker/README.md).",
  },
  local: {
    posture: "Other devices can sign in with a handle and password stored by this server.",
    envLine: "AUTH_MODE=local",
    instruction: "The sign-in mode is set in the server's environment. Over plain http a sign-in travels in clear; put HTTPS in front.",
  },
  oidc: {
    posture: "People sign in through your identity provider.",
    envLine: "AUTH_MODE=oidc",
    instruction: "The sign-in mode is set in the server's environment.",
  },
  "forward-header": {
    posture: "Your reverse proxy signs people in and tells this server who they are.",
    envLine: "AUTH_MODE=forward-header",
    instruction: "The sign-in mode is set in the server's environment.",
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
      <Kbd size="command" data-testid={testId("adminSharingEnvLine")}>
        {sharing.envLine}
      </Kbd>
      <Text voice="gloss">{sharing.instruction}</Text>
    </Stack>
  );
}
