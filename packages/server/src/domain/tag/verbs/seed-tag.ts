// A shipped card suggests its native tags; seeding never accepts them on the recipient's behalf.

import type { AttachSeedCardTag } from "../contract/seed-tag.ts";
import type { TagService } from "../contract/service.ts";

export function createSeedCardTag(attach: TagService["attachCardTagByName"]): AttachSeedCardTag {
  return (params) => attach({ ...params, source: "card", status: "pending" });
}
