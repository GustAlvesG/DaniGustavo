import type { ContractMime } from "@casamento/shared";
import { sniffImage } from "../admin/gifts.ts";

/*
 * Contratos (Fase 4, frente B): o tipo do arquivo vem dos primeiros bytes, nunca da extensão
 * nem do Content-Type que o navegador mandou.
 */

export type ContractExt = "pdf" | "jpg" | "png" | "webp";

export const CONTRACT_MIME_BY_EXT: Record<ContractExt, ContractMime> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** `%PDF-` nos primeiros 1024 bytes (a norma tolera lixo antes do cabeçalho). */
function isPdf(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 1024);
  for (let i = 0; i + 5 <= head.length; i++) {
    if (
      head[i] === 0x25 &&
      head[i + 1] === 0x50 &&
      head[i + 2] === 0x44 &&
      head[i + 3] === 0x46 &&
      head[i + 4] === 0x2d
    ) {
      return true;
    }
  }
  return false;
}

/** Extensão detectada pelos bytes (PDF, JPG, PNG ou WebP) ou null. */
export function sniffContract(bytes: Uint8Array): ContractExt | null {
  return sniffImage(bytes) ?? (isPdf(bytes) ? "pdf" : null);
}

/** Nome original seguro para guardar e devolver no download (sem pasta, sem controles). */
export function cleanFileName(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  return (cleaned || "contrato").slice(-191);
}

/** Cabeçalho Content-Disposition de download (nome ASCII de reserva + UTF-8 da RFC 5987). */
export function attachment(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/[\\"]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
