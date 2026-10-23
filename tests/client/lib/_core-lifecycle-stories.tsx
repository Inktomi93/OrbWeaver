import { installSafeErrorRing, runAfterViewTransition, safeErrorRing } from "@orb/client/lib";
import { setActiveSection, useActiveSection } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

function NativeSectionSwap(): ReactElement {
  const section = useActiveSection();
  const [settled, setSettled] = useState("Section swap idle");
  return (
    <Stack>
      <Text>Active section: {section}</Text>
      <Text>{settled}</Text>
      <Button
        onClick={(): void => {
          setActiveSection("characters");
          setActiveSection("config");
          runAfterViewTransition(() => {
            setSettled(
              document.documentElement.hasAttribute("data-native-transitions-finished") ? "Section swap settled" : "Follow-up ran before native settlement",
            );
          });
        }}
      >
        Swap sections in one intent
      </Button>
    </Stack>
  );
}

/** Uses production providers and state actions; the browser retains its native transition implementation. */
export function NativeSectionSwapStory(): ReactElement {
  return (
    <CtClientProviders>
      <NativeSectionSwap />
    </CtClientProviders>
  );
}

function SafeErrorObserver(): ReactElement {
  const [snapshot, setSnapshot] = useState("");
  useEffect(() => installSafeErrorRing(), []);
  return (
    <Stack>
      <Button
        onClick={(): void => {
          const error = new TypeError("private-message-canary");
          error.stack = [
            "TypeError: private-message-canary",
            `    at kept (${location.origin}/assets/client.js?token=private-token-canary:12:34)`,
            "    at foreign (https://private-host-canary.example/client.js:1:2)",
            "    at local (file:///home/private-path-canary/client.js:3:4)",
          ].join("\n");
          globalThis.dispatchEvent(new ErrorEvent("error", { error }));
          globalThis.dispatchEvent(new PromiseRejectionEvent("unhandledrejection", { promise: Promise.resolve(), reason: error }));
          setSnapshot(JSON.stringify(safeErrorRing()));
        }}
      >
        Capture browser errors
      </Button>
      <output aria-label="Captured safe errors">{snapshot}</output>
    </Stack>
  );
}

/** Browser error events enter the installed production observer before the public read is rendered. */
export function SafeErrorObserverStory(): ReactElement {
  return (
    <CtClientProviders>
      <SafeErrorObserver />
    </CtClientProviders>
  );
}
