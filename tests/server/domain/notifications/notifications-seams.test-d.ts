// @subject packages/server/src/domain/notifications/service.ts
import type { createNotificationsService } from "@orb/server/domain/notifications";
import { expectTypeOf, test } from "vitest";

type NotificationsDeps = Parameters<typeof createNotificationsService>[0];

test("the notifications service requires its id source, so a direct build cannot mint ambient ids", () => {
  expectTypeOf<Pick<NotificationsDeps, "idSource">>().toEqualTypeOf<Required<Pick<NotificationsDeps, "idSource">>>();
  expectTypeOf<undefined>().not.toExtend<NotificationsDeps["idSource"]>();
  // @ts-expect-error a notifications build without `idSource` must not compile
  const withoutIdSource: Pick<NotificationsDeps, "idSource"> = {};
  expectTypeOf(withoutIdSource).toBeObject();
});
