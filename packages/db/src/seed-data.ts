import type { AgeRange, RsvpStatus, Side } from "./schema/app.ts";

// Dados fictícios para desenvolvimento. Nada aqui é conteúdo real.

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
  { key: "couple.monogram", value: "D & G", isPublic: true },
  // TODO(conteudo): data e hora definitivas do casamento.
  { key: "wedding.datetime", value: "2027-05-15T16:00:00-03:00", isPublic: true },
  { key: "wedding.timezone", value: "America/Sao_Paulo", isPublic: true },
  // TODO(conteudo): local, endereço e coordenadas da cerimônia.
  {
    key: "ceremony.venue",
    value: { name: "Local a definir", address: "", lat: null, lng: null, time: "" },
    isPublic: true,
  },
  // TODO(conteudo): local, endereço e coordenadas da recepção.
  {
    key: "reception.venue",
    value: { name: "Local a definir", address: "", lat: null, lng: null, time: "" },
    isPublic: true,
  },
  // TODO(conteudo): prazo final do RSVP.
  { key: "rsvp.deadline", value: "2027-04-15T23:59:59-03:00", isPublic: true },
  // TODO(conteudo): percentual real da tarifa de cartão no Mercado Pago.
  { key: "payments.card_fee_percent", value: 4.98, isPublic: true },
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
  // TODO(conteudo): programação definitiva do dia.
  {
    key: "schedule.items",
    value: [
      {
        time: "15h30",
        title: "Chegada",
        text: "Os portões abrem. Chegue com calma e escolha um lugar.",
      },
      { time: "16h", title: "Cerimônia", text: "Dura cerca de 40 minutos." },
      { time: "17h", title: "Coquetel", text: "Bebidas e petiscos enquanto tiramos as fotos." },
      { time: "18h30", title: "Jantar", text: "Mesas por grupo. Avise se tiver restrição." },
      { time: "20h", title: "Festa", text: "Pista aberta até a meia-noite." },
    ],
    isPublic: true,
  },
  // TODO(conteudo): dress code e paleta definitivos.
  {
    key: "dresscode",
    value: {
      text: "Traje passeio completo. Escolha algo confortável para dançar.",
      palette: [
        { name: "Azul azulejo", hex: "#2F5D8A" },
        { name: "Verde oliva", hex: "#6B7A4F" },
        { name: "Terracota", hex: "#B5654A" },
        { name: "Areia", hex: "#D9C9A8" },
      ],
      avoid: ["Branco e off-white", "Preto total", "Estampas muito grandes"],
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
      "O endereço sai assim que o local for definido. Para voltar com segurança, combine caronas ou chame um carro por aplicativo.",
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
        answer: "Vamos informar assim que o local for definido. Prefira caronas ou aplicativo.",
      },
      {
        question: "Quero dar um presente. Como faço?",
        answer:
          "A lista está em Presentes. Você escolhe um item ou contribui com o valor que quiser. Presença é o que mais importa.",
      },
      {
        question: "Qual o horário de chegada?",
        answer: "A cerimônia começa às 16h. Chegue a partir das 15h30.",
      },
      {
        question: "Até quando posso confirmar presença?",
        answer: "Até 15 de abril de 2027. Depois dessa data, fale direto com a gente.",
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
  // TODO(conteudo): manual real dos padrinhos.
  {
    key: "godparents.manual",
    value: {
      dressCode:
        "Madrinhas em vestido longo na cor da paleta. Padrinhos em terno azul-marinho com gravata da paleta.",
      schedule: [
        { time: "14h", text: "Chegada ao local para as fotos." },
        { time: "15h30", text: "Fila de entrada: ensaio rápido." },
        { time: "16h", text: "Cerimônia." },
      ],
      palette: [
        { name: "Azul azulejo", hex: "#2F5D8A" },
        { name: "Terracota", hex: "#B5654A" },
        { name: "Areia", hex: "#D9C9A8" },
      ],
      notes: [
        "Levem um calçado confortável para a pista.",
        "O ensaio da cerimônia será na semana anterior. Avisamos a data.",
      ],
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
      title: "Dani & Gustavo | Casamento em 15 de maio de 2027",
      description:
        "Informações, confirmação de presença e lista de presentes do casamento de Dani e Gustavo.",
      ogTitle: "Dani & Gustavo vão casar",
      ogDescription: "15 de maio de 2027. Confirme sua presença pelo site.",
    },
    isPublic: true,
  },
];

export const ADMIN_NAMES = ["Dani", "Gustavo"] as const;
