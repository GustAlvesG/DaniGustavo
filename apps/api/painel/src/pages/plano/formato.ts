/** Taxa em bps → "0,5%" (página do plano e painel da plataforma). */
export const percent = (bps: number) =>
  `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
