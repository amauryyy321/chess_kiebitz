/**
 * Deep Links für Android-Widgets und geteilte Stellungen.
 */
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { firstSharePayload } from "../share/link";
import type { SharePayload } from "../share/codec";

/** Seiten, die ein Deep Link ansteuern darf · dieselben Ziele wie die Navigation. */
const OPEN_PAGES = [
  "dashboard",
  "games",
  "analysis",
  "repertoire",
  "endgame",
  "puzzles",
  "study",
  "insights",
  "settings",
] as const;

export type OpenPage = (typeof OPEN_PAGES)[number];

/**
 * Ziel eines `kiebitz://open?page=…`-Links.
 *
 * Diese Links kommen von den Android-Widgets. Eine unbekannte Seite ist kein
 * Fehler, sondern schlicht kein Ziel · die App bleibt dann, wo sie ist.
 */
export function parseOpenDeepLink(raw: string): OpenPage | null {
  const value = raw.trim();
  // Chromium kanonisiert `kiebitz://open?page=…` zu `kiebitz://open/?page=…`.
  if (!/^kiebitz:\/\/open\/?\?/i.test(value)) return null;
  const page = new URLSearchParams(value.slice(value.indexOf("?") + 1)).get("page");
  return (OPEN_PAGES as readonly string[]).includes(page ?? "") ? (page as OpenPage) : null;
}

export function firstOpenPage(urls: readonly string[] | null | undefined): OpenPage | null {
  for (const url of urls ?? []) {
    const page = parseOpenDeepLink(url);
    if (page) return page;
  }
  return null;
}

export interface DeepLinkHandlers {
  /** Ein Widget hat eine Seite angefordert. */
  onOpenPage?: (page: OpenPage) => void;
  /** Jemand hat eine geteilte Stellung geöffnet (`kiebitz://p/…`). */
  onSharedPosition?: (payload: SharePayload) => void;
}

/**
 * Hört auf die Deep Links der App und arbeitet sie ab. Liefert einen
 * Abmelder; ohne Deep-Link-Plugin (Browser-Vorschau) passiert nichts.
 */
export function installDeepLinks(handlers: DeepLinkHandlers = {}): () => void {
  let disposed = false;
  let unlisten: (() => void) | null = null;

  const handle = (urls: readonly string[] | null | undefined) => {
    if (disposed) return;
    const page = firstOpenPage(urls);
    if (page) handlers.onOpenPage?.(page);
    const shared = firstSharePayload(urls);
    if (shared) handlers.onSharedPosition?.(shared);
  };

  // Kaltstart über den Link: Die URL liegt schon bereit, bevor irgendjemand
  // zuhören konnte.
  getCurrent()
    .then(handle)
    .catch(() => {});

  onOpenUrl(handle)
    .then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    })
    .catch(() => {});

  return () => {
    disposed = true;
    unlisten?.();
  };
}
