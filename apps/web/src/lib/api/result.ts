import { ApiError } from "@casamento/shared";

/**
 * Resultado de uma chamada à API (leitura ou escrita). Sem exceções: a página
 * ou a Server Action decide pelo `error.code` (contrato em @casamento/shared).
 * Este módulo não tem `server-only` para poder ser testado no Vitest.
 */
export type ApiFailure = {
  ok: false;
  /** Status HTTP; 0 quando a API nem respondeu (fora do ar, timeout). */
  status: number;
  error: ApiError["error"];
};

export type ApiResult<T> = { ok: true; status: number; data: T } | ApiFailure;

/** Códigos que só o site gera (a API nunca os devolve). */
export const WEB_ERROR_CODES = {
  /** API fora do ar, timeout ou API_URL ausente. */
  unavailable: "unavailable",
  /** A API respondeu algo fora do contrato (JSON inválido ou schema diferente). */
  badResponse: "bad_response",
} as const;

const FALLBACK_MESSAGES: Record<number, string> = {
  400: "Algum dado não confere. Revise e tente de novo.",
  401: "Acesso negado pela API.",
  404: "Não encontramos o que você procurou.",
  409: "Isso mudou enquanto você preenchia. Recarregue a página e tente de novo.",
  422: "Algum dado não confere. Revise e tente de novo.",
  429: "Muitas tentativas seguidas. Espere um minuto e tente de novo.",
};

/** Converte uma resposta de erro (status + corpo já lido) no formato ApiError. */
export function toApiFailure(status: number, body: unknown): ApiFailure {
  const parsed = ApiError.safeParse(body);
  if (parsed.success) return { ok: false, status, error: parsed.data.error };
  return {
    ok: false,
    status,
    error: {
      code: status >= 500 ? "internal_error" : status === 429 ? "too_many_requests" : "http_error",
      message:
        FALLBACK_MESSAGES[status] ??
        "O site não conseguiu falar com o servidor. Tente de novo em alguns minutos.",
    },
  };
}

/** Falha de rede (sem resposta HTTP). */
export function unavailable(detail?: string): ApiFailure {
  return {
    ok: false,
    status: 0,
    error: {
      code: WEB_ERROR_CODES.unavailable,
      message:
        "O site não conseguiu falar com o servidor. Tente de novo em alguns minutos." +
        (detail && process.env.NODE_ENV !== "production" ? ` (${detail})` : ""),
    },
  };
}

/** A resposta veio, mas não bate com o contrato. */
export function badResponse(status: number, detail: string): ApiFailure {
  return {
    ok: false,
    status,
    error: {
      code: WEB_ERROR_CODES.badResponse,
      message:
        "O servidor respondeu num formato inesperado." +
        (process.env.NODE_ENV !== "production" ? ` (${detail})` : ""),
    },
  };
}

/** Lê o corpo como JSON sem lançar (corpo vazio ou HTML viram `undefined`). */
export async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
