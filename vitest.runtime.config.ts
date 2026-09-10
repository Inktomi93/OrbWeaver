// Native runtime-only entry point: typecheck projects are absent before caller project filters apply.
import { vitestConfig } from "./vitest.config.ts";

export default vitestConfig(true);
