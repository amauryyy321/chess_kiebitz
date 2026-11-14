import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Videos, { youtubeId } from "./Videos";

afterEach(() => { cleanup(); localStorage.clear(); });
describe("YouTube videos", () => {
  it("accepts YouTube URLs and rejects unrelated hosts", () => {
    expect(youtubeId("https://youtu.be/DH-OJ_wvyOo?t=12")).toBe("DH-OJ_wvyOo");
    expect(youtubeId("https://www.youtube.com/watch?v=DH-OJ_wvyOo")).toBe("DH-OJ_wvyOo");
    expect(youtubeId("https://youtube.com.example.org/watch?v=DH-OJ_wvyOo")).toBeNull();
  });
  it("saves, plays and removes a video", () => {
    const view = render(<Videos />);
    fireEvent.change(screen.getByLabelText("URL YouTube"), { target: { value: "https://youtu.be/DH-OJ_wvyOo" } });
    fireEvent.click(screen.getByText("Importer"));
    expect(screen.getByTitle("Lecteur vidéo YouTube").getAttribute("src")).toContain("DH-OJ_wvyOo");
    view.unmount(); render(<Videos />);
    fireEvent.click(screen.getByText(/Vidéo 1/));
    expect(screen.getByTitle("Lecteur vidéo YouTube")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Supprimer la vidéo 1"));
    expect(screen.queryByTitle("Lecteur vidéo YouTube")).toBeNull();
  });
});
