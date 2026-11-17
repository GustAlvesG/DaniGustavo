/*
 * Acesso ao banco para os e2e, executado em um processo Node à parte (o
 * Playwright carrega os testes como CommonJS e não importa o pacote ESM
 * @casamento/db). Uso: node db-cli.mts <comando> [argumento JSON].
 * Responde uma linha de JSON no stdout.
 */
import {
  and,
  db,
  eq,
  giftOrders,
  gifts,
  guests,
  inArray,
  invitations,
  messages,
  newPublicId,
  payments,
  settings,
  sql,
} from "@casamento/db";

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
        token,
        label: opts.label,
        side: "dani",
        maxGuests: opts.maxGuests ?? opts.guests.length,
        allowPlusOne: opts.allowPlusOne ?? false,
      });
      const [inv] = await db.select().from(invitations).where(eq(invitations.token, token));
      await db.insert(guests).values(
        opts.guests.map((g) => ({
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
      const [row] = await db.select().from(settings).where(eq(settings.key, "rsvp.deadline"));
      return { value: String(row?.value) };
    }
    case "set-deadline":
      await db
        .update(settings)
        .set({ value: String(arg) })
        .where(eq(settings.key, "rsvp.deadline"));
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
      await db.insert(messages).values({ author: `Tia E2E ${run}`, body: `Recado e2e ${run}` });
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
