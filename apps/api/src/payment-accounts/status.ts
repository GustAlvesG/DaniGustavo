import {
  and,
  eq,
  inArray,
  isNull,
  isNotNull,
  organizationMembers,
  organizations,
  paymentAccounts,
  user,
  webhookEvents,
  type Database,
} from "@casamento/db";
import { KycSnapshot, type PaymentAccountView } from "@casamento/shared";
import type { SecretBox } from "../crypto/secret-box.ts";
import type { Env } from "../env.ts";
import type { Mailer } from "../mailer.ts";
import { accountStatusLink, buildAccountStatusEmail } from "../payment-account-email.ts";
import {
  notImplemented,
  type AccountWebhookNotice,
  type PaymentProvider,
} from "../payments/index.ts";
import { crossEvent } from "../tenancy/cross-event.ts";
import {
  accountCredentials,
  holdersOf,
  toPaymentAccountView,
  type PaymentAccountRow,
} from "./store.ts";

/*
 * Fase 5, frente D (docs/saas/fase-5.md): situação cadastral (KYC) das subcontas. Consulta o
 * provedor (`forAccount(...).getAccountStatus()`), grava `status`/`kyc`/`status_checked_at`
 * (e `approved_at` na primeira aprovação) e avisa quem cadastrou quando muda. A situação que
 * vale é sempre a do provedor (uma conta aprovada só deixa de ser se ele disser); conta
 * desativada não muda. O `kyc` guardado é só o `KycSnapshot` (nenhum segredo nem documento).
 */

export interface AccountStatusDeps {
  env: Env;
  db: Database;
  provider: PaymentProvider;
  secrets: SecretBox;
  mailer: Mailer;
  now: () => Date;
}

async function viewOf(db: Database, row: PaymentAccountRow): Promise<PaymentAccountView> {
  const holders = await holdersOf(db, [row]);
  return toPaymentAccountView(row, row.userId ? (holders.get(row.userId) ?? null) : null);
}

async function reload(db: Database, row: PaymentAccountRow): Promise<PaymentAccountRow> {
  const [fresh] = await db
    .select()
    .from(paymentAccounts)
    .where(
      and(eq(paymentAccounts.organizationId, row.organizationId), eq(paymentAccounts.id, row.id)),
    );
  return fresh ?? row;
}

/** Quem recebe o aviso: quem cadastrou, o titular (pessoa) e os donos da organização. */
export async function accountStatusRecipients(
  db: Database,
  row: PaymentAccountRow,
): Promise<string[]> {
  const ids = new Set<string>();
  if (row.createdBy) ids.add(row.createdBy);
  if (row.holder === "user" && row.userId) ids.add(row.userId);
  const owners = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, row.organizationId),
        eq(organizationMembers.role, "owner"),
      ),
    );
  for (const o of owners) ids.add(o.userId);
  if (ids.size === 0) return [];
  const users = await db
    .select({ email: user.email })
    .from(user)
    .where(inArray(user.id, [...ids]));
  return [...new Set(users.map((u) => u.email.toLowerCase()))];
}

async function notifyChange(deps: AccountStatusDeps, row: PaymentAccountRow): Promise<void> {
  try {
    const kyc = KycSnapshot.safeParse(row.kyc);
    const [org] = await deps.db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, row.organizationId));
    const recipients = await accountStatusRecipients(deps.db, row);
    for (const to of recipients) {
      await deps.mailer.send(
        buildAccountStatusEmail({
          to,
          organizationName: org?.name ?? "Plataforma",
          accountName: row.name,
          status: row.status,
          rejectReason: kyc.success ? kyc.data.rejectReason : null,
          pendingDocuments: kyc.success
            ? kyc.data.documents
                .filter((d) => d.status === "not_sent" || d.status === "rejected")
                .map((d) => d.title)
            : [],
          link: accountStatusLink(deps.env.BETTER_AUTH_URL, row.organizationId),
        }),
      );
    }
  } catch (err) {
    // Falha de e-mail não desfaz a atualização da situação.
    console.error("[contas] Falha ao avisar a mudança de situação:", err);
  }
}

/** Consulta o provedor e grava a situação da conta; devolve a view atualizada. */
export async function refreshAccountStatus(
  deps: AccountStatusDeps,
  account: PaymentAccountRow,
): Promise<PaymentAccountView> {
  if (account.disabledAt || account.status === "disabled") return viewOf(deps.db, account);
  const scoped = deps.provider.forAccount?.(accountCredentials(deps.secrets, account));
  if (!scoped?.getAccountStatus) throw notImplemented("Situação cadastral da subconta");
  const snapshot = await scoped.getAccountStatus();
  const kyc = KycSnapshot.parse(snapshot.kyc);
  const now = deps.now();
  const changed = snapshot.status !== account.status;
  // Condição `status = <lido>`: duas consultas ao mesmo tempo só avisam uma vez.
  const [result] = await deps.db
    .update(paymentAccounts)
    .set({
      status: snapshot.status,
      kyc,
      statusCheckedAt: now,
      ...(snapshot.status === "approved" && !account.approvedAt ? { approvedAt: now } : {}),
    })
    .where(
      and(
        eq(paymentAccounts.organizationId, account.organizationId),
        eq(paymentAccounts.id, account.id),
        eq(paymentAccounts.status, account.status),
        isNull(paymentAccounts.disabledAt),
      ),
    );
  const fresh = await reload(deps.db, account);
  if (changed && result.affectedRows > 0) await notifyChange(deps, fresh);
  return viewOf(deps.db, fresh);
}

/** Aviso ACCOUNT_STATUS_* chegou no webhook da conta: idempotente e consulta o provedor. */
export async function handleAccountWebhook(
  deps: AccountStatusDeps,
  account: PaymentAccountRow,
  notice: AccountWebhookNotice,
): Promise<void> {
  const { db } = deps;
  await db
    .insert(webhookEvents)
    .ignore()
    .values({
      gateway: deps.provider.name,
      eventId: notice.eventId,
      payload: { type: notice.type },
    });
  const [row] = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.eventId, notice.eventId));
  if (row?.processedAt) return;
  await refreshAccountStatus(deps, account);
  await db
    .update(webhookEvents)
    .set({ processedAt: deps.now() })
    .where(eq(webhookEvents.eventId, notice.eventId));
}

/**
 * Rotina: contas não aprovadas nem desativadas (e já criadas no provedor), consultadas de
 * tempos em tempos (crossEvent). Uma falha não para as outras. Devolve quantas foram consultadas.
 */
export async function refreshPendingAccounts(deps: AccountStatusDeps): Promise<number> {
  const rows = await crossEvent(
    "contas: situação cadastral das não aprovadas",
    async () =>
      // O await dentro do callback mantém a consulta no contexto do crossEvent.
      await deps.db
        .select()
        .from(paymentAccounts)
        .where(
          and(
            inArray(paymentAccounts.status, ["pending", "awaiting_approval", "rejected"]),
            isNull(paymentAccounts.disabledAt),
            isNotNull(paymentAccounts.apiKeyEnc),
          ),
        ),
  );
  let done = 0;
  for (const row of rows) {
    try {
      await refreshAccountStatus(deps, row);
      done += 1;
    } catch (err) {
      console.error(`[contas] Falha ao consultar a conta ${row.id}:`, err);
    }
  }
  return done;
}
