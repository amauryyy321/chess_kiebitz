/** Official Lichess Board API transport. No engine or book data is exposed here. */
export interface BoardGameState {
  type: "gameState";
  moves: string;
  wtime: number;
  btime: number;
  status: string;
  winner?: "white" | "black";
}

export interface BoardGameFull {
  type: "gameFull";
  id: string;
  white: { id: string; name: string; rating: number };
  black: { id: string; name: string; rating: number };
  state: BoardGameState;
}

export interface BoardGameStart { type: "gameStart"; game: { id: string } }

async function request(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`https://lichess.org${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200);
    throw new Error(`Lichess ${response.status}${detail ? ` : ${detail}` : ""}`);
  }
  return response;
}

/** Keep the response body open: closing it cancels the public seek. */
export async function seekRatedGame(token: string, minutes: 5 | 10, signal: AbortSignal): Promise<void> {
  const body = new URLSearchParams({ time: String(minutes), increment: "0", rated: "true", variant: "standard" });
  const response = await request(token, "/api/board/seek", {
    method: "POST", body, signal,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  await response.body?.pipeTo(new WritableStream({ write() {} }), { signal });
}

/** NDJSON parser shared by the event and game streams. Blank keepalives are ignored. */
export async function readBoardStream<T>(response: Response, onItem: (item: T) => void, signal: AbortSignal): Promise<void> {
  if (!response.body) throw new Error("Lichess n'a pas fourni de flux de partie.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let newline = pending.indexOf("\n");
      while (newline >= 0) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (line) onItem(JSON.parse(line) as T);
        newline = pending.indexOf("\n");
      }
    }
  } finally { reader.releaseLock(); }
}

export async function boardEvents(token: string, signal: AbortSignal, onStart: (gameId: string) => void): Promise<void> {
  const response = await request(token, "/api/stream/event", { signal });
  await readBoardStream<BoardGameStart>(response, (event) => {
    if (event.type === "gameStart" && event.game?.id) onStart(event.game.id);
  }, signal);
}

export async function boardGame(token: string, gameId: string, signal: AbortSignal, onState: (event: BoardGameFull | BoardGameState) => void): Promise<void> {
  const response = await request(token, `/api/board/game/stream/${encodeURIComponent(gameId)}`, { signal });
  await readBoardStream<BoardGameFull | BoardGameState>(response, (event) => {
    if (event.type === "gameFull" || event.type === "gameState") onState(event);
  }, signal);
}

export async function boardMove(token: string, gameId: string, uci: string): Promise<void> {
  await request(token, `/api/board/game/${encodeURIComponent(gameId)}/move/${encodeURIComponent(uci)}`, { method: "POST" });
}

export async function boardResign(token: string, gameId: string): Promise<void> {
  await request(token, `/api/board/game/${encodeURIComponent(gameId)}/resign`, { method: "POST" });
}

export async function boardAccount(token: string): Promise<{ id: string; username: string }> {
  const response = await request(token, "/api/account");
  return response.json();
}

/** Recover a game if its start event arrived before the event stream was ready. */
export async function boardPlaying(token: string): Promise<string[]> {
  const response = await request(token, "/api/account/playing?nb=50");
  const data = await response.json() as { nowPlaying?: Array<{ gameId?: string; fullId?: string; variant?: { key?: string } | string; speed?: string }> };
  return (data.nowPlaying ?? [])
    .filter((game) => !game.variant || game.variant === "standard" || (typeof game.variant === "object" && game.variant.key === "standard"))
    .map((game) => game.gameId ?? game.fullId?.slice(0, 8) ?? "")
    .filter(Boolean);
}
