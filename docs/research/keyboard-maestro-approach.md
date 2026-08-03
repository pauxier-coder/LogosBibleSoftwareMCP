# Keyboard Maestro Bible Text Extraction POC

## Approach

This POC uses Keyboard Maestro (KM) as a UI automation layer to extract Bible text from Logos via the CopyBibleVerses (CBV) workflow:

```
Node.js script
  --> triggers KM macro via AppleScript
    --> KM opens Logos URL scheme (logos4:///Bible/{ref})
    --> KM waits for Logos to load
    --> KM simulates Control+Option+B (opens CBV panel)
    --> KM clicks the "Copy" button via image recognition
    --> KM writes sentinel file to /tmp
  <-- Node.js detects sentinel file
  <-- Node.js reads clipboard via JXA (NSPasteboard)
  <-- Returns plain text, HTML, and RTF
```

## Components

| File | Purpose |
|------|---------|
| `km-macro-extract-bible-text.xml` | Keyboard Maestro macro definition (importable XML) |
| `trigger-and-read.mjs` | Node.js script: triggers macro, waits, reads clipboard |
| `read-clipboard.mjs` | Standalone clipboard reader (plain text, HTML, RTF via JXA) |
| `test-clipboard-reader.mjs` | Self-test for the clipboard reading mechanism |
| `SETUP-GUIDE.md` | Step-by-step manual setup instructions |

## How It Works

### 1. Reference Format

The KM macro receives a Bible reference in Logos URL format (e.g., `Ro8.28` for Romans 8:28). The existing MCP server's `toLogosUrlRef()` function in `reference-parser.ts` converts human-readable references to this format:

- `Romans 8:28` --> `Ro8.28`
- `John 3:16-18` --> `Jn3.16-18`
- `Genesis 1:1-2:3` --> `Ge1.1-2.3`

### 2. URL Scheme Navigation

Logos supports the `logos4:///Bible/{ref}` URL scheme for navigation. The macro opens this URL, which activates Logos and navigates to the specified passage.

### 3. CopyBibleVerses Panel

Logos has a dedicated CopyBibleVerses feature (distinct from Cmd+C) that:
- Opens via Control+Option+B keyboard shortcut
- Presents a panel with formatting options
- Has a "Copy" button that places Bible text on the clipboard
- Copies in multiple formats: plain text, HTML, and RTF

### 4. Image Recognition Click

The macro uses KM's "Click at Found Image" action to find and click the Copy button. This requires a one-time setup where the user captures a screenshot of the Copy button for KM to match against.

### 5. Completion Signaling

The macro writes a sentinel file (`/tmp/km-logos-extract-done`) when finished. The Node.js script polls for this file to know when clipboard reading is safe.

### 6. Clipboard Reading

The Node.js script reads the clipboard via JXA (JavaScript for Automation) using `NSPasteboard`, which provides access to all clipboard formats:
- `NSPasteboardTypeString` (plain text)
- `public.html` (HTML)
- `public.rtf` (RTF)

## Setup Requirements

1. **Keyboard Maestro** must be installed and the Engine must be running
2. The macro must be imported (or manually created per SETUP-GUIDE.md)
3. A screenshot of the CBV "Copy" button must be captured for image matching
4. Node.js 18+ for the trigger scripts

See `SETUP-GUIDE.md` for detailed setup instructions.

## Known Limitations

### Timing Sensitivity
- The macro uses fixed pauses (3s for Logos load, 2s for CBV panel). These may need adjustment depending on system performance and Logos startup time.
- If Logos is already running and at the passage, the pauses are generous. If Logos needs to cold-start, they may be insufficient.

### Image Recognition Fragility
- The "Click at Found Image" action depends on the CBV panel rendering consistently.
- Display scaling, dark mode changes, or Logos UI updates could break the match.
- Alternative: Use fixed-coordinate clicks (more fragile w.r.t. window position, but no image capture needed).

### Single-Threaded / Sequential
- Only one extraction can run at a time (the macro controls the Logos UI).
- No parallelism possible since it depends on the active clipboard.
- Each extraction takes approximately 7-8 seconds (sum of all pauses + macro overhead).

### No Error Recovery
- If the CBV panel fails to open, the macro times out after 10 seconds and aborts.
- If Logos crashes or is unresponsive, the sentinel file is never written, and the Node.js script times out after 30 seconds.
- No retry logic is implemented (by design, for a POC).

### Screen Focus Required
- The macro must control the foreground (it activates Logos and simulates keystrokes).
- User interaction during extraction will likely break the workflow.
- Cannot run headlessly or while the user is working on something else.

### Clipboard Collision
- The macro writes to the system clipboard. If the user copies something during extraction, the results will be wrong.
- No clipboard save/restore is implemented (could be added).

### Bundle Identifier
- The macro assumes Logos has bundle identifier `com.logos.logosX`. This may vary by Logos version.

## Comparison with Other Approaches

| Aspect | KM Macro | CGEvent (low-level) | SQLite (direct) |
|--------|----------|-------------------|-----------------|
| Setup complexity | Medium (KM + image capture) | Low (just compile) | Low (find DB path) |
| Reliability | Medium (timing/image dependent) | Medium (timing dependent) | High (data access) |
| Speed per extraction | ~8 seconds | ~8 seconds | Milliseconds |
| Headless operation | No | No | Yes |
| Maintenance burden | High (UI changes break it) | Medium | Low |
| Clipboard formats | All (text/HTML/RTF) | All (text/HTML/RTF) | N/A (raw DB data) |
| Requires Logos running | Yes | Yes | No (reads DB files) |

## Recommendations

This KM approach is viable as a proof of concept but has significant fragility for production use. The main advantages over raw CGEvent-based approaches:

1. **Visual debugging**: KM shows each action step and can be paused/single-stepped
2. **Image matching**: More robust than fixed coordinates for the Copy button click
3. **Easy modification**: Non-programmers can adjust timing and add steps in KM's visual editor
4. **Existing ecosystem**: KM has a large community with examples and support

For production integration with the MCP server, the SQLite approach (if viable) or a hybrid approach would be more reliable.
