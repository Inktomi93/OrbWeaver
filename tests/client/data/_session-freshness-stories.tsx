import { useSessionRecovery, useTRPC } from "@orb/client/data";
import type { SessionDocumentHost } from "@orb/client/lib";
import { setActiveSection, useActiveSection, useOpenModal } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";

function Workspace(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [read, setRead] = useState("idle");
  const section = useActiveSection();
  const modal = useOpenModal();
  return (
    <Stack>
      <Text role="status" aria-label="Bound workspace">
        {section}
      </Text>
      <Text role="status" aria-label="Session prompt">
        {modal ?? "none"}
      </Text>
      <Button onClick={(): void => setActiveSection("corpus")}>Open Corpus</Button>
      <Button
        onClick={(): void => {
          void queryClient.query({ ...trpc.sessions.me.queryOptions(), staleTime: 0, retry: false }).then(
            () => setRead("answered"),
            () => setRead("refused"),
          );
        }}
      >
        Read session
      </Button>
      <Text role="status" aria-label="Explicit session read">
        {read}
      </Text>
    </Stack>
  );
}

function SessionOwner(): ReactElement {
  const state = useSessionRecovery();
  return state.status === "ready" ? (
    <Workspace />
  ) : (
    <Text role="status" aria-label="Session binding">
      {state.status}
    </Text>
  );
}

/** Mount the actual recovery and verified-user binding through production providers. */
export function SessionFreshnessStory({ nowMs = 0, visible = true }: { readonly nowMs?: number; readonly visible?: boolean }): ReactElement {
  const [mounted, setMounted] = useState(true);
  const [edge, setEdge] = useState(0);
  const [navigation, setNavigation] = useState("none");
  const [capability] = useState(() => {
    let at = nowMs;
    let shown = visible;
    const listeners = new Set<() => void>();
    const host: SessionDocumentHost = {
      now: () => at,
      currentPathname: () => "/",
      assign: setNavigation,
      isVisible: () => shown,
      subscribeVisibility: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    return {
      host,
      deliver: (time: number, nextVisible: boolean): void => {
        at = time;
        shown = nextVisible;
        for (const listener of listeners) {
          listener();
        }
      },
    };
  });
  return (
    <CtClientProviders sessionDocumentHost={capability.host}>
      {mounted ? <SessionOwner /> : <Text>Session owner unmounted</Text>}
      <Button
        onClick={(): void => {
          capability.deliver(nowMs, visible);
          setEdge((value) => value + 1);
        }}
      >
        Visibility edge
      </Button>
      <Text role="status" aria-label="Visibility delivery">
        {edge}
      </Text>
      <Text role="status" aria-label="Document navigation">
        {navigation}
      </Text>
      <Button onClick={(): void => setMounted(false)}>Unmount session owner</Button>
    </CtClientProviders>
  );
}
