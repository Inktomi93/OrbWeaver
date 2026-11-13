// The names the boot scrub deletes match without regard to letter case, on every platform: Windows reads
// `database_url` or `claude_config_dir` as the same variable the parse and every child read, and where two spellings
// both exist on a case-sensitive platform both are scrubbed. Ordinary host variables, Windows' own included, stay.
import { RESERVED_CLAUDE_ENV_KEYS } from "@orb/contracts/preset";
import { DATABASE_URL_KEY } from "@orb/server/foundation/data-layout";
import { childRefusedEnvNames } from "@orb/server/foundation/env/record";
import { expect, test } from "@orb/testkit/node";

const VALUE = "planted";

// `Claude_Config_Dir`: the first letter of each word upper, the rest lower.
const titleCase = (name: string): string =>
  name
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join("_");

// Host variables a child needs, in the spellings each platform uses; none of them may be refused.
const KEPT = ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "APPDATA", "LANG", "HOME"] as const;

test("every reserved agent SDK key and the database URL are refused in upper, lower and mixed case, beside the host's own variables", () => {
  const refused = [
    ...RESERVED_CLAUDE_ENV_KEYS.flatMap((key) => [key, key.toLowerCase(), titleCase(key)]),
    DATABASE_URL_KEY,
    DATABASE_URL_KEY.toLowerCase(),
    titleCase(DATABASE_URL_KEY),
  ];
  const source = Object.fromEntries([...refused, ...KEPT].map((name) => [name, VALUE]));

  const names = childRefusedEnvNames(source);

  expect(names.toSorted()).toEqual(refused.toSorted());
  expect(names.filter((name) => (KEPT as readonly string[]).includes(name))).toEqual([]);
});
