import type { SiteContent } from "@casamento/shared";

/**
 * Conteúdo de reserva, espelho do seed da API (packages/db/src/seed-data.ts).
 * Só aparece quando `/api/site` não responde (build no CI sem API, API fora
 * do ar). O conteúdo de verdade vive nas settings, editáveis no painel.
 * TODO(conteudo): revisar quando o casal fechar programação e textos.
 */
const VENUE_ADDRESS = "R. Papagaio, 1800 - Roma, Volta Redonda - RJ, 27257-770";

export const SITE_FALLBACK: SiteContent = {
  couple: { names: "Dani & Gustavo", monogram: "DG" },
  wedding: { datetime: "2027-04-10T16:00:00-03:00", timezone: "America/Sao_Paulo" },
  ceremony: {
    name: "Solare Roma",
    address: VENUE_ADDRESS,
    lat: null,
    lng: null,
    time: "16h",
    mapsUrl: null,
    wazeUrl: null,
  },
  reception: {
    name: "Solare Roma",
    address: VENUE_ADDRESS,
    lat: null,
    lng: null,
    time: "17h",
    mapsUrl: null,
    wazeUrl: null,
  },
  schedule: [
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
  dressCode: {
    text: "Traje passeio, com tons de azul. Pode escolher o seu azul, com detalhes brancos.",
    palette: [
      { name: "Azul marinho", hex: "#1F2A4D" },
      { name: "Azul serenity", hex: "#92A8D1" },
      { name: "Azul claro", hex: "#BBD0EC" },
      { name: "Branco", hex: "#FFFFFF" },
    ],
    avoid: ["Branco e off-white total (reservado à noiva)"],
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
      "O Solare Roma fica na R. Papagaio, 1800, bairro Roma, em Volta Redonda (RJ). Para voltar com segurança, combine caronas ou chame um carro por aplicativo.",
  },
  faq: [
    {
      question: "Posso levar meu filho?",
      answer:
        "Crianças da família estão no convite. Se o seu convite tem criança, ela aparece na confirmação. Se não tem, o evento é só para adultos.",
    },
    {
      question: "Tem estacionamento?",
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
      { title: "Acalmar o noivo", text: "Manter ele tranquilo (e hidratado) antes da cerimônia." },
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
  gallery: {
    items: Array.from({ length: 8 }, (_, i) => ({
      src: `/placeholder/galeria-${i + 1}.svg`,
      alt: `Foto ${i + 1} do pré-wedding (provisória)`,
      width: i % 3 === 0 ? 1200 : 800,
      height: i % 3 === 0 ? 800 : 1200,
    })),
    officialPhotosSoon: true,
  },
  contact: {
    whatsapp: "",
    email: "",
    message: "Alguma dúvida? Fale com a gente.",
  },
  rsvp: { deadline: "2027-03-10T23:59:59-03:00" },
  seo: {
    title: "Dani & Gustavo | Casamento em 10 de abril de 2027, Volta Redonda, RJ",
    description:
      "Informações, confirmação de presença e lista de presentes do casamento de Dani e Gustavo.",
    ogTitle: "Dani & Gustavo vão casar",
    ogDescription: "10 de abril de 2027, Volta Redonda, RJ. Confirme sua presença pelo site.",
  },
};
