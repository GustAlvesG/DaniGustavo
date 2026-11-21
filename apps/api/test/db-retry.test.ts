import { describe, expect, it } from "vitest";
import { isLockConflict, withDeadlockRetry } from "../src/db-retry.ts";

const deadlock = () => Object.assign(new Error("Failed query"), { cause: { errno: 1213 } });

describe("withDeadlockRetry", () => {
  it("repete a transação derrubada por deadlock e devolve o resultado", async () => {
    let calls = 0;
    const out = await withDeadlockRetry(async () => {
      calls++;
      if (calls < 3) throw deadlock();
      return "ok";
    });
    expect(out).toBe("ok");
    expect(calls).toBe(3);
  });

  it("não repete outros erros e desiste depois das tentativas", async () => {
    let calls = 0;
    await expect(
      withDeadlockRetry(async () => {
        calls++;
        throw new Error("outro");
      }),
    ).rejects.toThrow("outro");
    expect(calls).toBe(1);

    calls = 0;
    await expect(
      withDeadlockRetry(async () => {
        calls++;
        throw deadlock();
      }, 2),
    ).rejects.toThrow("Failed query");
    expect(calls).toBe(2);
  });

  it("reconhece 1213 e 1205, direto ou no cause do Drizzle", () => {
    expect(isLockConflict({ errno: 1205 })).toBe(true);
    expect(isLockConflict(deadlock())).toBe(true);
    expect(isLockConflict({ errno: 1062 })).toBe(false);
    expect(isLockConflict(null)).toBe(false);
  });
});
