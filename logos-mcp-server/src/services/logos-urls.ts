/**
 * Logos URL construction.
 *
 * Logos 48 and earlier accepted a path/query form (`logos4:///Bible/Jn1.1`).
 * Logos 53 silently ignores it — `open` succeeds, the app does nothing — so
 * every builder here emits the semicolon form instead. Each was verified
 * against Logos 53.1.0.0002 by firing the URL and reading the resulting panel.
 */

import { toLogosUrlRef } from "./reference-parser.js";

/** Greek and Hebrew blocks, used to pick the `lbs/<lang>/` lemma prefix. */
const GREEK = /[Ͱ-Ͽἀ-῿]/;
const HEBREW = /[֐-׿]/;

export function bibleUrl(reference: string): string {
  return `logosref:Bible.${toLogosUrlRef(reference)}`;
}

export function factbookUrl(topic: string): string {
  return `logos4:Factbook;ref=${encodeURIComponent(topic)}`;
}

/**
 * Bible Word Study. Greek/Hebrew input is qualified as a Logos lemma
 * (`lbs/el/ἀγάπη`); anything else is passed through, which Logos resolves as a
 * surface word.
 */
export function wordStudyUrl(word: string): string {
  const w = word.trim();
  let lemma = w;
  if (GREEK.test(w)) lemma = `lbs/el/${w}`;
  else if (HEBREW.test(w)) lemma = `lbs/he/${w}`;
  return `logos4:Guide;t=BibleWordStudy;lemma=${encodeURIComponent(lemma)}`;
}

export function bibleSearchUrl(query: string): string {
  return `logos4:Search;kind=BibleSearch;syntax=v2;q=${encodeURIComponent(query)}`;
}

export function searchAllUrl(query: string): string {
  return `logos4:Search;kind=AllSearch;syntax=v2;q=${encodeURIComponent(query)}`;
}

export function resourceUrl(resourceId: string, reference?: string): string {
  let url = `logosres:${encodeURIComponent(resourceId)}`;
  if (reference) url += `;ref=Bible.${toLogosUrlRef(reference)}`;
  return url;
}

/** Logos guide templates are single tokens: "Passage Guide" -> "PassageGuide". */
export function guideTemplateToken(guideType: string): string {
  return guideType.replace(/\s+/g, "");
}

export function guideUrl(guideType: string, reference: string): string {
  const t = encodeURIComponent(guideTemplateToken(guideType));
  return `logos4:Guide;t=${t};ref=Bible.${toLogosUrlRef(reference)}`;
}

/**
 * Logos 53 opens the Guide panel for reference-keyed guides (Passage,
 * Exegetical) but leaves the reference box empty — no URL form found applies
 * it. Word-keyed guides (Bible Word Study) are unaffected.
 */
export const GUIDE_REF_WARNING =
  "Logos 53 opens the Guide panel but does not apply the reference from a URL; " +
  "the passage must be typed into the guide's reference box.";
