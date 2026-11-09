import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Chess } from "chess.js";
import type { BoardGameFull, BoardGameState } from "../lib/lichessBoard";
import OnlinePlay from "./OnlinePlay";

const mocks = vi.hoisted(() => ({
  start: null as null | ((id: string) => void),
  gameEvent: null as null | ((event: BoardGameFull | BoardGameState) => void),
  seek: vi.fn(() => new Promise<void>(() => {})),
  upsert: vi.fn(async () => {}),
  move: vi.fn(async () => {}),
}));

vi.mock("../components/Board", () => ({
  default: ({ fen, orientation, squareStyles, draggable, onPieceDrop }: { fen: string; orientation: string; squareStyles: Record<string, { backgroundColor?: string }>; draggable: boolean; onPieceDrop: (from: string, to: string) => boolean }) =>
    <div data-testid="online-board" data-fen={fen} data-orientation={orientation}
      data-highlight={Object.keys(squareStyles).filter((square) => squareStyles[square].backgroundColor?.includes("250, 204, 21")).join(",")}
      data-draggable={draggable}>
      <button onClick={() => onPieceDrop("g1", "f3")}>Board g1f3</button>
      <button onClick={() => onPieceDrop("d2", "d4")}>Board d2d4</button>
    </div>,
}));
vi.mock("../lib/lichess", () => ({ lichessToken: vi.fn(async () => "test-token") }));
vi.mock("../lib/importer", () => ({ importLichessGame: vi.fn(async () => ({})) }));
vi.mock("../lib/db", () => ({ upsertGames: mocks.upsert, gameIdBySource: vi.fn(async () => 42) }));
vi.mock("../lib/lichessBoard", () => ({
  boardAccount: vi.fn(async () => ({ id: "me", username: "me" })),
  boardEvents: vi.fn((_token: string, _signal: AbortSignal, onStart: (id: string) => void) => {
    mocks.start = onStart;
    return new Promise<void>(() => {});
  }),
  boardPlaying: vi.fn(async () => []),
  boardGame: vi.fn((_token: string, _id: string, _signal: AbortSignal, onState: (event: BoardGameFull | BoardGameState) => void) => {
    mocks.gameEvent = onState;
    return new Promise<void>(() => {});
  }),
  boardMove: mocks.move,
  boardResign: vi.fn(),
  seekRatedGame: mocks.seek,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.start = null;
  mocks.gameEvent = null;
});

describe("Jouer dans Kiebitz", () => {
  it("shows the board before and during matchmaking, then connects the game", async () => {
    render(<OnlinePlay onRecorded={vi.fn()} onConnectionIssue={vi.fn()} />);
    expect(screen.getByTestId("online-board").dataset.orientation).toBe("white");
    expect(screen.getAllByText("Adversaire").length).toBeGreaterThan(0);
    expect(screen.getByText("Coups joués")).toBeTruthy();
    const fiveMinutes = await screen.findByRole("button", { name: /5 minutes/ }) as HTMLButtonElement;
    await waitFor(() => expect(fiveMinutes.disabled).toBe(false));
    fireEvent.click(fiveMinutes);
    expect(screen.getByTestId("online-board")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Recherche d'un adversaire pour 5 minutes");
    expect(mocks.seek).toHaveBeenCalledWith("test-token", 5, expect.any(AbortSignal));

    await waitFor(() => expect(mocks.start).not.toBeNull());
    act(() => mocks.start?.("game123"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Connexion à la partie Lichess"));
    expect(screen.getByTestId("online-board")).toBeTruthy();
  });

  it("highlights the shown move in yellow and keeps an old position while the game continues", async () => {
    render(<OnlinePlay onRecorded={vi.fn()} onConnectionIssue={vi.fn()} />);
    await waitFor(() => expect(mocks.start).not.toBeNull());
    act(() => mocks.start?.("game123"));
    await waitFor(() => expect(mocks.gameEvent).not.toBeNull());
    const started: BoardGameState = { type: "gameState", moves: "e2e4 e7e5 g1f3", status: "started", wtime: 300000, btime: 300000 };
    act(() => mocks.gameEvent?.({ type: "gameFull", id: "game123",
      white: { id: "me", name: "Me", rating: 1500 }, black: { id: "them", name: "Them", rating: 1500 }, state: started }));
    const board = screen.getByTestId("online-board");
    await waitFor(() => expect(board.dataset.highlight).toBe("g1,f3"));
    fireEvent.click(screen.getByRole("button", { name: "Coup précédent" }));
    const afterE5 = new Chess(); afterE5.move("e4"); afterE5.move("e5");
    expect(board.dataset.fen).toBe(afterE5.fen());
    expect(board.dataset.highlight).toBe("e7,e5");
    expect(board.dataset.draggable).toBe("false");
    act(() => mocks.gameEvent?.({ ...started, moves: "e2e4 e7e5 g1f3 b8c6" }));
    expect(board.dataset.fen).toBe(afterE5.fen());
    fireEvent.click(screen.getByRole("button", { name: "Revenir à la partie" }));
    expect(board.dataset.highlight).toBe("b8,c6");
  });

  it("queues several premoves and sends only one legal move per actual turn", async () => {
    render(<OnlinePlay onRecorded={vi.fn()} onConnectionIssue={vi.fn()} />);
    await waitFor(() => expect(mocks.start).not.toBeNull());
    act(() => mocks.start?.("game123"));
    await waitFor(() => expect(mocks.gameEvent).not.toBeNull());
    const started: BoardGameState = { type: "gameState", moves: "e2e4", status: "started", wtime: 300000, btime: 300000 };
    act(() => mocks.gameEvent?.({ type: "gameFull", id: "game123",
      white: { id: "me", name: "Me", rating: 1500 }, black: { id: "them", name: "Them", rating: 1500 }, state: started }));
    fireEvent.click(screen.getByRole("button", { name: "Board g1f3" }));
    fireEvent.click(screen.getByRole("button", { name: "Board d2d4" }));
    expect(screen.getByText(/2 coups anticipés en attente/)).toBeTruthy();
    expect(mocks.move).not.toHaveBeenCalled();

    act(() => mocks.gameEvent?.({ ...started, moves: "e2e4 e7e5" }));
    await waitFor(() => expect(mocks.move).toHaveBeenCalledWith("test-token", "game123", "g1f3"));
    act(() => mocks.gameEvent?.({ ...started, moves: "e2e4 e7e5" }));
    expect(mocks.move).toHaveBeenCalledTimes(1);
    act(() => mocks.gameEvent?.({ ...started, moves: "e2e4 e7e5 g1f3" }));
    expect(mocks.move).toHaveBeenCalledTimes(1);
    act(() => mocks.gameEvent?.({ ...started, moves: "e2e4 e7e5 g1f3 d7d6" }));
    await waitFor(() => expect(mocks.move).toHaveBeenCalledWith("test-token", "game123", "d2d4"));
    expect(mocks.move).toHaveBeenCalledTimes(2);
  });

  it("reports the result after saving so analysis can start behind the dialog", async () => {
    const onRecorded = vi.fn();
    render(<OnlinePlay onRecorded={onRecorded} onConnectionIssue={vi.fn()} />);
    await waitFor(() => expect(mocks.start).not.toBeNull());
    act(() => mocks.start?.("game123"));
    await waitFor(() => expect(mocks.gameEvent).not.toBeNull());
    act(() => mocks.gameEvent?.({ type: "gameFull", id: "game123",
      white: { id: "me", name: "Me", rating: 1500 }, black: { id: "them", name: "Them", rating: 1500 },
      state: { type: "gameState", moves: "e2e4", status: "mate", winner: "white", wtime: 250000, btime: 0 } }));
    await waitFor(() => expect(onRecorded).toHaveBeenCalledWith(42, "win", undefined));
  });
});
