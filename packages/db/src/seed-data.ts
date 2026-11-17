import type { AgeRange, RsvpStatus, Side } from "./schema/app.ts";

// Convites, presentes e usuários são fictícios; as configurações já têm o conteúdo real do casal.

export interface SeedInvitation {
  label: string;
  side: Side;
  maxGuests: number;
  allowPlusOne: boolean;
  guests: {
    name: string;
    isChild?: boolean;
    ageRange?: AgeRange;
    rsvpStatus?: RsvpStatus;
    dietaryNotes?: string;
    phone?: string;
    email?: string;
  }[];
}

export const seedInvitations: SeedInvitation[] = [
  {
    label: "Família Albuquerque",
    side: "dani",
    maxGuests: 3,
    allowPlusOne: false,
    guests: [
      { name: "Helena Albuquerque", phone: "+55 11 90000-0001", email: "helena@exemplo.com" },
      { name: "Rafael Albuquerque", rsvpStatus: "confirmed", dietaryNotes: "Vegetariano" },
      { name: "Lia Albuquerque", isChild: true, ageRange: "3-7" },
    ],
  },
  {
    label: "Marina Toledo",
    side: "gustavo",
    maxGuests: 2,
    allowPlusOne: true,
    guests: [{ name: "Marina Toledo", phone: "+55 21 90000-0002", email: "marina@exemplo.com" }],
  },
  {
    label: "Tio Otávio e tia Célia",
    side: "gustavo",
    maxGuests: 2,
    allowPlusOne: false,
    guests: [
      { name: "Otávio Ramos", rsvpStatus: "declined" },
      { name: "Célia Ramos", rsvpStatus: "declined", dietaryNotes: "Alergia a camarão" },
    ],
  },
  {
    label: "Carlos e Beatriz Nogueira",
    side: "gustavo",
    maxGuests: 2,
    allowPlusOne: false,
    guests: [
      { name: "Carlos Nogueira", email: "carlos@exemplo.com" },
      { name: "Beatriz Nogueira" },
    ],
  },
  {
    label: "Júlia Ferraz",
    side: "dani",
    maxGuests: 2,
    allowPlusOne: true,
    guests: [{ name: "Júlia Ferraz" }],
  },
];

export interface SeedGift {
  slug: string;
  title: string;
  description: string;
  priceCents: number;
  openAmount?: boolean;
  quotaTotal: number;
  category: string;
  tileDesign: string;
}

export const seedGifts: SeedGift[] = [
  {
    slug: "jantar-em-lisboa",
    title: "Jantar em Lisboa",
    description: "Uma noite com vista para o Tejo na lua de mel.",
    priceCents: 45000,
    quotaTotal: 4,
    category: "lua-de-mel",
    tileDesign: "monograma",
  },
  {
    slug: "passeio-de-barco",
    title: "Passeio de barco",
    description: "Uma tarde no mar, sem pressa.",
    priceCents: 32000,
    quotaTotal: 2,
    category: "lua-de-mel",
    tileDesign: "onda",
  },
  {
    slug: "jogo-de-panelas",
    title: "Jogo de panelas",
    description: "Para os almoços de domingo em casa.",
    priceCents: 89000,
    quotaTotal: 1,
    category: "casa",
    tileDesign: "ramo",
  },
  {
    slug: "cafeteira",
    title: "Cafeteira",
    description: "O café da manhã agradece.",
    priceCents: 38000,
    quotaTotal: 1,
    category: "casa",
    tileDesign: "flor",
  },
  {
    slug: "jogo-de-cama",
    title: "Jogo de cama",
    description: "Lençóis de algodão para a casa nova.",
    priceCents: 52000,
    quotaTotal: 1,
    category: "casa",
    tileDesign: "moldura",
  },
  {
    slug: "plantas-da-varanda",
    title: "Plantas da varanda",
    description: "Vasos e mudas para deixar a varanda verde.",
    priceCents: 15000,
    quotaTotal: 5,
    category: "casa",
    tileDesign: "ramo",
  },
  {
    slug: "noite-de-estrelas",
    title: "Noite de estrelas",
    description: "Uma noite num chalé longe das luzes da cidade.",
    priceCents: 70000,
    quotaTotal: 2,
    category: "experiencias",
    tileDesign: "estrela",
  },
  {
    slug: "contribuicao-livre",
    title: "Contribuição livre",
    description: "Escolha o valor que quiser.",
    priceCents: 10000,
    openAmount: true,
    quotaTotal: 999,
    category: "livre",
    tileDesign: "monograma",
  },
];

/** Configurações placeholder. Tudo aqui é editável no painel. */
export const seedSettings: { key: string; value: unknown; isPublic: boolean }[] = [
  { key: "couple.names", value: "Dani & Gustavo", isPublic: true },
  { key: "couple.monogram", value: "DG", isPublic: true },
  { key: "wedding.datetime", value: "2027-04-10T16:00:00-03:00", isPublic: true },
  { key: "wedding.timezone", value: "America/Sao_Paulo", isPublic: true },
  // TODO(conteudo): coordenadas (lat/lng) opcionais; os links de mapa saem do endereço.
  {
    key: "ceremony.venue",
    value: {
      name: "Solare Roma",
      address: "R. Papagaio, 1800 - Roma, Volta Redonda - RJ, 27257-770",
      lat: null,
      lng: null,
      time: "16h",
    },
    isPublic: true,
  },
  // TODO(conteudo): confirmar se a recepção é no mesmo local e o horário de início.
  {
    key: "reception.venue",
    value: {
      name: "Solare Roma",
      address: "R. Papagaio, 1800 - Roma, Volta Redonda - RJ, 27257-770",
      lat: null,
      lng: null,
      time: "17h",
    },
    isPublic: true,
  },
  // TODO(conteudo): confirmar o prazo final do RSVP.
  { key: "rsvp.deadline", value: "2027-03-10T23:59:59-03:00", isPublic: true },
  // TODO(conteudo): percentual real da tarifa de cartão no Asaas. É o que soma ao valor
  // quando o convidado marca "Quero cobrir a taxa" no pagamento com cartão.
  { key: "payments.card_fee_percent", value: 4.98, isPublic: true },
  // Nomes das categorias da lista de presentes (o filtro de /presentes segue esta ordem).
  {
    key: "gifts.categories",
    value: [
      { slug: "lua-de-mel", label: "Lua de mel" },
      { slug: "casa", label: "Casa" },
      { slug: "experiencias", label: "Experiências" },
      { slug: "livre", label: "Valor livre" },
    ],
    isPublic: true,
  },
  // TODO(conteudo): contato real dos noivos (WhatsApp só com dígitos e DDI).
  {
    key: "couple.contact",
    value: {
      whatsapp: "5511900000000",
      email: "contato@exemplo.com",
      message: "Alguma dúvida? Fale com a gente.",
    },
    isPublic: true,
  },
  // TODO(conteudo): horários após a cerimônia são estimativa; confirmar a programação.
  {
    key: "schedule.items",
    value: [
      {
        time: "15h30",
        title: "Chegada",
        text: "Chegue com calma, cumprimente quem já está lá e escolha um lugar.",
      },
      { time: "16h", title: "Cerimônia", text: "Dura cerca de 40 minutos." },
      { time: "17h", title: "Recepção", text: "Coquetel e fotos logo após a cerimônia." },
      { time: "18h30", title: "Jantar", text: "Mesas por grupo. Avise se tiver restrição." },
      { time: "20h30", title: "Festa", text: "Pista aberta. Prepare o pé de dança." },
    ],
    isPublic: true,
  },
  // TODO(conteudo): detalhes do traje (comprimento, tecidos, calçado) e o que evitar.
  {
    key: "dresscode",
    value: {
      text: "Traje passeio, com tons de azul. Pode escolher o seu azul, com detalhes brancos.",
      palette: [
        { name: "Azul marinho", hex: "#1F2A4D" },
        { name: "Azul serenity", hex: "#92A8D1" },
        { name: "Azul claro", hex: "#BBD0EC" },
        { name: "Branco", hex: "#FFFFFF" },
      ],
      avoid: ["Branco e off-white total (reservado à noiva)"],
    },
    isPublic: true,
  },
  // TODO(conteudo): hospedagens reais, distâncias e links.
  {
    key: "accommodation.items",
    value: [
      {
        name: "Hotel a definir",
        distance: "10 minutos do local",
        url: null,
        note: "Peça o código do casamento ao reservar.",
      },
      {
        name: "Pousada a definir",
        distance: "15 minutos do local",
        url: null,
        note: "Boa opção para quem vem em grupo.",
      },
    ],
    isPublic: true,
  },
  // TODO(conteudo): orientação real de como chegar.
  {
    key: "accommodation.how_to_get_there",
    value:
      "O Solare Roma fica na R. Papagaio, 1800, bairro Roma, em Volta Redonda (RJ). Para voltar com segurança, combine caronas ou chame um carro por aplicativo.",
    isPublic: true,
  },
  // TODO(conteudo): revisar cada resposta quando as decisões forem tomadas.
  {
    key: "faq.items",
    value: [
      {
        question: "Posso levar meu filho?",
        answer:
          "Crianças da família estão no convite. Se o seu convite tem criança, ela aparece na confirmação. Se não tem, o evento é só para adultos.",
      },
      {
        question: "Tem estacionamento?",
        // TODO(conteudo): confirmar estacionamento no Solare Roma.
        answer:
          "Vamos confirmar as informações de estacionamento do Solare Roma em breve. Prefira caronas ou aplicativo.",
      },
      {
        question: "Quero dar um presente. Como faço?",
        answer:
          "A lista está em Presentes. Você escolhe um item ou contribui com o valor que quiser. Presença é o que mais importa.",
      },
      {
        question: "Qual o horário de chegada?",
        answer: "A cerimônia começa às 16h, no Solare Roma. Chegue a partir das 15h30.",
      },
      {
        question: "Até quando posso confirmar presença?",
        answer: "Até 10 de março de 2027. Depois dessa data, fale direto com a gente.",
      },
      {
        question: "Posso levar acompanhante?",
        answer:
          "Só se o seu convite permitir. Na página de confirmação aparece o campo para o nome. Se não aparecer, o convite é individual.",
      },
    ],
    isPublic: true,
  },
  // TODO(conteudo): momentos reais da história do casal e fotos.
  {
    key: "story.items",
    value: [
      {
        id: "encontro",
        when: "2016",
        title: "A gente se conheceu",
        text: "Foi num churrasco de amigos. Falamos a noite toda sobre nada.",
        image: "/placeholder/historia-1.svg",
        imageAlt: "Ilustração de um azulejo azul e branco",
      },
      {
        id: "primeiro-encontro",
        when: "2017",
        title: "Primeiro encontro de verdade",
        text: "Um café que durou quatro horas. O garçom já tinha desistido de nós.",
        image: "/placeholder/historia-2.svg",
        imageAlt: "Ilustração de um azulejo com ramos",
      },
      {
        id: "morar-juntos",
        when: "2020",
        title: "Casa nova",
        text: "Duas pessoas, um gato e caixas por todo lado.",
        image: "/placeholder/historia-3.svg",
        imageAlt: "Ilustração de um azulejo com flor",
      },
      {
        id: "viagem",
        when: "2023",
        title: "A viagem longa",
        text: "Pegamos o mapa errado e foi o melhor dia da viagem.",
        image: "/placeholder/historia-4.svg",
        imageAlt: "Ilustração de um azulejo com ondas",
      },
      {
        id: "pedido",
        when: "2026",
        title: "O pedido",
        text: "Ela disse sim antes de ele terminar a frase.",
        image: "/placeholder/historia-5.svg",
        imageAlt: "Ilustração de um azulejo com estrela",
      },
    ],
    isPublic: true,
  },
  // Manual dos padrinhos (docs/marca/manual-padrinhos.pdf).
  // TODO(conteudo): URLs da playlist do Spotify e do álbum de fotos.
  {
    key: "godparents.manual",
    value: {
      dressCode:
        "Madrinhas de vestido azul serenity, modelo livre. Padrinhos de terno cinza, camisa branca, gravata azul claro e tênis branco.",
      schedule: [
        { time: "15h30", text: "Chegada ao local da cerimônia (meia hora de antecedência)." },
        { time: "16h", text: "Cerimônia." },
      ],
      palette: [{ name: "Azul serenity", hex: "#92A8D1" }],
      notes: [
        "Tirem muitas fotos e façam vários vídeos para ajudar a eternizar o momento.",
        "Organizem previamente o laço da gravata.",
      ],
      invitation:
        'Existem pessoas que tornam a nossa história ainda mais bonita, e vocês fazem parte dela! Por isso, não conseguiríamos imaginar o nosso "sim" sem vocês ao nosso lado. Mais do que testemunhas do nosso amor, queremos vocês caminhando conosco nesse sonho chamado casamento.',
      bridesmaids: {
        text: "Queremos que você se sinta linda e à vontade nesse dia especial! O modelo do vestido fica totalmente a seu critério. Capriche no que mais combina com seu estilo. A única regra é a cor: precisa ser azul serenity, para fechar com a paleta do casamento.",
        inspiration: { name: "Azul serenity", hex: "#92A8D1" },
      },
      groomsmen: {
        text: "Para mantermos a harmonia da cerimônia, pedimos que utilize terno cinza médio, camisa branca e a gravata que já foi enviada para vocês. Se organize com o laço da gravata previamente.",
        summary: "Terno cinza, camisa branca, gravata azul claro e tênis branco.",
      },
      missions: [
        { title: "Cuidar da noiva", text: "Ajudar com o vestido, a cauda e os retoques." },
        {
          title: "Acalmar o noivo",
          text: "Manter ele tranquilo (e hidratado) antes da cerimônia.",
        },
        { title: "Animar a pista", text: "Ninguém fica sentado quando a festa começar!" },
        { title: "Reunir as solteiras", text: "Na hora do buquê, ninguém escapa." },
        { title: "Comandar a hora da gravata", text: "Cada pedacinho vale ouro!" },
        {
          title: "Reunir a galera para as fotos",
          text: "Quando o fotógrafo chamar, todo mundo junto.",
        },
      ],
      missionsClosing: "Missão dada é missão cumprida!",
      music: {
        text: "A festa também é de vocês! Queremos que a pista tenha um pedacinho de cada um!",
        playlistUrl: null,
        albumText: "E já adicione as fotos do seu making of no nosso álbum!",
        albumUrl: null,
      },
      bigDay: [
        "Chegar com meia hora de antecedência ao local da cerimônia. Não podemos atrasar, ok?",
        "Tirar muitas fotos e fazer vários vídeos nossos! Assim vocês nos ajudarão a eternizar esse momento!",
        "E divirta-se muito!",
      ],
      verse: {
        text: "Para que todos vejam, e saibam, e considerem, e juntamente entendam que a mão do Senhor fez isto.",
        reference: "Isaías 41:20",
      },
    },
    isPublic: true,
  },
  // TODO(conteudo): fotos reais do pré-wedding. Os arquivos são placeholders em apps/web/public.
  {
    key: "gallery.items",
    value: Array.from({ length: 8 }, (_, i) => ({
      src: `/placeholder/galeria-${i + 1}.svg`,
      alt: `Foto ${i + 1} do pré-wedding (provisória)`,
      width: i % 3 === 0 ? 1200 : 800,
      height: i % 3 === 0 ? 800 : 1200,
    })),
    isPublic: true,
  },
  { key: "gallery.official_soon", value: true, isPublic: true },
  // TODO(conteudo): textos finais de SEO e da prévia do WhatsApp.
  {
    key: "seo",
    value: {
      title: "Dani & Gustavo | Casamento em 10 de abril de 2027, Volta Redonda, RJ",
      description:
        "Informações, confirmação de presença e lista de presentes do casamento de Dani e Gustavo.",
      ogTitle: "Dani & Gustavo vão casar",
      ogDescription: "10 de abril de 2027, Volta Redonda, RJ. Confirme sua presença pelo site.",
    },
    isPublic: true,
  },
];

export const ADMIN_NAMES = ["Dani", "Gustavo"] as const;
