import { createBinding } from "@orb/kit/binding";
import { expect, test } from "@orb/testkit/node";

test("an early read preserves the composition error and succeeds after binding", () => {
  const message = "runtime accessed before composition";
  const binding = createBinding<{ readonly ready: boolean }>(message);
  expect(() => binding.read()).toThrow(new Error(message));
  const value = { ready: true };
  binding.bind(value);
  expect(binding.read()).toBe(value);
});

test("binding retains late object identity and permits the existing rebind lifecycle", () => {
  const first = { generation: 1 };
  const binding = createBinding<typeof first>("not built");
  binding.bind(first);
  first.generation = 2;
  expect(binding.read()).toBe(first);
  expect(binding.read().generation).toBe(2);
  const second = { generation: 3 };
  binding.bind(second);
  expect(binding.read()).toBe(second);
  expect(binding.read().generation).toBe(3);
});
