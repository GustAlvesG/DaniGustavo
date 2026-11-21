import {
  and,
  eq,
  events,
  isNull,
  paymentAccounts,
  user,
  type Database,
  type PaymentAccountStatus,
} from "@casamento/db";
import {
  KycSnapshot,
  type CompanyType,
  type EventPaymentState,
  type PaymentReceiver,
  type PaymentAccountSummary,
  type PaymentAccountView,
} from "@casamento/shared";
import { paymentAccountAad, type SecretBox } from "../crypto/secret-box.ts";
import type { AccountCredentials } from "../payments/index.ts";
import { crossEvent } from "../tenancy/cross-event.ts";
import type { EventCtx } from "../tenancy/types.ts";

/*
 * Fase 5 (docs/saas/fase-5.md): acesso a `payment_accounts` comum às frentes (arquivo da
 * integração; as frentes só acrescentam). Toda consulta filtra por `organization_id`, exceto
 * a busca pela URL do webhook (`public_id`), feita em crossEvent. A apiKey só é decifrada aqui,
 * na hora de chamar o provedor, e nunca sai em view, log ou erro.
 */

export type PaymentAccountRow = typeof paymentAccounts.$inferSelect;

/** Conta da organização pelo id (null se não existe ou é de outra organização). */
export async function getOrgPaymentAccount(
  db: Database,
  orgId: number,
  accountId: number,
): Promise<PaymentAccountRow | null> {
  const [row] = await db
    .select()
    .from(paymentAccounts)
    .where(and(eq(paymentAccounts.organizationId, orgId), eq(paymentAccounts.id, accountId)));
  return row ?? null;
}

/** A conta ativa (não desativada) da organização como titular, se houver. */
export async function activeOrganizationAccount(
  db: Database,
  orgId: number,
): Promise<PaymentAccountRow | null> {
  const [row] = await db
    .select()
    .from(paymentAccounts)
    .where(
      and(
        eq(paymentAccounts.organizationId, orgId),
        eq(paymentAccounts.holder, "organization"),
        isNull(paymentAccounts.disabledAt),
      ),
    );
  return row ?? null;
}

/** A conta ativa de uma pessoa na organização, se houver. */
export async function activeUserAccount(
  db: Database,
  orgId: number,
  userId: string,
): Promise<PaymentAccountRow | null> {
  const [row] = await db
    .select()
    .from(paymentAccounts)
    .where(
      and(
        eq(paymentAccounts.organizationId, orgId),
        eq(paymentAccounts.holder, "user"),
        eq(paymentAccounts.userId, userId),
        isNull(paymentAccounts.disabledAt),
      ),
    );
  return row ?? null;
}

/** Conta pela URL do webhook dela (não se sabe a organização antes: crossEvent). */
export function findAccountByPublicId(
  db: Database,
  publicId: string,
): Promise<PaymentAccountRow | null> {
  return crossEvent("webhook: conta pelo id público da URL", async () => {
    const [row] = await db
      .select()
      .from(paymentAccounts)
      .where(eq(paymentAccounts.publicId, publicId));
    return row ?? null;
  });
}

/** Cifra a apiKey da subconta para gravar em `api_key_enc` (amarrada ao `public_id`). */
export const sealAccountApiKey = (box: SecretBox, publicId: string, apiKey: string) =>
  box.seal(apiKey, paymentAccountAad(publicId));

/** A conta pode cobrar? Aprovada, não desativada e com credenciais. */
export function canCharge(row: PaymentAccountRow): boolean {
  return (
    row.status === "approved" &&
    !row.disabledAt &&
    Boolean(row.apiKeyEnc && row.walletId && row.providerAccountId)
  );
}

/** Credenciais decifradas da subconta. Lança se a conta ainda não existe no provedor. */
export function accountCredentials(box: SecretBox, row: PaymentAccountRow): AccountCredentials {
  if (!row.apiKeyEnc || !row.walletId || !row.providerAccountId) {
    throw new Error(`Subconta ${row.id} sem credenciais do provedor.`);
  }
  return {
    providerAccountId: row.providerAccountId,
    walletId: row.walletId,
    apiKey: box.open(row.apiKeyEnc, paymentAccountAad(row.publicId)),
  };
}

type Holder = { id: string; name: string; email: string } | null;

/** Titulares (`user`) das contas, por id, para as views. */
export async function holdersOf(
  db: Database,
  rows: PaymentAccountRow[],
): Promise<Map<string, NonNullable<Holder>>> {
  const ids = [...new Set(rows.map((r) => r.userId).filter((id): id is string => Boolean(id)))];
  const map = new Map<string, NonNullable<Holder>>();
  for (const id of ids) {
    const [u] = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, id));
    if (u) map.set(u.id, u);
  }
  return map;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Linha → o que o painel vê (sem apiKey, wallet, token nem documento completo). */
export function toPaymentAccountView(row: PaymentAccountRow, holder: Holder): PaymentAccountView {
  const kyc = KycSnapshot.safeParse(row.kyc);
  return {
    id: row.id,
    holder: row.holder,
    user: row.holder === "user" ? holder : null,
    provider: row.provider,
    personType: row.personType,
    companyType: (row.companyType as CompanyType | null) ?? null,
    name: row.name,
    email: row.email,
    documentHint: row.documentHint,
    status: row.status as PaymentAccountStatus,
    kyc: kyc.success ? kyc.data : null,
    statusCheckedAt: iso(row.statusCheckedAt),
    approvedAt: iso(row.approvedAt),
    disabledAt: iso(row.disabledAt),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toPaymentAccountSummary(
  row: PaymentAccountRow,
  holder: Holder,
): PaymentAccountSummary {
  const v = toPaymentAccountView(row, holder);
  return {
    id: v.id,
    holder: v.holder,
    user: v.user,
    name: v.name,
    documentHint: v.documentHint,
    status: v.status,
  };
}

/** Recebedor gravado no evento e a conta que ele aponta agora (B e C usam o mesmo cálculo). */
export interface EventReceiverAccount {
  receiver: PaymentReceiver;
  /** `organization`: a conta ativa da org; `host`: a escolhida; `platform`: null. */
  account: PaymentAccountRow | null;
}

export async function loadEventReceiverAccount(
  db: Database,
  ev: EventCtx,
): Promise<EventReceiverAccount> {
  // `events` é a raiz do escopo (sem auditor); o id e a organização vêm do contexto.
  const [row] = await db
    .select({ receiver: events.paymentReceiver, accountId: events.receivingAccountId })
    .from(events)
    .where(and(eq(events.id, ev.id), eq(events.organizationId, ev.orgId)));
  const receiver: PaymentReceiver = row?.receiver ?? "organization";
  if (receiver === "platform") return { receiver, account: null };
  if (receiver === "organization") {
    return { receiver, account: await activeOrganizationAccount(db, ev.orgId) };
  }
  const account = row?.accountId ? await getOrgPaymentAccount(db, ev.orgId, row.accountId) : null;
  return { receiver, account };
}

/** Situação de recebimento do evento a partir do recebedor e da conta. */
export function receiverState({ receiver, account }: EventReceiverAccount): EventPaymentState {
  if (receiver === "platform") return "platform";
  if (!account || account.disabledAt) return "no_account";
  return canCharge(account) ? "ready" : "not_approved";
}
