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
  // TODO(conteudo): contato real dos noivos.
  {
    key: "couple.contact",
    value: { whatsapp: "", email: "contato@exemplo.com", message: "Fale com a gente" },
    isPublic: true,
  },
];

export const ADMIN_NAMES = ["Dani", "Gustavo"] as const;
