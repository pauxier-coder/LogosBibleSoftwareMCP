# Research Notes

These documents record why each Logos-integration approach was adopted or rejected. They are historical records from proof-of-concept experiments (originally under `poc/`, which is gitignored scratch).

- [sqlite-approach.md](sqlite-approach.md) — Direct read-only access to Logos' local SQLite databases (clippings, history, layouts, notes, library catalog). **Adopted** as the primary data channel: fast (milliseconds), headless, no UI automation, no Logos running required.
- [screenshot-approach.md](screenshot-approach.md) — Window discovery via `CGWindowListCopyWindowInfo` + `screencapture -l`, using a small compiled clang helper. **Adopted** for `capture_panel_screenshot`: reliable, needs only Screen Recording permission, works for the Bible panel.
- [keyboard-maestro-approach.md](keyboard-maestro-approach.md) — Keyboard Maestro macro driving Logos' CopyBibleVerses panel (image-recognition click, clipboard read) to extract Bible text. **Rejected** for production: fragile timing/image matching, ~8s per extraction, requires screen focus, clipboard collisions, high maintenance burden. SQLite or a hybrid approach is preferred.
