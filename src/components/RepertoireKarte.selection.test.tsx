import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KartenBild } from "./RepertoireKarte";
import { repertoireKarte } from "../lib/repertoireKarte";
import type { RepNode } from "../lib/repertoire";

afterEach(cleanup);

const base = { side: "white" as const, name: "", note: "", fen_key: "x", reps: 0, lapses: 0,
  due_ts: 0, stability: 0, sort_order: 0 };
const nodes: RepNode[] = [
  { ...base, id: 1, parent_id: 0, san: "e4", depth: 1, my_move: true },
  { ...base, id: 2, parent_id: 1, san: "e5", depth: 2, my_move: false },
  { ...base, id: 3, parent_id: 2, san: "Nf3", depth: 3, my_move: true },
  { ...base, id: 4, parent_id: 2, san: "Bc4", depth: 3, my_move: true },
  { ...base, id: 5, parent_id: 1, san: "c5", depth: 2, my_move: false },
];

function show(nachfahren: boolean) {
  const teil = repertoireKarte(nodes, 1).teile[0];
  render(<KartenBild teil={teil} breite={640} zeilenHoehe={22} blatt={false}
    aktiv="white:2" nachfahren={nachfahren} namen={{}} zugText={(san) => san}
    lageText={(lage) => lage} terraIncognita="" titel="Carte" frisch={new Set()} offen onWaehlen={() => {}} />);
  return screen.getByTestId("repertoire-map-selection").getAttribute("data-node-ids");
}

describe("sélection sur le schéma", () => {
  it("selects only the clicked move and its predecessors", () => {
    expect(show(false)).toBe("1,2");
  });
  it("adds every descendant only after Tout sélectionner après", () => {
    expect(show(true)).toBe("1,2,3,4");
  });
});
