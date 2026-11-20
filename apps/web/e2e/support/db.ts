/*
 * Apoio dos e2e de RSVP: cria convites descartáveis direto no banco (os de
 * seed nunca são alterados, então a suíte é repetível sem `db:reset`) e mexe
 * no prazo global só no teste de prazo, que roda isolado (projeto "prazo").
 * O acesso ao banco roda em `db-cli.mts` (processo Node à parte).
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

export type TestGuest = { name: string; isChild?: boolean; ageRange?: "0-2" | "3-7" | "8-12" };

export type TestInvitation = { token: string; label: string };

const cli = join(__dirname, "db-cli.mts");

function run<T>(command: string, arg?: string): T {
  const out = execFileSync(process.execPath, [cli, command, ...(arg === undefined ? [] : [arg])], {
    encoding: "utf8",
    env: process.env,
    cwd: __dirname,
  });
  return JSON.parse(out.trim().split("\n").pop() ?? "null") as T;
}

export async function createInvitation(opts: {
  label: string;
  guests: TestGuest[];
  maxGuests?: number;
  allowPlusOne?: boolean;
}): Promise<TestInvitation> {
  const { token } = run<{ token: string }>("create", JSON.stringify(opts));
  return { token, label: opts.label };
}

/** Apaga o convite (os convidados e logs saem junto, por cascata). */
export async function deleteInvitation(token: string): Promise<void> {
  run("delete", token);
}

export async function getDeadline(): Promise<string> {
  return run<{ value: string }>("get-deadline").value;
}

export async function setDeadline(iso: string): Promise<void> {
  run("set-deadline", iso);
}

/** Apaga os pedidos de presente feitos com este e-mail e devolve as cotas. */
export async function cleanupOrders(buyerEmail: string): Promise<void> {
  run("cleanup-orders", buyerEmail);
}

/** Painel: presente com pedido pago (simulado) e recado pendente, identificados por `run`. */
export async function painelFixture(
  runId: string,
): Promise<{ slug: string; publicId: string; giftId: number }> {
  return run("painel-fixture", runId);
}

export async function painelCleanup(runId: string): Promise<void> {
  run("painel-cleanup", runId);
}

/** Recados do mural (e2e): aprova o recado deste autor / apaga os deste autor. */
export async function approveMessage(author: string): Promise<void> {
  run("message-approve", author);
}

export async function deleteMessages(author: string): Promise<void> {
  run("message-delete", author);
}

/** Tira seções, tema e módulos gravados do evento (volta ao neutro do tipo); devolve o id. */
export async function resetFase2(slug: string): Promise<number> {
  return run<{ eventId: number }>("fase2-reset", slug).eventId;
}
