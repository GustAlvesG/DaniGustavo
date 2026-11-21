/*
 * Acesso ao banco para os e2e, executado em um processo Node à parte (o
 * Playwright carrega os testes como CommonJS e não importa o pacote ESM
 * @casamento/db). Uso: node db-cli.mts <comando> [argumento JSON].
 * Responde uma linha de JSON no stdout.
 */
import {
  and,
  budgetLines,
  createEventRecord,
  db,
  eq,
  eventMembers,
  eventSettings,
  eventTasks,
  events,
  eventVendors,
  giftOrders,
  gifts,
  guests,
  inArray,
  invitations,
  LEGACY_EVENT_ID,
  like,
  messages,
  newPublicId,
  organizationMembers,
  paymentAccounts,
  payments,
  scheduleItems,
  sql,
  taskTemplates,
  teamInvites,
  user,
  vendorContracts,
  vendors,
} from "@casamento/db";
import { createHash, randomBytes } from "node:crypto";
import { rm, rmdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { cleanupE2eOrg, ensureE2eHost, ensureE2eOrg } from "@casamento/db/testing";

/** Fase 5: nomes do e2e de recebimentos (org, dona, evento, host) a partir do `run`. */
const f5 = (run: string) => ({
  org: `e2e-f5-org-${run}`,
  email: `dona-f5-${run}@exemplo.com`,
  slug: `e2e-f5-${run}`,
});

/** Pedidos, pagamentos e contas de recebimento da org do e2e da Fase 5 (FK restrict). */
async function cleanupFase5(run: string) {
  const { org, email, slug } = f5(run);
  const evs = await db
    .select({ id: events.id, orgId: events.organizationId })
    .from(events)
    .where(eq(events.slug, slug));
  for (const ev of evs) {
    await db.delete(payments).where(eq(payments.eventId, ev.id));
    await db.delete(messages).where(eq(messages.eventId, ev.id));
    await db.delete(giftOrders).where(eq(giftOrders.eventId, ev.id));
    await db
      .update(events)
      .set({ paymentReceiver: "organization", receivingAccountId: null })
      .where(eq(events.id, ev.id));
    await db.delete(paymentAccounts).where(eq(paymentAccounts.organizationId, ev.orgId));
  }
  await cleanupE2eOrg(db, org, [email]);
}

type NewInvitation = {
  label: string;
  guests: { name: string; isChild?: boolean; ageRange?: "0-2" | "3-7" | "8-12" }[];
  maxGuests?: number;
  allowPlusOne?: boolean;
};

const [command, arg] = process.argv.slice(2);

async function main(): Promise<unknown> {
  switch (command) {
    case "create": {
      const opts = JSON.parse(arg ?? "{}") as NewInvitation;
      const token = newPublicId();
      await db.insert(invitations).values({
        eventId: LEGACY_EVENT_ID,
        token,
        label: opts.label,
        side: "dani",
        maxGuests: opts.maxGuests ?? opts.guests.length,
        allowPlusOne: opts.allowPlusOne ?? false,
      });
      const [inv] = await db.select().from(invitations).where(eq(invitations.token, token));
      await db.insert(guests).values(
        opts.guests.map((g) => ({
          eventId: LEGACY_EVENT_ID,
          invitationId: inv!.id,
          name: g.name,
          isChild: g.isChild ?? false,
          ageRange: g.ageRange ?? null,
        })),
      );
      return { token };
    }
    case "delete":
      // Convidados e logs saem junto (ON DELETE CASCADE).
      await db.delete(invitations).where(eq(invitations.token, String(arg)));
      return { ok: true };
    case "get-deadline": {
      const [row] = await db
        .select()
        .from(eventSettings)
        .where(
          and(eq(eventSettings.eventId, LEGACY_EVENT_ID), eq(eventSettings.key, "rsvp.deadline")),
        );
      return { value: String(row?.value) };
    }
    case "set-deadline":
      await db
        .update(eventSettings)
        .set({ value: String(arg) })
        .where(
          and(eq(eventSettings.eventId, LEGACY_EVENT_ID), eq(eventSettings.key, "rsvp.deadline")),
        );
      return { ok: true };
    case "cleanup-orders": {
      // Apaga os pedidos de teste (pelo e-mail do comprador) e recalcula as cotas vendidas
      // dos presentes afetados a partir dos pedidos que sobraram (pendentes e pagos).
      const email = String(arg);
      const rows = await db.select().from(giftOrders).where(eq(giftOrders.buyerEmail, email));
      const ids = rows.map((r) => r.id);
      const giftIds = [...new Set(rows.map((r) => r.giftId))];
      if (ids.length) {
        await db.delete(payments).where(inArray(payments.orderId, ids));
        await db.delete(messages).where(inArray(messages.giftOrderId, ids));
        await db.delete(giftOrders).where(inArray(giftOrders.id, ids));
      }
      for (const giftId of giftIds) {
        const [sum] = await db
          .select({ n: sql<number>`COALESCE(SUM(${giftOrders.quantity}), 0)` })
          .from(giftOrders)
          .where(
            and(eq(giftOrders.giftId, giftId), inArray(giftOrders.status, ["pending", "paid"])),
          );
        await db
          .update(gifts)
          .set({ quotaSold: Number(sum?.n ?? 0) })
          .where(and(eq(gifts.id, giftId), eq(gifts.openAmount, false)));
      }
      return { deleted: ids.length };
    }
    case "painel-fixture": {
      // Painel: um presente próprio com um pedido pago (simulado) e um recado pendente.
      const run = String(arg);
      const slug = `e2e-painel-${run}`;
      await db.insert(gifts).values({
        eventId: LEGACY_EVENT_ID,
        slug,
        title: `Presente e2e ${run}`,
        priceCents: 12000,
        quotaTotal: 3,
        quotaSold: 1,
        category: "casa",
        tileDesign: "flor",
        sort: 99999,
      });
      const [gift] = await db.select().from(gifts).where(eq(gifts.slug, slug));
      const publicId = newPublicId();
      const now = new Date();
      await db.insert(giftOrders).values({
        eventId: LEGACY_EVENT_ID,
        publicId,
        giftId: gift!.id,
        quantity: 1,
        amountCents: 12000,
        method: "card",
        provider: "simulado",
        providerOrderId: `SIM-CARD-E2E-${run}`,
        statusDetail: "accredited",
        buyerName: `Madrinha E2E ${run}`,
        buyerEmail: `e2e-painel-${run}@exemplo.com`,
        message: "Felicidades!",
        status: "paid",
        expiresAt: now,
        paidAt: now,
      });
      await db.insert(messages).values({
        eventId: LEGACY_EVENT_ID,
        author: `Tia E2E ${run}`,
        body: `Recado e2e ${run}`,
      });
      return { slug, publicId, giftId: gift!.id };
    }
    case "painel-cleanup": {
      const run = String(arg);
      const [gift] = await db
        .select()
        .from(gifts)
        .where(eq(gifts.slug, `e2e-painel-${run}`));
      if (gift) {
        const rows = await db.select().from(giftOrders).where(eq(giftOrders.giftId, gift.id));
        const ids = rows.map((r) => r.id);
        if (ids.length) {
          await db.delete(payments).where(inArray(payments.orderId, ids));
          await db.delete(messages).where(inArray(messages.giftOrderId, ids));
          await db.delete(giftOrders).where(inArray(giftOrders.id, ids));
        }
        await db.delete(gifts).where(eq(gifts.id, gift.id));
      }
      await db.delete(messages).where(eq(messages.author, `Tia E2E ${run}`));
      await db.delete(invitations).where(eq(invitations.label, `Convite E2E ${run}`));
      return { ok: true };
    }
    case "message-approve": {
      await db
        .update(messages)
        .set({ approved: true })
        .where(eq(messages.author, arg ?? ""));
      return { ok: true };
    }
    case "message-delete": {
      await db.delete(messages).where(eq(messages.author, arg ?? ""));
      return { ok: true };
    }
    case "e2e-host": {
      const input = JSON.parse(arg ?? "{}") as {
        slug: string;
        email: string;
        name: string;
        password: string;
      };
      return { ok: true, ...(await ensureE2eHost(db, input)) };
    }
    case "fase2-reset": {
      // Volta o evento de teste ao site neutro do tipo (seções, tema e módulos padrão).
      const [ev] = await db
        .select({ id: events.id })
        .from(events)
        .where(eq(events.slug, arg ?? ""));
      if (!ev) throw new Error(`Evento ${arg} não existe.`);
      await db
        .delete(eventSettings)
        .where(
          and(
            eq(eventSettings.eventId, ev.id),
            inArray(eventSettings.key, ["site.sections", "site.theme", "event.modules"]),
          ),
        );
      return { ok: true, eventId: ev.id };
    }
    case "multi-gift": {
      // Presente que só existe no evento de teste (prova que as listas não se misturam).
      const [ev] = await db
        .select({ id: events.id })
        .from(events)
        .where(eq(events.slug, arg ?? ""));
      if (!ev) throw new Error(`Evento ${arg} não existe.`);
      // Fase 5: o evento de teste recebe na conta principal, como o casamento (sem subconta,
      // os presentes em dinheiro ficariam indisponíveis).
      await db
        .update(events)
        .set({ paymentReceiver: "platform", receivingAccountId: null })
        .where(eq(events.id, ev.id));
      const slug = "e2e-so-do-evento-2";
      const [has] = await db
        .select({ id: gifts.id })
        .from(gifts)
        .where(and(eq(gifts.eventId, ev.id), eq(gifts.slug, slug)));
      if (!has) {
        await db.insert(gifts).values({
          eventId: ev.id,
          slug,
          title: "Presente só do evento 2",
          priceCents: 15000,
          quotaTotal: 1,
          category: "casa",
          tileDesign: "flor",
        });
      }
      return { ok: true, eventId: ev.id };
    }
    case "fase3-org": {
      // Organização própria do e2e da Fase 3, com uma dona de senha dada.
      const input = JSON.parse(arg ?? "{}") as { run: string; password: string };
      return ensureE2eOrg(db, {
        slug: `e2e-f3-org-${input.run}`,
        name: `Organização E2E ${input.run}`,
        email: `dona-f3-${input.run}@exemplo.com`,
        password: input.password,
      });
    }
    case "fase3-invite-token": {
      // O banco só guarda o hash do token e o e-mail vai para o console da API: o e2e troca o
      // hash do convite pendente por um token que ele conhece (o "link do e-mail").
      const email = String(arg).toLowerCase();
      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const pending = await db
        .select({ id: teamInvites.id })
        .from(teamInvites)
        .where(eq(teamInvites.email, email));
      if (pending.length !== 1) throw new Error(`Esperava 1 convite para ${email}.`);
      await db.update(teamInvites).set({ tokenHash }).where(eq(teamInvites.id, pending[0]!.id));
      return { token };
    }
    case "fase3-cleanup": {
      // Organização do e2e (o evento, convites e vínculos saem junto) e as duas contas.
      const run = String(arg);
      await cleanupE2eOrg(db, `e2e-f3-org-${run}`, [
        `dona-f3-${run}@exemplo.com`,
        `anfitriao-f3-${run}@exemplo.com`,
      ]);
      return { ok: true };
    }
    case "fase4-member": {
      // Fase 4: membro da organização do evento de teste (cria modelos e o catálogo), com senha
      // dada. O apoio do anfitrião cria a conta; o vínculo de anfitrião sai e entra o da org.
      const input = JSON.parse(arg ?? "{}") as { run: string; slug: string; password: string };
      const { eventId, userId } = await ensureE2eHost(db, {
        slug: input.slug,
        email: `gestora-f4-${input.run}@exemplo.com`,
        name: `Gestora E2E ${input.run}`,
        password: input.password,
      });
      await db
        .delete(eventMembers)
        .where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.userId, userId)));
      const [ev] = await db
        .select({ orgId: events.organizationId })
        .from(events)
        .where(eq(events.id, eventId));
      await db
        .insert(organizationMembers)
        .ignore()
        .values({ organizationId: ev!.orgId, userId, role: "member" });
      return { orgId: ev!.orgId, eventId };
    }
    case "fase4-cleanup": {
      // Tudo o que o e2e da Fase 4 criou (marcado com o `run`) no evento de teste e na org dele,
      // os arquivos de contrato e a conta da gestora. O previsto da categoria usada também sai.
      const input = JSON.parse(arg ?? "{}") as { run: string; slug: string; category: string };
      const [ev] = await db
        .select({ id: events.id, orgId: events.organizationId })
        .from(events)
        .where(eq(events.slug, input.slug));
      if (!ev) return { ok: true };
      const mark = `%${input.run}%`;
      const ours = await db
        .select({ id: vendors.id })
        .from(vendors)
        .where(and(eq(vendors.organizationId, ev.orgId), like(vendors.name, mark)));
      const vendorIds = ours.map((v) => v.id);
      if (vendorIds.length) {
        const links = await db
          .select({ id: eventVendors.id })
          .from(eventVendors)
          .where(and(eq(eventVendors.eventId, ev.id), inArray(eventVendors.vendorId, vendorIds)));
        const linkIds = links.map((l) => l.id);
        if (linkIds.length) {
          const files = await db
            .select({ file: vendorContracts.file })
            .from(vendorContracts)
            .where(
              and(
                eq(vendorContracts.eventId, ev.id),
                inArray(vendorContracts.eventVendorId, linkIds),
              ),
            );
          const dir =
            process.env.UPLOAD_DIR ??
            fileURLToPath(new URL("../../../api/storage/uploads", import.meta.url));
          for (const f of files) await rm(`${dir}/${ev.id}/private/${f.file}`, { force: true });
          // Pastas que ficaram vazias (rmdir recusa pasta com arquivo: o que já existia fica).
          for (const sub of [`${ev.id}/private`, `${ev.id}`]) {
            await rmdir(`${dir}/${sub}`).catch(() => undefined);
          }
          // Orçamentos, itens, parcelas e contratos saem junto (cascata).
          await db.delete(eventVendors).where(inArray(eventVendors.id, linkIds));
        }
        await db.delete(vendors).where(inArray(vendors.id, vendorIds));
      }
      await db
        .delete(eventTasks)
        .where(and(eq(eventTasks.eventId, ev.id), like(eventTasks.title, mark)));
      await db
        .delete(scheduleItems)
        .where(and(eq(scheduleItems.eventId, ev.id), like(scheduleItems.title, mark)));
      await db
        .delete(taskTemplates)
        .where(and(eq(taskTemplates.organizationId, ev.orgId), like(taskTemplates.name, mark)));
      await db
        .delete(budgetLines)
        .where(and(eq(budgetLines.eventId, ev.id), eq(budgetLines.category, input.category)));
      await db.delete(user).where(eq(user.email, `gestora-f4-${input.run}@exemplo.com`));
      return { ok: true };
    }
    case "fase5-setup": {
      // Organização com dona de senha dada e um evento ativo que recebe pela conta da
      // organização (ainda sem conta: presentes em dinheiro indisponíveis), com um presente.
      const input = JSON.parse(arg ?? "{}") as { run: string; password: string; host: string };
      const names = f5(input.run);
      await cleanupFase5(input.run);
      const { orgId } = await ensureE2eOrg(db, {
        slug: names.org,
        name: `Organização E2E ${input.run}`,
        email: names.email,
        password: input.password,
      });
      const ev = await createEventRecord(db, {
        organizationId: orgId,
        slug: names.slug,
        name: "Lia & Caio",
        type: "wedding",
        startsAt: "2029-03-10T16:00:00-03:00",
        status: "active",
        host: input.host,
      });
      await db.insert(gifts).values({
        eventId: ev.id,
        slug: "e2e-f5-jantar",
        title: "Jantar da lua de mel",
        priceCents: 20000,
        quotaTotal: 2,
        category: "lua-de-mel",
        tileDesign: "flor",
      });
      return { orgId, eventId: ev.id, email: names.email };
    }
    case "fase5-cleanup": {
      await cleanupFase5(String(arg));
      return { ok: true };
    }
    default:
      throw new Error(`Comando desconhecido: ${command}`);
  }
}

try {
  console.log(JSON.stringify(await main()));
  await db.$client.end();
} catch (err) {
  console.error(err);
  process.exit(1);
}
