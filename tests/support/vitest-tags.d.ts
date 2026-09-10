import type { TestTag } from "@orb/tooling/_shared/test-tags";

declare module "vitest" {
  interface TestTags {
    orbweaver: TestTag;
  }
}

export {};
