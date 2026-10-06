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
 * Bible Word Study. Every lemma must carry a language tag -- English included.
 * A bare `lemma=love` is rejected and the panel opens blank; `lbs/en/love`
 * works. Greek and Hebrew take `lbs/el/` and `lbs/he/`.
 */
export function wordStudyUrl(word: string): string {
  const w = word.trim();
  let lang = "en";
  if (GREEK.test(w)) lang = "el";
  else if (HEBREW.test(w)) lang = "he";
  const lemma = `lbs/${lang}/${w}`;
  return `logos4:Guide;t=${encodeURIComponent("Bible Word Study")};lemma=${encodeURIComponent(lemma)}`;
}

export function bibleSearchUrl(query: string): string {
  return `logos4:Search;kind=BibleSearch;syntax=v2;q=${encodeURIComponent(query)}`;
}

export function searchAllUrl(query: string): string {
  return `logos4:Search;kind=AllSearch;syntax=v2;q=${encodeURIComponent(query)}`;
}

/** A Louw-Nida entry number, bare or prefixed: "33.117", "LN 33.117", "LouwNida.33.117". */
const LN_REF = /^(?:LN\s*|LouwNida\.)?(\d{1,2}\.\d{1,3}[a-z]?)$/i;

/** Returns the `LouwNida.X.Y` datatype ref for an LN entry number, or null. */
export function louwNidaRef(reference: string): string | null {
  const m = reference.trim().match(LN_REF);
  return m ? `LouwNida.${m[1]}` : null;
}

/**
 * Opens a resource, optionally at a Bible reference, a Louw-Nida entry number,
 * or a dictionary headword. Verified on Logos 53 (2026-10-06):
 *
 *   logosres:LLS%3A46.30.18;hw=ἀτάκτως          -> BDAG article for ἀτάκτως
 *   logosres:LLS%3A46.30.4;hw=ἀτάκτως           -> LN 88.247 (breadcrumb shows the subdomain)
 *   logosres:LLS%3A46.30.4;ref=LouwNida.33.117  -> LN 33.117 at the top of the panel
 *
 * `headword` wins over `reference` when both are given. The headword must be
 * the lexical form (lemma), accented as the lexicon prints it.
 */
export function resourceUrl(resourceId: string, reference?: string, headword?: string): string {
  let url = `logosres:${encodeURIComponent(resourceId)}`;
  if (headword && headword.trim()) {
    url += `;hw=${encodeURIComponent(headword.trim().normalize("NFC"))}`;
  } else if (reference) {
    const ln = louwNidaRef(reference);
    url += ln ? `;ref=${ln}` : `;ref=Bible.${toLogosUrlRef(reference)}`;
  }
  return url;
}

/** Whether a term contains Greek or Hebrew script (needs Factbook type-ahead). */
export function isBiblicalScript(term: string): boolean {
  return GREEK.test(term) || HEBREW.test(term);
}

/**
 * Logos wants the template name exactly as it appears in the app, spaces and
 * all -- "Passage Guide", percent-encoded by the caller. Collapsing it to one
 * token yields a template Logos does not recognise, and it opens an empty panel
 * rather than reporting an error. Whitespace is normalised, not removed.
 */
export function guideTemplateToken(guideType: string): string {
  return guideType.trim().replace(/\s+/g, " ");
}

export function guideUrl(guideType: string, reference: string): string {
  const t = encodeURIComponent(guideTemplateToken(guideType));
  return `logos4:Guide;t=${t};ref=Bible.${toLogosUrlRef(reference)}`;
}

/*
 * Verified 2026-09-04 on Logos 53.1.0.0002 (macOS) by dispatching each form and
 * screenshotting the panel:
 *
 *   t=Passage%20Guide;ref=Bible.Jn6.35            -> populates
 *   t=PassageGuide;ref=Bible.Eph1.4               -> blank
 *   t=Bible%20Word%20Study;lemma=lbs%2Fen%2Flove  -> populates
 *   t=BibleWordStudy;lemma=agape                  -> blank
 *
 * An earlier version of this file carried a GUIDE_REF_WARNING claiming Logos
 * ignored the subject parameter and that no working form existed. That was an
 * inference from our own malformed URLs, not a search of the URL space, and it
 * was wrong. The two forms above are the fix; the warning is gone because there
 * is nothing left to warn about.
 */
