// COMPOSITION ROOT: wires the 6 verbs over the injected `PresetContext` (zero logic). It only calls the
// verb factories and assembles the `PresetService`. The context (db + bound `audit` writer + injected
// clock/id seam) is built at the entry composition root and passed in — preset injects no cross-feature
// op and no guard (it gates by `ownerId === userId`).

import type { PresetContext, PresetService } from "./contract/service";
import { createCreate } from "./verbs/create";
import { createGet } from "./verbs/get";
import { createList } from "./verbs/list";
import { createRemove } from "./verbs/remove";
import { createResetToDefault } from "./verbs/reset-to-default";
import { createUpdate } from "./verbs/update";

export function createPresetService(ctx: PresetContext): PresetService {
  return {
    ...createCreate(ctx),
    ...createList(ctx),
    ...createGet(ctx),
    ...createUpdate(ctx),
    ...createRemove(ctx),
    ...createResetToDefault(ctx),
  };
}
