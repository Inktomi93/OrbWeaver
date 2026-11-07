// An outsider's socket has no frame list to read undrained, and an unseated account cannot open a seated device.

import { expectTypeOf } from "vitest";
import type { Account, Device, OutsiderDevice, openDevice, Seat } from "./_held-room.ts";

expectTypeOf<keyof OutsiderDevice>().toEqualTypeOf<"attach" | "drained" | "takeChair" | "close">();
expectTypeOf<Device>().toHaveProperty("frames");
expectTypeOf<Parameters<typeof openDevice>[1]>().toEqualTypeOf<Seat>();
expectTypeOf<Account>().not.toExtend<Seat>();
