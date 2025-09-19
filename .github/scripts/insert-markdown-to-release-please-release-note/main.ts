//>>>> insert-markdown-to-release-please-release-note.ts
// 
// This script inserts content from a markdown file to the release note
// of a GitHub release created by release-please (workflows/release-please.yml).

///////////////////////////////////////////////////////////////////////////////////////

/**
 * "Release" type from the official octokit/openapi-types.ts repository.
 *
 * See: https://github.com/octokit/openapi-types.ts/blob/main/packages/openapi-types/types.d.ts (L#25722)
 */
interface Release {
  /** Format: uri */
  url: string;
  /** Format: uri */
  html_url: string;
  /** Format: uri */
  assets_url: string;
  upload_url: string;
  /** Format: uri */
  tarball_url: string | null;
  /** Format: uri */
  zipball_url: string | null;
  id: number;
  node_id: string;
  /**
   * @description The name of the tag.
   * @example v1.0.0
   */
  tag_name: string;
  /**
   * @description Specifies the commitish value that determines where the Git tag is created from.
   * @example master
   */
  target_commitish: string;
  name: string | null;
  body?: string | null;
  /**
   * @description true to create a draft (unpublished) release, false to create a published one.
   * @example false
   */
  draft: boolean;
  /**
   * @description Whether to identify the release as a prerelease or a full release.
   * @example false
   */
  prerelease: boolean;
  /** Format: date-time */
  created_at: string;
  /** Format: date-time */
  published_at: string | null;
  /**
   * @description Omitted type (not used in this script)
   * @type components["schemas"]["simple-user"]
   */
  author: unknown;
  /**
   * @description Omitted type (not used in this script)
   * @type components["schemas"]["release-asset"][]
   */
  assets: unknown[];
  body_html?: string;
  body_text?: string;
  mentions_count?: number;
  /**
   * Format: uri
   * @description The URL of the release discussion.
   */
  discussion_url?: string;
  /**
   * @description Omitted type (not used in this script)
   * @type components["schemas"]["reaction-rollup"]
   */
  reactions?: unknown;
}

interface RequiredInputs {
  token: string;
  githubRepo: string;
  tagName: string;
}

function getRequiredInputs(): RequiredInputs {
  const TOKEN = Deno.env.get("TOKEN");
  if (!TOKEN) throw new Error("🔑 TOKEN environment variable is not defined.");

  const GITHUB_REPOSITORY = Deno.env.get("GITHUB_REPOSITORY");
  if (!GITHUB_REPOSITORY) throw new Error("GITHUB_REPOSITORY is not available. Cannot determine repository owner and name.");

  const TAG_NAME = Deno.env.get("TAG_NAME");
  if (!TAG_NAME) throw new Error("TAG_NAME environment variable is not defined.");

  return {
    token: TOKEN,
    githubRepo: GITHUB_REPOSITORY,
    tagName: TAG_NAME,
  };
}

async function fetchOrThrow(...args: Parameters<typeof fetch>): Promise<Response> {
  const response = await fetch(...args);

  if (!response.ok) {
    throw new Error(
      `Request failed. Status: ${response.status}\n` +
        "::group::Error response:\n" +
        `${JSON.stringify(await response.json(), null, 2)}\n` +
        "::endgroup::",
    );
  }

  return response;
}

async function runScript() {
  console.log("Collecting required inputs...");
  const inputs = getRequiredInputs();
  const insertMarkdownStr = await Deno.readTextFile(".github/scripts/insert-markdown-to-release-please-release-note/insert-markdown-20-09-25.md");
  if (!insertMarkdownStr) throw new Error("📄 '.github/scr/insert-markdown-to-release-please-release-note/insert-markdown-20-09-25.md' is empty.");

  const [owner, repo] = inputs.githubRepo.split("/");
  const releaseTagUrl = `https://github.com/${owner}/${repo}/releases/tag/${inputs.tagName}`;

  const getApiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${inputs.tagName}`;

  console.log(`Sending GET request (via GitHub REST API) to ${getApiUrl}`);
  const getReleaseResponse = await fetchOrThrow(getApiUrl, {
    headers: {
      "Authorization": `Bearer ${inputs.token}`,
      "Accept": "application/vnd.github+json",
    },
  });

  const release = await getReleaseResponse.json() as Release;

  const MARKER_START = "<!-- additional-markdown:start -->";
  const MARKER_TIMESTAMP = `<!-- time:${new Date().toISOString()} -->`;
  const MARKER_END = "<!-- additional-markdown:end -->";

  if (release.body?.includes(MARKER_START)) {
    console.log("::notice::🏃‍♂️ Release already contains an inserted markdown block. Skipped.");
    return;
  }

  const patchApiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/${release.id}`;
  const newReleaseBody = `${MARKER_START}\n${MARKER_TIMESTAMP}\n${insertMarkdownStr.trim()}\n${MARKER_END}\n\n\n${release.body || ""}`;

  console.log(`Sending PATCH request (via GitHub REST API) to ${patchApiUrl}`);
  await fetch(patchApiUrl, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${inputs.token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body: newReleaseBody }),
  });

  console.log(`✔ Successfully fetched and updated release: ${releaseTagUrl}`);
}

async function main() {
  console.log("🔹 Start insert-markdown-to-release-please-release-note.ts");

  try {
    await runScript();
  } catch (error) {
    console.log("::error::❌ An unexpected error occurred.\n" + error);
    Deno.exit(1);
  }

  console.log("🔹 Finished 'insert-markdown-to-release-please-release-note.ts' successfully.");
}

main();
