# Plataforma — Fase 2: conteúdo, temas e vocabulário por tipo de evento

Branch `saas`. Regras e fluxo dos agentes em `docs/saas/AGENTES.md`.

**Objetivo:** nenhum evento depende de conteúdo fixo no código. O anfitrião edita textos, fotos, tema, módulos e palavras no painel. O casamento de Dani & Gustavo fica **visualmente idêntico** ao de hoje, mas vindo do banco.

**Pronto quando:**

1. `apps/web/src/content/*`, `lib/legacy-content.ts`, `lib/fotos.ts` e `apps/web/public/fotos` não existem mais; nenhum `if (slug === "dani-gustavo")` no código.
2. O site do evento 1, depois de `content:import-legacy`, fica igual ao `v1-casamento` (screenshots 390×844 e 1440×900 lado a lado, home e páginas internas).
3. Um evento novo (`event:create --type fifteen`) abre com o site neutro do tipo (vocabulário, tema Festa, sem padrinhos se o tipo não tiver) e tudo se edita no painel: seções, galeria (upload múltiplo com miniatura), tema/paleta/fontes, módulos, lados e palavras.
4. Módulo desligado: some do menu e da home, a página dá 404 no site e as rotas públicas da API dão 404.
5. `applyCharge` revalida `gifts:<id>` (e `messages:<id>` quando o pedido tem recado): a cota vendida aparece na hora.
6. Fotos dos presentes e do evento passam pela interface `Storage`.
7. `pnpm lint`, `typecheck`, `test`, `build` e e2e (`chromium`, `painel`, `multi`) verdes; auditor de SQL estrito.

**Fora do escopo:** painel da organização / criar evento pela UI (F3), S3 (precisa de dependência), CSP (F7), tradução para outros idiomas.

## 1. Modelo de dados (migration 0008, feita pela fundação)

| O quê           | Onde                                            | Observação                                                                                                                                                                                                                                                                                                            |
| --------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fotos do evento | tabela `event_media`                            | `event_id` (cascade), `file`, `thumb_file`, `mime`, `width`, `height`, `bytes`, `alt`, `caption`, `album`, `position`, `in_gallery`, `sort`, timestamps; únicos (event_id, id) e (event_id, file); índice (event_id, in_gallery, sort). Arquivos no Storage em `<eventId>/<ULID>.<ext>` e miniatura `<ULID>-t.<ext>`. |
| Lado do convite | `invitations.side` varchar(32)                  | Era enum(dani, gustavo). Guarda a `key` de um dos lados de `event.sides`. A 0008 gravou `event.sides = [dani/Dani, gustavo/Gustavo]` para todo evento existente (privado).                                                                                                                                            |
| Tipos de evento | `events.type` (varchar, já era)                 | `EVENT_TYPES` += `baby_shower`, `corporate`.                                                                                                                                                                                                                                                                          |
| Seções do site  | `event_settings` › `site.sections` (público)    | `SiteSections` (shared/content.ts). Fotos como `PhotoRef { mediaId, alt, position }`.                                                                                                                                                                                                                                 |
| Tema            | `event_settings` › `site.theme` (público)       | `ThemeSelection { theme, palette?, fonts? }` (shared/themes.ts).                                                                                                                                                                                                                                                      |
| Módulos         | `event_settings` › `event.modules` (público)    | `EventModulesInput` parcial; o resto vem de `defaultModules(type)`.                                                                                                                                                                                                                                                   |
| Lados           | `event_settings` › `event.sides` (privado)      | `EventSides` (1–6, chaves únicas `^[a-z0-9-]{1,32}$`). Sem a chave: `defaultSides(type)`.                                                                                                                                                                                                                             |
| Vocabulário     | `event_settings` › `event.vocabulary` (público) | `VocabularyOverrides` (parcial); o resto vem de `VOCABULARY[type]`.                                                                                                                                                                                                                                                   |

Dados do evento que já estavam no banco continuam onde estão (`couple.*`, `wedding.*`, venues, `schedule.items`, `dresscode`, `accommodation.*`, `faq.items`, `godparents.manual`, `couple.contact`, `rsvp.deadline`, `seo`, `gallery.official_soon`). Saem na integração: `story.items` (vira `site.sections.story.items`) e `gallery.items` (vira `event_media`); `SiteContent.story` está marcado `@deprecated`.

## 2. Contratos (prontos na fundação)

`packages/shared/src/`:

- `event-types.ts`: `EVENT_TYPES`, `EVENT_TYPE_LABELS`, `eventTypeOf`, `VOCABULARY_KEYS`, `VOCABULARY[type]`, `vocabularyFor(type, overrides)`, `SideOption`, `EventSides`, `defaultSides(type)`, `sideLabel`.
- `modules.ts`: `MODULES` (gifts, messages, gallery, godparents, rsvp, schedule), `MODULE_LABELS`, `MODULE_ROUTES`, `EventModules`, `defaultModules`, `modulesFor`, `moduleOfPath`.
- `themes.ts`: `PALETTE_TOKENS` (nomes herdados do Álbum, papel de cada um documentado), `CONTRAST_PAIRS`, `paletteContrastIssues`, `FONTS` (lista curada, papéis `text`/`ui`/`script` = `--font-serif`/`--font-sans`/`--font-script`), `THEMES` (album, festa, moderno; 2 paletas cada, todas aprovadas na WCAG AA por teste), `defaultThemeFor(type)`, `ThemeSelection`, `ResolvedTheme`, `resolveTheme`.
- `content.ts`: `PhotoRef`, `Photo`, `HOME_SECTION_IDS`/`LABELS`, `siteSectionsSchema(photo)`, `SiteSections` (gravado), `PublicSiteSections` (site), `defaultSections(type, vocab)`, `resolveSections`, `mediaIdsIn`. Todo bloco tem `prefault({})`: gravação parcial é válida.
- `media.ts`: `MEDIA_*` (tipos, 4 MB, miniatura 640 px/400 KB, maior lado 2560, 20 por envio, 500 por evento), `AdminMedia`, `MediaUpdate`, `MediaReorder`, `PublicGalleryPhoto`.
- `site.ts`: `SiteContent` ganhou `event { type, modules, vocabulary }`, `theme: ResolvedTheme`, `sections: PublicSiteSections`; `GalleryPhoto` ganhou `thumbSrc`, `caption`, `album`, `position`; `siteDefaults(type)` para o conteúdo de reserva.
- `admin.ts`: as 5 chaves novas em `SETTINGS_SCHEMAS` e `DEDICATED_SETTINGS_KEYS` (o PUT genérico de `/settings` recusa; cada uma tem rota própria).
- `color.ts` e `image-size.ts` vieram de `apps/web/src/lib` (web reexporta a paleta em `lib/palette.ts`).

`apps/api/src/`:

- `site-content.ts`: `loadSiteContent(ev, db)` (settings públicas + `event_media`), `buildSiteContent(settings, { type, media })`, `mediaPhoto(row, ref)`. Galeria = `event_media.in_gallery`, ou a chave antiga enquanto não houver mídia.
- `storage/index.ts`: `Storage { put, get, delete, url }`, `createLocalStorage(dir)` (escrita atômica, nome validado por `STORAGE_FILE`), `deps.storage` nas rotas do painel.
- `tenancy/modules.ts`: `eventModules(ev, db)`, `requireModule(db, módulo)`; em `app.ts`: `/invitations/*` → rsvp, `/messages/*` → messages, `/gifts/*` e `POST /orders` → gifts (status e webhook de pedido existente seguem).
- `tenancy/permissions.ts`: ações `content.write` e `event.configure`.
- `admin/event-settings.ts`: `readSetting`, `writeSetting`.
- Rotas em `/api/admin/events/:eventId` (GET pronto, escrita devolve 501 até a frente implementar): `/site` (A), `/media` (A), `/appearance` (C), `/config` (D).
- Painel: itens Site, Galeria, Aparência, Evento no menu (`App.tsx`) com páginas reservadas em `painel/src/pages/{Site,Galeria,Aparencia,Evento}.tsx`.

## 3. Decisões

- **Conteúdo em `event_settings` (JSON validado) e fotos em tabela.** Seções mudam juntas e são lidas juntas (uma chave, uma validação); fotos precisam de ordem, upload, apagar e contagem de uso, então são linhas.
- **Foto referenciada por id**, nunca por URL, no conteúdo: apagar/trocar a foto não deixa link quebrado (`resolveSections` tira a foto que sumiu); alt e posição podem ser do uso ou da foto.
- **Tokens de cor com os nomes do Álbum** (`papel`, `tinta`, `marinho`...): o CSS existente segue igual; cada tema dá outro valor ao mesmo papel. Contraste validado no registro (teste), não no painel: o anfitrião escolhe entre paletas prontas, não cores livres.
- **Fontes por lista curada** servidas pelo next/font (sem pedido ao Google no navegador); só as do tema escolhido entram na página.
- **Lados como chave livre por evento** (varchar), validados na aplicação contra `event.sides`; o evento 1 mantém `dani`/`gustavo` sem reescrever linhas.
- **Vocabulário = dicionário por tipo + trocas do evento**; o site e o painel não montam plural/gênero, usam a chave certa.
- **Módulo desligado = 404** no site e na API pública; o painel continua mostrando os dados.
- **Miniatura no navegador** (canvas → JPEG/WebP), a API confere tipo pelos bytes e tamanho; sem dependência.
- **Conteúdo do casamento migra por CLI idempotente** (`content:import-legacy`), que também roda no seed do evento 1: dev e testes mostram o casamento vindo do banco.

## 4. Frentes paralelas

Cada frente: worktree próprio, banco `casamento_f2<letra>`, portas de `AGENTES.md`. **Sem migrations.** Contratos de `packages/shared` só mudam de forma aditiva e no arquivo da própria frente (dono entre parênteses abaixo); precisou mudar contrato de outra frente → pare e reporte.

### A — Editor (API do painel + páginas de conteúdo e galeria)

- **Objetivo:** o anfitrião edita as seções do site e a galeria (upload múltiplo com miniatura, ordem, legendas, álbuns) no painel.
- **Arquivos:** `apps/api/src/admin/site-editor.ts`, `apps/api/src/admin/media.ts`, `apps/api/painel/src/pages/{Site,Galeria}.tsx`, `apps/api/painel/src/pages/Configuracoes.tsx` (tirar história e galeria antigas), novos `apps/api/painel/src/editor/**` e `apps/api/painel/src/editor.css`; dono de `packages/shared/src/{content,media}.ts`; testes `apps/api/test/{site-editor,media}.test.ts`.
- **Consome:** `SiteSections`, `PhotoRef`, `mediaIdsIn`, `MEDIA_*`, `MediaUpdate`, `MediaReorder`, `AdminMedia`, `deps.storage`, `sniffImage` (de `admin/gifts.ts`, só importar), `readSetting`/`writeSetting`, `requirePermission("content.write")`, `revalidate(ev.id, ["site"])`.
- **Testes:** PUT `/site` valida e recusa `mediaId` de outro evento; upload (tipo pelos bytes, limites, miniatura opcional, 20 por envio, 500 por evento), PATCH, ordem, DELETE recusa foto em uso; isolamento (rota nova entra sozinha em `admin-isolation.test.ts`); auditor estrito.

### B — Site público (renderiza do banco)

- **Objetivo:** home e páginas internas montadas de `SiteContent.sections`/`gallery`/`event`, com vocabulário e módulos (menu, home e 404), sem `content/*` nem `legacy-content.ts`.
- **Arquivos:** `apps/web/src/app/[host]/(site)/**`, `apps/web/src/app/[host]/not-found.tsx`, `apps/web/src/components/{home,album,site,recados,presentes,rsvp,countdown,ui}/**`, `apps/web/src/lib/{api/site.ts,legacy-content.ts,fotos.ts,site.ts,texto.ts,rsvp.ts}` (+ testes), `apps/web/src/content/site-fallback.ts`, `apps/web/next.config.ts` (imagens de `/uploads`), `apps/api/src/site-content.ts`; dono de `packages/shared/src/site.ts`. Não apaga `content/*` nem `public/fotos` (integração).
- **Consome:** `SiteContent`, `PublicSiteSections`, `Photo`, `PublicGalleryPhoto`, `moduleOfPath`, `MODULE_ROUTES`, `Vocabulary`.
- **Testes:** unitários de montagem do menu/rodapé por módulos, textos com `{prazo}`/`{data}` e `*ênfase*`, página de módulo desligado → `notFound()`; `site-content` com fotos resolvidas e galeria por álbum; e2e fica para a integração.

### C — Temas

- **Objetivo:** tema, paleta e fontes por evento aplicados por variáveis CSS no layout `[host]`, com Álbum idêntico ao atual e Festa/Moderno coerentes; OG, ícones e manifest no tema; página Aparência no painel.
- **Arquivos:** `apps/web/src/app/[host]/layout.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/app/album.css`, novos `apps/web/src/themes/**`, `apps/web/src/components/brand/**`, `apps/web/src/app/[host]/{icon,apple-icon,opengraph-image}.tsx`, `apps/web/src/app/[host]/{icons,manifest.webmanifest}/**`, `apps/web/src/app/_og/**`, `apps/web/src/lib/{palette.ts,palette.test.ts,pwa-icon.tsx,seo.ts}`, `apps/api/src/admin/appearance.ts`, `apps/api/painel/src/pages/Aparencia.tsx`; dono de `packages/shared/src/{themes,color}.ts`; testes `apps/api/test/appearance.test.ts`.
- **Consome:** `THEMES`, `FONTS`, `ResolvedTheme`, `resolveTheme`, `paletteContrastIssues`, `SiteContent.theme`, `requirePermission("content.write")`, `revalidate(ev.id, ["site"])`.
- **Testes:** toda paleta passa WCAG AA (já existe em shared); Álbum/marinho = `globals.css`; PUT `/appearance` recusa paleta/fonte fora do tema; teste do layout gerando as variáveis; prévia de cores no painel sem dependência.

### D — Tipos, lados, módulos e dados do casamento

- **Objetivo:** lados genéricos e vocabulário no back e no painel de convites, configuração do evento (tipo/módulos/lados/palavras), migração do conteúdo do casamento para o banco, revalidação no pagamento e Storage nos presentes.
- **Arquivos:** `apps/api/src/admin/{event-config,invitations,guest-import,guest-lists,gifts}.ts`, `apps/api/src/routes/invitations.ts`, `apps/api/src/{rsvp-email,reminder-email,reminders,mailer}.ts`, `apps/api/src/orders/{service,notify}.ts`, `apps/api/src/app.ts`, `apps/api/src/tenancy/modules.ts`, `apps/api/painel/src/pages/{Evento,Convites,Importar,Listas}.tsx`; `packages/shared/src/{admin,rsvp,guest-import}.ts` (só lados) e dono de `packages/shared/src/{event-types,modules}.ts`; `packages/db/src/{schema/app.ts (só o tipo Side → string),seed.ts,seed-data.ts,cli.ts,tenancy-admin.ts}`, novos `packages/db/src/legacy/**` (tradução de `content/*.ts` para `SiteSections` + importador) e `packages/db/legacy/dani-gustavo/fotos/` (cópia das fotos); testes em `apps/api/test/{event-config,sides,orders}.test.ts` e `packages/db/test/legacy.test.ts`.
- **Consome:** `EventSides`, `sideLabel`, `defaultSides`, `vocabularyFor`, `EventModulesInput`, `EventType`, `SiteSections`, `PhotoRef`, `Storage`/`STORAGE_FILE`, `imageSize`, `Revalidate`.
- **Entregas:** `PUT /config` (tipo válido, módulos, lados sem tirar um em uso — 422 dizendo quantos convites usam —, palavras; limpa o cache do resolver; revalida `site`, `gifts`, `messages`); CSV/XLSX aceitam o rótulo ou a chave do lado; e-mails e avisos com o vocabulário; `content:import-legacy [--event dani-gustavo] [--upload-dir]` idempotente (fotos por nome → `event_media`, `site.sections` igual ao `home.ts`/`paginas.ts`/`galeria.ts` atuais, `story.items`/`gallery.items` antigos removidos) e chamado pelo seed do evento 1; `applyCharge` revalida `gifts` (+ `messages` se houver recado) do evento; `admin/gifts.ts` e `uploadFileRoutes` pelo `Storage`.
- **Testes:** importador roda 2× sem duplicar; convite com lado inexistente → 422; mudar lado em uso → 422; webhook pago chama `revalidate(ev.id, ["gifts", ...])` só do evento; módulos (já há `apps/api/test/fase2.test.ts`).

### Integração (depois das 4)

Merge A → D → C → B na `saas`; apagar `apps/web/src/content/{home,galeria,paginas}.ts`, `lib/legacy-content.ts`, `lib/fotos.ts`, `apps/web/public/fotos` (o teste de `packages/shared/test/image-size.test.ts` passa a ler `packages/db/legacy/dani-gustavo/fotos`), `SiteContent.story` e as chaves `story.items`/`gallery.items`; dump + `content:import-legacy` no banco `casamento`; e2e (`chromium`, `painel`, `multi`) e screenshots em `.screenshots/fase2/` comparando com o `v1-casamento`; CLAUDE.md e PERSONALIZAR.

## 5. Decisões que dependem do usuário (padrões em vigor)

| Decisão                                    | Padrão                                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Palavras por tipo (`VOCABULARY`)           | "a debutante", "o aniversariante", "os papais", "a organização"; cada evento troca no painel.                                                |
| Paletas e fontes dos temas Festa e Moderno | Festa: rosa/ameixa e lilás, DM Serif Display + Nunito Sans + Great Vibes. Moderno: grafite/verde-água e oceano, Outfit + Inter, sem cursiva. |
| Lados padrão de evento novo                | Casamento: Noiva/Noivo; 15 anos e aniversário: Família/Amigos; demais: um lado "Convidados".                                                 |
| Quem pode mudar tipo/módulos/lados         | Todos os papéis do evento (`event.configure`), como o resto da Fase 1.                                                                       |
| Fotos do casamento no git                  | Copiadas para `packages/db/legacy/dani-gustavo/fotos` (≈9,5 MB, já estavam no git em `public/fotos`).                                        |
