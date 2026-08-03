import { describe, it, expect } from "vitest";
import { gzipSync } from "zlib";
import { decodeClippingBlob, extractClippingText } from "../src/utils/clippings.js";

function makeGzipBlob(text: string): Buffer {
  return Buffer.concat([Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00]), gzipSync(Buffer.from(text, "utf-8"))]);
}

function makeRawBlob(text: string): Buffer {
  return Buffer.concat([Buffer.from([0x02, 0x00, 0x00, 0x00]), Buffer.from(text, "utf-8")]);
}

describe("decodeClippingBlob", () => {
  it("decodes gzip-prefixed blobs", () => {
    const xml = "<Span><Run Text='Grace'/></Span>";
    expect(decodeClippingBlob(makeGzipBlob(xml))).toBe(xml);
  });

  it("decodes raw-prefixed blobs", () => {
    const xml = "<Span><Run Text='Peace'/></Span>";
    expect(decodeClippingBlob(makeRawBlob(xml))).toBe(xml);
  });

  it("returns null for empty blob", () => {
    expect(decodeClippingBlob(Buffer.alloc(0))).toBeNull();
    expect(decodeClippingBlob(null)).toBeNull();
  });
});

describe("extractClippingText", () => {
  it("preserves spacing from segmented Run nodes", () => {
    const xml = `
      <Paragraph>
        <Run Text="In"/><Run Text=" "/><Run Text="the"/><Run Text=" "/><Run Text="beginning"/>
      </Paragraph>
    `;
    expect(extractClippingText(xml)).toBe("In the beginning");
  });

  it("joins paragraphs with newlines", () => {
    const xml = `
      <Paragraph><Run Text="First line"/></Paragraph>
      <Paragraph><Run Text="Second line"/></Paragraph>
    `;
    expect(extractClippingText(xml)).toBe("First line\nSecond line");
  });
});
