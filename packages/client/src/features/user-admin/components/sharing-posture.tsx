// The READ-ONLY "Who can sign in" panel in the Multi-user section: the boot-fixed sign-in mode, where it came from, and
// for each other mode the lines that switch this install to it, the file they go in and the restart. Nothing here
// writes: a runtime switch would make the one boot invariant every auth rule keys on mutable.

import type { AuthMode, AuthModeSource, EnvLine, InstallKind, ShareRefusalNotice, SignInTargetMode } from "@orb/contracts/identity";
import {
  AUTH_MODE_KEY,
  BARE_METAL_ENV_FILE,
  COMPOSE_FILE,
  COMPOSE_UP_COMMAND,
  CONTAINER_ENV_FILE,
  CONTAINER_LOGIN_FALLBACK_ENV,
  SETUP_COMMAND,
  SETUP_FRIENDS_ANSWER,
  SIGN_IN_MODE_KEYS,
  signInModeEnvLines,
} from "@orb/contracts/identity";
import { CopyButton } from "@orb/ui/copy-button";
import { Kbd } from "@orb/ui/kbd";
import { Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useTRPC } from "#data";
import { testId } from "#lib";
import { MODE_NAME } from "../lib/share-model.ts";
import { ShareCode, ShareProse } from "./share-prose.tsx";

const SHIPPED_CONTAINER_ENV_FILE = "docker/orbweaver.env";
const START_COMMAND = "pnpm start";

const POSTURE: Record<AuthMode, string> = {
  "single-user": "Only this machine can use this server: single-user mode has no login, so the server listens on this machine only.",
  local: "Other devices can sign in with a handle and password stored by this server. Over plain http a sign-in travels in clear; put HTTPS in front.",
  oidc: "People sign in through your identity provider.",
  "forward-header": "Your reverse proxy signs people in and tells this server who they are.",
};

function sourceSentence(source: AuthModeSource, install: InstallKind): ReactNode {
  switch (source) {
    case "env-file":
      return install === "container" ? (
        <>
          Set in <ShareCode>{BARE_METAL_ENV_FILE}</ShareCode> in the server's folder inside the container.
        </>
      ) : (
        <>
          Set in <ShareCode>{BARE_METAL_ENV_FILE}</ShareCode> in the Orbweaver folder, by hand or by <ShareCode>{SETUP_COMMAND}</ShareCode>.
        </>
      );
    case "process-env":
      return install === "container" ? (
        <>
          Set by the container environment: <ShareCode>{SHIPPED_CONTAINER_ENV_FILE}</ShareCode>, <ShareCode>{CONTAINER_ENV_FILE}</ShareCode> or the{" "}
          <ShareCode>environment:</ShareCode> block of <ShareCode>{COMPOSE_FILE}</ShareCode>.
        </>
      ) : (
        <>
          Set by the environment the server started with, such as a launcher flag or a shell export, not by <ShareCode>{BARE_METAL_ENV_FILE}</ShareCode>.
        </>
      );
    case "default":
      return "Nothing sets it, so the server runs its default, single-user.";
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

// The two owner-fallback keys a container moves with the mode and bare metal must leave out of `.env`.
const fallbackKeys = (
  <>
    <ShareCode>{CONTAINER_LOGIN_FALLBACK_ENV[0][0]}</ShareCode> and <ShareCode>{CONTAINER_LOGIN_FALLBACK_ENV[1][0]}</ShareCode>
  </>
);

const CHANGE_STEP: Record<InstallKind, ReactNode> = {
  container: (
    <>
      To switch, put the lines for that mode in <ShareCode>{CONTAINER_ENV_FILE}</ShareCode>, then run <ShareCode>{COMPOSE_UP_COMMAND}</ShareCode>, which
      recreates the container with them. A key in the <ShareCode>environment:</ShareCode> block of <ShareCode>{COMPOSE_FILE}</ShareCode> wins over that file, so
      remove <ShareCode>{AUTH_MODE_KEY}</ShareCode> there if you set it.
    </>
  ),
  "bare-metal": (
    <>
      To switch, put the lines for that mode in <ShareCode>{BARE_METAL_ENV_FILE}</ShareCode> in the Orbweaver folder, then stop the server and start it again
      with <ShareCode>{START_COMMAND}</ShareCode>. Leave {fallbackKeys} out of <ShareCode>{BARE_METAL_ENV_FILE}</ShareCode>: the server refuses them there and
      sets both from the mode.
    </>
  ),
};

function envFileText(lines: readonly EnvLine[]): string {
  return lines.map(([key, value]) => `${key}=${value}`).join("\n");
}

function shareSentence(refusal: ShareRefusalNotice | null): string {
  return refusal === null ? "Start sharing works in this mode." : `Start sharing refuses this mode. ${refusal.message}`;
}

interface TargetBlockProps {
  readonly mode: SignInTargetMode;
  readonly install: InstallKind;
  readonly shareRefusal: ShareRefusalNotice | null;
}

function TargetBlock({ mode, install, shareRefusal }: TargetBlockProps): ReactElement {
  const text = envFileText(signInModeEnvLines(mode, install));
  return (
    <Stack gap="tight" data-testid={testId("adminSignInTarget")} data-target-mode={mode}>
      <Text voice="label">{`${mode}: ${MODE_NAME[mode]}`}</Text>
      <ShareProse>{shareSentence(shareRefusal)}</ShareProse>
      <CopyButton text={text} what={`the ${mode} lines`}>
        <Text voice="label" className="min-w-0 font-mono whitespace-pre-wrap wrap-anywhere">
          {text}
        </Text>
      </CopyButton>
      {SIGN_IN_MODE_KEYS[mode].length > 0 ? (
        <ShareProse>
          Replace the example values with your own. "Login modes" in <ShareCode>docker/README.md</ShareCode> describes each key.
        </ShareProse>
      ) : null}
    </Stack>
  );
}

export function SharingPosturePanel(): ReactElement {
  const trpc = useTRPC();
  const { data: view } = useSuspenseQuery(trpc.share.signInMode.queryOptions());
  // The setup wizard asks the sign-in question only on bare metal; a container never runs it.
  const offerSetup = view.mode === "single-user" && view.install === "bare-metal";
  return (
    <Stack gap="tight" data-auth-mode={view.mode} data-auth-mode-source={view.source} data-install={view.install} data-testid={testId("adminSharingPanel")}>
      <Heading level={4} voice="label">
        Who can sign in
      </Heading>
      <ShareProse>{POSTURE[view.mode]}</ShareProse>
      <ShareProse>
        The sign-in mode is <ShareCode>{`${AUTH_MODE_KEY}=${view.mode}`}</ShareCode>. {sourceSentence(view.source, view.install)}
      </ShareProse>
      {offerSetup ? (
        <>
          <ShareProse>{`To let other devices sign in, stop the server, run this command and choose "${SETUP_FRIENDS_ANSWER}".`}</ShareProse>
          <CopyButton text={SETUP_COMMAND} what={`the command ${SETUP_COMMAND}`}>
            <Kbd size="command" data-testid={testId("adminSharingLine")}>
              {SETUP_COMMAND}
            </Kbd>
          </CopyButton>
        </>
      ) : null}
      <ShareProse>{CHANGE_STEP[view.install]}</ShareProse>
      <Stack gap="field">
        {view.targets
          .filter((target) => target.mode !== view.mode)
          .map((target) => (
            <TargetBlock key={target.mode} mode={target.mode} install={view.install} shareRefusal={target.shareRefusal} />
          ))}
      </Stack>
    </Stack>
  );
}
