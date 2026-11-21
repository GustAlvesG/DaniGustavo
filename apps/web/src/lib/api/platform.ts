import "server-only";

import { PlanLimits, type PlanView } from "@casamento/shared";
import { z } from "zod";
import { apiGet, apiWrite, type ApiResult } from "./client";

/*
 * Fase 6, frente B: chamadas do site da plataforma (landing, preços e cadastro), no host
 * `PLATFORM_HOST`. Nada de evento aqui: são rotas globais da API.
 */

/** Tag de cache da página de preços (a API ainda não pede revalidação: expira em 5 min). */
export const PLANS_TAG = "platform:plans";

const PlanViewSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  public: z.boolean(),
  priceMonthlyCents: z.number().int().nullable(),
  priceYearlyCents: z.number().int().nullable(),
  trialDays: z.number().int(),
  feeBps: z.number().int(),
  limits: PlanLimits,
}) satisfies z.ZodType<PlanView>;

const PublicPlans = z.object({ plans: z.array(PlanViewSchema) });

/** Planos da página de preços (`GET /api/plans`). API fora do ar: lista vazia. */
export async function getPublicPlans(): Promise<PlanView[]> {
  const result = await apiGet("/api/plans", PublicPlans, { tags: [PLANS_TAG], revalidate: 300 });
  if (result.ok) return result.data.plans;
  console.warn(
    `[plataforma] /api/plans indisponível (${result.status} ${result.error.code}). ${result.error.message}`,
  );
  return [];
}

/** Pedido de cadastro (`POST /api/signup`, com X-Web-Key). A resposta é sempre 202. */
export function requestSignup(
  body: unknown,
  clientIp: string | null,
): Promise<ApiResult<undefined>> {
  return apiWrite("POST", "/api/signup", body, { clientIp });
}

/** Painel (login e confirmação do cadastro), no host da API. Sem BETTER_AUTH_URL: null. */
export function painelUrl(): string | null {
  const base = process.env.BETTER_AUTH_URL?.trim();
  return base ? `${base.replace(/\/+$/, "")}/painel/` : null;
}
