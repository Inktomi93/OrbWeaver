// @subject packages/client/src/state/new-character-request-store.ts
// The new-character request is spent exactly once, by exactly one host, and a request is never left pending for a host that mounts later.
import { onNewCharacterRequest, requestNewCharacter, takeNewCharacterRequest } from "@orb/client/state";
import { expect, test } from "@orb/testkit/node";

/** A host as the section mounts it: it opens only when its take wins. */
function mountHost(): { readonly opened: () => number; readonly unmount: () => void } {
  let opened = 0;
  const unmount = onNewCharacterRequest(() => {
    if (takeNewCharacterRequest()) {
      opened += 1;
    }
  });
  return { opened: (): number => opened, unmount };
}

test("a host that took the request waiting at its mount opens for each later request too", () => {
  requestNewCharacter();
  const host = mountHost();
  expect(host.opened()).toBe(1);
  requestNewCharacter();
  expect(host.opened()).toBe(2);
  requestNewCharacter();
  expect(host.opened()).toBe(3);
  host.unmount();
});

test("two mounted hosts open one form for one request", () => {
  const list = mountHost();
  const content = mountHost();
  requestNewCharacter();
  expect(list.opened() + content.opened()).toBe(1);
  requestNewCharacter();
  expect(list.opened() + content.opened()).toBe(2);
  list.unmount();
  content.unmount();
});

test("a request spent by one host leaves nothing pending for a host that mounts later", () => {
  const first = mountHost();
  requestNewCharacter();
  expect(first.opened()).toBe(1);
  const later = mountHost();
  expect(later.opened()).toBe(0);
  expect(takeNewCharacterRequest()).toBe(false);
  first.unmount();
  later.unmount();
});
