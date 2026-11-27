// The chat row fields every chat read carries, declared once: the full read (`ChatDetail`) and the list row
// (`ChatSummary`) both build on them, so a field of the row has one home.

import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

export interface ChatRowFields {
  readonly id: ChatId;
  readonly title: string | null;
  readonly archived: boolean;
}

export const chatRowShape = {
  id: typeIdSchema(ID_PREFIX.chat),
  title: z.string().nullable(),
  archived: z.boolean(),
};
