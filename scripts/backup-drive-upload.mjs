#!/usr/bin/env node
/**
 * backup-drive-upload.mjs - Upload encrypted Sortes backup to Google Drive.
 *
 * Usage:
 *   node scripts/backup-drive-upload.mjs --file <absolute .age path> \
 *     [--folder-id <id>] [--folder-name 'Sortes Backups'] [--dry-run] [--keep 14]
 *
 * Same-day re-upload policy:
 *   If an upload is re-run for an existing file name (e.g. manual retry,
 *   transient failure recovery, or multiple runs on the same date), the
 *   script replaces the content of the existing Drive file in place via
 *   `files update` instead of creating a duplicate file.
 *   This preserves the existing Drive file ID and webViewLink, prevents
 *   wasting shared Drive storage quota with redundant copies, and avoids
 *   confusion regarding which dump is authoritative.
 *
 * Safety:
 *   Refuses to upload any file not ending in .age (plaintext dumps must
 *   never leave the local VM).
 *   Never creates the Drive folder automatically; operator must create it.
 *   Prints only JSON log lines. Never logs credentials.
 */
import { spawnSync } from "child_process";
import { existsSync, statSync } from "fs";
import path from "path";

function arg(name) {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const filePath = arg("file");
const folderIdArg = arg("folder-id");
const folderName = arg("folder-name") || "Sortes Backups";
const dryRun = process.argv.includes("--dry-run");
const keep = Number(arg("keep") || process.env.SORTES_BACKUP_KEEP || 14);

if (!filePath) {
  console.error("backup-drive-upload: --file <absolute .age path> is required.");
  process.exit(2);
}

if (!path.isAbsolute(filePath)) {
  console.error(`backup-drive-upload: --file path must be absolute: ${filePath}`);
  process.exit(2);
}

if (!filePath.endsWith(".age")) {
  console.error(`backup-drive-upload: refusing to upload unencrypted file (must end in .age): ${filePath}`);
  process.exit(2);
}

if (!dryRun && !existsSync(filePath)) {
  console.error(`backup-drive-upload: file does not exist: ${filePath}`);
  process.exit(1);
}

const fileName = path.basename(filePath);
const fileSize = existsSync(filePath) ? statSync(filePath).size : 0;

const GWS_CLI = "/opt/hatch/bin/hatch_gws_cli";

function callGws(args) {
  const res = spawnSync(GWS_CLI, ["drive", ...args], { encoding: "utf8" });
  if (res.status !== 0) {
    const errMsg = (res.stderr || res.stdout || "unknown error").trim();
    console.error(`backup-drive-upload: Drive API call failed: ${errMsg}`);
    process.exit(1);
  }
  try {
    return JSON.parse(res.stdout);
  } catch {
    console.error("backup-drive-upload: failed to parse Drive CLI response as JSON.");
    process.exit(1);
  }
}

// 1. Resolve target folder
let folderId = folderIdArg;
if (!folderId) {
  const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`;
  const listRes = callGws(["files", "list", "--params", JSON.stringify({ q, fields: "files(id, name)" })]);
  if (!listRes.files || listRes.files.length === 0) {
    console.error(`backup-drive-upload: Google Drive folder '${folderName}' not found. Operator must create the folder first.`);
    process.exit(1);
  }
  folderId = listRes.files[0].id;
}

// 2. Check for existing file with the same name in the folder (same-day re-upload)
const checkQ = `'${folderId}' in parents and name = '${fileName.replace(/'/g, "\\'")}' and trashed = false`;
const existRes = callGws(["files", "list", "--params", JSON.stringify({ q: checkQ, fields: "files(id, name, size)" })]);
const existingFile = (existRes.files && existRes.files.length > 0) ? existRes.files[0] : null;

let uploadedFileId = "";

if (existingFile) {
  // Replace existing file content
  if (dryRun) {
    console.log(JSON.stringify({
      event: "drive-upload-dry-run",
      action: "replace",
      fileId: existingFile.id,
      name: fileName,
      size: fileSize,
      folderId
    }));
    uploadedFileId = existingFile.id;
  } else {
    callGws(["files", "update", "--params", JSON.stringify({ fileId: existingFile.id }), "--upload", filePath]);
    console.log(JSON.stringify({
      event: "drive-upload-ok",
      action: "replace",
      fileId: existingFile.id,
      name: fileName,
      size: fileSize,
      folderId
    }));
    uploadedFileId = existingFile.id;
  }
} else {
  // Upload new file
  if (dryRun) {
    console.log(JSON.stringify({
      event: "drive-upload-dry-run",
      action: "upload",
      name: fileName,
      size: fileSize,
      folderId
    }));
    uploadedFileId = "dry-run-file-id";
  } else {
    const uploadRes = callGws(["files", "+upload", filePath, "--parent", folderId, "--name", fileName]);
    uploadedFileId = uploadRes.id;
    console.log(JSON.stringify({
      event: "drive-upload-ok",
      action: "upload",
      fileId: uploadedFileId,
      name: fileName,
      size: fileSize,
      folderId
    }));
  }
}

// 3. Enforce 14-day retention on Drive (keep newest N files matching pattern)
const retentionQ = `'${folderId}' in parents and trashed = false`;
const retentionRes = callGws(["files", "list", "--params", JSON.stringify({ q: retentionQ, fields: "files(id, name, createdTime)" })]);
const backupBlobs = (retentionRes.files || [])
  .filter((f) => /^sortes-\d{8}-\d{6}\.dump\.age$/.test(f.name))
  .sort((a, b) => a.name.localeCompare(b.name));

const toPrune = [];
while (backupBlobs.length > keep) {
  toPrune.push(backupBlobs.shift());
}

if (toPrune.length > 0) {
  if (dryRun) {
    console.log(JSON.stringify({
      event: "drive-prune-dry-run",
      folderId,
      pruneCount: toPrune.length,
      toPrune: toPrune.map((f) => ({ id: f.id, name: f.name }))
    }));
  } else {
    for (const oldFile of toPrune) {
      callGws(["files", "update", "--params", JSON.stringify({ fileId: oldFile.id }), "--json", JSON.stringify({ trashed: true })]);
    }
    console.log(JSON.stringify({
      event: "drive-prune-ok",
      folderId,
      kept: backupBlobs.length,
      pruned: toPrune.map((f) => ({ id: f.id, name: f.name }))
    }));
  }
} else {
  if (dryRun) {
    console.log(JSON.stringify({
      event: "drive-prune-dry-run",
      folderId,
      pruneCount: 0,
      toPrune: []
    }));
  } else {
    console.log(JSON.stringify({
      event: "drive-prune-ok",
      folderId,
      kept: backupBlobs.length,
      pruned: []
    }));
  }
}
