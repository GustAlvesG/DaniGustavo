import {
  and,
  asc,
  desc,
  eq,
  eventMembers,
  events,
  inArray,
  isNull,
  newPublicId,
  organizations,
  paymentAccounts,
  type Database,
} from "@casamento/db";
import {
  ERROR_CODES,
  maskDocument,
  type EventPaymentView,
  type EventReceiverUpdate,
  type OrgPaymentAccountsView,
  type PaymentAccountInput,
  type PaymentAccountView,
} from "@casamento/shared";
import { newWebhookToken, secretsOf, sha256Hex } from "../crypto/secret-box.ts";
import type { Env } from "../env.ts";
import type { PaymentProvider } from "../payments/index.ts";
import { PaymentProviderError } from "../payments/provider.ts";
import type { EventCtx } from "../tenancy/types.ts";
import {
  activeOrganizationAccount,
  activeUserAccount,
  getOrgPaymentAccount,
  holdersOf,
  loadEventReceiverAccount,
  receiverState,
  sealAccountApiKey,
  toPaymentAccountSummary,
  toPaymentAccountView,
  type PaymentAccountRow,
} from "./store.ts";

/*
 * Fase 5, frente C: cadastro, desativação, listagem e recebedor do evento. A apiKey devolvida
 * pelo provedor é cifrada aqui e nunca sai (view, log, erro). Documento completo, endereço,
 * renda e nascimento vão só ao provedor: gravamos nome, e-mail e o documento mascarado.
 */

export interface PaymentAccountDeps {
  env: Env;
  db: Database;
  provider: PaymentProvider;
  secrets?: Parameters<typeof secretsOf>[0]["secrets"];
  now: () => Date;
}

/** Erro de regra de negócio com o status HTTP que a rota devolve. */
export class PaymentAccountError extends Error {
  readonly code: string;
  readonly status: 403 | 404 | 409 | 422 | 502;
  readonly field?: string;
  constructor(status: 403 | 404 | 409 | 422 | 502, message: string, field?: string) {
    super(message);
    this.name = "PaymentAccountError";
    this.status = status;
    this.field = field;
    this.code =
      status === 409
        ? ERROR_CODES.conflict
        : status === 404
          ? ERROR_CODES.notFound
          : status === 403
            ? ERROR_CODES.unauthorized
            : status === 502
              ? ERROR_CODES.paymentFailed
              : ERROR_CODES.invalidRequest;
  }
}

const feePercent = (env: Env) => env.PLATFORM_FEE_PERCENT ?? 0;

/** Traduz o erro do provedor sem repassar nada além da mensagem já tratada. */
function providerFailure(err: unknown): PaymentAccountError {
  if (err instanceof PaymentProviderError) {
    if (err.status === 400 || err.status === 422) {
      return new PaymentAccountError(
        422,
        err.message || "O provedor recusou o cadastro. Confira os dados.",
      );
    }
  }
  return new PaymentAccountError(
    502,
    "Não foi possível falar com o provedor de pagamento. Tente de novo em instantes.",
  );
}

interface CreateArgs {
  orgId: number;
  holder: "organization" | "user";
  userId: string | null;
  createdBy: string;
  input: PaymentAccountInput;
}

/**
 * Cria a subconta no provedor e grava a linha. Uma conta ativa por titular: a transação trava
 * a linha da organização, então dois cadastros simultâneos não criam duas contas.
 */
export async function createPaymentAccount(
  deps: PaymentAccountDeps,
  args: CreateArgs,
): Promise<PaymentAccountRow> {
  const { env, db, provider } = deps;
  const { orgId, holder, userId, createdBy, input } = args;
  const createSubaccount = provider.createSubaccount?.bind(provider);
  if (!createSubaccount) {
    throw new PaymentAccountError(422, "O provedor de pagamento configurado não cria subcontas.");
  }
  const box = secretsOf(deps);
  const publicId = newPublicId();
  const webhookToken = newWebhookToken();

  return db.transaction(async (tx) => {
    const trx = tx as unknown as Database;
    await trx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .for("update");
    const existing =
      holder === "organization"
        ? await activeOrganizationAccount(trx, orgId)
        : await activeUserAccount(trx, orgId, userId ?? "");
    if (existing) {
      throw new PaymentAccountError(
        409,
        "Já existe uma conta de recebimento ativa. Desative a atual antes de cadastrar outra.",
      );
    }
    let created;
    try {
      created = await createSubaccount({
        ...input,
        webhook: {
          url: `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/api/webhooks/payments/accounts/${publicId}`,
          authToken: webhookToken,
          email: env.ADMIN_EMAIL_1 ?? "nao-responda@localhost",
        },
      });
    } catch (err) {
      throw providerFailure(err);
    }
    const now = deps.now();
    const snapshot = created.status;
    const status = snapshot?.status ?? "pending";
    const [res] = await trx.insert(paymentAccounts).values({
      organizationId: orgId,
      holder,
      userId: holder === "user" ? userId : null,
      provider: provider.name as "simulado" | "asaas",
      publicId,
      providerAccountId: created.providerAccountId,
      walletId: created.walletId,
      apiKeyEnc: sealAccountApiKey(box, publicId, created.apiKey),
      webhookTokenHash: sha256Hex(webhookToken),
      personType: input.personType,
      companyType: input.personType === "company" ? (input.companyType ?? null) : null,
      name: input.name,
      email: input.email,
      documentHint: maskDocument(input.document),
      status,
      kyc: snapshot?.kyc ?? null,
      statusCheckedAt: snapshot ? now : null,
      approvedAt: status === "approved" ? now : null,
      createdBy,
    });
    const [row] = await trx
      .select()
      .from(paymentAccounts)
      .where(
        and(
          eq(paymentAccounts.organizationId, orgId),
          eq(paymentAccounts.id, Number((res as { insertId: number }).insertId)),
        ),
      );
    return row!;
  });
}

/** Nomes dos eventos ativos que recebem por esta conta. */
async function dependentEvents(db: Database, row: PaymentAccountRow): Promise<string[]> {
  const rows = await db
    .select({
      name: events.name,
      status: events.status,
      receiver: events.paymentReceiver,
      accountId: events.receivingAccountId,
    })
    .from(events)
    .where(eq(events.organizationId, row.organizationId));
  return rows
    .filter((e) => e.status === "active")
    .filter((e) =>
      row.holder === "organization"
        ? e.receiver === "organization"
        : e.receiver === "host" && e.accountId === row.id,
    )
    .map((e) => e.name);
}

export async function disablePaymentAccount(
  deps: PaymentAccountDeps,
  orgId: number,
  accountId: number,
): Promise<PaymentAccountRow> {
  const { db } = deps;
  const row = await getOrgPaymentAccount(db, orgId, accountId);
  if (!row) throw new PaymentAccountError(404, "Conta não encontrada.");
  if (row.disabledAt) return row;
  const using = await dependentEvents(db, row);
  if (using.length) {
    throw new PaymentAccountError(
      409,
      `Esta conta recebe os presentes de: ${using.join(", ")}. Escolha outro recebedor antes de desativar.`,
    );
  }
  await db
    .update(paymentAccounts)
    .set({ status: "disabled", disabledAt: deps.now() })
    .where(and(eq(paymentAccounts.organizationId, orgId), eq(paymentAccounts.id, accountId)));
  return (await getOrgPaymentAccount(db, orgId, accountId))!;
}

async function viewsOf(db: Database, rows: PaymentAccountRow[]): Promise<PaymentAccountView[]> {
  const holders = await holdersOf(db, rows);
  return rows.map((r) =>
    toPaymentAccountView(r, r.userId ? (holders.get(r.userId) ?? null) : null),
  );
}

export async function paymentAccountView(
  db: Database,
  row: PaymentAccountRow,
): Promise<PaymentAccountView> {
  return (await viewsOf(db, [row]))[0]!;
}

export async function listOrgPaymentAccounts(
  deps: PaymentAccountDeps,
  orgId: number,
): Promise<OrgPaymentAccountsView> {
  const { db, env, provider } = deps;
  const rows = await db
    .select()
    .from(paymentAccounts)
    .where(eq(paymentAccounts.organizationId, orgId))
    .orderBy(desc(paymentAccounts.createdAt), desc(paymentAccounts.id));
  const org = rows.find((r) => r.holder === "organization" && !r.disabledAt) ?? null;
  const [orgView] = org ? await viewsOf(db, [org]) : [null];
  return {
    organizationAccount: orgView ?? null,
    userAccounts: await viewsOf(
      db,
      rows.filter((r) => r.holder === "user"),
    ),
    platformFeePercent: feePercent(env),
    provider: provider.name as "simulado" | "asaas",
  };
}

/** Pessoas que são anfitriãs do evento. */
async function hostIds(db: Database, ev: EventCtx): Promise<string[]> {
  const rows = await db
    .select({ userId: eventMembers.userId })
    .from(eventMembers)
    .where(and(eq(eventMembers.eventId, ev.id), eq(eventMembers.role, "host")))
    .orderBy(asc(eventMembers.id));
  return rows.map((r) => r.userId);
}

export async function eventPaymentView(
  deps: PaymentAccountDeps,
  ev: EventCtx,
  canConfigure: boolean,
): Promise<EventPaymentView> {
  const { db, env } = deps;
  const current = await loadEventReceiverAccount(db, ev);
  let options: EventPaymentView["options"] = [];
  if (canConfigure) {
    const orgAccount = await activeOrganizationAccount(db, ev.orgId);
    const hosts = await hostIds(db, ev);
    const hostRows = hosts.length
      ? await db
          .select()
          .from(paymentAccounts)
          .where(
            and(
              eq(paymentAccounts.organizationId, ev.orgId),
              eq(paymentAccounts.holder, "user"),
              inArray(paymentAccounts.userId, hosts),
              isNull(paymentAccounts.disabledAt),
            ),
          )
      : [];
    const rows = [...(orgAccount ? [orgAccount] : []), ...hostRows];
    const holders = await holdersOf(db, rows);
    options = rows.map((r) =>
      toPaymentAccountSummary(r, r.userId ? (holders.get(r.userId) ?? null) : null),
    );
  }
  let account: EventPaymentView["account"] = null;
  if (current.account) {
    const holders = await holdersOf(db, [current.account]);
    const uid = current.account.userId;
    account = toPaymentAccountSummary(current.account, uid ? (holders.get(uid) ?? null) : null);
  }
  return {
    receiver: current.receiver,
    account,
    state: receiverState(current),
    platformFeePercent: current.receiver === "platform" ? 0 : feePercent(env),
    options,
    canConfigure,
  };
}

export async function setEventReceiver(
  deps: PaymentAccountDeps,
  ev: EventCtx,
  update: EventReceiverUpdate,
  isPlatformAdmin: boolean,
): Promise<void> {
  const { db } = deps;
  let accountId: number | null = null;
  if (update.receiver === "platform" && !isPlatformAdmin) {
    throw new PaymentAccountError(
      403,
      "Só a administração da plataforma escolhe a conta da plataforma.",
    );
  }
  if (update.receiver === "host") {
    const acc = await getOrgPaymentAccount(db, ev.orgId, update.accountId ?? 0);
    if (!acc || acc.holder !== "user" || acc.disabledAt || !acc.userId) {
      throw new PaymentAccountError(
        422,
        "Escolha a conta de um anfitrião deste evento.",
        "accountId",
      );
    }
    if (!(await hostIds(db, ev)).includes(acc.userId)) {
      throw new PaymentAccountError(
        422,
        "Essa conta não é de um anfitrião deste evento.",
        "accountId",
      );
    }
    accountId = acc.id;
  }
  await db
    .update(events)
    .set({ paymentReceiver: update.receiver, receivingAccountId: accountId })
    .where(and(eq(events.id, ev.id), eq(events.organizationId, ev.orgId)));
}
