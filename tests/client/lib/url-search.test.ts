import { withoutUrlSearchParam } from "../../../packages/client/src/lib/url-search.ts";
import { expect, test } from "../../support/fixtures.ts";

test("malformed unrelated keys cannot block removal of encoded and duplicated handoff keys", () => {
  expect(withoutUrlSearchParam({ pathname: "/login", search: "?bad%=value&pendingJoin=1&%70endingJoin=1&keep=%2f", hash: "#turn" }, "pendingJoin")).toBe(
    "/login?bad%=value&keep=%2f#turn",
  );
});
