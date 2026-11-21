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

/** Fase 3: organização própria do e2e, com a dona `dona-f3-<run>@exemplo.com`. */
export function fase3Org(runId: string, password: string): { orgId: number } {
  return run<{ orgId: number }>("fase3-org", JSON.stringify({ run: runId, password }));
}

/** Fase 3: token conhecido para o convite pendente deste e-mail (o banco só tem o hash). */
export function fase3InviteToken(email: string): string {
  return run<{ token: string }>("fase3-invite-token", email).token;
}

/** Fase 3: apaga a organização do e2e (evento e convites juntos) e as contas criadas. */
export function fase3Cleanup(runId: string): void {
  run("fase3-cleanup", runId);
}

/** Fase 4: membro (gestora) da organização do evento de teste, com a senha dada. */
export function fase4Member(
  runId: string,
  slug: string,
  password: string,
): { orgId: number; eventId: number } {
  return run("fase4-member", JSON.stringify({ run: runId, slug, password }));
}

/** Fase 4: apaga o que o e2e criou (marcado com `run`), o previsto da categoria e a gestora. */
export function fase4Cleanup(runId: string, slug: string, category: string): void {
  run("fase4-cleanup", JSON.stringify({ run: runId, slug, category }));
}

/** Fase 5: org com dona (senha dada) e evento que recebe pela conta da organização. */
export function fase5Setup(
  runId: string,
  password: string,
  host: string,
): { orgId: number; eventId: number; email: string } {
  return run("fase5-setup", JSON.stringify({ run: runId, password, host }));
}

/** Fase 5: apaga pedidos, contas de recebimento, o evento, a org e a dona do e2e. */
export function fase5Cleanup(runId: string): void {
  run("fase5-cleanup", runId);
}

/** Fase 6: token conhecido para o cadastro pendente deste e-mail (o banco só tem o hash). */
export function fase6SignupToken(email: string): string {
  return run<{ token: string }>("fase6-signup-token", email).token;
}

/** Fase 6: convite de um convidado só no evento dado; devolve o token do link. */
export function fase6Invitation(slug: string, label: string, guest: string): string {
  return run<{ token: string }>("fase6-invitation", JSON.stringify({ slug, label, guest })).token;
}

/** Fase 6: assinatura da org com pagamento em atraso há `days` dias. */
export function fase6PastDue(orgId: number, days: number): void {
  run("fase6-past-due", JSON.stringify({ orgId, days }));
}

/** Fase 6: assinatura da org de volta ao teste grátis, sem atraso. */
export function fase6Restore(orgId: number): void {
  run("fase6-restore", String(orgId));
}

/** Fase 6: platform admin do e2e (`admin-f6-<run>@exemplo.com`) com a senha dada. */
export function fase6Admin(runId: string, password: string): { email: string } {
  return run("fase6-admin", JSON.stringify({ run: runId, password }));
}

/** Fase 6: apaga a org da dona do cadastro (eventos juntos), os cadastros e as contas. */
export function fase6Cleanup(runId: string): void {
  run("fase6-cleanup", runId);
}
