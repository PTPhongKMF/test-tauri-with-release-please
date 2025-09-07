/** prepend-markdown-to-release-please-release-note.ts
 *
 * dsd
 */

///////////////////////////////////////////////////////////////////////////////////////

console.log("🔹 Start prepend-markdown-to-release-please-release-note.ts");

try {
    const TOKEN = Deno.env.get("TOKEN");
    if (!TOKEN) throw new Error("🔑 TOKEN environment variable is not defined.");

    const GITHUB_REPOSITORY = Deno.env.get("GITHUB_REPOSITORY");
    if (!GITHUB_REPOSITORY) throw new Error("GITHUB_REPOSITORY is not available. Cannot determine repository owner and name.");

    const TAG_NAME = Deno.env.get("TAG_NAME");
    if (!TAG_NAME) throw new Error("TAG_NAME environment variable is not defined.");

    const prependMarkdownStr = await Deno.readTextFile(".github/scripts/assets/prepend-release-note.md");
} catch (error) {
    console.log(
        "::error::❌ An unexpected error occurred.\n" +
            error,
    );
    Deno.exit(1);
}

// console.log(`✔ Successfully updated pull request: ${prUrl}`);
console.log("🔹 Script 'prepend-markdown-to-release-please-release-note.ts' finished successfully.");
Deno.exit(0);
