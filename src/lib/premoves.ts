import { Chess } from "chess.js";

export interface Premove { from: string; to: string; uci: string }

function ownTurnFen(fen: string, color: "white" | "black"): string {
  const fields = fen.split(" ");
  fields[1] = color === "white" ? "w" : "b";
  // En passant belongs to the actual last move, not a projected reply.
  fields[3] = "-";
  return fields.join(" ");
}

/** A visual plan only. Each move is checked again against Lichess's live position. */
export function projectPremoves(fen: string, color: "white" | "black", queue: Premove[]): string {
  let projected = fen;
  for (const planned of queue) {
    const chess = new Chess(ownTurnFen(projected, color));
    chess.move({ from: planned.from, to: planned.to, promotion: planned.uci[4] ?? "q" });
    projected = chess.fen();
  }
  return ownTurnFen(projected, color);
}

export function makePremove(fen: string, color: "white" | "black", from: string, to: string): Premove | null {
  try {
    const chess = new Chess(ownTurnFen(fen, color));
    const move = chess.move({ from, to, promotion: "q" });
    return { from, to, uci: `${from}${to}${move.promotion ?? ""}` };
  } catch { return null; }
}

export function legalPremove(fen: string, planned: Premove): boolean {
  try {
    new Chess(fen).move({ from: planned.from, to: planned.to, promotion: planned.uci[4] ?? "q" });
    return true;
  } catch { return false; }
}
