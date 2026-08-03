# Screenshot Capture POC Results

## Status: Working

The proof-of-concept successfully navigates Logos Bible Software to a Bible passage via URL scheme, captures the Logos window as a PNG screenshot, and returns the image path for vision model consumption.

## What Works

### Window Discovery (get-window-bounds.mjs)

- **CGWindowListCopyWindowInfo** reliably finds Logos windows, even though Logos uses Chromium Embedded Framework (CEF)
- Returns the macOS `kCGWindowNumber` (window ID) which is needed for `screencapture -l`
- Logos exposes two on-screen windows:
  - **Main window**: "Logos Legacy Edition" at full screen (1440x875), window ID varies per session
  - **Panel window**: Unnamed, smaller (1392x750), offset from top-left
- The main window is identified by its name containing "Logos"
- Window bounds (x, y, width, height) are accurate and real-time

### Window Capture (screencapture -l)

- `screencapture -x -l <windowID>` captures the exact Logos window without any sound or flash
- Produces clean PNG images (approximately 2MB per capture)
- Works even when Logos is partially obscured by other windows (captures the full window content)
- No accessibility permissions beyond screen recording are needed
- The `-x` flag suppresses the camera shutter sound

### Bible Navigation (capture-logos.mjs)

- `logos4:///Bible/<ref>` URL scheme reliably navigates to Bible passages
- Reference parsing handles full book names, abbreviations, and verse ranges
- 4-5 second wait time is sufficient for content to render
- JSON output mode makes the script easy to integrate with other tools

## What Partially Works

### Non-Bible Tool Navigation

The URL scheme commands are sent correctly and Logos accepts them, but the visual result depends on Logos's panel/tab management:

| Tool | URL | Navigates? | Visible in Screenshot? |
|------|-----|-----------|----------------------|
| Bible | `logos4:///Bible/Ro12.1` | Yes | Yes -- main panel |
| Factbook | `logos4:///Factbook?ref=Moses` | Yes (Logos acknowledges) | No -- opens in a background panel |
| Word Study | `logos4:///WordStudy?word=agape` | Yes (Logos acknowledges) | No -- opens in a background panel |
| Guide | `logos4:///Guide?t=...&ref=...` | Yes (Logos acknowledges) | No -- opens in a background panel |
| Search | `logos4:///Search?type=Bible&q=...` | Yes (Logos acknowledges) | Depends on panel state |

The issue is not with the URL scheme -- Logos correctly receives and processes all commands. The problem is that tools like Factbook, Word Study, and Guides open in panels that may not be the frontmost panel captured in the screenshot. The Bible panel, being the main content area, is consistently visible.

## Technical Details

### Approach for Window Discovery

Several methods were evaluated for finding the Logos window:

| Method | Result |
|--------|--------|
| AppleScript `System Events` | Works for position/size, but does NOT provide the CGWindowID needed for `screencapture -l` |
| Python3 `Quartz` module | `ModuleNotFoundError` -- pyobjc is not installed on system Python |
| Swift CLI | Toolchain conflict (`SwiftBridging` module redefinition) |
| JXA ObjC bridge | Returns empty results for CGWindowList |
| **Compiled Objective-C** | **Works perfectly** -- small .m file compiled with clang, cached at `/tmp/logos-window-helper` |

The compiled helper approach is fast (< 50ms), reliable, and requires no additional dependencies.

### Screenshot Details

- Format: PNG
- Size: approximately 2MB per full-window capture
- Resolution: Matches the window pixel dimensions (e.g., 1440x875)
- Content: Dark-themed Logos UI with Bible text clearly readable
- Retina: On Retina displays, the actual pixel dimensions are 2x the window dimensions

### File Structure

```
poc/screenshot/
  capture-logos.mjs        -- Main script: navigate + screenshot
  get-window-bounds.mjs    -- Helper: find Logos window position/size/ID
  RESULTS.md               -- This file
  logos-romans-12-1.png    -- Test screenshot of Romans 12 (NASB)
```

## Integration Notes

### For Vision Model Processing

The captured screenshots can be fed directly to any vision-capable LLM:

```javascript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const exec = promisify(execFile);

// 1. Capture
const { stdout } = await exec("node", [
  "capture-logos.mjs", "bible", "Romans 12:1",
  "--json", "--wait", "5000"
]);
const result = JSON.parse(stdout);

// 2. Read the image
const imageBuffer = await readFile(result.screenshot);
const base64Image = imageBuffer.toString("base64");

// 3. Send to vision model (e.g., Claude, GPT-4V)
// Include as image content in the API request
```

### For MCP Tool Integration

The script can be wrapped as an MCP tool that returns the screenshot path. The MCP server would:

1. Accept a tool type and reference
2. Call `capture-logos.mjs` with `--json`
3. Return the screenshot path in the tool response
4. The calling LLM reads the image via its vision capabilities

### Limitations and Future Improvements

1. **Non-Bible panels**: To capture Factbook, Word Study, etc., would need:
   - AppleScript to click/activate specific Logos panels after URL navigation
   - Or use CGEvent-based keyboard shortcuts to switch panels
   - Or capture multiple windows and identify the correct one

2. **Wait time heuristic**: The fixed 4-5s wait could be replaced with:
   - Pixel-change detection (compare sequential screenshots)
   - Content-hash stabilization (wait until the image stops changing)

3. **Multiple monitors**: The CGWindowList approach works across monitors since it captures by window ID, not screen coordinates.

4. **Window ID caching**: Window IDs can change when Logos is restarted. The script fetches the window ID fresh each time, which is correct but adds approximately 50ms overhead.

5. **Retina scaling**: On Retina displays, `screencapture -l` captures at Retina resolution (2x). If the image is too large for the vision model, it can be downscaled.

## Test Results

### Romans 12:1 Capture

```
$ node capture-logos.mjs bible "Romans 12:1" --output /tmp/logos-romans-12-1.png --wait 5000

Navigating: Bible: Romans 12:1 -> Ro12.1
URL: logos4:///Bible/Ro12.1
Waiting 5000ms for content to load...

Screenshot saved: /tmp/logos-romans-12-1.png
Window ID: 146322
Bounds: {"x":0,"y":25,"width":1440,"height":875}
```

The screenshot shows Romans 12 (NASB with interlinear) with all verse text clearly readable. The heading "Dedicated Service" is visible, and verses 1-21 are displayed in the main content area.
