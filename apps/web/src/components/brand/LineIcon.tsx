import { cx } from "@/lib/cx";

/*
 * Ícones de linha próprios (24×24, traço 1,5, pontas redondas), no mesmo
 * espírito dos azulejos: poucos traços, sem preenchimento. Decorativos: o
 * texto ao lado sempre diz o que o ícone mostra.
 */
const ICONS = {
  /** Vestido de noiva. */
  vestido: (
    <>
      <path d="M9.5 3.5c.3 1.6 1.2 2.6 2.5 2.6s2.2-1 2.5-2.6" />
      <path d="M9.5 3.5 8.6 8.2l1.6 1.4M14.5 3.5l.9 4.7-1.6 1.4" />
      <path d="M10.2 9.6 5.2 20.5h13.6l-5-10.9" />
      <path d="M8.8 15.2c1.9.9 4.5.9 6.4 0" />
    </>
  ),
  /** Copo d'água. */
  copo: (
    <>
      <path d="M6.5 4h11l-1.6 15.2a1.5 1.5 0 0 1-1.5 1.3H9.6a1.5 1.5 0 0 1-1.5-1.3Z" />
      <path d="M7.2 10.2c1.6-.8 3.2-.8 4.8 0s3.2.8 4.8 0" />
    </>
  ),
  /** Nota musical. */
  nota: (
    <>
      <path d="M9 17.5V5.2l10-1.7v12.3" />
      <path d="M9 9 19 7.3" />
      <circle cx="6.6" cy="17.6" r="2.4" />
      <circle cx="16.6" cy="15.9" r="2.4" />
    </>
  ),
  /** Buquê. */
  buque: (
    <>
      <circle cx="12" cy="6.6" r="2.6" />
      <circle cx="7.6" cy="8.8" r="2.3" />
      <circle cx="16.4" cy="8.8" r="2.3" />
      <path d="M9.2 12.2 12 20.5l2.8-8.3" />
      <path d="M12 12v8.5M9.6 16.4h4.8" />
    </>
  ),
  /** Gravata. */
  gravata: (
    <>
      <path d="M9.6 3.5h4.8l-1 2.8h-2.8Z" />
      <path d="m10.6 6.3-2.2 10.6 3.6 3.6 3.6-3.6-2.2-10.6" />
    </>
  ),
  /** Câmera. */
  camera: (
    <>
      <path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.6l1.5-2.2h5.8L16.4 7H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z" />
      <circle cx="12" cy="12.8" r="3.4" />
      <path d="M17.2 9.8h.6" />
    </>
  ),
  /** Despertador. */
  relogio: (
    <>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 9.2V13l2.6 1.8" />
      <path d="M4.2 6.2 6.8 3.8M19.8 6.2l-2.6-2.4M7.4 19l-1.4 1.8M16.6 19l1.4 1.8" />
    </>
  ),
  /** Duas taças brindando. */
  tacas: (
    <>
      <path d="M4.5 4.5h5.2l-.4 4.6a2.2 2.2 0 0 1-4.4 0Z" />
      <path d="M14.3 4.5h5.2l-.4 4.6a2.2 2.2 0 0 1-4.4 0Z" />
      <path d="M7.1 11.3v7.2M16.9 11.3v7.2M5 18.5h4.2M14.8 18.5H19" />
      <path d="M11.2 3.2 12 1.8l.8 1.4M10.4 5.8h3.2" />
    </>
  ),
  /** Coração em linha. */
  coracao: (
    <path d="M12 19.5s-7.5-4.4-7.5-9.6A4 4 0 0 1 12 7.6a4 4 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6Z" />
  ),
} as const;

export type LineIconName = keyof typeof ICONS;

export function LineIcon({ name, className }: { name: LineIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx("size-6", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}

/** Escolhe um ícone pelo texto da missão (o conteúdo vem do painel). */
export function iconForText(text: string, fallback: LineIconName = "coracao"): LineIconName {
  const t = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const rules: [RegExp, LineIconName][] = [
    [/noiva|vestido|cauda/, "vestido"],
    [/noivo|acalm|hidrat/, "copo"],
    [/pista|danc|music|playlist|festa/, "nota"],
    [/buque|solteir/, "buque"],
    [/gravata/, "gravata"],
    [/foto|video|camera/, "camera"],
    [/hora|chegar|antecedencia|atras/, "relogio"],
    [/divirt|brind|celebr/, "tacas"],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? fallback;
}
