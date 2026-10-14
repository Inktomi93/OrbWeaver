import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { inheritedProcessEnv, processEnvValue, withProcessEnv } from "@orb/tooling/floor/process/process-env";
import { colourNeutralParentEnv } from "../../../../tooling/src/verify/lib/child-env.ts";

const FORCE_COLOR = "FORCE_COLOR";
const CHILD_VALUE = "ORB_CHILD_ENV_CONTROL";

test("stage environment filters only FORCE_COLOR, reads current parent values and never mutates the parent", async () => {
  await withProcessEnv(FORCE_COLOR, "3", () =>
    withProcessEnv(CHILD_VALUE, "first", async () => {
      const parent = inheritedProcessEnv();
      const child = colourNeutralParentEnv();
      expect(Object.hasOwn(child, FORCE_COLOR)).toBe(false);
      expect(child[CHILD_VALUE]).toBe("first");
      expect({ ...child, [FORCE_COLOR]: "3" }).toEqual(parent);
      child[CHILD_VALUE] = "child-only";
      expect(processEnvValue(CHILD_VALUE)).toBe("first");
      expect(processEnvValue(FORCE_COLOR)).toBe("3");
      await withProcessEnv(CHILD_VALUE, "", () => {
        expect(colourNeutralParentEnv()[CHILD_VALUE]).toBe("");
        return Promise.resolve();
      });
      expect(colourNeutralParentEnv()[CHILD_VALUE]).toBe("first");
    }),
  );
});
