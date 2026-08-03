import { describe, it, expect } from "vitest";
import {
  buildNavigationUrl,
  parseSipsPixelWidth,
  shouldResample,
  buildSipsResampleArgs,
} from "../src/services/screenshot-capture.js";

describe("buildNavigationUrl", () => {
  describe("bible panel", () => {
    it("builds URL for a simple reference", () => {
      const result = buildNavigationUrl("bible", { reference: "Romans 12:1" });
      expect(result.url).toBe("logos4:///Bible/Ro12.1");
      expect(result.description).toBe("Bible: Romans 12:1");
    });

    it("builds URL for a verse range", () => {
      const result = buildNavigationUrl("bible", { reference: "Genesis 1:1-5" });
      expect(result.url).toBe("logos4:///Bible/Ge1.1-1.5");
    });

    it("builds URL for a cross-chapter range", () => {
      const result = buildNavigationUrl("bible", { reference: "Genesis 1:1-2:3" });
      expect(result.url).toBe("logos4:///Bible/Ge1.1-2.3");
    });

    it("builds URL for a chapter-only reference", () => {
      const result = buildNavigationUrl("bible", { reference: "Psalms 23" });
      expect(result.url).toBe("logos4:///Bible/Ps23");
    });

    it("builds URL for a numbered book", () => {
      const result = buildNavigationUrl("bible", { reference: "1 Corinthians 13:4" });
      expect(result.url).toBe("logos4:///Bible/1Co13.4");
    });

    it("throws when reference is missing", () => {
      expect(() => buildNavigationUrl("bible", {})).toThrow("requires a reference");
    });
  });

  describe("factbook panel", () => {
    it("builds URL for a topic", () => {
      const result = buildNavigationUrl("factbook", { reference: "Moses" });
      expect(result.url).toBe("logos4:///Factbook?ref=Moses");
      expect(result.description).toBe("Factbook: Moses");
    });

    it("encodes special characters", () => {
      const result = buildNavigationUrl("factbook", { reference: "Sea of Galilee" });
      expect(result.url).toBe("logos4:///Factbook?ref=Sea%20of%20Galilee");
    });

    it("throws when reference is missing", () => {
      expect(() => buildNavigationUrl("factbook", {})).toThrow("requires a reference");
    });
  });

  describe("wordstudy panel", () => {
    it("builds URL for a word", () => {
      const result = buildNavigationUrl("wordstudy", { reference: "agape" });
      expect(result.url).toBe("logos4:///WordStudy?word=agape");
      expect(result.description).toBe("Word Study: agape");
    });

    it("encodes special characters", () => {
      const result = buildNavigationUrl("wordstudy", { reference: "hesed (lovingkindness)" });
      expect(result.url).toBe("logos4:///WordStudy?word=hesed%20(lovingkindness)");
    });

    it("throws when reference is missing", () => {
      expect(() => buildNavigationUrl("wordstudy", {})).toThrow("requires a word");
    });
  });

  describe("guide panel", () => {
    it("builds URL for Exegetical Guide", () => {
      const result = buildNavigationUrl("guide", {
        reference: "Romans 12:1",
        guideType: "Exegetical Guide",
      });
      expect(result.url).toBe("logos4:///Guide?t=Exegetical%20Guide&ref=bible.Ro12.1");
      expect(result.description).toBe("Exegetical Guide: Romans 12:1");
    });

    it("builds URL for Passage Guide", () => {
      const result = buildNavigationUrl("guide", {
        reference: "John 3:16",
        guideType: "Passage Guide",
      });
      expect(result.url).toBe("logos4:///Guide?t=Passage%20Guide&ref=bible.Jn3.16");
    });

    it("throws when reference is missing", () => {
      expect(() => buildNavigationUrl("guide", { guideType: "Exegetical Guide" }))
        .toThrow("requires a Bible reference");
    });

    it("throws when guide_type is missing", () => {
      expect(() => buildNavigationUrl("guide", { reference: "Romans 12:1" }))
        .toThrow("requires a guide_type");
    });
  });

  describe("search panel", () => {
    it("builds URL for a search query", () => {
      const result = buildNavigationUrl("search", { reference: "justification by faith" });
      expect(result.url).toBe("logos4:///Search?type=Bible&q=justification%20by%20faith");
      expect(result.description).toBe("Search: justification by faith");
    });

    it("throws when query is missing", () => {
      expect(() => buildNavigationUrl("search", {})).toThrow("requires a query");
    });
  });

  describe("searchall panel", () => {
    it("builds URL for a search all query", () => {
      const result = buildNavigationUrl("searchall", { reference: "baptism" });
      expect(result.url).toBe("logos4:///Search?kind=AllSearch&syntax=v2&q=baptism");
      expect(result.description).toBe("Search All: baptism");
    });

    it("throws when query is missing", () => {
      expect(() => buildNavigationUrl("searchall", {})).toThrow("requires a query");
    });
  });

  describe("resource panel", () => {
    it("builds URL for a resource without reference", () => {
      const result = buildNavigationUrl("resource", { resourceId: "LLS:CLVNCOMM" });
      expect(result.url).toBe("logosres:LLS%3ACLVNCOMM");
      expect(result.description).toBe("Resource: LLS:CLVNCOMM");
    });

    it("builds URL for a resource with reference", () => {
      const result = buildNavigationUrl("resource", {
        resourceId: "LLS:CLVNCOMM",
        reference: "Romans 12:1",
      });
      expect(result.url).toBe("logosres:LLS%3ACLVNCOMM;ref=bible.Ro12.1");
      expect(result.description).toBe("Resource: LLS:CLVNCOMM at Romans 12:1");
    });

    it("throws when resource_id is missing", () => {
      expect(() => buildNavigationUrl("resource", {})).toThrow("requires a resource_id");
    });
  });

  describe("unknown panel type", () => {
    it("throws for invalid panel type", () => {
      expect(() => buildNavigationUrl("unknown" as any, {})).toThrow("Unknown panel type");
    });
  });
});

describe("parseSipsPixelWidth", () => {
  it("parses width from typical sips output", () => {
    const output = "/tmp/logos-mcp-capture-123.png\n  pixelWidth: 2880\n";
    expect(parseSipsPixelWidth(output)).toBe(2880);
  });

  it("parses width regardless of surrounding whitespace", () => {
    expect(parseSipsPixelWidth("pixelWidth:1400")).toBe(1400);
  });

  it("returns null when the field is absent", () => {
    expect(parseSipsPixelWidth("some unrelated output")).toBeNull();
  });

  it("returns null for empty output", () => {
    expect(parseSipsPixelWidth("")).toBeNull();
  });
});

describe("shouldResample", () => {
  it("returns true when current width exceeds maxWidth", () => {
    expect(shouldResample(2880, 1400)).toBe(true);
  });

  it("returns false when current width equals maxWidth", () => {
    expect(shouldResample(1400, 1400)).toBe(false);
  });

  it("returns false when current width is below maxWidth", () => {
    expect(shouldResample(1200, 1400)).toBe(false);
  });
});

describe("buildSipsResampleArgs", () => {
  it("builds the correct sips argv", () => {
    expect(buildSipsResampleArgs("/tmp/foo.png", 1400)).toEqual([
      "--resampleWidth",
      "1400",
      "/tmp/foo.png",
    ]);
  });
});
