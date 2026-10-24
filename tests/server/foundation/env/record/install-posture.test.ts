// @subject packages/server/src/foundation/env/record/index.ts
// The install posture and the machine's name are parse inputs: the record, not the machine running the test, decides
// the install kind, the fix a bind refusal names and whether the machine's name joins the Host allowlist.
import { allowedHostsInput, bindPostureInput, installKind, resolveBindPosture } from "@orb/server/foundation/env/record";
import { expect, test } from "@orb/testkit/node";
import { createTestEnv } from "@orb/testkit/node/helpers";

const MACHINE = "orb-posture-host";
const PUBLIC_HOST = "0.0.0.0";

test.for([
  { containerMarker: false, install: "bare-metal", machineHostname: MACHINE },
  { containerMarker: true, install: "container", machineHostname: null },
] as const)("a $install posture reaches the install kind, the bind refusal and the Host allowlist", ({ containerMarker, install, machineHostname }) => {
  const host = { containerMarker, hostname: MACHINE };
  const record = createTestEnv({}, host);
  expect(installKind(record)).toBe(install);
  expect(allowedHostsInput(record).machineHostname).toBe(machineHostname);

  const refusal = resolveBindPosture({ ...bindPostureInput(record), bindHost: PUBLIC_HOST }).refusal;
  expect(refusal).not.toBeNull();
  expect(() => createTestEnv({ ["BIND_HOST"]: PUBLIC_HOST }, host)).toThrow(refusal ?? "");
});

test("the image's own declaration is a container install on a machine with no runtime marker", () => {
  expect(installKind(createTestEnv({ ["ORB_CONTAINER"]: "true" }, { containerMarker: false, hostname: MACHINE }))).toBe("container");
});
