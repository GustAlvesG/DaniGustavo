import { eq } from "drizzle-orm";
import type { Database } from "./client.ts";
import { platformTaskTemplateItems, platformTaskTemplates } from "./schema/planning.ts";

/*
 * Fase 6, frente E (docs/saas/fase-6.md): modelos de tarefas prontos da PLATAFORMA, por tipo de
 * evento (casamento, 15 anos, aniversário...). Gravados pelo seed/setup por `code`: modelo novo
 * entra com os itens; modelo que já existe não é tocado (o platform admin pode ter editado).
 * Reservado pela fundação com a lista vazia; a frente E escreve o conteúdo (categorias de
 * TASK_CATEGORIES, `offsetDays` relativos à data do evento).
 */

export interface PlatformTemplateSeed {
  code: string;
  name: string;
  eventType: string | null;
  description: string | null;
  items: { title: string; description?: string | null; category: string; offsetDays: number }[];
}

export const PLATFORM_TASK_TEMPLATES: readonly PlatformTemplateSeed[] = [];

/** Grava os modelos que faltam. Devolve quantos criou. */
export async function ensurePlatformTaskTemplates(db: Database): Promise<number> {
  let created = 0;
  for (const [i, t] of PLATFORM_TASK_TEMPLATES.entries()) {
    const [existing] = await db
      .select({ id: platformTaskTemplates.id })
      .from(platformTaskTemplates)
      .where(eq(platformTaskTemplates.code, t.code));
    if (existing) continue;
    await db.transaction(async (tx) => {
      const [res] = await tx.insert(platformTaskTemplates).values({
        code: t.code,
        name: t.name,
        eventType: t.eventType,
        description: t.description,
        sort: i,
      });
      if (t.items.length > 0) {
        await tx.insert(platformTaskTemplateItems).values(
          t.items.map((item, sort) => ({
            templateId: res.insertId,
            title: item.title,
            description: item.description ?? null,
            category: item.category,
            offsetDays: item.offsetDays,
            sort,
          })),
        );
      }
    });
    created++;
  }
  return created;
}
