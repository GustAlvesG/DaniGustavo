import type { SiteContent } from "@casamento/shared";

/**
 * Conteúdo de reserva, igual ao seed da API. Só aparece quando `/api/site`
 * não responde (build no CI sem API, API fora do ar). O conteúdo de verdade
 * vive nas settings, editáveis no painel. TODO(conteudo): todos os textos.
 */
export const SITE_FALLBACK: SiteContent = {
  couple: { names: "Dani & Gustavo", monogram: "D & G" },
  wedding: { datetime: "2027-04-10T15:30:00-03:00", timezone: "America/Sao_Paulo" },
  ceremony: {
    name: "Local a definir",
    address: "",
    lat: null,
    lng: null,
    time: "",
    mapsUrl: null,
    wazeUrl: null,
  },
  reception: {
    name: "Local a definir",
    address: "",
    lat: null,
    lng: null,
    time: "",
    mapsUrl: null,
    wazeUrl: null,
  },
  schedule: [
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
  dressCode: {
    text: "Traje passeio completo. Escolha algo confortável para dançar.",
    palette: [
      { name: "Azul azulejo", hex: "#2F5D8A" },
      { name: "Verde oliva", hex: "#6B7A4F" },
      { name: "Terracota", hex: "#B5654A" },
      { name: "Areia", hex: "#D9C9A8" },
    ],
    avoid: ["Branco e off-white", "Preto total", "Estampas muito grandes"],
  },
  accommodation: {
    items: [
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
    howToGetThere:
      "O endereço sai assim que o local for definido. Para voltar com segurança, combine caronas ou chame um carro por aplicativo.",
  },
  faq: [
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
  story: [
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
  godparents: {
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
  gallery: {
    items: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
      const landscape = n === 1 || n === 4 || n === 7;
      return {
        src: `/placeholder/galeria-${n}.svg`,
        alt: `Foto ${n} do pré-wedding (provisória)`,
        width: landscape ? 1200 : 800,
        height: landscape ? 800 : 1200,
      };
    }),
    officialPhotosSoon: true,
  },
  contact: {
    whatsapp: "",
    email: "",
    message: "Alguma dúvida? Fale com a gente.",
  },
  rsvp: { deadline: "2027-04-15T23:59:59-03:00" },
  seo: {
    title: "Dani & Gustavo | Casamento em 15 de maio de 2027",
    description:
      "Informações, confirmação de presença e lista de presentes do casamento de Dani e Gustavo.",
    ogTitle: "Dani & Gustavo vão casar",
    ogDescription: "15 de maio de 2027. Confirme sua presença pelo site.",
  },
};
