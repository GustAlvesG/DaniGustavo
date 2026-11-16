/*
 * Acesso ao banco para os e2e, executado em um processo Node à parte (o
 * Playwright carrega os testes como CommonJS e não importa o pacote ESM
 * @casamento/db). Uso: node db-cli.mts <comando> [argumento JSON].
 * Responde uma linha de JSON no stdout.
 */
import { db, eq, guests, invitations, newPublicId, settings } from "@casamento/db";

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
