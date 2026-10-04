// Unit: the fit room's explainer numbers (features/chat/lib/context-room).

import { limitOutgrownByReply, noRoomLine, roomExplainer } from "../../../../../packages/client/src/features/chat/lib/context-room.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("a reply reserve equal to the limit already leaves no room; one token less does", () => {
  expect(limitOutgrownByReply({ kind: "cap", tokens: 2048 }, 2048)).toEqual({ kind: "cap", tokens: 2048 });
  expect(limitOutgrownByReply({ kind: "cap", tokens: 2049 }, 2048)).toBeNull();
  expect(limitOutgrownByReply(null, 2048)).toBeNull();
});

test("a window explainer derives the margin from the limit, the reserve and the room; a cap carries none", () => {
  const window = roomExplainer(4300, { kind: "window", tokens: 8192 }, 2048);
  for (const figure of ["4,300", "8,192", "2,048", "1,844"]) {
    expect(window).toContain(figure);
  }
  const cap = roomExplainer(3952, { kind: "cap", tokens: 6000 }, 2048);
  for (const figure of ["3,952", "6,000", "2,048"]) {
    expect(cap).toContain(figure);
  }
  expect(cap).not.toContain("1,844");
  for (const figure of ["2,048", "2,000"]) {
    expect(noRoomLine({ kind: "cap", tokens: 2000 }, 2048)).toContain(figure);
  }
});
