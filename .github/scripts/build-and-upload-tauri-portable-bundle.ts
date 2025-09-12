//>>>> build-and-upload-tauri-portable-bundle.ts
//
// Run the installer produced by tauri-action, capture the installed files,
// produce a portable ZIP, and attach it to the GitHub release.

///////////////////////////////////////////////////////////////////////////////////////

import { join } from "jsr:@std/path/join";

interface RequiredInputs {
  token: string;
  githubRepo: string;
  workspace: string;
  runnerTemp?: string;
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
  const TOKEN = Deno.env.get("TOKEN");
  if (!TOKEN) throw new Error("🔑 TOKEN environment variable is not defined.");

  const GITHUB_REPOSITORY = Deno.env.get("GITHUB_REPOSITORY");
  if (!GITHUB_REPOSITORY) throw new Error("GITHUB_REPOSITORY is not available. Cannot determine repository owner and name.");

  const WORKSPACE = Deno.env.get("GITHUB_WORKSPACE") ?? Deno.cwd();
  const RUNNER_TEMP = Deno.env.get("RUNNER_TEMP");

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
    token: TOKEN,
    githubRepo: GITHUB_REPOSITORY,
    workspace: WORKSPACE,
    runnerTemp: RUNNER_TEMP,
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

async function exists(p: string) {
  try {
    await Deno.stat(p);
    return true;
  } catch {
    return false;
  }
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

  if (!(await exists(installDir))) {
    console.log("Install folder not found; searching common Program Files locations for installed files...");
    const pf = Deno.env.get("ProgramFiles");
    const pf86 = Deno.env.get("ProgramFiles(x86)");
    const candidates = [pf, pf86].filter(Boolean);
    for (const c of candidates) {
      try {
        if (!c) break;
        console.log("Contents of", c);
        for await (const e of Deno.readDir(c)) {
          console.log(" -", e.name);
        }
      } catch (err: any) {
        console.warn("Could not read", c, ":", err.message ?? err);
      }
    }
  }

  console.log(`🔎 Verifying install directory: ${installDir}`);
  let installedAny = false;
  for await (const _ of Deno.readDir(installDir)) {
    installedAny = true;
    break;
  }

  if (!installedAny) {
    throw new Error(
      `Install directory '${installDir}' appears empty.\n` +
        `The installer may not support redirecting INSTALLDIR or it failed. Set KEEP_TEMP=true to inspect runner files.`,
    );
  }
}

async function bundleToPortableZip(inputs: RequiredInputs, installDir: string): Promise<PortableZip> {
  const zipName = `windows-portable-${inputs.tagName}.zip`;
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

  const baseTemp = inputs.runnerTemp ?? join(inputs.workspace, ".tmp");
  const unique = `${inputs.tagName.replace(/[^A-Za-z0-9._-]/g, "_")}-${Date.now()}`;
  const installDir = join(baseTemp, `portable-${unique}`);
  console.log(`Install dir: ${installDir}`);

  console.log("Preparing to run installer...");
  await runInstaller(inputs, installDir);

  console.log("Preparing to bundle installed assets into portable zip...");
  const zip = await bundleToPortableZip(inputs, installDir);

  const zipFileBytes = await Deno.readFile(zip.path);

  const uploadBase = inputs.uploadUrl.replace(/\{.*\}$/, "");
  const apiUrl = `${uploadBase}?name=${encodeURIComponent(zip.name)}`;

  console.log(`Sending POST request (via GitHub REST API) to ${apiUrl}`);
  await fetchOrThrow(apiUrl, {
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
