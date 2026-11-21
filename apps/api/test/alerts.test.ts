import { ALERT_COOLDOWN_MINUTES } from "@casamento/shared";
import { describe, expect, it } from "vitest";
import { createAlerter } from "../src/alerts.ts";
import { startIntervalJob } from "../src/jobs.ts";
import { createLogger } from "../src/log.ts";
import type { MailMessage } from "../src/mailer.ts";

// Fase 6, frente D: alertas por e-mail para a plataforma, com intervalo entre iguais.

function setup(email: string | null = "ops@plataforma.exemplo") {
  const sent: MailMessage[] = [];
  let failing = false;
  let t = new Date("2026-11-21T12:00:00Z").getTime();
  const alerter = createAlerter({
    env: { PLATFORM_ALERT_EMAIL: email ?? undefined, NODE_ENV: "production" },
    mailer: {
      send(m) {
        if (failing) return Promise.reject(new Error("SMTP fora"));
        sent.push(m);
        return Promise.resolve();
      },
    },
    logger: createLogger({ format: "json", write: () => {} }),
    now: () => new Date(t),
  });
  return {
    alerter,
    sent,
    advance: (min: number) => (t += min * 60_000),
    fail: (v: boolean) => (failing = v),
  };
}

describe("alertas", () => {
  it("envia para PLATFORM_ALERT_EMAIL com o título no assunto", async () => {
    const { alerter, sent } = setup();
    const ok = await alerter.notify({ key: "k", title: "Rotina caiu", error: new Error("boom") });
    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "ops@plataforma.exemplo",
      subject: "[alerta] Rotina caiu",
    });
    expect(sent[0]?.text).toContain("Error: boom");
  });

  it("alerta repetido dentro do intervalo não é reenviado; depois sai com a contagem", async () => {
    const { alerter, sent, advance } = setup();
    await alerter.notify({ key: "rotina:x", title: "Falhou" });
    advance(1);
    expect(await alerter.notify({ key: "rotina:x", title: "Falhou" })).toBe(false);
    advance(1);
    expect(await alerter.notify({ key: "rotina:x", title: "Falhou" })).toBe(false);
    // Outra chave não espera.
    expect(await alerter.notify({ key: "rotina:y", title: "Outra" })).toBe(true);
    expect(sent).toHaveLength(2);
    advance(ALERT_COOLDOWN_MINUTES);
    expect(await alerter.notify({ key: "rotina:x", title: "Falhou" })).toBe(true);
    expect(sent).toHaveLength(3);
    expect(sent[2]?.text).toContain("Repetições seguradas desde o último aviso: 2.");
  });

  it("sem e-mail configurado, não faz nada", async () => {
    const { alerter, sent } = setup(null);
    expect(await alerter.notify({ key: "k", title: "x" })).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("falha no SMTP não lança e libera a próxima tentativa", async () => {
    const { alerter, sent, fail } = setup();
    fail(true);
    expect(await alerter.notify({ key: "k", title: "x" })).toBe(false);
    fail(false);
    expect(await alerter.notify({ key: "k", title: "x" })).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it("não leva e-mail nem CPF de convidado no texto", async () => {
    const { alerter, sent } = setup();
    await alerter.notify({
      key: "k",
      title: "Erro com ana@exemplo.com",
      error: new Error("CPF 123.456.789-09 recusado para ana@exemplo.com"),
    });
    const all = `${sent[0]?.subject}\n${sent[0]?.text}`;
    expect(all).not.toContain("ana@exemplo.com");
    expect(all).not.toContain("123.456.789-09");
  });
});

describe("rotinas", () => {
  it("rotina que falha vai para o log e para o alerta", async () => {
    const logged: string[] = [];
    const alerts: string[] = [];
    const stop = startIntervalJob(
      {
        name: "teste",
        intervalMs: 60_000,
        runAtStart: true,
        run: () => Promise.reject(new Error("sem banco")),
      },
      {
        logger: createLogger({ format: "json", write: (l) => logged.push(l) }),
        alerts: {
          notify: (a) => {
            alerts.push(a.key);
            return Promise.resolve(true);
          },
        },
      },
    );
    await new Promise((r) => setTimeout(r, 20));
    stop();
    expect(JSON.parse(logged[0]!)).toMatchObject({
      level: "error",
      job: "teste",
      message: "sem banco",
    });
    expect(alerts).toEqual(["rotina:teste"]);
  });
});

describe("rotinas (startIntervalJob)", () => {
  it("firstRunDelayMs adia a primeira rodada; parar antes cancela", async () => {
    let runs = 0;
    const job = (firstRunDelayMs: number) =>
      startIntervalJob(
        {
          name: "atrasada",
          intervalMs: 60_000,
          runAtStart: true,
          firstRunDelayMs,
          run: () => {
            runs += 1;
            return Promise.resolve(null);
          },
        },
        { logger: createLogger({ format: "json", write: () => {} }) },
      );
    const stop = job(60);
    await new Promise((r) => setTimeout(r, 10));
    expect(runs).toBe(0);
    await new Promise((r) => setTimeout(r, 120));
    expect(runs).toBe(1);
    stop();

    const cancelled = job(60);
    cancelled();
    await new Promise((r) => setTimeout(r, 120));
    expect(runs).toBe(1);
  });
});
