// A draft retry can recover publication, but never move either stable pointer backwards.
import { compareSemver, SEMVER_RE } from "@orb/kit/semver";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { runTool } from "@orb/tooling/_shared/run-tool";
import { z } from "zod";

const API_TIMEOUT_MS = 30_000;
const HTTP_NOT_FOUND = 404;
const commitSchema = z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/u) });
const versionSchema = z.string().regex(SEMVER_RE);
const releaseSchema = z.object({ ["tag_name"]: z.string(), draft: z.literal(false), prerelease: z.literal(false) });

await runTool(async () => {
  const env = z
    .object({
      GH_TOKEN: z.string().min(1),
      GITHUB_REPOSITORY: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
      SOURCE_SHA: commitSchema.shape.sha,
      VERSION: versionSchema,
      TAG: z.string(),
    })
    .parse(inheritedProcessEnv());
  if (env.TAG !== `v${env.VERSION}`) {
    throw new Error("Promotion tag and version disagree");
  }
  const api = async (path: string): Promise<Response> =>
    await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/${path}`, {
      redirect: "error",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Cache-Control": "no-cache",
      },
    });
  const required = async (path: string): Promise<Response> => {
    const response = await api(path);
    if (!response.ok) {
      throw new Error(`Promotion admission read failed with HTTP ${String(response.status)}`);
    }
    return response;
  };
  const [tag, head] = await Promise.all([
    required(`commits/${env.TAG}`).then(async (response) => commitSchema.parse(await response.json())),
    required("commits/release").then(async (response) => commitSchema.parse(await response.json())),
  ]);
  if (tag.sha !== env.SOURCE_SHA) {
    throw new Error("Promotion source is not the candidate release tag");
  }
  const comparison = z.object({ ["merge_base_commit"]: commitSchema }).parse(await (await required(`compare/${env.SOURCE_SHA}...${head.sha}`)).json());
  if (comparison.merge_base_commit.sha !== env.SOURCE_SHA) {
    throw new Error("Candidate release is no longer on the trusted release history");
  }
  const blob = z.object({ encoding: z.literal("base64"), content: z.string() }).parse(await (await required(`contents/package.json?ref=${head.sha}`)).json());
  const current = z.object({ version: versionSchema }).parse(JSON.parse(Buffer.from(blob.content, "base64").toString("utf8")));
  if (compareSemver(env.VERSION, current.version) !== 0) {
    throw new Error("Obsolete draft cannot promote over the current release version");
  }
  const latest = await api("releases/latest");
  if (latest.status !== HTTP_NOT_FOUND) {
    if (!latest.ok) {
      throw new Error(`Latest release read failed with HTTP ${String(latest.status)}`);
    }
    const published = releaseSchema.parse(await latest.json());
    if (!published.tag_name.startsWith("v")) {
      throw new Error("Latest stable release has an unrecognized tag");
    }
    const publishedVersion = versionSchema.parse(published.tag_name.slice(1));
    if (compareSemver(env.VERSION, publishedVersion) < 0) {
      throw new Error("Obsolete draft cannot move the latest stable release backwards");
    }
  }
  console.log(`Admitted stable promotion of ${env.TAG} from ${env.SOURCE_SHA}.`);
  return 0;
});
