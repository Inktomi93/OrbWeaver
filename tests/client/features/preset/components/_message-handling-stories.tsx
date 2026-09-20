// CT story module for the preset MESSAGE HANDLING section. A CT only mounts from a NON-test module
// (Spine-Testing §7), and this module exports COMPONENTS ONLY (playwright-ct rewrites named imports into
// generated component consts — a mixed component+constant import fails to parse).
//
// The two arms are the two shapes of `capability.turns.roleHandlingFloor`: a wire that imposes a REAL floor
// (Claude — the note is a true constraint the user cannot escape) and one that imposes NONE (the local vLLM
// wire under D143 — the note must not appear at all). Both go through the REAL `createAutosaveEntityForm`
// boundary the production editor mounts the section under.

import type { AppFormInstance } from "@orb/client/forms/editor";
import { createAutosaveEntityForm } from "@orb/client/forms/editor";
import type { GenerationCapability, RoleHandling } from "@orb/contracts/inference";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ReactElement } from "react";
import { MessageHandlingSection } from "../../../../../packages/client/src/features/preset/components/message-handling-section.tsx";
import { makeGenerationCapability } from "../../../../support/factories/resolved-connection.ts";

const STORY_PRESET = "preset_msghandlingaaa";

/** The Claude shape: `refineCuratedTurns` floors every Claude arm at `strict` (the wire hard-errors on
 *  adjacent same-role rows), so the floor note is TRUE and must render. */
const STRICT_CAPABILITY: ModelCapability = makeGenerationCapability({
  turns: {
    assistantPrefill: false,
    midConversationSystem: false,
    historySystemRows: false,
    roleHandlingFloor: "strict",
    explicitPromptCache: true,
    cacheMinTokens: 1024,
  },
});

/** The vLLM shape (`VLLM_TURNS`): no floor at all — the user's pick is the whole answer. */
const FLOORLESS_CAPABILITY: ModelCapability = makeGenerationCapability({
  turns: {
    assistantPrefill: false,
    midConversationSystem: true,
    historySystemRows: true,
    roleHandlingFloor: "none",
    explicitPromptCache: false,
  },
});

const StoryForm = createAutosaveEntityForm<PromptConfig>({ defaultValues: DEFAULT_PROMPT_CONFIG });

/** A model that DOES enforce a floor, with a below-floor pick stored — the note AND the clamp badge. */
export function MessageHandlingStrictFloorStory(): ReactElement {
  return <Harness capability={STRICT_CAPABILITY} roleHandling="merge" />;
}

/** The same model with no pick — the note stands alone (nothing to clamp). */
export function MessageHandlingStrictFloorUnsetStory(): ReactElement {
  return <Harness capability={STRICT_CAPABILITY} roleHandling={undefined} />;
}

/** The floorless (vLLM) model with the SAME below-a-strict-floor pick: nothing is clamped and nothing is
 *  announced — the pick is simply what runs. */
export function MessageHandlingNoFloorStory(): ReactElement {
  return <Harness capability={FLOORLESS_CAPABILITY} roleHandling="merge" />;
}

/** The capability read still in flight — no descriptor, so no floor claim either. */
export function MessageHandlingPendingCapabilityStory(): ReactElement {
  return <Harness capability={undefined} roleHandling={undefined} />;
}

function Harness({
  capability,
  roleHandling,
}: {
  readonly capability: ModelCapability | undefined;
  readonly roleHandling: RoleHandling | undefined;
}): ReactElement {
  const serverValues: PromptConfig = {
    ...DEFAULT_PROMPT_CONFIG,
    params: { ...DEFAULT_PROMPT_CONFIG.params, advanced: { ...DEFAULT_PROMPT_CONFIG.params.advanced, roleHandling } },
  };
  return (
    <StoryForm entityId={STORY_PRESET} save={(): Promise<void> => Promise.resolve()} serverValues={serverValues}>
      {(session): ReactElement => <MessageHandlingSection capability={capability} form={session.form as AppFormInstance<PromptConfig>} />}
    </StoryForm>
  );
}
