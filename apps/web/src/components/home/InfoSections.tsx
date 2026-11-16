import type { SiteContent } from "@casamento/shared";
import { SectionHeading } from "@/components/ui";
import { Faq } from "./Faq";
import { Section } from "./Section";
import { Swatches } from "./Swatches";

/** Programação do dia: horário em Bodoni, título e uma frase. */
export function Schedule({ items }: { items: SiteContent["schedule"] }) {
  return (
    <Section id="programacao" band="flor">
      <div className="lg:col-span-4">
        <SectionHeading id="programacao-titulo">Programação</SectionHeading>
      </div>
      <ol className="flex flex-col lg:col-span-7 lg:col-start-6">
        {items.map((item) => (
          <li
            key={item.time + item.title}
            className="grid grid-cols-[5.5rem_1fr] gap-x-6 border-t border-cobalto/20 py-6 last:border-b sm:grid-cols-[8rem_1fr]"
          >
            <p className="font-display text-3xl text-tinta tabular-nums">{item.time}</p>
            <div>
              <h3 className="text-lg font-medium text-tinta">{item.title}</h3>
              <p className="mt-1 text-base text-tinta/80">{item.text}</p>
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
        <p className="max-w-[36ch] text-xl text-tinta">{dressCode.text}</p>
        {dressCode.avoid.length ? (
          <div>
            <h3 className="text-lg font-medium text-tinta">Melhor evitar</h3>
            <ul className="mt-3 flex flex-col gap-1.5 text-base text-tinta/80">
              {dressCode.avoid.map((a) => (
                <li key={a} className="flex items-baseline gap-3">
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rotate-45 border border-cobalto"
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
          <h3 className="mb-5 text-lg font-medium text-tinta">Paleta sugerida</h3>
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
            <h3 className="font-display text-3xl text-tinta">{item.name}</h3>
            <p className="text-base text-tinta">{item.distance}</p>
            {item.note ? <p className="text-base text-tinta/80">{item.note}</p> : null}
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener"
                className="mt-1 inline-flex min-h-11 items-center self-start text-cobalto underline underline-offset-[0.22em]"
              >
                Ver o site de {item.name}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="bg-nevoa p-6 sm:p-8 lg:col-span-5 lg:col-start-8 lg:self-start lg:p-10">
        <h3 className="font-display text-3xl text-tinta">Como chegar</h3>
        <p className="mt-4 text-base text-tinta">{accommodation.howToGetThere}</p>
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
