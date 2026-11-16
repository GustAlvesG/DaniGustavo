import type { SiteContent } from "@casamento/shared";
import { SectionHeading } from "@/components/ui";
import { Faq } from "./Faq";
import { Section } from "./Section";
import { Swatches } from "./Swatches";

/** Programação do dia: horário em Bodoni, título e uma frase. */
export function Schedule({ items }: { items: SiteContent["schedule"] }) {
  return (
    <Section id="programacao" band="flor" surface="relevo">
      <div className="lg:col-span-12">
        <SectionHeading id="programacao-titulo">Programação</SectionHeading>
      </div>
      <ol className="flex flex-col lg:col-span-7 lg:col-start-6">
        {items.map((item) => (
          <li
            key={item.time + item.title}
            className="grid grid-cols-[6.25rem_1fr] gap-x-5 border-t border-line-soft py-6 last:border-b sm:grid-cols-[8rem_1fr] sm:gap-x-6"
          >
            <p className="font-display text-2xl text-ink tabular-nums sm:text-3xl">{item.time}</p>
            <div>
              <h3 className="text-lg font-medium text-ink">{item.title}</h3>
              <p className="mt-1 text-base text-ink-soft">{item.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function DressCode({ dressCode }: { dressCode: SiteContent["dressCode"] }) {
  return (
    <Section id="traje" band="trama">
      <div className="flex flex-col gap-8 lg:col-span-6">
        <SectionHeading id="traje-titulo">Dress code</SectionHeading>
        <p className="max-w-[36ch] text-xl text-ink">{dressCode.text}</p>
        {dressCode.avoid.length ? (
          <div>
            <h3 className="text-lg font-medium text-ink">Melhor evitar</h3>
            <ul className="mt-3 flex flex-col gap-1.5 text-base text-ink-soft">
              {dressCode.avoid.map((a) => (
                <li key={a} className="flex items-baseline gap-3">
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 translate-y-[-0.1em] rounded-full border border-accent"
                  />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {dressCode.palette.length ? (
        <div className="lg:col-span-5 lg:col-start-8 lg:self-end">
          <h3 className="mb-5 text-lg font-medium text-ink">Paleta sugerida</h3>
          <Swatches colors={dressCode.palette} label="Cores sugeridas" />
        </div>
      ) : null}
    </Section>
  );
}

export function Stay({ accommodation }: { accommodation: SiteContent["accommodation"] }) {
  return (
    <Section id="hospedagem" band="ramo">
      <div className="lg:col-span-12">
        <SectionHeading id="hospedagem-titulo">Hospedagem e como chegar</SectionHeading>
      </div>
      <ul className="flex flex-col gap-10 lg:col-span-6">
        {accommodation.items.map((item) => (
          <li key={item.name} className="flex flex-col gap-1.5">
            <h3 className="font-display text-3xl text-ink">{item.name}</h3>
            <p className="text-base text-ink">{item.distance}</p>
            {item.note ? <p className="text-base text-ink-soft">{item.note}</p> : null}
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener"
                className="mt-1 inline-flex min-h-11 items-center self-start text-ink underline decoration-accent underline-offset-[0.22em]"
              >
                Ver o site de {item.name}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="surface-relevo card-relevo rounded-[2.25rem] px-7 py-9 [--card-border:4px] sm:px-10 lg:col-span-5 lg:col-start-8 lg:self-start lg:rounded-full lg:px-16 lg:py-14">
        <h3 className="font-display text-3xl text-ink">Como chegar</h3>
        <p className="mt-4 text-base text-ink">{accommodation.howToGetThere}</p>
      </div>
    </Section>
  );
}

export function Questions({ faq }: { faq: SiteContent["faq"] }) {
  return (
    <Section id="duvidas" band="laco">
      <div className="lg:col-span-4">
        <SectionHeading id="duvidas-titulo">Dúvidas</SectionHeading>
      </div>
      <div className="lg:col-span-7 lg:col-start-6">
        <Faq items={faq} />
      </div>
    </Section>
  );
}
