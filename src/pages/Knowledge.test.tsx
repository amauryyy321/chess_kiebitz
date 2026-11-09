import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RepNode } from "../lib/repertoire";
import Knowledge from "./Knowledge";

const mocks = vi.hoisted(() => ({ list: vi.fn(), unmark: vi.fn(), add: vi.fn() }));
vi.mock("../components/Board", () => ({ default: ({ fen }: { fen: string }) => <div data-testid="knowledge-board" data-fen={fen} /> }));
vi.mock("../lib/repertoire", () => ({
  repList: mocks.list, repUnmarkKnown: mocks.unmark, repAddLine: mocks.add,
}));

const base = { side: "white" as const, name: "", note: "", fen_key: "x", reps: 0, lapses: 0,
  due_ts: 0, stability: 0, sort_order: 0, known: true };
const nodes: RepNode[] = [
  { ...base, id: 1, parent_id: 0, san: "e4", depth: 1, my_move: true },
  { ...base, id: 2, parent_id: 1, san: "e5", depth: 2, my_move: false },
  { ...base, id: 3, parent_id: 2, san: "Nf3", depth: 3, my_move: true },
  { ...base, id: 4, parent_id: 3, san: "Nc6", depth: 4, my_move: false },
];

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("arbre de connaissance", () => {
  it("shows three plies in the main tree and opens the rest on click", async () => {
    mocks.list.mockResolvedValue(nodes);
    mocks.unmark.mockResolvedValue(undefined);
    render(<Knowledge />);
    const third = await screen.findByRole("button", { name: /2\.Nf3/ });
    expect(screen.queryByRole("button", { name: "2…Nc6" })).toBeNull();
    fireEvent.click(third);
    expect(await screen.findByRole("button", { name: "2…Nc6" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Retirer 2…Nc6/ }));
    await waitFor(() => expect(mocks.unmark).toHaveBeenCalledWith(4, false));
  });
});
