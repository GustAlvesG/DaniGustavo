import { describe, expect, it } from "vitest";
import { cx } from "./cx";

describe("cx", () => {
  it("junta classes e ignora valores falsos", () => {
    expect(cx("a", false, null, undefined, 0, "", "b")).toBe("a b");
  });

  it("devolve string vazia sem classes", () => {
    expect(cx()).toBe("");
  });
});
