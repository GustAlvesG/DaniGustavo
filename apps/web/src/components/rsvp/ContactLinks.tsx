import { whatsappUrl } from "@/lib/site";

export type CoupleContact = { whatsapp: string; email: string };

const link = "inline-flex min-h-11 items-center text-cobalto underline underline-offset-[0.22em]";

/** Links de contato dos noivos (WhatsApp e e-mail), com alvo de toque de 44px. */
export function ContactLinks({ contact }: { contact: CoupleContact }) {
  const wa = whatsappUrl(contact.whatsapp, "Oi, Dani e Gustavo!");
  const email = contact.email.trim();
  if (!wa && !email) return null;
  return (
    <ul className="flex flex-wrap gap-x-6">
      {wa ? (
        <li>
          <a href={wa} className={link} target="_blank" rel="noopener">
            WhatsApp dos noivos
          </a>
        </li>
      ) : null}
      {email ? (
        <li>
          <a href={`mailto:${email}`} className={link}>
            {email}
          </a>
        </li>
      ) : null}
    </ul>
  );
}
