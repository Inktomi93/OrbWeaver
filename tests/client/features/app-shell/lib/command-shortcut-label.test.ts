import { expect, test } from "@orb/testkit/node";
import { commandShortcutLabel } from "#client/features/app-shell/lib/command-shortcut-label.ts";

const CHROME_LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const CHROME_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const SAFARI_IPAD = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

test("Apple platforms name the Command key", () => {
  for (const userAgent of [CHROME_MAC, SAFARI_IPHONE, SAFARI_IPAD]) {
    expect(commandShortcutLabel(userAgent)).toBe("⌘K");
  }
});

test("non-Apple platforms name Ctrl, even though every Chromium UA carries AppleWebKit", () => {
  for (const userAgent of [CHROME_LINUX, CHROME_WINDOWS, ""]) {
    expect(commandShortcutLabel(userAgent)).toBe("Ctrl+K");
  }
});
