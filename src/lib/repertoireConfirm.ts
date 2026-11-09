import type { TFunc } from "./i18n";

/** Confirm the exact line and destination before changing stored repertoire data. */
export function confirmRepertoireLine(t: TFunc, sans: string[], edit = false): boolean {
  return window.confirm(t(edit ? "rep.confirmUpdateRepertoire" : "rep.confirmAddRepertoire", {
    line: sans.join(" "),
  }));
}

export function confirmKnowledgeLine(t: TFunc, sans: string[]): boolean {
  return window.confirm(t("rep.confirmAddKnowledge", { line: sans.join(" ") }));
}
