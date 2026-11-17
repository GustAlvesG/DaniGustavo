import { cx } from "@/lib/cx";

/*
 * Ilustrações de linha dos presentes (24×24, traço fino, sem preenchimento),
 * no mesmo traço dos ícones do site. Decorativas: o título do presente
 * sempre diz o que é. A escolha é pelo texto do presente; sem acerto, um
 * pacote de presente.
 */
const ART = {
  taca: (
    <>
      <path d="M8 3.5h8l-.6 5.2a3.4 3.4 0 0 1-6.8 0Z" />
      <path d="M12 12.3v7.2M8.8 20.5h6.4" />
      <path d="M8.4 7h7.2" />
    </>
  ),
  barco: (
    <>
      <path d="M3.5 15.5h17l-2.6 4H6.1Z" />
      <path d="M12 3.5v12M12 4.2l6 9.3h-6M12 6.5 7.2 13.5H12" />
      <path d="M2.5 21c1.4 0 1.4-.8 2.8-.8s1.4.8 2.8.8" />
    </>
  ),
  panela: (
    <>
      <path d="M4.5 10h15v6.5a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3Z" />
      <path d="M2.5 11.5h2M19.5 11.5h2M9.5 7.5h5" />
      <path d="M12 7.5V5.8" />
    </>
  ),
  xicara: (
    <>
      <path d="M5 10h11v4.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 14.5Z" />
      <path d="M16 11.5h1.4a2.2 2.2 0 0 1 0 4.4H16" />
      <path d="M3.5 21h14" />
      <path d="M9 3.5c-.8.9-.8 1.9 0 2.8s.8 1.9 0 2.8M12.5 3.5c-.8.9-.8 1.9 0 2.8" />
    </>
  ),
  cama: (
    <>
      <path d="M3.5 18.5V6.5M20.5 18.5v-5" />
      <path d="M3.5 13.5h17M3.5 16.5h17" />
      <path d="M6 13.5v-2.2a1.8 1.8 0 0 1 1.8-1.8h2.4A1.8 1.8 0 0 1 12 11.3v2.2" />
    </>
  ),
  planta: (
    <>
      <path d="M7.5 14.5h9l-1.2 6h-6.6Z" />
      <path d="M12 14.5V8" />
      <path d="M12 10.5c-3.6.2-5.6-1.6-6-5 3.4-.1 5.5 1.6 6 5Z" />
      <path d="M12 9c.2-3 2.1-4.7 5.5-5-.1 3.3-2 5-5.5 5Z" />
    </>
  ),
  noite: (
    <>
      <path d="M15.5 4.5a7.5 7.5 0 1 0 4 12.6A6.5 6.5 0 0 1 15.5 4.5Z" />
      <path d="M8 4.5v3M6.5 6h3M18.5 10v2M17.5 11h2" />
    </>
  ),
  envelope: (
    <>
      <path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h14A1.5 1.5 0 0 1 20.5 7v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17Z" />
      <path d="m4 7 8 6 8-6" />
      <path d="M12 16.2c-1.4-1-2.2-1.7-2.2-2.5a1.1 1.1 0 0 1 2.2-.2 1.1 1.1 0 0 1 2.2.2c0 .8-.8 1.5-2.2 2.5Z" />
    </>
  ),
  pacote: (
    <>
      <path d="M4.5 10h15v10.5h-15ZM3.5 7h17v3h-17Z" />
      <path d="M12 7v13.5" />
      <path d="M12 7c-1.2-2.8-4.8-3.4-4.8-1.2C7.2 7 9.6 7 12 7c2.4 0 4.8 0 4.8-1.2C16.8 3.6 13.2 4.2 12 7Z" />
    </>
  ),
};

export type GiftArtName = keyof typeof ART;

/** Escolhe a ilustração pelo slug/título do presente. */
export function artFor(text: string, openAmount = false): GiftArtName {
  if (openAmount) return "envelope";
  const t = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const rules: [RegExp, GiftArtName][] = [
    [/jantar|vinho|brinde/, "taca"],
    [/barco|mar|passeio/, "barco"],
    [/panela|cozinha/, "panela"],
    [/cafe|xicara/, "xicara"],
    [/cama|lencol/, "cama"],
    [/planta|varanda|jardim/, "planta"],
    [/estrela|noite|chale/, "noite"],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? "pacote";
}

export function GiftIcon({ name, className }: { name: GiftArtName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx("size-10", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ART[name]}
    </svg>
  );
}
