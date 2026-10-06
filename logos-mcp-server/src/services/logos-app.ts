import { execFile } from "child_process";
import { promisify } from "util";
import {
  bibleUrl,
  bibleSearchUrl,
  wordStudyUrl,
  factbookUrl,
  resourceUrl,
  guideUrl,
  searchAllUrl,
} from "./logos-urls.js";
import type { LogosCommandResult } from "../types.js";

const execFileAsync = promisify(execFile);

async function openUrl(url: string): Promise<LogosCommandResult> {
  try {
    if (process.platform === "win32") {
      // rundll32 takes the URL as one argument — avoids cmd.exe mangling
      // the `&` in query strings that `start` would require escaping for.
      await execFileAsync("rundll32", ["url.dll,FileProtocolHandler", url]);
    } else {
      await execFileAsync("open", [url]);
    }
    return { success: true, command: url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, command: url, error: msg };
  }
}

export async function navigateToPassage(reference: string): Promise<LogosCommandResult> {
  try {
    return openUrl(bibleUrl(reference));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, command: reference, error: msg };
  }
}

export async function searchBibleInLogos(query: string): Promise<LogosCommandResult> {
  return openUrl(bibleSearchUrl(query));
}

export async function openWordStudy(word: string): Promise<LogosCommandResult> {
  return openUrl(wordStudyUrl(word));
}

export async function openFactbook(topic: string): Promise<LogosCommandResult> {
  return openUrl(factbookUrl(topic));
}

export async function openResource(
  resourceId: string,
  reference?: string,
  headword?: string
): Promise<LogosCommandResult> {
  try {
    return openUrl(resourceUrl(resourceId, reference, headword));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, command: `logosres:${resourceId}`, error: msg };
  }
}

export async function openGuide(
  guideType: string,
  reference: string
): Promise<LogosCommandResult> {
  try {
    const result = await openUrl(guideUrl(guideType, reference));
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, command: "", error: msg };
  }
}

export async function searchAll(query: string): Promise<LogosCommandResult> {
  return openUrl(searchAllUrl(query));
}

export async function isLogosRunning(): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("tasklist", [
        "/FI",
        "IMAGENAME eq Logos.exe",
        "/NH",
      ]);
      return stdout.toLowerCase().includes("logos.exe");
    }
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to (name of processes) contains "Logos"',
    ]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}
