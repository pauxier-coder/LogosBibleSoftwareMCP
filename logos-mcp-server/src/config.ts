import { homedir } from "os";
import { join } from "path";
import { readdirSync } from "fs";

// ─── Logos Data Paths ────────────────────────────────────────────────────────

// Logos stores per-install data under a randomly named instance directory
// (e.g. "a3wo155q.w14"). Detect it instead of hardcoding.
function detectInstanceDir(root: string): string {
  try {
    const dirs = readdirSync(root, { withFileTypes: true }).filter((e) =>
      e.isDirectory()
    );
    if (dirs.length > 0) return join(root, dirs[0].name);
  } catch {
    // root missing — fall through, DB reads will report file-not-found
  }
  return root;
}

const IS_WINDOWS = process.platform === "win32";

const LOGOS_ROOT = IS_WINDOWS
  ? join(
      process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
      "Logos"
    )
  : join(homedir(), "Library", "Application Support", "Logos4");

export const LOGOS_DATA_DIR =
  process.env.LOGOS_DATA_DIR ?? detectInstanceDir(join(LOGOS_ROOT, "Documents"));

// Catalog DB lives under Data/ (not Documents/)
export const LOGOS_CATALOG_DIR =
  process.env.LOGOS_CATALOG_DIR ?? detectInstanceDir(join(LOGOS_ROOT, "Data"));

export const DB_PATHS = {
  visualMarkup: join(LOGOS_DATA_DIR, "VisualMarkup", "visualmarkup.db"),
  favorites: join(LOGOS_DATA_DIR, "FavoritesManager", "favorites.db"),
  workflows: join(LOGOS_DATA_DIR, "Workflows", "Workflows.db"),
  readingLists: join(LOGOS_DATA_DIR, "ReadingLists", "ReadingLists.db"),
  shortcuts: join(LOGOS_DATA_DIR, "ShortcutsManager", "shortcuts.db"),
  guides: join(LOGOS_DATA_DIR, "Guides", "guides.db"),
  notes: join(LOGOS_DATA_DIR, "NotesToolManager", "notestool.db"),
  clippings: join(LOGOS_DATA_DIR, "Documents", "Clippings", "Clippings.db"),
  passageLists: join(LOGOS_DATA_DIR, "Documents", "PassageList", "PassageList.db"),
  catalog: join(LOGOS_CATALOG_DIR, "LibraryCatalog", "catalog.db"),
} as const;

// ─── Biblia API ──────────────────────────────────────────────────────────────

export const BIBLIA_API_KEY = process.env.BIBLIA_API_KEY ?? "";
export const BIBLIA_API_BASE = "https://api.biblia.com/v1/bible";
export const DEFAULT_BIBLE = "LEB";

// ─── Logos URL Schemes ───────────────────────────────────────────────────────

export const LOGOS_URL_BASE = "logos4:";

// ─── Server Info ─────────────────────────────────────────────────────────────

export const SERVER_NAME = "logos-bible";
export const SERVER_VERSION = "1.0.0";
