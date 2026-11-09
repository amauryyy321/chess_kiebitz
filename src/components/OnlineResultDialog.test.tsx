import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OnlineResultDialog from "./OnlineResultDialog";

afterEach(cleanup);

describe("résultat de la partie Lichess", () => {
  it.each([
    ["win", "Vous avez gagné !"],
    ["loss", "Vous avez perdu."],
    ["draw", "Partie nulle."],
  ] as const)("shows %s and opens analysis", (result, message) => {
    const onViewAnalysis = vi.fn();
    render(<OnlineResultDialog result={result} onViewAnalysis={onViewAnalysis} />);
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText(message)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Voir l’analyse" }));
    expect(onViewAnalysis).toHaveBeenCalledOnce();
  });
});
