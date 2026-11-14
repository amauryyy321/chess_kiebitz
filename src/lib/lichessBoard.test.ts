import { afterEach, describe, expect, it, vi } from "vitest";
import { boardPlaying, readBoardStream, seekRatedGame } from "./lichessBoard";

afterEach(() => vi.unstubAllGlobals());

describe("Lichess Board API", () => {
  it.each([[5, "5"], [10, "0"]] as const)("submits a rated %i minute seek with increment %s", async (minutes, increment) => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as URLSearchParams;
      expect(form.get("time")).toBe(String(minutes));
      expect(form.get("increment")).toBe(increment);
      expect(form.get("rated")).toBe("true");
      expect(form.get("variant")).toBe("standard");
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("\n")); controller.close(); } }));
    });
    vi.stubGlobal("fetch", fetcher);
    await seekRatedGame("test-token", minutes, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledWith("https://lichess.org/api/board/seek", expect.any(Object));
  });

  it("parses split NDJSON messages and ignores keepalives", async () => {
    const seen: unknown[] = [];
    const response = new Response(new ReadableStream({
      start(controller) {
        const encode = new TextEncoder();
        controller.enqueue(encode.encode('\n{"type":"game'));
        controller.enqueue(encode.encode('Start","game":{"id":"abc"}}\n\n'));
        controller.close();
      },
    }));
    await readBoardStream(response, (item) => seen.push(item), new AbortController().signal);
    expect(seen).toEqual([{ type: "gameStart", game: { id: "abc" } }]);
  });

  it("recovers an active standard game when its start event was missed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ nowPlaying: [
      { gameId: "8abcdefgh", variant: { key: "standard" } },
      { gameId: "chess960", variant: { key: "chess960" } },
    ] }))));
    expect(await boardPlaying("test-token")).toEqual(["8abcdefgh"]);
  });
});
