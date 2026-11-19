/**
 * Fotos e textos das páginas internas (mesmo esquema de content/home.ts:
 * o arquivo fica em apps/web/public/fotos e aqui vai só o nome).
 */
import type { Foto } from "./home";

export const paginas = {
  /** /padrinhos: a foto no arco, ao lado do título. */
  padrinhos: {
    foto: {
      arquivo: "img_7871.jpg",
      alt: "Dani e Gustavo abraçados, com o sol se pondo atrás",
      posicao: "40% center",
    } satisfies Foto as Foto | null,
  },
  /** /recados: o mural e o formulário "Deixe um recado". */
  recados: {
    rotulo: "Mural de recados",
    titulo: "Palavras de quem *nos quer bem*",
    lead: "Os recados aparecem aqui depois que a gente lê. Obrigado pelo carinho.",
    vazio: "Ainda não tem recado por aqui. Que tal ser a primeira pessoa a escrever?",
    indisponivel: "O mural não carregou agora. Recarregue a página em alguns instantes.",
    formTitulo: "Deixe um recado",
    formLead:
      "Escreva o que quiser para nós dois. A gente lê tudo, e o recado entra no mural depois.",
    formBotao: "Enviar recado",
    privacidade:
      "Privacidade: guardamos só o nome e o texto que você escrever, para mostrar no mural depois de aprovado. Não pedimos e-mail nem guardamos o seu IP. Para tirar um recado, é só falar com a gente.",
    enviadoTitulo: "Recado enviado, obrigado!",
    enviadoTexto: "Assim que a gente ler, ele aparece no mural.",
  },
  /** Página não encontrada (404). */
  naoEncontrada: {
    foto: {
      arquivo: "img_7977.jpg",
      alt: "Dani e Gustavo pequenos no topo da pedra, com a trilha e as montanhas",
    } satisfies Foto as Foto | null,
    legenda: "Pegamos o caminho errado também.",
  },
};

export type Paginas = typeof paginas;
