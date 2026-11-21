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

type Item = PlatformTemplateSeed["items"][number];
const t = (offsetDays: number, category: string, title: string, description?: string): Item => ({
  title,
  category,
  offsetDays,
  description: description ?? null,
});

// TODO(conteudo): prazos e textos são uma sugestão inicial; a equipe da plataforma revisa e edita
// pelo painel da plataforma (os modelos que já existem no banco não são sobrescritos).
export const PLATFORM_TASK_TEMPLATES: readonly PlatformTemplateSeed[] = [
  {
    code: "casamento-completo",
    name: "Casamento completo",
    eventType: "wedding",
    description: "Roteiro de 12 meses até o grande dia, do orçamento ao pós-festa.",
    items: [
      t(-365, "financeiro", "Definir o orçamento total e quem contribui"),
      t(-365, "convidados", "Fazer a primeira lista de convidados", "Uma estimativa por lado."),
      t(-330, "cerimonia", "Escolher o estilo, a data e o tipo de cerimônia"),
      t(-300, "fornecedores", "Visitar e reservar o local da festa"),
      t(-270, "fornecedores", "Contratar buffet e bebidas"),
      t(-270, "fornecedores", "Contratar fotografia e filmagem"),
      t(-240, "fornecedores", "Contratar cerimonial ou assessoria"),
      t(-210, "visual", "Escolher decoração e flores"),
      t(-180, "fornecedores", "Contratar música, som e DJ"),
      t(-150, "visual", "Escolher os trajes dos noivos e da corte"),
      t(-120, "documentos", "Dar entrada nos documentos do casamento civil"),
      t(-120, "convidados", "Fechar a lista de convidados e enviar os convites"),
      t(-90, "festa", "Provar o cardápio e escolher o bolo"),
      t(-75, "fornecedores", "Contratar transporte e hospedagem dos convidados"),
      t(-60, "festa", "Montar a lista de presentes e o roteiro da festa"),
      t(-45, "convidados", "Cobrar as confirmações de presença"),
      t(-30, "festa", "Definir mesas e lugares"),
      t(-30, "financeiro", "Quitar as parcelas dos fornecedores principais"),
      t(-14, "fornecedores", "Confirmar horários e endereços com todos os fornecedores"),
      t(-7, "visual", "Fazer a prova final dos trajes e o teste de maquiagem e cabelo"),
      t(-1, "festa", "Separar alianças, documentos e o kit de emergência"),
      t(0, "cerimonia", "Dia do casamento"),
      t(7, "festa", "Agradecer aos convidados e aos fornecedores"),
    ],
  },
  {
    code: "festa-15-anos",
    name: "Festa de 15 anos",
    eventType: "fifteen",
    description: "Roteiro de 9 meses para a festa de debutante.",
    items: [
      t(-270, "financeiro", "Definir o orçamento e o formato da festa"),
      t(-270, "convidados", "Fazer a lista de convidados"),
      t(-240, "fornecedores", "Reservar o local da festa"),
      t(-210, "fornecedores", "Contratar buffet e bebidas"),
      t(-180, "fornecedores", "Contratar fotografia e filmagem"),
      t(-150, "visual", "Escolher o vestido, o tema e a decoração"),
      t(-120, "festa", "Combinar a valsa e o ensaio com a coreografia"),
      t(-120, "fornecedores", "Contratar DJ ou banda"),
      t(-90, "convidados", "Enviar os convites"),
      t(-60, "festa", "Escolher o bolo, os doces e as lembrancinhas"),
      t(-45, "convidados", "Cobrar as confirmações de presença"),
      t(-30, "financeiro", "Quitar as parcelas dos fornecedores principais"),
      t(-14, "festa", "Definir mesas e o roteiro da festa"),
      t(-7, "visual", "Prova final do vestido, penteado e maquiagem"),
      t(0, "festa", "Dia da festa"),
      t(7, "festa", "Agradecer aos convidados"),
    ],
  },
  {
    code: "aniversario",
    name: "Aniversário",
    eventType: "birthday",
    description: "Roteiro enxuto de 3 meses para uma festa de aniversário.",
    items: [
      t(-90, "financeiro", "Definir o orçamento"),
      t(-90, "convidados", "Fazer a lista de convidados"),
      t(-75, "fornecedores", "Reservar o local"),
      t(-60, "fornecedores", "Contratar buffet, bolo e doces"),
      t(-60, "visual", "Escolher o tema e a decoração"),
      t(-45, "convidados", "Enviar os convites"),
      t(-30, "fornecedores", "Contratar música ou animação"),
      t(-21, "convidados", "Cobrar as confirmações de presença"),
      t(-14, "financeiro", "Quitar os fornecedores"),
      t(-7, "festa", "Confirmar horários com os fornecedores"),
      t(0, "festa", "Dia da festa"),
      t(3, "festa", "Agradecer aos convidados"),
    ],
  },
];

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
