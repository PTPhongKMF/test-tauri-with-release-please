/** prepend-markdown-to-release-please-release-note.ts
 *
 * This script prepends content from a markdown file to the release note
 * of a GitHub release created by release-please (workflows/release-please.yml).
 */

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

console.log("🔹 Start prepend-markdown-to-release-please-release-note.ts");

try {
    const TOKEN = Deno.env.get("TOKEN");
    if (!TOKEN) throw new Error("🔑 TOKEN environment variable is not defined.");

    const GITHUB_REPOSITORY = Deno.env.get("GITHUB_REPOSITORY");
    if (!GITHUB_REPOSITORY) throw new Error("GITHUB_REPOSITORY is not available. Cannot determine repository owner and name.");

    const TAG_NAME = Deno.env.get("TAG_NAME");
    if (!TAG_NAME) throw new Error("TAG_NAME environment variable is not defined.");

    const prependMarkdownStr = await Deno.readTextFile(".github/scripts/assets/prepend-release-note.md");

    const [owner, repo] = GITHUB_REPOSITORY.split("/");
    const releaseTagUrl = `https://github.com/${owner}/${repo}/releases/tag/${TAG_NAME}`;

    const getApiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${TAG_NAME}`;

    console.log(`Sending GET request (via GitHub REST API) to ${getApiUrl}`);
    const getReleaseResponse = await fetch(getApiUrl, {
        headers: {
            "Authorization": `Bearer ${TOKEN}`,
            "Accept": "application/vnd.github+json",
        },
    });

    if (!getReleaseResponse.ok) {
        throw new Error(
            `Failed to fetch release. Status: ${getReleaseResponse.status}\n` +
                "::group::Error response:\n" +
                `${JSON.stringify(await getReleaseResponse.json(), null, 2)}\n` +
                "::endgroup::",
        );
    }

    const release = await getReleaseResponse.json() as Release;
    const releaseId = release.id;
    const releaseBody = release.body ?? "";

    const patchApiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/${releaseId}`;
    const newReleaseBody = `${prependMarkdownStr.trim()}\n\n${releaseBody.trim()}`;

    console.log(`Sending PATCH request (via GitHub REST API) to ${patchApiUrl}`);
    const patchReleaseResponse = await fetch(patchApiUrl, {
        method: "PATCH",
        headers: {
            "Authorization": `Bearer ${TOKEN}`,
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: newReleaseBody }),
    });

    if (!patchReleaseResponse.ok) {
        throw new Error(
            `Failed to update release note. Status: ${patchReleaseResponse.status}\n` +
                "::group::Error response:\n" +
                `${JSON.stringify(await patchReleaseResponse.json(), null, 2)}\n` +
                "::endgroup::",
        );
    }

    console.log(`✔ Successfully fetched and updated release: ${releaseTagUrl}`);
} catch (error) {
    console.log(
        "::error::❌ An unexpected error occurred.\n" +
            error,
    );
    Deno.exit(1);
}

console.log("🔹 Finished 'prepend-markdown-to-release-please-release-note.ts' successfully.");
Deno.exit(0);
