// Shared helper for the local-JSON db test files (db-followup,
// db-phaseb, db-delete). The flake: src/lib/db.ts binds its store
// path (data/local-db.json) once, at import time, from
// process.cwd(), and vitest runs test files in parallel — so files
// that back up / delete / restore that one file race each other
// inside db.ts's read-modify-write cycle and lose each other's rows.
//
// The fix is per-file isolation, test-only: each file gets its own
// temp directory, chdirs into it, and only then dynamically imports
// @/lib/db, so LOCAL_PATH lands inside that file's own temp store
// and the real data/local-db.json is never touched. This is safe
// because vitest runs each test file in its own worker process
// (forks pool — verified: two probe files got different pids), so
// the chdir cannot leak into any other test file. The static
// `import ... from "@/lib/db"` must NOT be used in a file that uses
// this helper: a static import would bind LOCAL_PATH to the repo
// cwd before beforeAll ever runs.
import { promises as fs } from "fs";
import os from "os";
import path from "path";

export async function importDbWithIsolatedStore(): Promise<{
  db: typeof import("@/lib/db");
  cleanup: () => Promise<void>;
}> {
  const originalCwd = process.cwd();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sortes-local-db-"));
  await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
  process.chdir(tmpDir);
  try {
    const db = await import("@/lib/db");
    return {
      db,
      cleanup: async () => {
        process.chdir(originalCwd);
        await fs.rm(tmpDir, { recursive: true, force: true });
      },
    };
  } catch (err) {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
    throw err;
  }
}
