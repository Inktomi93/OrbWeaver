import type { listMessagesInputSchema } from "@orb/contracts/chat";
import type { MessageWindowCursor } from "@orb/contracts/search";
import { expectTypeOf } from "vitest";
import type { z } from "zod";

type Input = z.input<typeof listMessagesInputSchema>;
expectTypeOf<Input["cursor"]>().toEqualTypeOf<MessageWindowCursor | null | undefined>();
expectTypeOf<Extract<keyof Input, "beforeSeq">>().toEqualTypeOf<never>();
