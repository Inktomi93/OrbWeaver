// E2E (SINGLE-USER): the /api/_debug token states on a booted stack with its operator DEBUG_TOKEN configured.
import { describeDebugTokenStates } from "./support/debug-gate.ts";

describeDebugTokenStates("single-user");
