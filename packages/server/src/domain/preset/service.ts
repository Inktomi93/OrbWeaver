// COMPOSITION ROOT: wires the verbs over the injected `PresetContext` (zero logic). It only calls the
// verb factories and assembles the `PresetService`. The context (db + bound `audit` writer + injected
// clock/id seam) is built at the entry composition root and passed in — preset injects no guard (it gates by
// `ownerId === userId`) and exactly ONE cross-feature op: the chat-role capability read `resolveEffective`
// projects the generation funnel against.

import type { PresetContext } from "./context.ts";
import type { PresetService } from "./contract/service.ts";
import { createClonePackaged } from "./verbs/clone-packaged.ts";
import { createCreate } from "./verbs/create.ts";
import { createGet } from "./verbs/get.ts";
import { createImport } from "./verbs/import.ts";
import { createImportFile } from "./verbs/import-file.ts";
import { createList } from "./verbs/list.ts";
import { createRemove } from "./verbs/remove.ts";
import { createResetToDefault } from "./verbs/reset-to-default.ts";
import { createResolveEffective } from "./verbs/resolve-effective.ts";
import { createUpdate } from "./verbs/update.ts";

export function createPresetService(ctx: PresetContext): PresetService {
  return {
    ...createCreate(ctx),
    ...createList(ctx),
    ...createGet(ctx),
    ...createUpdate(ctx),
    ...createRemove(ctx),
    ...createResetToDefault(ctx),
    ...createClonePackaged(ctx),
    ...createResolveEffective(ctx),
    // The single-preset import DOOR over the bundle's own import verb (factory injection — the verb-isolation
    // wiring point), so both doors run one implementation.
    ...createImportFile({ importPreset: createImport(ctx) }),
  };
}
