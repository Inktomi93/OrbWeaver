// The two-human fixture, pure: the env recipe that runs the dev stack as a real multi-human deployment
// beside the operator's own (its own port pair, data root and run dir), and the credentials it seeds.
import { join } from "node:path";
import { FIXTURE_PORTS } from "../../_shared/ports.ts";
import { ENV_NO_FILE, PORT_ENV, RUN_DIR_ENV, VITE_API_TARGET_ENV, VITE_PORT_ENV } from "./stack-plan.ts";

/** Where the fixture keeps its DB, assets, secrets and run dir, under the repo root. */
export const FIXTURE_DIR_REL = join(".cache", "multi-user-fixture");
const FIXTURE_RUN_DIR_REL = join(FIXTURE_DIR_REL, "stack");
/** The env keys that move the fixture off its default pair when something else owns it. */
const FIXTURE_PORT_ENV = "FIXTURE_PORT";
const FIXTURE_VITE_PORT_ENV = "FIXTURE_VITE_PORT";

/** The dev users the fixture seeds, in `--contexts N` assignment order. Dev-only, insecure by design. */
export const FIXTURE_CREDENTIALS: readonly { readonly handle: string; readonly password: string }[] = [
  { handle: "owner", password: "owner-dev-pass" },
  { handle: "member", password: "member-dev-pass" },
];

const [OWNER, MEMBER] = FIXTURE_CREDENTIALS as readonly [
  { readonly handle: string; readonly password: string },
  { readonly handle: string; readonly password: string },
];

function portOr(raw: string | undefined, fallback: number): number {
  const port = Number(raw);
  return raw !== undefined && raw !== "" && Number.isInteger(port) && port > 0 ? port : fallback;
}

/** The fixture's env over the ambient one. The data root is relative to the repo root the way the
 *  server resolves it; the run dir is absolute so every reader agrees on it. `.env` is skipped entirely,
 *  so an operator key (an owner handle, an SSO issuer) cannot reach the fixture by luck. */
export function fixtureEnv(repoRoot: string, ambient: Readonly<Record<string, string | undefined>>): Readonly<Record<string, string>> {
  const server = portOr(ambient[FIXTURE_PORT_ENV], FIXTURE_PORTS.server);
  const vite = portOr(ambient[FIXTURE_VITE_PORT_ENV], FIXTURE_PORTS.vite);
  const dataRel = `./${FIXTURE_DIR_REL.replaceAll("\\", "/")}`;
  return Object.fromEntries([
    [PORT_ENV, String(server)],
    [VITE_PORT_ENV, String(vite)],
    [VITE_API_TARGET_ENV, `http://127.0.0.1:${String(server)}`],
    [RUN_DIR_ENV, join(repoRoot, FIXTURE_RUN_DIR_REL)],
    ["AUTH_MODE", "local"],
    ["DATA_DIR", dataRel],
    ["DATABASE_URL", `file:${dataRel}/orb.db`],
    ["ASSETS_DIR", `${dataRel}/assets`],
    ["SESSION_SECRET", "orbweaver-multi-user-fixture-session-secret-insecure"],
    ["CREDENTIALS_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"],
    ["LOCAL_INITIAL_PASSWORD", OWNER.password],
    [ENV_NO_FILE, "1"],
    ["OWNER_HANDLES", OWNER.handle],
    ["SEED_BASE_URL", `http://127.0.0.1:${String(server)}`],
    ["FIXTURE_OWNER_HANDLE", OWNER.handle],
    ["FIXTURE_OWNER_PASSWORD", OWNER.password],
    ["FIXTURE_MEMBER_HANDLE", MEMBER.handle],
    ["FIXTURE_MEMBER_PASSWORD", MEMBER.password],
  ]);
}
