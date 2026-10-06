import { describe, it, expect } from "vitest";
import { resourceUrl, louwNidaRef, isBiblicalScript } from "../src/services/logos-urls.js";
import {
  buildNavigationUrl,
  needsFactbookTypeAhead,
  scrollPoint,
  scrollPixels,
} from "../src/services/screenshot-capture.js";

describe("resourceUrl headword / Louw-Nida", () => {
  it("jumps to a headword", () => {
    expect(resourceUrl("LLS:46.30.18", undefined, "ἡσυχάζω")).toBe(
      `logosres:LLS%3A46.30.18;hw=${encodeURIComponent("ἡσυχάζω")}`
    );
  });
  it("prefers headword over reference", () => {
    expect(resourceUrl("LLS:46.30.4", "33.117", "ἀτάκτως")).toContain(";hw=");
  });
  it("maps LN entry numbers to LouwNida refs", () => {
    expect(resourceUrl("LLS:46.30.4", "33.117")).toBe("logosres:LLS%3A46.30.4;ref=LouwNida.33.117");
    expect(louwNidaRef("LN 88.247")).toBe("LouwNida.88.247");
    expect(louwNidaRef("LouwNida.33.117")).toBe("LouwNida.33.117");
    expect(louwNidaRef("Romans 12:1")).toBeNull();
  });
  it("still handles Bible references", () => {
    expect(resourceUrl("LLS:CLVNCOMM", "Romans 12:1")).toMatch(/;ref=Bible\./);
  });
  it("buildNavigationUrl passes headword for resource panels", () => {
    const nav = buildNavigationUrl("resource", { resourceId: "LLS:46.30.18", headword: "ἀτάκτως" });
    expect(nav.url).toContain(";hw=");
    expect(nav.description).toContain("ἀτάκτως");
  });
});

describe("Factbook type-ahead", () => {
  it("detects Greek and Hebrew", () => {
    expect(isBiblicalScript("φιλαδελφία")).toBe(true);
    expect(isBiblicalScript("שָׁלוֹם")).toBe(true);
    expect(isBiblicalScript("Moses")).toBe(false);
  });
  it("uses type-ahead for lemmas or an explicit pick", () => {
    expect(needsFactbookTypeAhead("ἡσυχάζω")).toBe(true);
    expect(needsFactbookTypeAhead("Moses")).toBe(false);
    expect(needsFactbookTypeAhead("Philadelphia", 2)).toBe(true);
  });
});

describe("scroll geometry", () => {
  const win = { x: 0, y: 34, width: 1512, height: 896 };
  it("targets the right panel by default", () => {
    expect(scrollPoint(win)).toEqual({ x: 1104, y: 527 });
  });
  it("honours x_fraction and clamps", () => {
    expect(scrollPoint(win, "left", 0).x).toBe(30);
  });
  it("scales pages to window height", () => {
    expect(scrollPixels(896, 1)).toBe(627);
    expect(scrollPixels(896, -2)).toBe(-1254);
  });
});
