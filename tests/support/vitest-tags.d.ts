import type { TestTag } from "@orb/tooling/floor/testing/test-tags";

declare module "vitest" {
  interface TestTags {
    orbweaver: TestTag;
  }
}
