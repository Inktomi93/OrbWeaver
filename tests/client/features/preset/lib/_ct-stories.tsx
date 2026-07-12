// CT story module for THE FORM BRIDGE (features/preset/lib/preset-editor-bridge) — Spine-Testing §7: a CT
// only mounts from a NON-test module. Proves the `useSyncExternalStore` SUBSCRIPTION fires across SIBLING
// components (the real cross-region shape: CONTENT publishes, CONTEXT subscribes — no shared React
// ancestor), which the headless node test cannot exercise (no DOM). The publisher builds a REAL preset
// form via the factory and publishes/clears it on a button; the sibling subscriber re-renders on each
// publish/clear, proving the external-store notification path.

import { createSavedEntityForm } from "@orb/client/forms";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import {
  clearAssemblyForm,
  publishAssemblyForm,
  useAssemblyForm,
} from "../../../../../packages/client/src/features/preset/lib/preset-editor-bridge";

const STORY_PRESET = castId<PresetId>("preset_bridgestoryaa");

// Module-scope factory (D54 §13.1 — stable hook identity across renders). The bridge is a module
// singleton; Playwright CT gives every test a fresh browser context so it starts clean per test.
const useStoryForm = createSavedEntityForm<PromptConfig>({
  defaultValues: DEFAULT_PROMPT_CONFIG,
  save: (values: PromptConfig): Promise<PromptConfig> => Promise.resolve(values),
});

/** The PUBLISHER — owns the real form; publish/clear buttons drive the module-scope bridge. */
function BridgePublisher(): ReactElement {
  const { form } = useStoryForm({ entityId: STORY_PRESET, serverValues: DEFAULT_PROMPT_CONFIG });
  return (
    <div>
      <button
        type="button"
        onClick={(): void => publishAssemblyForm({ presetId: STORY_PRESET, form })}
      >
        publish form
      </button>
      <button type="button" onClick={(): void => clearAssemblyForm()}>
        clear form
      </button>
    </div>
  );
}

/** The SUBSCRIBER — a SIBLING (no shared form provider) reading the published handle reactively. */
function BridgeSubscriber(): ReactElement {
  const handle = useAssemblyForm();
  return <output>{`handle=${handle === null ? "none" : handle.presetId}`}</output>;
}

/** The cross-sibling story the CT mounts: publisher + subscriber under a common parent that is NOT a
 *  form provider — exactly the CONTENT/CONTEXT split the bridge exists to cross. */
export function BridgeStory(): ReactElement {
  return (
    <div>
      <BridgePublisher />
      <BridgeSubscriber />
    </div>
  );
}
