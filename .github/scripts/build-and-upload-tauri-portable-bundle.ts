//> build-and-upload-tauri-portable-bundle.ts
// 
// Run the installer produced by tauri-action, capture the installed files,
// produce a portable ZIP, and attach it to the GitHub release.

///////////////////////////////////////////////////////////////////////////////////////

interface RequiredInputs {
  token: string;
  githubRepo: string;
  workspace: string;
  runnerTemp?: string;
  tagName: string;
  artifactPaths: string;
  releaseUploadUrl: string;
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

  const ARTIFACT_PATHS = Deno.env.get("ARTIFACT_PATHS");
  if (!ARTIFACT_PATHS) throw new Error("ARTIFACT_PATHS environment variable is not defined.");

  const RELEASE_UPLOAD_URL = Deno.env.get("RELEASE_UPLOAD_URL");
  if (!RELEASE_UPLOAD_URL) throw new Error("RELEASE_UPLOAD_URL environment variable is not defined.");

  return {
    token: TOKEN,
    githubRepo: GITHUB_REPOSITORY,
    workspace: WORKSPACE,
    runnerTemp: RUNNER_TEMP,
    tagName: TAG_NAME,
    artifactPaths: ARTIFACT_PATHS,
    releaseUploadUrl: RELEASE_UPLOAD_URL,
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

// function splitArtifactPaths(s: string): string[] {
//   // tauri-action may output newline or semicolon separated paths; be robust
//   return s.split(/[\r\n;]+/).map((p) => p.trim()).filter(Boolean);
// }

async function runInstallerAndZip(inputs: RequiredInputs) {
  console.log("Parsing artifact paths...");
  const paths = splitArtifactPaths(inputs.artifactPaths);
  console.log(`Found ${paths.length} candidate artifact path(s).`);

  // prefer nsis setup.exe ending with -setup.exe, else any .exe, else .msi
  let installer = paths.find((p) => /-setup\.exe$/i.test(p)) ?? paths.find((p) => /\.exe$/i.test(p));
  let isMsi = false;
  if (!installer) {
    installer = paths.find((p) => /\.msi$/i.test(p));
    if (installer) isMsi = true;
  }

  if (!installer) {
    console.error("::error::No installer (.exe or .msi) found in artifactPaths. Listing candidate files under workspace...");
    // show some candidates for debugging
    try {
      const listing = [...Deno.readDirSync(inputs.workspace)];
      console.log("Workspace top-level sample:");
      listing.slice(0, 20).forEach((entry) => console.log(" - " + entry.name));
    } catch {
      // ignore
    }
    throw new Error("Installer not found; aborting.");
  }

  installer = installer.trim();
  console.log(`✔ Chosen installer: ${installer}`);

  // Prepare install dir
  const tempBase = inputs.runnerTemp ?? (inputs.workspace + "/.tmp");
  const installDir = `${tempBase}/portable_install`;
  try {
    await Deno.remove(installDir, { recursive: true });
  } catch { /* ignore */ }
  await Deno.mkdir(installDir, { recursive: true });

  // Run installer
  if (isMsi || /\.msi$/i.test(installer)) {
    console.log(`Running MSI (quiet) to INSTALLDIR=${installDir}`);
    const p = Deno.run({
      cmd: ["msiexec.exe", "/i", installer, "/qn", `INSTALLDIR=${installDir}`],
      stdout: "inherit",
      stderr: "inherit",
    });
    const status = await p.status();
    p.close();
    if (!status.success) throw new Error("msiexec failed (non-zero exit code)");
  } else {
    console.log(`Running NSIS/EXE installer silently to ${installDir}`);
    // For NSIS: /S silent; /D=path (must be last argument, no quotes)
    // Many setup.exe will support /S; this is a best-effort.
    const dArg = `/D=${installDir}`;
    const p = Deno.run({
      cmd: [installer, "/S", dArg],
      stdout: "inherit",
      stderr: "inherit",
    });
    const status = await p.status();
    p.close();
    if (!status.success) throw new Error("installer exited with non-zero status");
  }

  // Verify install dir populated
  let installedAny = false;
  try {
    for await (const _ of Deno.readDir(installDir)) {
      installedAny = true;
      break;
    }
  } catch {
    installedAny = false;
  }
  if (!installedAny) {
    console.warn(
      "::warning::Install directory appears empty after running installer. The installer may not support redirecting INSTALLDIR. Check installer behavior.",
    );
  } else {
    console.log("✔ Install directory populated (sample):");
    try {
      for await (const item of Deno.readDir(installDir)) {
        console.log(" - " + item.name);
      }
    } catch { /* ignore */ }
  }

  // Create zip
  const zipName = `portable-${inputs.tagName}.zip`;
  const zipPath = `${inputs.workspace}/${zipName}`;
  try {
    await Deno.remove(zipPath);
  } catch { /* ignore */ }

  if (Deno.build.os === "windows") {
    console.log("Zipping on Windows using PowerShell Compress-Archive...");
    const cmd = [
      "powershell",
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path "${installDir}\\*" -DestinationPath "${zipPath}" -Force`,
    ];
    const pzip = Deno.run({ cmd, stdout: "inherit", stderr: "inherit" });
    const s = await pzip.status();
    pzip.close();
    if (!s.success) throw new Error("Compress-Archive failed");
  } else {
    // non-windows fallback (requires zip installed)
    console.log("Zipping on non-Windows using system zip (zip must be available)...");
    const pzip = Deno.run({ cmd: ["zip", "-r", zipPath, "."], stdout: "inherit", stderr: "inherit", cwd: installDir });
    const s = await pzip.status();
    pzip.close();
    if (!s.success) throw new Error("zip failed");
  }

  console.log(`✔ Created zip: ${zipPath}`);

  // Upload to release via uploads URL
  // releaseUploadUrl likely contains a template like: https://uploads.github.com/.../releases/ID/assets{?name,label}
  let uploadBase = inputs.releaseUploadUrl.replace(/\{.*\}$/, "");
  const assetName = zipName;
  const uploadUrl = `${uploadBase}?name=${encodeURIComponent(assetName)}`;
  console.log(`Uploading asset to: ${uploadUrl}`);

  // Read file as bytes
  const fileBytes = await Deno.readFile(zipPath);
  const res = await fetchOrThrow(uploadUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${inputs.token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/zip",
      "Content-Length": String(fileBytes.length),
    },
    body: fileBytes,
  });

  const asset = await res.json();
  // asset.browser_download_url is useful
  console.log(`✔ Uploaded asset: ${asset.browser_download_url ?? asset.url ?? JSON.stringify(asset)}`);

  // Export portable_zip output for GitHub Actions
  const githubOutputPath = Deno.env.get("GITHUB_OUTPUT");
  if (githubOutputPath) {
    const line = `portable_zip=${zipPath}\n`;
    await Deno.writeTextFile(githubOutputPath, line, { append: true });
    console.log(`Set GitHub Actions output 'portable_zip' -> ${zipPath}`);
  } else {
    console.log("GITHUB_OUTPUT not set; skipping action output write.");
  }

  return {
    zipPath,
    asset,
  };
}

async function runScript() {
  const inputs = getRequiredInputs();

  const result = await runInstallerAndZip(inputs);
  console.log("All done. Portable zip path:", result.zipPath);
}

async function main() {
  console.log("🔹 Start build-and-upload-tauri-portable-bundle.ts");

  try {
    await runScript();
  } catch (error) {
    console.log("::error::❌ An unexpected error occurred.\n" + String(error));
    Deno.exit(1);
  }

  console.log("🔹 Finished 'build-and-upload-tauri-portable-bundle.ts' successfully.");
}

main();
