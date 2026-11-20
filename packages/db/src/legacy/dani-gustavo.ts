/*
 * Conteúdo fixo do casamento de Dani & Gustavo (evento 1) como ele estava em
 * apps/web/src/content/{home,paginas,galeria}.ts, traduzido para o formato do banco
 * (`site.sections`, `SiteSections` de @casamento/shared). Só o importador usa isto
 * (`content:import-legacy`); depois da importação o conteúdo se edita no painel.
 *
 * As fotos ficam em packages/db/legacy/dani-gustavo/fotos e entram em `event_media`.
 */

/** Arte desenhada do monograma (a ligadura DG de `components/brand`). */
export const LEGACY_MONOGRAM_ART = "dg";

/** UID da agenda que o site já publicava (`casamento-<data>@dani-e-gustavo`): não muda. */
export const LEGACY_CALENDAR_UID = "casamento-20270410@dani-e-gustavo";

/** Foto usada numa seção: referência ao `event_media` mais o alt/posição daquele uso. */
export interface LegacyPhotoRef {
  mediaId: number;
  alt: string;
  position: string;
}

/** Devolve a referência de uma foto pelo nome do arquivo original. */
export type PhotoOf = (file: string, alt?: string, position?: string) => LegacyPhotoRef;

/** Fotos da galeria, na ordem da página (nome do arquivo original + texto alternativo). */
export const LEGACY_GALLERY: readonly { file: string; alt: string }[] = [
  { file: "dsc06378.jpg", alt: "Casal caminhando no campo dourado ao pôr do sol" },
  { file: "dsc06230.jpg", alt: "Abraço testa com testa na luz dourada" },
  { file: "dsc04828copiar.jpg", alt: "Close do casal em preto e branco" },
  { file: "dsc06264.jpg", alt: "Casal de costas, de mãos dadas, olhando o pôr do sol" },
  { file: "img_7871.jpg", alt: "Casal abraçado, com o sol se pondo atrás" },
  { file: "dsc04745.jpg", alt: "Casal de mãos dadas, ela olhando para a câmera" },
  { file: "dsc05667.jpg", alt: "Beijo do casal com as montanhas ao fundo" },
  { file: "img_8083.jpg", alt: "Casal de branco caminhando de mãos dadas no crepúsculo azul" },
  { file: "dsc06205.jpg", alt: "Close do casal na luz de fim de tarde" },
  { file: "dsc04934.jpg", alt: "Casal rindo, caminhando entre os pinheiros" },
  { file: "dsc06384.jpg", alt: "Casal de costas caminhando no capim dourado" },
  { file: "img_8038.jpg", alt: "Silhuetas do casal no céu do entardecer" },
  { file: "dsc065521.jpg", alt: "Casal no topo do morro sob céu azul intenso" },
  { file: "dsc05197.jpg", alt: "Casal abraçado no bosque de pinheiros" },
  { file: "img_7977.jpg", alt: "Casal pequeno no topo da pedra, com trilha e montanhas" },
  { file: "dsc06040.jpg", alt: "Beijo do casal com o véu ao vento" },
  { file: "img-20261117-wa0020.jpg", alt: "Casal de braços dados, rindo, no bosque" },
  { file: "dsc06216.jpg", alt: "Casal abraçado ao pé do Cristo, sob céu azul" },
  { file: "dsc05969.jpg", alt: "Casal de branco se beijando no campo dourado" },
  { file: "dsc04643.jpg", alt: "Casal abraçado na trilha entre os pinheiros" },
  { file: "dsc062981.jpg", alt: "Casal caminhando de mãos dadas no calçamento de pedra" },
  { file: "img_8091.jpg", alt: "Casal abraçado à noite, em preto e branco" },
  { file: "dsc06398.jpg", alt: "Casal caminhando no capim, em direção ao pôr do sol" },
  { file: "img-20261117-wa0019.jpg", alt: "Casal abraçado no bosque, ela sorrindo" },
  { file: "dsc05465.jpg", alt: "Casal em preto e branco ao lado de um carro antigo" },
  { file: "dsc06426.jpg", alt: "Casal de costas caminhando no campo ao entardecer" },
  { file: "img_7846.jpg", alt: "Casal de costas na estrada de terra, com o sol se pondo" },
];

/** Aviso da galeria enquanto as fotos oficiais não chegam (`gallery.official_soon`). */
const GALLERY_SOON =
  "Por enquanto, o pré-wedding. As fotos oficiais chegam aqui em breve, depois do casamento.";

/** `site.sections` do casamento (mesmos textos de content/home.ts e content/paginas.ts). */
export function legacySections(photo: PhotoOf) {
  return {
    order: [
      "story",
      "album",
      "event",
      "verse",
      "schedule",
      "dresscode",
      "gifts",
      "messages",
      "rsvp",
      "faq",
    ].map((id) => ({ id, enabled: true })),
    numberPages: true,
    hero: {
      kicker: "Vamos nos casar",
      photoDesktop: photo(
        "dsc06378.jpg",
        "Dani e Gustavo caminhando num campo dourado ao pôr do sol, com montanhas ao fundo",
        "center 55%",
      ),
      photoMobile: photo(
        "dsc06264.jpg",
        "Dani e Gustavo de costas, de mãos dadas, olhando o pôr do sol nas montanhas",
        "center 45%",
      ),
      countdown: {
        title: "Faltam para o nosso sim",
        today: "É hoje! Nos vemos no altar.",
        after: "Casamos em {data}. Obrigado por fazer parte.",
      },
    },
    story: {
      menu: "História",
      label: "Nossa história",
      title: "Dez anos *colados* no mesmo álbum",
      lead: "Alguns momentos que nos trouxeram até aqui.",
      // TODO(conteudo): conferir anos e textos com o casal.
      items: [
        {
          year: "2016",
          title: "A gente se conheceu",
          text: "Foi num churrasco de amigos. Falamos a noite toda sobre nada.",
          photo: photo("dsc06205.jpg", "Close do casal na luz de fim de tarde"),
        },
        {
          year: "2017",
          title: "Primeiro encontro de verdade",
          text: "Um café que durou quatro horas. O garçom já tinha desistido de nós.",
          photo: photo(
            "img_7871.jpg",
            "Casal abraçado olhando-se, com o sol se pondo atrás",
            "40% center",
          ),
        },
        {
          year: "2020",
          title: "Casa nova",
          text: "Duas pessoas, um gato e caixas por todo lado.",
          photo: photo("dsc06384.jpg", "Casal de costas caminhando no capim dourado"),
        },
        {
          year: "2023",
          title: "A viagem longa",
          text: "Pegamos o mapa errado e foi o melhor dia da viagem.",
          photo: photo("img_7977.jpg", "Casal pequeno no topo da pedra, com trilha e montanhas"),
        },
        {
          year: "2026",
          title: "O pedido",
          text: "Ela disse sim antes de ele terminar a frase.",
          photo: photo("dsc05969.jpg", "Casal de branco se beijando no campo dourado"),
        },
      ],
    },
    album: {
      label: "Pelo caminho",
      title: "Do nosso *álbum*",
      photos: [
        {
          photo: photo("dsc06230.jpg", "Abraço testa com testa na luz dourada, montanhas ao fundo"),
          caption: "Luz de fim de tarde",
        },
        {
          photo: photo("dsc04828copiar.jpg", "Close do casal em preto e branco"),
          caption: "Em preto e branco",
        },
        {
          photo: photo(
            "dsc06264.jpg",
            "Casal de costas, de mãos dadas, olhando o pôr do sol nas montanhas",
          ),
          caption: "Olhando na mesma direção",
        },
        {
          photo: photo("img_8091.jpg", "Casal abraçado à noite, em preto e branco"),
          caption: "Depois que o sol foi embora",
        },
        {
          photo: photo("dsc04745.jpg", "Casal de mãos dadas, ela olhando para a câmera"),
          caption: "De mãos dadas",
        },
        {
          photo: photo("dsc06378.jpg", "Casal caminhando no campo dourado ao pôr do sol"),
          caption: "O campo dourado",
        },
      ],
      galleryLink: "Ver todas as fotos",
    },
    event: {
      menu: "O casamento",
      label: "O casamento",
      lead: "Cerimônia e recepção no mesmo lugar, em Volta Redonda.",
      photo: photo(
        "img_8083.jpg",
        "Casal de branco caminhando de mãos dadas no crepúsculo azul",
        "center 40%",
      ),
      photoCaption: "Até lá, contando os dias.",
      accommodationTitle: "Onde ficar",
    },
    verse: {
      photo: photo(
        "img_8038.jpg",
        "Silhuetas do casal frente a frente no céu do entardecer",
        "center 40%",
      ),
      lines: [
        "“Para que todos vejam, e saibam,",
        "e considerem, e juntamente entendam",
        "que a mão do Senhor fez isto.”",
      ],
      reference: "Isaías 41:20",
    },
    schedule: {
      menu: "Programação",
      label: "Programação",
      title: "O dia, *hora a hora*",
      lead: "Os horários depois da cerimônia são uma estimativa.",
    },
    dresscode: {
      menu: "Traje",
      label: "Dress code",
      title: "Traje passeio, *em tons de azul*",
      lead: "Pode escolher o seu azul, com detalhes brancos.",
      photo: photo(
        "dsc065521.jpg",
        "Casal em pé no topo do morro sob céu azul intenso",
        "center 30%",
      ),
    },
    gifts: {
      menu: "Presentes",
      menuLink: "/presentes",
      label: "Presentes",
      title: "Presença é o que *mais importa*",
      text: "Se quiser nos presentear, a lista está aqui no site. Você escolhe um item para a casa nova ou para a lua de mel, ou contribui com o valor que quiser, no Pix ou no cartão.",
      photo: photo("dsc06230.jpg", "Abraço testa com testa na luz dourada"),
      photoCaption: "Obrigado por fazer parte",
      buttons: [{ text: "Ver a lista de presentes", link: "/presentes" }],
      notice: "A lista de presentes abre em breve, aqui mesmo.",
    },
    messages: {
      menu: "Recados",
      menuLink: "/recados",
      label: "Mural de recados",
      title: "Palavras de *quem nos quer bem*",
      lead: "Os recados que chegam ficam aqui depois que a gente lê.",
      count: 3,
      seeAll: "Ver o mural todo",
      write: "Deixar um recado",
      empty: "Ainda não tem recado por aqui. Que tal ser a primeira pessoa a escrever?",
    },
    rsvp: {
      label: "Confirmação",
      title: "Conta pra gente se *você vem*",
      text: "Responda até {prazo}. Depois dessa data, fale direto com a gente.",
      photos: [photo("dsc06384.jpg", ""), photo("dsc05969.jpg", "")],
      card: {
        title: "Cartão-resposta",
        text: "Digite seu nome como está no convite e responda por todos do seu convite de uma vez. Leva um minuto, e dá para mudar depois.",
        button: "Confirmar presença",
      },
    },
    faq: { menu: "Dúvidas", label: "Dúvidas", title: "Perguntas *frequentes*" },
    nav: {
      cta: "Confirmar presença",
      extras: [{ text: "Galeria", link: "/galeria" }],
    },
    footer: {
      phrase: "“…que a mão do Senhor fez isto.” Isaías 41:20",
      links: [
        { text: "Galeria", link: "/galeria" },
        { text: "Lista de presentes", link: "/presentes" },
        { text: "Mural de recados", link: "/recados" },
        { text: "Manual dos padrinhos", link: "/padrinhos" },
        { text: "Confirmar presença", link: "/confirmar" },
      ],
    },
    pages: {
      gallery: { title: "Galeria", soonNotice: GALLERY_SOON },
      godparents: {
        photo: photo(
          "img_7871.jpg",
          "Dani e Gustavo abraçados, com o sol se pondo atrás",
          "40% center",
        ),
      },
      messages: {
        label: "Mural de recados",
        title: "Palavras de quem *nos quer bem*",
        lead: "Os recados aparecem aqui depois que a gente lê. Obrigado pelo carinho.",
        empty: "Ainda não tem recado por aqui. Que tal ser a primeira pessoa a escrever?",
        unavailable: "O mural não carregou agora. Recarregue a página em alguns instantes.",
        formTitle: "Deixe um recado",
        formLead:
          "Escreva o que quiser para nós dois. A gente lê tudo, e o recado entra no mural depois.",
        formButton: "Enviar recado",
        privacy:
          "Privacidade: guardamos só o nome e o texto que você escrever, para mostrar no mural depois de aprovado. Não pedimos e-mail nem guardamos o seu IP. Para tirar um recado, é só falar com a gente.",
        sentTitle: "Recado enviado, obrigado!",
        sentText: "Assim que a gente ler, ele aparece no mural.",
      },
      notFound: {
        photo: photo(
          "img_7977.jpg",
          "Dani e Gustavo pequenos no topo da pedra, com a trilha e as montanhas",
        ),
        caption: "Pegamos o caminho errado também.",
      },
    },
  };
}
