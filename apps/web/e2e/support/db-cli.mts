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
