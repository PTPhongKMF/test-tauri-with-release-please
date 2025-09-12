//>>>> build-and-upload-tauri-portable-bundle.ts
//
// Run the installer produced by tauri-action, capture the installed files,
// produce a portable ZIP, and attach it to the GitHub release.

///////////////////////////////////////////////////////////////////////////////////////

import { join } from "jsr:@std/path/join";

/**
 * Release Asset type from the official octokit/openapi-types.ts repository.
 * @description Data related to a release.
 *
 * See: https://github.com/octokit/openapi-types.ts/blob/main/packages/openapi-types/types.d.ts (L#25691)
 */
interface releaseAsset {
  /** Format: uri */
  url: string;
  /** Format: uri */
  browser_download_url: string;
  id: number;
  node_id: string;
  /**
   * @description The file name of the asset.
   * @example Team Environment
   */
  name: string;
  label: string | null;
  /**
   * @description State of the release asset.
   * @enum {string}
   */
  state: "uploaded" | "open";
  content_type: string;
  size: number;
  download_count: number;
  /** Format: date-time */
  created_at: string;
  /** Format: date-time */
  updated_at: string;
  /**
   * @description Omitted type (not used in this script)
   * @type components["schemas"]["nullable-simple-user"]
   */
  uploader: unknown;
}

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
  assets: releaseAsset[];
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
  appName: string;
  token: string;
  osName: string;
  githubRepo: string;
  workspace: string;
  runnerTemp?: string;
  releaseId: string;
  tagName: string;
  artifactPaths: string[];
  htmlUrl: string;
  uploadUrl: string;
}

interface PortableZip {
  name: string;
  path: string;
}

function getRequiredInputs(): RequiredInputs {
  const APP_NAME = Deno.env.get("APP_NAME");
  if (!APP_NAME) throw new Error("APP_NAME environment variable is not defined.");

  const TOKEN = Deno.env.get("TOKEN");
  if (!TOKEN) throw new Error("🔑 TOKEN environment variable is not defined.");

  const OS_NAME = Deno.env.get("OS_NAME");
  if (!OS_NAME) throw new Error("OS_NAME environment variable is not defined.");

  const GITHUB_REPOSITORY = Deno.env.get("GITHUB_REPOSITORY");
  if (!GITHUB_REPOSITORY) throw new Error("GITHUB_REPOSITORY is not available. Cannot determine repository owner and name.");

  const WORKSPACE = Deno.env.get("GITHUB_WORKSPACE") ?? Deno.cwd();
  const RUNNER_TEMP = Deno.env.get("RUNNER_TEMP");

  const RELEASE_ID = Deno.env.get("RELEASE_ID ");
  if (!RELEASE_ID) throw new Error("RELEASE_ID  environment variable is not defined.");

  const TAG_NAME = Deno.env.get("TAG_NAME") ?? Deno.env.get("GITHUB_REF_NAME");
  if (!TAG_NAME) throw new Error("TAG_NAME environment variable is not defined.");

  const ARTIFACT_PATHS_JSON_STR = Deno.env.get("ARTIFACT_PATHS");
  if (!ARTIFACT_PATHS_JSON_STR) throw new Error("ARTIFACT_PATHS environment variable is not defined.");

  const HTML_URL = Deno.env.get("HTML_URL");
  if (!HTML_URL) throw new Error("HTML_URL environment variable is not defined.");

  const ARTIFACT_PATHS = JSON.parse(ARTIFACT_PATHS_JSON_STR);
  if (!(Array.isArray(ARTIFACT_PATHS) && ARTIFACT_PATHS.every((el) => typeof el === "string"))) {
    throw new Error(`Unexpected ARTIFACT_PATHS format. Expected string[], got: ${JSON.stringify(ARTIFACT_PATHS)}`);
  }

  const UPLOAD_URL = Deno.env.get("UPLOAD_URL");
  if (!UPLOAD_URL) throw new Error("UPLOAD_URL environment variable is not defined.");

  return {
    appName: APP_NAME,
    token: TOKEN,
    osName: OS_NAME,
    githubRepo: GITHUB_REPOSITORY,
    workspace: WORKSPACE,
    runnerTemp: RUNNER_TEMP,
    releaseId: RELEASE_ID,
    tagName: TAG_NAME,
    artifactPaths: ARTIFACT_PATHS,
    htmlUrl: HTML_URL,
    uploadUrl: UPLOAD_URL,
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

async function runInstaller(inputs: RequiredInputs, installDir: string) {
  console.log("Candidate artifact path(s):" + inputs.artifactPaths.map((p) => `\n > ${p}`).join(""));

  // prefer nsis setup.exe ending with -setup.exe, else any .exe
  const installer = inputs.artifactPaths.find((p) => /-setup\.exe$/i.test(p)) ??
    inputs.artifactPaths.find((p) => /\.exe$/i.test(p));
  if (!installer) throw new Error("Installer not found. Aborted.");

  console.log(`✔ Chosen installer: ${installer}`);
  try {
    await Deno.remove(installDir, { recursive: true });
  } catch { /* ignore */ }
  await Deno.mkdir(installDir, { recursive: true });

  console.log(`Running NSIS/EXE installer silently to ${installDir}`);
  // For NSIS: /S silent; /D=path (must be last argument, no quotes)
  // Many setup.exe will support /S; this is a best-effort.
  const cmd = new Deno.Command(installer, {
    args: ["/S", `/D=${installDir}`],
    stdout: "inherit",
    stderr: "inherit",
  });
  const child = cmd.spawn();
  const status = await child.status;
  if (!status.success) throw new Error("Installer exited with non-zero status.");

  console.log(`🔎 Verifying install directory after installation: ${installDir}`);
  let installedAny = false;
  for await (const _ of Deno.readDir(installDir)) {
    installedAny = true;
    break;
  }

  if (installedAny) {
    console.log(`🔎 No problems found.`);
  } else {
    throw new Error(
      `Install directory '${installDir}' appears empty.\n` +
        `The installer may not support redirecting INSTALLDIR or it failed. Set KEEP_TEMP=true to inspect runner files.`,
    );
  }
}

async function bundleToPortableZip(inputs: RequiredInputs, zipName: string, installDir: string): Promise<PortableZip> {
  const zipPath = join(inputs.workspace, zipName);
  try {
    await Deno.remove(zipPath);
  } catch { /* ignore */ }

  console.log("Zipping on Windows using PowerShell Compress-Archive...");
  const cmd = new Deno.Command("powershell", {
    args: ["-NoProfile", "-Command", `Compress-Archive -Path '${installDir}\\*' -DestinationPath '${zipPath}' -Force`],
    stdout: "inherit",
    stderr: "inherit",
  });
  const child = cmd.spawn();
  const status = await child.status;
  if (!status.success) throw new Error("Compress-Archive failed");

  console.log(`✔ Created zip: ${zipPath}`);

  return {
    name: zipName,
    path: zipPath,
  };
}

async function runScript() {
  console.log("Collecting required inputs...");
  const inputs = getRequiredInputs();

  const zipFilename = `${inputs.appName}-${inputs.tagName}-${inputs.osName}-portable.zip`;

  console.log(`Checking if release (id=${inputs.releaseId}, tag=${inputs.tagName}) already has asset '${zipFilename}'...`);

  const [owner, repo] = inputs.githubRepo.split("/");
  const getApiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/${inputs.releaseId}`;

  console.log(`Sending GET request (via GitHub REST API) to ${getApiUrl}`);
  const getReleaseResponse = await fetchOrThrow(getApiUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${inputs.token}`,
      Accept: "application/vnd.github+json",
    },
  });

  const release = await getReleaseResponse.json() as Release;
  if (release.assets.some((a) => a.name === zipFilename)) {
    throw new Error(`Release already contains '${zipFilename}'. Aborted.`);
  }

  console.log(`✔ No existing asset named '${zipFilename}' found. Continuing...`);

  const baseTemp = inputs.runnerTemp ?? join(inputs.workspace, ".tmp");
  const unique = `${inputs.tagName.replace(/[^A-Za-z0-9._-]/g, "_")}-${Date.now()}`;
  const installDir = join(baseTemp, `portable-${unique}`);
  console.log(`Install dir: ${installDir}`);

  console.log("Preparing to run installer...");
  await runInstaller(inputs, installDir);

  console.log("Preparing to bundle installed assets into portable zip...");
  const zip = await bundleToPortableZip(inputs, zipFilename, installDir);

  const zipFileBytes = await Deno.readFile(zip.path);

  const uploadBase = inputs.uploadUrl.replace(/\{.*\}$/, "");
  const postApiUrl = `${uploadBase}?name=${zip.name}`;

  console.log(`Sending POST request (via GitHub REST API) to ${postApiUrl}`);
  await fetchOrThrow(postApiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${inputs.token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/zip",
    },
    body: zipFileBytes,
  });

  console.log(`✔ Successfully uploaded portable zip version to release: ${inputs.htmlUrl}`);
}

async function main() {
  console.log("🔹 Start build-and-upload-tauri-portable-bundle.ts");

  try {
    await runScript();
  } catch (error) {
    console.log("::error::❌ An unexpected error occurred.\n" + error);
    Deno.exit(1);
  }

  console.log("🔹 Finished 'build-and-upload-tauri-portable-bundle.ts' successfully.");
}

main();
