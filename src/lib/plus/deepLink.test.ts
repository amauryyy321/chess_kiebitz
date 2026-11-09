// @vitest-environment node
/** Deep Links aus Widgets und geteilten Stellungen führen in die App. */
import { describe, expect, it } from "vitest";
import { firstOpenPage, parseOpenDeepLink } from "./deepLink";

describe("parseOpenDeepLink", () => {
  it("maps a widget link to a page", () => {
    expect(parseOpenDeepLink("kiebitz://open?page=puzzles")).toBe("puzzles");
    expect(parseOpenDeepLink("kiebitz://open/?page=puzzles")).toBe("puzzles");
    expect(parseOpenDeepLink("kiebitz://open?page=settings&section=plus")).toBe("settings");
  });

  it("ignores unknown pages instead of navigating somewhere random", () => {
    expect(parseOpenDeepLink("kiebitz://open?page=admin")).toBeNull();
    expect(parseOpenDeepLink("kiebitz://open")).toBeNull();
    expect(parseOpenDeepLink("kiebitz://auth?code=abcdef0123456789ABCDEF")).toBeNull();
  });

  it("picks the first usable page from a batch of links", () => {
    expect(firstOpenPage(["kiebitz://open?page=nope", "kiebitz://open?page=study"])).toBe("study");
    expect(firstOpenPage(undefined)).toBeNull();
  });
});
