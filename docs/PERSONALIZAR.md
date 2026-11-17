# Como personalizar o site

Guia rápido para trocar textos, fotos, cores e dados do casamento. Rode `pnpm dev` e deixe
http://localhost:3000 aberto: a maioria das mudanças aparece sozinha ao salvar o arquivo.

## 1. Textos e fotos da página inicial

Tudo que é "apresentação" da home fica em **`apps/web/src/content/home.ts`**, com comentários em
cada campo:

| O que                                      | Onde em `home.ts`                              |
| ------------------------------------------ | ---------------------------------------------- |
| Ordem das seções / esconder uma seção      | `secoes` (mude a ordem ou apague)              |
| Foto de fundo do topo (computador/celular) | `hero.fotoDesktop`, `hero.fotoCelular`         |
| "Vamos nos casar", título da contagem      | `hero.chamada`, `hero.contador`                |
| Nossa história (polaroids)                 | `historia.momentos` (ano, título, texto, foto) |
| Galeria "Do nosso álbum"                   | `album.fotos` (foto + legenda)                 |
| Foto e legenda do casamento                | `casamento.foto`, `casamento.legendaFoto`      |
| Versículo sobre a foto                     | `versiculo.linhas`, `versiculo.referencia`     |
| Títulos e frases de cada seção             | `rotulo`, `titulo`, `lead` de cada seção       |
| Presentes (texto, botões)                  | `presentes` (com `botoes: []` aparece o aviso) |
| Cartão-resposta (confirmação)              | `rsvp.cartao`                                  |
| Menu do topo e links do rodapé             | `menu`, `rodape`                               |

Convenções:

- Palavra entre `*asteriscos*` num título sai em itálico azul: `"Do nosso *álbum*"`.
- `{prazo}` no texto da confirmação vira a data limite que está no banco.
- Item do menu: a seção aparece no menu se tiver `menu: "Texto"`.

Outras páginas:

- **`apps/web/src/content/galeria.ts`**: fotos da página `/galeria` (ordem = ordem na página).
- **`apps/web/src/content/paginas.ts`**: foto da capa de `/padrinhos` e da página 404.

## 2. Fotos

1. Coloque o arquivo em **`apps/web/public/fotos/`** (nome sem espaços, em minúsculas, ex.:
   `praia-2024.jpg`).
2. No `home.ts` (ou `galeria.ts`), escreva só o nome: `arquivo: "praia-2024.jpg"`, e uma
   descrição curta em `alt` (para leitor de tela).
3. Se um rosto ficar cortado, ajuste `posicao` (é o `object-position` do CSS):
   `"center 30%"` mostra mais o alto da foto; `"40% center"` puxa para a esquerda.

Formato e tamanho: **JPEG**, lado maior com **2000 a 2400 px**, qualidade ~80 (até ~800 KB).
PNG e WebP também funcionam. Não precisa gerar versões menores: o Next (`next/image`) cria as
versões em WebP/AVIF no tamanho de cada tela. A largura e a altura são lidas do próprio arquivo.

- Topo no computador: foto **deitada** (paisagem). Topo no celular: foto **em pé** (retrato),
  com o casal no meio ou na metade de cima (a contagem cobre o rodapé da foto).
- Polaroids da história recortam em 4:5 (retrato); o álbum e a galeria mostram a foto inteira.

> As fotos do casal ficam versionadas no repositório (é privado). Antes de publicar o
> repositório em algum lugar aberto, tire-as do git.

## 3. Dados do casamento (vêm do banco)

Data e hora, local e endereço, programação, traje (cores e "evite"), hospedagem, perguntas
frequentes, contato, prazo da confirmação, manual dos padrinhos e textos de SEO ficam na tabela
`settings` do banco e chegam ao site por `GET /api/site`. O site guarda essa resposta em cache
por 60 segundos: depois de mudar, espere um minuto (ou reinicie o `pnpm dev`).

Para editar:

- **Drizzle Studio** (planilha no navegador, sem apagar nada):
  `pnpm --filter @casamento/db exec drizzle-kit studio` → tabela `settings` → coluna `value`
  (JSON). Ex.: `schedule.items`, `dresscode`, `faq.items`, `couple.contact`, `rsvp.deadline`.
- **Seed** (`packages/db/src/seed-data.ts`, lista `seedSettings`): é o ponto de partida do banco.
  O `pnpm db:seed` só cria as chaves que ainda não existem (não sobrescreve). Para aplicar
  mudanças do seed em chaves existentes, use `pnpm db:reset`, que **apaga e recria o banco
  inteiro, inclusive convites e respostas**: só antes de enviar os convites.

O conteúdo de reserva em `apps/web/src/content/site-fallback.ts` só aparece se a API estiver fora
do ar; mantenha-o parecido com o seed.

## 4. Cores e fontes

- **Cores**: `apps/web/src/app/globals.css`, bloco `@theme static` (`--color-papel`,
  `--color-tinta`, `--color-marinho`, `--color-serenity`…). Viram classes do Tailwind
  (`bg-papel`, `text-tinta`) e variáveis CSS. Mudou uma cor, atualize
  `apps/web/src/lib/palette.ts`: `pnpm test` confere o contraste (acessibilidade).
- **Fontes**: `apps/web/src/app/layout.tsx` (Cormorant Garamond no texto, Jost nos rótulos e
  botões, Pinyon Script só nos nomes), ligadas aos tokens `--font-serif`, `--font-sans` e
  `--font-script` em `globals.css`.
- **Peças do álbum** (polaroid, fita, cartão de fio duplo, moldura com cantoneiras, arco,
  animações na rolagem): `apps/web/src/app/album.css`. Layout das seções da home:
  `apps/web/src/components/home/home.module.css`.
- Imagem de prévia do link (WhatsApp): `apps/web/src/app/opengraph-image.tsx` (usa a foto
  `hero.fotoCelular`).
