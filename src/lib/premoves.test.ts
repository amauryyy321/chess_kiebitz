import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { legalPremove, makePremove, projectPremoves } from "./premoves";

describe("coups anticipés", () => {
  it("projects several moves of the same color while leaving Lichess's position untouched", () => {
    const live = new Chess();
    live.move("e4");
    const first = makePremove(live.fen(), "white", "g1", "f3");
    expect(first).not.toBeNull();
    const afterFirst = projectPremoves(live.fen(), "white", [first!]);
    const second = makePremove(afterFirst, "white", "f3", "g5");
    expect(second).not.toBeNull();
    const projected = new Chess(projectPremoves(live.fen(), "white", [first!, second!]));
    expect(projected.get("g5")?.type).toBe("n");
    expect(live.get("g1")?.type).toBe("n");
  });

  it("rejects a plan if the opponent's actual move makes it illegal", () => {
    const chess = new Chess();
    chess.move("e4");
    const planned = makePremove(chess.fen(), "white", "e4", "e5");
    expect(planned).not.toBeNull();
    chess.move("e5");
    expect(legalPremove(chess.fen(), planned!)).toBe(false);
  });
});
