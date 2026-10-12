// Unit: the command palette's shortcut hint names the key the person actually has. The accelerator itself
// accepts either modifier (use-command-shortcut.ts); only the printed glyph depends on the platform.

import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { commandShortcutLabel } from "#client/features/app-shell/lib/command-shortcut-label.ts";

const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const IPAD_SAFARI = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const LINUX_CHROME = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const WINDOWS_EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0";

test("Apple platforms print the command glyph", () => {
  expect(commandShortcutLabel(MAC_CHROME)).toBe("⌘K");
  expect(commandShortcutLabel(IPAD_SAFARI)).toBe("⌘K");
});

test("every other platform prints Ctrl+K, including one whose UA carries the word Apple", () => {
  // `AppleWebKit` sits in every Chromium UA: a match on "Apple" alone would print ⌘ on Linux and Windows.
  expect(commandShortcutLabel(LINUX_CHROME)).toBe("Ctrl+K");
  expect(commandShortcutLabel(WINDOWS_EDGE)).toBe("Ctrl+K");
});
