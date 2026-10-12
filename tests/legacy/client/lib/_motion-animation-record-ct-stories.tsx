// Real-browser story for motion-animation-record.ct.tsx. Kept outside the test module because
// Playwright CT mounts importable stories, not locally declared components.

import { storyTestId } from "@orb/testkit/browser/story-test-ids.ts";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { activeAnimations, installAnimationLifecycleRecorder } from "#client/lib/motion-animation-record.ts";

export function AnimationRecordStory(): ReactElement {
  useEffect(() => {
    installAnimationLifecycleRecorder();
    globalThis.__readAnimationRecords = activeAnimations;
    return (): void => {
      globalThis.__readAnimationRecords = undefined;
    };
  }, []);
  return (
    <>
      <div
        data-starting-style=""
        data-testid={storyTestId("libraryTransition")}
        style={{ height: 10, transition: "height 30s linear, width 30s linear", width: 10 }}
      />
      <div
        data-starting-style=""
        data-testid={storyTestId("concurrentTransition")}
        style={{ height: 10, opacity: 1, transition: "height 30s linear, opacity 30s linear" }}
      />
      <div data-testid={storyTestId("applicationTransition")} style={{ height: 10, transition: "height 30s linear" }} />
      <div data-testid={storyTestId("waapiAnimation")} style={{ height: 10 }} />
    </>
  );
}
