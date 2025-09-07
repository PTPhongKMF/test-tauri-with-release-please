/** prepend-markdown-to-release-please-release-note.ts
 * 
 * 
 */

///////////////////////////////////////////////////////////////////////////////////////

console.log("🔹 Start prepend-markdown-to-release-please-release-note.ts");

const TOKEN = Deno.env.get("TOKEN");
if (!TOKEN) {
  console.log("::error::❌ TOKEN environment variable is not defined.");
  Deno.exit(1);
}

const GITHUB_REPOSITORY = Deno.env.get("GITHUB_REPOSITORY");
if (!GITHUB_REPOSITORY) {
  console.log("::error::❌ GITHUB_REPOSITORY is not available. Cannot determine repository owner and name.");
  Deno.exit(1);
}

const TAG_NAME = Deno.env.get("TAG_NAME");
if (!TAG_NAME) {
  console.log("::error::❌ TAG_NAME environment variable is not defined.");
  Deno.exit(1);
}

// console.log(`✔ Successfully updated pull request: ${prUrl}`);
console.log("✔ Script 'prepend-markdown-to-release-please-release-note.ts' finished successfully.");
Deno.exit(0);