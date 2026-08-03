# SQLite Database Extraction - POC Results

## Summary

Explored all SQLite databases under `~/Library/Application Support/Logos4/` (120+ databases found). Four primary databases contain user-facing content suitable for AI consumption. The Clippings database is the most valuable — it stores actual resource text with full XML markup.

---

## 1. Clippings.db (HIGHEST VALUE)

**Path:** `Documents/a3wo155q.w14/Documents/Clippings/Clippings.db`

**What it contains:** User-highlighted/clipped text from Logos resources — actual book and Bible content with full text.

**Stats:** 36 clippings across 4 collections ("Untitled Clippings", "Judean", "Daily bible reading", "Nice quotes"), from 5 distinct resources (LEB, NASB, KJV-Apocrypha, Catholic Encyclopedia, and one other book).

### Blob Format (Title / Content / Notes columns)

All three are stored as blobs with a prefix byte:

| Prefix | Format | Decoding |
|--------|--------|----------|
| `0x01` | Gzip compressed XML | Skip 5 bytes, gunzip the rest, read as UTF-8 |
| `0x02` | Raw XML | Skip 4 bytes, read rest as UTF-8 |

### XML Structure

The decoded XML uses Logos XAML-style markup:

```xml
<Span Language="en-US" FontSize="12" FlowDirection="LeftToRight">
  <Run Text="Consider" />
  <Run Text=" " />
  <Run FontItalic="True" Text="it" />
  <Run Text=" " />
  <Run Text="all" />
  <Run Text=" " />
  <Run Text="joy" />
</Span>
```

Key observations:
- Each word is a separate `<Run Text="..." />` element
- Spaces between words are separate `<Run Text=" " />` elements
- Font formatting is stored as Run attributes (FontBold, FontItalic, FontVariant)
- Verse numbers use `FontVariant="Superscript"`
- Paragraphs are split by `<Paragraph>` elements
- Section headings have distinct font attributes (e.g. FontBold="True", smaller FontSize)

### Extracted Metadata Per Clipping

- `ResourceId` — identifies the source (e.g. `LLS:LEB`, `LLS:CATHENCY`)
- `StartPosition` / `EndPosition` — article offsets with version timestamps
- `CreatedDate` — ISO 8601 timestamp
- `Tags` — verse references (e.g. "Jas 1:2-4", "Pr 3:5")
- `DocumentRowId` — links to collection/document

### AI Usefulness: HIGH
Actual resource text extracted cleanly. Can serve as a source of user-highlighted passages with context about what the user found important.

---

## 2. History.db (MEDIUM VALUE)

**Path:** `Data/a3wo155q.w14/HistoryManager/history.db`

**What it contains:** Browsing history — which resources, passages, and tools the user visited.

**Stats:** 91 active entries across 8 types:
- Resource: 52 entries (Bible passages, commentaries, lexicons)
- Guides: 15 entries
- Factbook: 13 entries
- Search: 5 entries
- PowerLookup: 3 entries
- StudyAssistant: 1 entry
- Settings: 1 entry
- BibleSenseLexicon: 1 entry

### Bookmark Format

The `Bookmark` column uses a pipe-delimited key=value format:

```
Resource|Id=LLS:1.0.71|Milestone=DataType%3dbible+nasb95%7c...|Reference=bible+nasb95.75.5.17-75.5.20
```

Key fields:
- `_type` — first segment (Resource, Factbook, Guides, Search, etc.)
- `Id` — resource identifier
- `Reference` — Bible reference in internal format (e.g. `bible+nasb95.66.12.1`)
- `Milestone` / `MilestoneEnd` — segment positions within the resource
- `Position` — article, offset, context snippet
- `ReportId` — for Factbook entries, the topic ID

### AI Usefulness: MEDIUM
Good for understanding study patterns and recent context. Could power "what were you looking at recently?" queries. No actual content text though — just navigation breadcrumbs.

---

## 3. Layouts.db (LOW-MEDIUM VALUE)

**Path:** `Documents/a3wo155q.w14/LayoutManager/layouts.db`

**What it contains:** Saved workspace configurations — which panels are open, their types, and Bible references.

**Stats:** 15 active layouts including named layouts ("Passage Study", "Deep Study", "Daily Reading", "Counseling", "Daily Reading Layout") and "Application Closed" auto-saves.

### XML Structure

```xml
<Layout>
  <MainWindow Placement='Height=672|...'>
    <MainFrame>
      <Tiles>
        <Tile Column='8' Row='0' ColumnSpan='8' RowSpan='24'>
          <Panels>
            <Panel Kind='BibleExplorer' Settings='Reference=bible+kjv.75.2.10' />
            <Panel Kind='Resource' Settings='Reference=bible.66.12.1' />
          </Panels>
        </Tile>
      </Tiles>
    </MainFrame>
  </MainWindow>
</Layout>
```

Panel types found: BibleExplorer, PowerLookup, Resource, Factbook, NotesTool, Search, Guides, PassageAnalysis, BibleBrowser, BibleSenseLexicon, CitedBy, ReadingPlan, StudyAssistant, AddNewTab.

### AI Usefulness: LOW-MEDIUM
Useful for restoring workspace context or understanding study setups. Could tell AI "in the Deep Study layout, the user has 26 panels open including KJV, ESV, LEB cross-referenced at Genesis 6:5-13."

---

## 4. CopyBibleVerses.db (LOW VALUE — but useful reference)

**Path:** `Documents/a3wo155q.w14/CopyBibleVerses/CopyBibleVerses.db`

**What it contains:** 11 format templates for copying Bible verses to clipboard.

### Template Variables

| Variable | Description |
|----------|-------------|
| `[FullPassageRef]` | Full passage reference (e.g. "Romans 12:1-2") |
| `[FullVerseRef]` | Full reference per verse (e.g. "Romans 12:1") |
| `[VerseNum]` | Verse number only |
| `[VerseText]` | The verse text content |
| `[Version]` | Bible version name |

### Template Flags

- `%UseBibleParagraphs` — preserve original Bible paragraph breaks
- `%CopyAllText` — include all text (headings, etc.)
- `%NoCharFormatting` — strip bold/italic formatting
- `%NoRedLetter` — don't show red-letter text
- `%NoFootnotes` — exclude footnotes
- `%NoCitation` — exclude citation info
- `%HeaderStyle=...` / `%ForEachVerseStyle=...` — custom CSS-like styles

### AI Usefulness: LOW
Not content per se, but documents how Logos formats verse output. Could be useful for building Copy Bible Verses automation.

---

## Other Databases Scanned (Notable)

| Database | Content | Data Present? |
|----------|---------|---------------|
| **Sermon.db** | Sermon editor documents with blocks (text, passages, clippings) | 5 documents |
| **PrayerList.db** | Prayer items with JSON prayer objects and schedules | 42 prayers |
| **PassageList.db** | Passage lists with compressed items blob | 1 list |
| **WordList.db** | Vocabulary word lists with lemmas, glosses, memorization status | 0 entries |
| **Bibliography.db** | Bibliography items | Tables exist, likely empty |
| **Canvas.db** | Visual canvas documents | Not explored in detail |
| **BibleStudy.db** | Bible study documents | Not explored in detail |
| **ReadingPlan.db** | Reading plan documents | Not explored in detail |
| **ResourceManager/\*/Identified.db** | 20+ datasets (CrossReferences, Lemmas, Timelines, Events, etc.) | Data-level indexes |
| **catalog.db** | Library catalog (already in MCP server) | Full library metadata |

---

## Recommendations for MCP Integration

1. **Clippings** — High priority. Add a `get_clippings` tool to the MCP server. The blob decoding logic is straightforward (5 lines of code). Returns actual user-highlighted text with resource IDs and tags.

2. **History** — Medium priority. Add a `get_recent_history` tool. Provides study context without needing to scrape the UI.

3. **Sermon.db** — Worth exploring further. The `Blocks` table has Content, PassageJson, ClippingJson columns that likely contain rich study notes.

4. **PrayerList.db** — The `Prayer` column is JSON — could be parsed for prayer request content.

5. **Layouts** — Low priority unless workspace restoration is needed.

---

## Scripts

| Script | Purpose |
|--------|---------|
| `extract-clippings.ts` | Decodes blob format, extracts text from XML, lists all clippings |
| `extract-history.ts` | Parses bookmark format, categorizes by type, shows recent activity |
| `extract-layouts.ts` | Parses layout XML, extracts panel types and references |
| `extract-copy-bible-verses.ts` | Parses format templates, lists variables and flags |

Run with: `npx tsx <script-name>.ts` (after `npm install`)
