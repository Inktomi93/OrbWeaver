import { CtIsolation } from "@orb/testkit/browser";
import { SandboxFrame } from "@orb/ui/sandbox-frame";
import type { ComponentProps, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

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

/** A text field above two frames, nothing focused: a reader's keys, a press on either frame, and Tab between them. */
export function TwoFramesBesideFieldStory({ first, second }: { readonly first: FrameStoryProps; readonly second: FrameStoryProps }): ReactElement {
  return (
    <CtIsolation subject="SandboxFrame focus gate" isolates="Focus entering two frames beside one text field, without application state">
      <input aria-label="Outside the frame" />
      <SandboxFrame {...first} />
      <SandboxFrame {...second} />
    </CtIsolation>
  );
}

/** A text field above one frame whose handed-over links the story lists, so a case reads what the link gate let through. */
export function LinkingFrameBesideFieldStory(props: FrameStoryProps): ReactElement {
  const [links, setLinks] = useState<readonly string[]>([]);
  return (
    <CtIsolation subject="SandboxFrame link gate" isolates="Links a frame hands to its host beside one text field, without the confirm or application state">
      <input aria-label="Outside the frame" />
      <SandboxFrame
        {...props}
        onLink={(url): void => {
          setLinks((handed) => [...handed, url]);
        }}
      />
      <output aria-label="Handed-over links">{links.join(" ")}</output>
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
