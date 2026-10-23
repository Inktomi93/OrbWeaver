import { toolCallsToExtraction } from "@orb/contracts/rpg";
import { expect, test } from "@orb/testkit/node";

// Tool-call arguments are model output, and JSON.parse keeps `__proto__` as an own key.
test("a refused field cannot return through a __proto__ key in the salvaged arguments", () => {
  const smuggled = JSON.stringify({ ["__proto__"]: { location: "Smuggled harbor" }, location: 7, calendarDate: "Spring 3" });
  const extraction = toolCallsToExtraction([{ name: "update_scene", arguments: smuggled }]);
  expect(extraction.scene?.calendarDate).toBe("Spring 3");
  expect(extraction.scene?.location).toBeUndefined();
});
