import type { Invitation } from "@casamento/shared";
import { ContactLinks, type CoupleContact } from "./ContactLinks";
import { formatDayMonth } from "@/lib/site";

const STATUS_TEXT = { confirmed: "Vai", declined: "Não vai", pending: "Sem resposta" } as const;

/** Resposta do convite em somente leitura, depois do prazo. Server Component. */
export function ClosedSummary({
  invitation,
  contact,
}: {
  invitation: Invitation;
  contact: CoupleContact;
}) {
  return (
    <div className="flex flex-col gap-6" data-testid="rsvp-closed">
      <h2 className="font-display text-display-sm text-ink">Prazo encerrado</h2>
      <p className="max-w-[56ch] text-lg text-ink">
        O prazo para confirmar presença terminou em {formatDayMonth(invitation.deadline)}. Para
        alterar a resposta, fale direto com os noivos.
      </p>
      <ContactLinks contact={contact} />
      <dl className="flex flex-col" aria-label="Resposta registrada">
        {invitation.guests.map((g) => (
          <div key={g.id} className="border-t border-line-soft py-3 last:border-b">
            <dt className="text-base font-medium text-ink">{g.name}</dt>
            <dd className="text-base text-ink">
              {STATUS_TEXT[g.rsvpStatus]}
              {g.isPlusOne ? ", como acompanhante" : ""}
              {g.rsvpStatus === "confirmed" && g.dietaryNotes ? (
                <span className="block text-sm text-ink-soft">Restrição: {g.dietaryNotes}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
