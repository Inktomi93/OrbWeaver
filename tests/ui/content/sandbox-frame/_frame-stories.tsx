import { CtIsolation } from "@orb/testkit/browser";
import { SandboxFrame } from "@orb/ui/sandbox-frame";
import type { ComponentProps, ReactElement } from "react";
import { useEffect, useRef } from "react";

/** A Node mount supplies plain data while preserving the frame's sizing union. */
type FrameStoryProps = ComponentProps<typeof SandboxFrame> & { readonly onHostMessage?: never };

/** A focused control above the frame: the frame loading must leave focus where the reader put it. */
export function FocusedBesideFrameStory(props: FrameStoryProps): ReactElement {
  const outside = useRef<HTMLInputElement>(null);
  useEffect(() => {
    outside.current?.focus();
  }, []);
  return (
    <CtIsolation subject="SandboxFrame focus" isolates="Frame load focus handling next to one focused control, without application state">
      <input aria-label="Outside the frame" ref={outside} />
      <SandboxFrame {...props} />
    </CtIsolation>
  );
}

export function SandboxFrameStory(props: FrameStoryProps): ReactElement {
  return (
    <CtIsolation subject="SandboxFrame" isolates="The sealed iframe painter and the policy its document is served under, without application state">
      <SandboxFrame {...props} />
    </CtIsolation>
  );
}
