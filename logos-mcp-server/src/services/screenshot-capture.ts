/**
 * screenshot-capture.ts
 *
 * Captures screenshots of the Logos Bible Software window via the macOS
 * CGWindowList API and `screencapture` CLI. Uses a compiled Objective-C helper
 * to discover window IDs (the only reliable method — AppleScript, Python, JXA,
 * and Swift all failed for CEF-based windows).
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { readFile, unlink } from "fs/promises";
import { join } from "path";
import {
  bibleUrl,
  bibleSearchUrl,
  wordStudyUrl,
  factbookUrl,
  resourceUrl,
  guideUrl,
  searchAllUrl,
  isBiblicalScript,
} from "./logos-urls.js";
import { isLogosRunning } from "./logos-app.js";
import {
  HELPER_CACHE_DIR,
  WINDOW_HELPER_BIN,
  WINDOW_HELPER_SRC,
  SCROLL_HELPER_BIN,
  SCROLL_HELPER_SRC,
  SCREENSHOT_TEMP_DIR,
  DEFAULT_CAPTURE_WAIT_MS,
  MAX_CAPTURE_WAIT_MS,
} from "../config.js";
import type { LogosWindow, ScreenshotResult, CaptureToolType } from "../types.js";

const execFileAsync = promisify(execFile);

// ─── Objective-C helper source ──────────────────────────────────────────────

const OBJ_C_SOURCE = `
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        CFArrayRef windowList = CGWindowListCopyWindowInfo(
            kCGWindowListOptionAll | kCGWindowListExcludeDesktopElements,
            kCGNullWindowID
        );
        if (!windowList) {
            fprintf(stderr, "Failed to get window list (screen capture permission needed)\\n");
            return 1;
        }
        NSArray *windows = (NSArray *)windowList;
        NSMutableArray *results = [NSMutableArray array];
        for (NSDictionary *window in windows) {
            NSString *ownerName = window[@"kCGWindowOwnerName"];
            if ([ownerName containsString:@"Logos"]) {
                NSDictionary *bounds = window[@"kCGWindowBounds"];
                [results addObject:@{
                    @"owner": ownerName ?: @"",
                    @"windowID": window[@"kCGWindowNumber"] ?: @0,
                    @"x": bounds[@"X"] ?: @0,
                    @"y": bounds[@"Y"] ?: @0,
                    @"width": bounds[@"Width"] ?: @0,
                    @"height": bounds[@"Height"] ?: @0,
                    @"layer": window[@"kCGWindowLayer"] ?: @0,
                    @"name": window[@"kCGWindowName"] ?: @""
                }];
            }
        }
        CFRelease(windowList);
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:results options:0 error:nil];
        printf("%s\\n", [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding].UTF8String);
    }
    return 0;
}
`;

// ─── Helper compilation ─────────────────────────────────────────────────────

async function ensureHelper(): Promise<void> {
  if (!existsSync(WINDOW_HELPER_BIN)) {
    mkdirSync(HELPER_CACHE_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(WINDOW_HELPER_SRC, OBJ_C_SOURCE);
    await execFileAsync("clang", [
      "-framework", "CoreGraphics",
      "-framework", "Foundation",
      "-o", WINDOW_HELPER_BIN,
      WINDOW_HELPER_SRC,
    ]);
  }
}

/**
 * Posts pixel scroll-wheel events at a global screen point, then puts the
 * cursor back. Logos scrolls whichever panel is under the point, so this is
 * how a specific panel gets scrolled without clicking into it. Needs the
 * Accessibility permission for the process that runs the server.
 */
const SCROLL_C_SOURCE = `
#import <ApplicationServices/ApplicationServices.h>
#include <stdlib.h>
#include <unistd.h>
// usage: scroll x y pixels [steps]   (global points; positive = content moves up, i.e. read further down)
int main(int argc, const char *argv[]) {
  if (argc < 4) { fprintf(stderr, "usage: scroll x y pixels [steps]\\n"); return 2; }
  double x = atof(argv[1]), y = atof(argv[2]);
  int px = atoi(argv[3]); int steps = argc > 4 ? atoi(argv[4]) : 10;
  if (steps < 1) steps = 1;
  CGEventRef cur = CGEventCreate(NULL); CGPoint saved = CGEventGetLocation(cur); CFRelease(cur);
  CGPoint p = CGPointMake(x, y);
  CGWarpMouseCursorPosition(p); CGAssociateMouseAndMouseCursorPosition(true);
  usleep(80000);
  int per = px / steps;
  for (int i = 0; i < steps; i++) {
    CGEventRef e = CGEventCreateScrollWheelEvent(NULL, kCGScrollEventUnitPixel, 1, -per);
    CGEventSetLocation(e, p); CGEventPost(kCGHIDEventTap, e); CFRelease(e); usleep(15000);
  }
  usleep(80000);
  CGWarpMouseCursorPosition(saved); CGAssociateMouseAndMouseCursorPosition(true);
  return 0;
}
`;

async function ensureScrollHelper(): Promise<void> {
  if (!existsSync(SCROLL_HELPER_BIN)) {
    mkdirSync(HELPER_CACHE_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(SCROLL_HELPER_SRC, SCROLL_C_SOURCE);
    await execFileAsync("clang", [
      "-framework", "ApplicationServices",
      "-o", SCROLL_HELPER_BIN,
      SCROLL_HELPER_SRC,
    ]);
  }
}

// ─── Window discovery ───────────────────────────────────────────────────────

export async function getLogosWindows(): Promise<LogosWindow[]> {
  await ensureHelper();
  const { stdout } = await execFileAsync(WINDOW_HELPER_BIN);
  return JSON.parse(stdout.trim()) as LogosWindow[];
}

async function getMainWindow(): Promise<LogosWindow | null> {
  const windows = await getLogosWindows();
  if (windows.length === 0) return null;

  // Prefer the window with "Logos" in its name
  const named = windows.find((w) => w.name && w.name.includes("Logos"));
  if (named) return named;

  // Fall back to largest by area
  return windows.reduce((best, w) =>
    w.width * w.height > best.width * best.height ? w : best
  );
}

/**
 * Titles (kCGWindowName) of all currently open Logos windows, for use by a
 * `get_logos_state` tool. Never throws — returns an empty array if Logos
 * isn't running or the window helper fails.
 */
export async function getLogosWindowTitles(): Promise<string[]> {
  try {
    const running = await isLogosRunning();
    if (!running) return [];
    const windows = await getLogosWindows();
    return windows.map((w) => w.name).filter((name): name is string => Boolean(name));
  } catch {
    return [];
  }
}

// ─── URL building ───────────────────────────────────────────────────────────

export interface NavigationUrl {
  url: string;
  description: string;
}

export function buildNavigationUrl(
  panelType: CaptureToolType,
  options: {
    reference?: string;
    guideType?: string;
    resourceId?: string;
    headword?: string;
  }
): NavigationUrl {
  switch (panelType) {
    case "bible": {
      if (!options.reference) {
        throw new Error("Bible panel requires a reference (e.g., 'Romans 12:1')");
      }
      return {
        url: bibleUrl(options.reference),
        description: `Bible: ${options.reference}`,
      };
    }

    case "factbook": {
      if (!options.reference) {
        throw new Error("Factbook panel requires a reference/topic (e.g., 'Moses')");
      }
      return {
        url: factbookUrl(options.reference),
        description: `Factbook: ${options.reference}`,
      };
    }

    case "wordstudy": {
      if (!options.reference) {
        throw new Error("Word Study panel requires a word (e.g., 'agape')");
      }
      return {
        url: wordStudyUrl(options.reference),
        description: `Word Study: ${options.reference}`,
      };
    }

    case "guide": {
      if (!options.reference) {
        throw new Error("Guide panel requires a Bible reference");
      }
      if (!options.guideType) {
        throw new Error("Guide panel requires a guide_type (e.g., 'Exegetical Guide')");
      }
      return {
        url: guideUrl(options.guideType, options.reference),
        description: `${options.guideType}: ${options.reference}`,
      };
    }

    case "search": {
      if (!options.reference) {
        throw new Error("Search panel requires a query");
      }
      return {
        url: bibleSearchUrl(options.reference),
        description: `Search: ${options.reference}`,
      };
    }

    case "searchall": {
      if (!options.reference) {
        throw new Error("Search All panel requires a query");
      }
      return {
        url: searchAllUrl(options.reference),
        description: `Search All: ${options.reference}`,
      };
    }

    case "resource": {
      if (!options.resourceId) {
        throw new Error("Resource panel requires a resource_id");
      }
      let desc = `Resource: ${options.resourceId}`;
      if (options.headword) desc += ` headword ${options.headword}`;
      else if (options.reference) desc += ` at ${options.reference}`;
      return {
        url: resourceUrl(options.resourceId, options.reference, options.headword),
        description: desc,
      };
    }

    default:
      throw new Error(`Unknown panel type: ${panelType}`);
  }
}

// ─── Downscaling ─────────────────────────────────────────────────────────────

const DEFAULT_MAX_WIDTH = 1400;

/** Parses the width in pixels from `sips -g pixelWidth <path>` stdout. */
export function parseSipsPixelWidth(output: string): number | null {
  const match = output.match(/pixelWidth:\s*(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/** Whether an image of `currentWidth` needs resampling down to `maxWidth`. */
export function shouldResample(currentWidth: number, maxWidth: number): boolean {
  return currentWidth > maxWidth;
}

/** Builds the `sips` argv that resamples the image at `tempPath` to `maxWidth`. */
export function buildSipsResampleArgs(tempPath: string, maxWidth: number): string[] {
  return ["--resampleWidth", String(maxWidth), tempPath];
}

/**
 * Downscales the PNG at `tempPath` in place when it's wider than `maxWidth`.
 * Retina full-window captures are huge base64 blobs for an LLM; this bounds
 * them. If `sips` fails for any reason, the capture proceeds un-scaled.
 */
async function maybeDownscale(tempPath: string, maxWidth: number): Promise<void> {
  try {
    const { stdout } = await execFileAsync("sips", ["-g", "pixelWidth", tempPath]);
    const currentWidth = parseSipsPixelWidth(stdout);
    if (currentWidth === null || !shouldResample(currentWidth, maxWidth)) {
      return;
    }
    await execFileAsync("sips", buildSipsResampleArgs(tempPath, maxWidth));
  } catch {
    // sips unavailable or failed — proceed with the un-scaled image.
  }
}

// ─── Capture primitives ─────────────────────────────────────────────────────

/**
 * Brings Logos to the front. Region capture grabs whatever is physically on
 * screen inside the rect, so an MCP client window sitting on top of Logos
 * would otherwise end up in the image.
 */
/** Time for the window server to finish fronting Logos before we measure it. */
const ACTIVATION_SETTLE_MS = 800;

async function activateLogos(): Promise<void> {
  try {
    await execFileAsync("osascript", ["-e", 'tell application "Logos" to activate']);
  } catch {
    // Activation is best-effort; `open logos4://` has usually already fronted it.
  }
}

/**
 * Writes a PNG of `win` to `outPath`.
 *
 * Prefers `screencapture -l <windowID>`, which captures the window even when
 * occluded. That path is backed by CGWindowListCreateImage, which Apple
 * deprecated in macOS 14 and which no longer functions on macOS 26 — there it
 * fails with "could not create image from window" regardless of Screen
 * Recording permission. So we fall back to a bounds-based region capture,
 * which still works. Region capture is second choice because it grabs whatever
 * is on screen in that rect, occluding windows included.
 */
export async function captureWindowImage(
  win: LogosWindow,
  outPath: string
): Promise<void> {
  try {
    await execFileAsync("screencapture", ["-x", "-l", String(win.windowID), outPath]);
    if (existsSync(outPath)) return;
  } catch {
    // fall through to region capture
  }

  await execFileAsync("screencapture", [
    "-x",
    `-R${win.x},${win.y},${win.width},${win.height}`,
    outPath,
  ]);
}

// ─── Factbook type-ahead ────────────────────────────────────────────────────

/**
 * Logos 53 has no Factbook URL form that takes a Greek or Hebrew lemma
 * (`;lemma=` is ignored; `;ref=<greek>` opens an empty Factbook). What works is
 * the search box: opening any Factbook URL focuses it, then we paste the term,
 * let the suggestion dropdown populate, arrow down to row `pick`, and press
 * Return. The paste goes through the clipboard (System Events keystrokes can't
 * type Greek), and the user's clipboard is restored afterwards.
 *
 * `pick` matters when a lemma collides with a proper noun: for φιλαδελφία row 1
 * is the city Φιλαδελφία and row 2 is the common noun "brotherly love".
 */
const FACTBOOK_TYPEAHEAD_SCRIPT = `
on run argv
  set term to item 1 of argv
  set downs to (item 2 of argv) as integer
  set old to missing value
  try
    set old to the clipboard
  end try
  set the clipboard to term
  tell application "Logos" to activate
  delay 0.5
  tell application "System Events"
    keystroke "a" using command down
    keystroke "v" using command down
    delay 1.5
    repeat downs times
      key code 125
      delay 0.2
    end repeat
    key code 36
  end tell
  delay 0.3
  if old is not missing value then set the clipboard to old
end run
`;

/** Time for the Factbook to focus its search box after the URL opens. */
const FACTBOOK_FOCUS_MS = 2500;
/** Factbook articles for lemmas render slowly (senses, media, links). */
const FACTBOOK_TYPEAHEAD_WAIT_MS = 8000;

export function needsFactbookTypeAhead(topic: string, pick?: number): boolean {
  return isBiblicalScript(topic) || (pick !== undefined && pick > 1);
}

async function factbookTypeAhead(term: string, pick: number): Promise<void> {
  await execFileAsync("open", [factbookUrl("x")]);
  await new Promise((resolve) => setTimeout(resolve, FACTBOOK_FOCUS_MS));
  await execFileAsync("osascript", [
    "-e", FACTBOOK_TYPEAHEAD_SCRIPT,
    term.normalize("NFC"),
    String(Math.max(0, pick - 1)),
  ]);
}

// ─── Scrolling ──────────────────────────────────────────────────────────────

export type PanelPosition = "left" | "center" | "right";

/** Horizontal fraction of the main window used for each named panel position. */
const PANEL_X_FRACTION: Record<PanelPosition, number> = {
  left: 0.3,
  center: 0.5,
  right: 0.73,
};
/** Vertical point inside the window — below the toolbar and panel tabs. */
const PANEL_Y_FRACTION = 0.55;
/** One "page" scrolls this share of the window height, leaving some overlap. */
const PAGE_FRACTION = 0.7;

/** Global screen point to scroll at, from window bounds and a panel position. */
export function scrollPoint(
  win: Pick<LogosWindow, "x" | "y" | "width" | "height">,
  position: PanelPosition = "right",
  xFraction?: number,
  yFraction?: number
): { x: number; y: number } {
  const fx = xFraction ?? PANEL_X_FRACTION[position];
  const fy = yFraction ?? PANEL_Y_FRACTION;
  return {
    x: Math.round(win.x + win.width * Math.min(Math.max(fx, 0.02), 0.98)),
    y: Math.round(win.y + win.height * Math.min(Math.max(fy, 0.1), 0.95)),
  };
}

/** Pixels to scroll for `pages` pages of a window this tall (negative = up). */
export function scrollPixels(windowHeight: number, pages: number): number {
  return Math.round(windowHeight * PAGE_FRACTION * pages);
}

/**
 * Scrolls the Logos panel at `position` by `pages` screens (negative scrolls
 * up) and captures the window afterwards. Does not navigate anywhere first.
 */
export async function scrollLogosPanel(options: {
  position?: PanelPosition;
  pages?: number;
  pixels?: number;
  xFraction?: number;
  yFraction?: number;
  maxWidth?: number;
  capture?: boolean;
}): Promise<ScreenshotResult> {
  if (process.platform !== "darwin") {
    return { success: false, error: "scroll_panel is macOS-only." };
  }
  if (!(await isLogosRunning())) {
    return { success: false, error: "Logos is not running. Please start Logos Bible Software first." };
  }

  await activateLogos();
  await new Promise((resolve) => setTimeout(resolve, ACTIVATION_SETTLE_MS));

  const mainWindow = await getMainWindow().catch(() => null);
  if (!mainWindow) {
    return { success: false, error: "No Logos window found on screen. Is Logos visible?" };
  }

  const position = options.position ?? "right";
  const point = scrollPoint(mainWindow, position, options.xFraction, options.yFraction);
  const pixels = options.pixels ?? scrollPixels(mainWindow.height, options.pages ?? 1);

  try {
    await ensureScrollHelper();
    await execFileAsync(SCROLL_HELPER_BIN, [String(point.x), String(point.y), String(pixels), "12"]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      error: `Scroll failed: ${msg}. The app running this server needs Accessibility permission (System Settings › Privacy & Security › Accessibility).`,
    };
  }

  const description = `Scrolled ${position} panel ${pixels >= 0 ? "down" : "up"} ${Math.abs(pixels)}px at (${point.x},${point.y})`;
  if (options.capture === false) {
    return { success: true, description };
  }

  // Let smooth scrolling finish before the capture.
  await new Promise((resolve) => setTimeout(resolve, 700));
  return captureMainWindow(description, options.maxWidth);
}

// ─── Main capture function ──────────────────────────────────────────────────

/**
 * Captures the ENTIRE Logos window, not just the active panel. `panelType`
 * only controls which panel Logos navigates to before the screenshot is
 * taken — it does not crop the resulting image.
 */
export async function captureLogosPanel(
  panelType: CaptureToolType,
  options: {
    reference?: string;
    guideType?: string;
    resourceId?: string;
    headword?: string;
    factbookPick?: number;
    waitMs?: number;
    maxWidth?: number;
  } = {}
): Promise<ScreenshotResult> {
  // Capture relies on clang/screencapture/sips — all macOS-only.
  if (process.platform !== "darwin") {
    return {
      success: false,
      error: "capture_panel_screenshot is currently macOS-only (it uses the macOS screencapture toolchain). Other Logos tools work on Windows.",
    };
  }

  // 1. Check Logos is running
  const running = await isLogosRunning();
  if (!running) {
    return {
      success: false,
      error: "Logos is not running. Please start Logos Bible Software first.",
    };
  }

  // 2. Build navigation URL
  let nav: NavigationUrl;
  try {
    nav = buildNavigationUrl(panelType, options);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }

  // 3. Navigate Logos: a URL for most panels, search-box type-ahead for a
  // Factbook lemma in Greek/Hebrew (or an explicit dropdown row).
  const typeAhead =
    panelType === "factbook" &&
    !!options.reference &&
    needsFactbookTypeAhead(options.reference, options.factbookPick);
  try {
    if (typeAhead) {
      const pick = options.factbookPick ?? 1;
      await factbookTypeAhead(options.reference!, pick);
      nav = { ...nav, description: `${nav.description} (dropdown row ${pick})` };
    } else {
      await execFileAsync("open", [nav.url]);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint = typeAhead
      ? " Factbook type-ahead needs Accessibility permission for the app running this server."
      : "";
    return { success: false, error: `Failed to navigate Logos: ${msg}.${hint}` };
  }

  // 3b. Front Logos so a region capture cannot pick up an overlapping window
  await activateLogos();

  // 4. Wait for content to render
  const defaultWait = typeAhead ? FACTBOOK_TYPEAHEAD_WAIT_MS : DEFAULT_CAPTURE_WAIT_MS;
  const waitMs = Math.min(options.waitMs ?? defaultWait, MAX_CAPTURE_WAIT_MS);
  await new Promise((resolve) => setTimeout(resolve, waitMs));

  // 4b. Re-front Logos immediately before measuring and capturing: another app
  // may have taken focus during the render wait, and a region capture reads
  // whatever is on screen, not the window itself.
  await activateLogos();
  await new Promise((resolve) => setTimeout(resolve, ACTIVATION_SETTLE_MS));

  return captureMainWindow(nav.description, options.maxWidth);
}

/**
 * Finds the main Logos window and captures it as-is (no navigation). Logos
 * must already be frontmost: on macOS 26 this is a region capture.
 */
async function captureMainWindow(
  description: string,
  maxWidthOpt?: number
): Promise<ScreenshotResult> {
  // 5. Find the Logos window
  let mainWindow: LogosWindow | null;
  try {
    mainWindow = await getMainWindow();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      error: `Failed to find Logos window: ${msg}. Ensure Screen Recording permission is granted.`,
    };
  }

  if (!mainWindow) {
    return {
      success: false,
      error: "No Logos window found on screen. Is Logos visible?",
    };
  }

  // 6. Capture the window
  const timestamp = Date.now();
  const tempPath = join(SCREENSHOT_TEMP_DIR, `logos-mcp-capture-${timestamp}.png`);

  try {
    await captureWindowImage(mainWindow, tempPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Screenshot capture failed: ${msg}` };
  }

  if (!existsSync(tempPath)) {
    return { success: false, error: "Screenshot file was not created" };
  }

  // 7. Downscale if oversized, read to base64, and clean up
  const maxWidth = maxWidthOpt ?? DEFAULT_MAX_WIDTH;
  await maybeDownscale(tempPath, maxWidth);

  try {
    const imageBuffer = await readFile(tempPath);
    const imageBase64 = imageBuffer.toString("base64");

    return {
      success: true,
      imageBase64,
      description,
      bounds: {
        x: mainWindow.x,
        y: mainWindow.y,
        width: mainWindow.width,
        height: mainWindow.height,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Failed to read screenshot: ${msg}` };
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}
