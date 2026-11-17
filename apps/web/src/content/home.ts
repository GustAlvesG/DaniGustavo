/**
 * ============================================================================
 *  CONTEÚDO DA PÁGINA INICIAL (textos, fotos e ordem das seções)
 * ============================================================================
 *
 * Este arquivo é para editar à vontade. Tudo o que é "apresentação" da home
 * mora aqui; os DADOS DO EVENTO (data, local, programação, traje, perguntas,
 * hospedagem, contato e prazo da confirmação) vêm do banco, pela API, e se
 * editam no seed ou no painel (veja docs/PERSONALIZAR.md).
 *
 * Regrinhas:
 *  - Fotos: coloque o arquivo em `apps/web/public/fotos/` e escreva só o nome
 *    (ex.: "dsc06378.jpg"). Largura e altura são lidas do próprio arquivo.
 *  - `alt`: descreva a foto para quem usa leitor de tela (curto, sem "foto de").
 *  - `posicao`: qual parte da foto fica visível quando ela é cortada
 *    (CSS object-position). "center 30%" = centro na horizontal, 30% do topo.
 *    Use quando um rosto estiver sendo cortado.
 *  - Palavras entre *asteriscos* nos títulos saem em itálico azul.
 *  - {prazo} é trocado pela data limite da confirmação (vinda do banco).
 *  - Salvou, o `pnpm dev` atualiza a página sozinho.
 */

/** Uma foto de `public/fotos`. */
export type Foto = {
  /** Nome do arquivo em apps/web/public/fotos (ex.: "dsc06378.jpg"). */
  arquivo: string;
  /** Descrição para leitor de tela. */
  alt: string;
  /** Parte da foto que aparece no corte (CSS object-position). Padrão: "center". */
  posicao?: string;
};

/** Seções da home. Mude a ordem ou apague uma linha para esconder a seção. */
export type SecaoHome =
  | "historia"
  | "album"
  | "casamento"
  | "versiculo"
  | "programacao"
  | "traje"
  | "presentes"
  | "recados"
  | "rsvp"
  | "duvidas";

/** Cabeçalho comum das seções. */
type Cabecalho = {
  /** Texto do item no menu do topo. Sem ele, a seção não aparece no menu. */
  menu?: string;
  /** Destino do item do menu (padrão: a âncora da seção na home). */
  menuLink?: string;
  /** Rótulo pequeno acima do título (sai como "Página 1 · Nossa história"). */
  rotulo: string;
  /** Título grande. *Palavra* sai em itálico azul. */
  titulo: string;
  /** Frase abaixo do título (opcional). */
  lead?: string;
};

/** Cabeçalho mais os campos próprios de cada seção. */
type Secao = Cabecalho & { [campo: string]: unknown };

export const home = {
  /** Ordem das seções. Apague uma linha para esconder a seção. */
  secoes: [
    "historia",
    "album",
    "casamento",
    "versiculo",
    "programacao",
    "traje",
    "presentes",
    "recados",
    "rsvp",
    "duvidas",
  ] satisfies SecaoHome[] as SecaoHome[],

  /** Numerar os rótulos como páginas de álbum ("Página 1 · ..."). */
  numerarPaginas: true,

  // --------------------------------------------------------------------------
  // Topo (hero): foto de fundo, nomes, data e contagem regressiva.
  // Nomes, data e local vêm do banco.
  // --------------------------------------------------------------------------
  hero: {
    /** Linha pequena acima dos nomes. */
    chamada: "Vamos nos casar",
    /** Foto de fundo em telas largas (computador, tablet deitado). Prefira foto deitada. */
    fotoDesktop: {
      arquivo: "dsc06378.jpg",
      alt: "Dani e Gustavo caminhando num campo dourado ao pôr do sol, com montanhas ao fundo",
      posicao: "center 55%",
    } satisfies Foto,
    /** Foto de fundo no celular (até 700px de largura). Prefira foto em pé. */
    fotoCelular: {
      arquivo: "dsc06264.jpg",
      alt: "Dani e Gustavo de costas, de mãos dadas, olhando o pôr do sol nas montanhas",
      posicao: "center 45%",
    } satisfies Foto,
    contador: {
      titulo: "Faltam para o nosso sim",
      /** Mensagem no dia do casamento, depois do horário. */
      hoje: "É hoje! Nos vemos no altar.",
      /** Mensagem depois do casamento ({data} = data do casamento). */
      depois: "Casamos em {data}. Obrigado por fazer parte.",
    },
  },

  // --------------------------------------------------------------------------
  // Nossa história: as polaroids com ano, título e texto.
  // --------------------------------------------------------------------------
  historia: {
    menu: "História",
    rotulo: "Nossa história",
    titulo: "Dez anos *colados* no mesmo álbum",
    lead: "Alguns momentos que nos trouxeram até aqui.",
    // TODO(conteudo): conferir anos e textos com o casal.
    momentos: [
      {
        ano: "2016",
        titulo: "A gente se conheceu",
        texto: "Foi num churrasco de amigos. Falamos a noite toda sobre nada.",
        foto: { arquivo: "dsc06205.jpg", alt: "Close do casal na luz de fim de tarde" },
      },
      {
        ano: "2017",
        titulo: "Primeiro encontro de verdade",
        texto: "Um café que durou quatro horas. O garçom já tinha desistido de nós.",
        foto: {
          arquivo: "img_7871.jpg",
          alt: "Casal abraçado olhando-se, com o sol se pondo atrás",
          posicao: "40% center",
        },
      },
      {
        ano: "2020",
        titulo: "Casa nova",
        texto: "Duas pessoas, um gato e caixas por todo lado.",
        foto: { arquivo: "dsc06384.jpg", alt: "Casal de costas caminhando no capim dourado" },
      },
      {
        ano: "2023",
        titulo: "A viagem longa",
        texto: "Pegamos o mapa errado e foi o melhor dia da viagem.",
        foto: {
          arquivo: "img_7977.jpg",
          alt: "Casal pequeno no topo da pedra, com trilha e montanhas",
        },
      },
      {
        ano: "2026",
        titulo: "O pedido",
        texto: "Ela disse sim antes de ele terminar a frase.",
        foto: { arquivo: "dsc05969.jpg", alt: "Casal de branco se beijando no campo dourado" },
      },
    ],
  },

  // --------------------------------------------------------------------------
  // Do nosso álbum: fotos soltas com legenda (a altura segue cada foto).
  // --------------------------------------------------------------------------
  album: {
    rotulo: "Pelo caminho",
    titulo: "Do nosso *álbum*",
    fotos: [
      {
        arquivo: "dsc06230.jpg",
        alt: "Abraço testa com testa na luz dourada, montanhas ao fundo",
        legenda: "Luz de fim de tarde",
      },
      {
        arquivo: "dsc04828copiar.jpg",
        alt: "Close do casal em preto e branco",
        legenda: "Em preto e branco",
      },
      {
        arquivo: "dsc06264.jpg",
        alt: "Casal de costas, de mãos dadas, olhando o pôr do sol nas montanhas",
        legenda: "Olhando na mesma direção",
      },
      {
        arquivo: "img_8091.jpg",
        alt: "Casal abraçado à noite, em preto e branco",
        legenda: "Depois que o sol foi embora",
      },
      {
        arquivo: "dsc04745.jpg",
        alt: "Casal de mãos dadas, ela olhando para a câmera",
        legenda: "De mãos dadas",
      },
      {
        arquivo: "dsc06378.jpg",
        alt: "Casal caminhando no campo dourado ao pôr do sol",
        legenda: "O campo dourado",
      },
    ] satisfies (Foto & { legenda: string })[],
    /** Link no fim da seção para a página com todas as fotos (vazio = sem link). */
    linkGaleria: "Ver todas as fotos",
  },

  // --------------------------------------------------------------------------
  // O casamento: data, local e hospedagem vêm do banco. O título é montado
  // com a data ("Sábado, *10 de abril* de 2027").
  // --------------------------------------------------------------------------
  casamento: {
    menu: "O casamento",
    rotulo: "O casamento",
    lead: "Cerimônia e recepção no mesmo lugar, em Volta Redonda.",
    foto: {
      arquivo: "img_8083.jpg",
      alt: "Casal de branco caminhando de mãos dadas no crepúsculo azul",
      posicao: "center 40%",
    } satisfies Foto,
    legendaFoto: "Até lá, contando os dias.",
    tituloHospedagem: "Onde ficar",
  },

  // --------------------------------------------------------------------------
  // Versículo sobre foto. Cada item de `linhas` aparece em sequência.
  // --------------------------------------------------------------------------
  versiculo: {
    foto: {
      arquivo: "img_8038.jpg",
      alt: "Silhuetas do casal frente a frente no céu do entardecer",
      posicao: "center 40%",
    } satisfies Foto,
    linhas: [
      "“Para que todos vejam, e saibam,",
      "e considerem, e juntamente entendam",
      "que a mão do Senhor fez isto.”",
    ],
    referencia: "Isaías 41:20",
  },

  // --------------------------------------------------------------------------
  // Programação: os horários vêm do banco.
  // --------------------------------------------------------------------------
  programacao: {
    menu: "Programação",
    rotulo: "Programação",
    titulo: "O dia, *hora a hora*",
    lead: "Os horários depois da cerimônia são uma estimativa.",
  },

  // --------------------------------------------------------------------------
  // Traje: cores e o que evitar vêm do banco.
  // --------------------------------------------------------------------------
  traje: {
    menu: "Traje",
    rotulo: "Dress code",
    titulo: "Traje passeio, *em tons de azul*",
    lead: "Pode escolher o seu azul, com detalhes brancos.",
    foto: {
      arquivo: "dsc065521.jpg",
      alt: "Casal em pé no topo do morro sob céu azul intenso",
      posicao: "center 30%",
    } satisfies Foto,
  },

  // --------------------------------------------------------------------------
  // Presentes: a chamada para a lista em /presentes. Com `botoes` vazio, aparece o aviso.
  // --------------------------------------------------------------------------
  presentes: {
    menu: "Presentes",
    /** O item do menu leva direto à lista, não à seção da home. */
    menuLink: "/presentes",
    rotulo: "Presentes",
    titulo: "Presença é o que *mais importa*",
    texto:
      "Se quiser nos presentear, a lista está aqui no site. Você escolhe um item para a casa nova ou para a lua de mel, ou contribui com o valor que quiser, no Pix ou no cartão.",
    foto: {
      arquivo: "dsc06230.jpg",
      alt: "Abraço testa com testa na luz dourada",
    } satisfies Foto,
    legendaFoto: "Obrigado por fazer parte",
    botoes: [{ texto: "Ver a lista de presentes", link: "/presentes" }] as {
      texto: string;
      link: string;
    }[],
    aviso: "A lista de presentes abre em breve, aqui mesmo.",
  },

  // --------------------------------------------------------------------------
  // Recados: os últimos recados aprovados no painel (o mural todo fica em /recados;
  // os textos dessa página e do formulário estão em content/paginas.ts).
  // --------------------------------------------------------------------------
  recados: {
    menu: "Recados",
    /** O item do menu leva direto ao mural, não à seção da home. */
    menuLink: "/recados",
    rotulo: "Mural de recados",
    titulo: "Palavras de *quem nos quer bem*",
    lead: "Os recados que chegam ficam aqui depois que a gente lê.",
    /** Quantos recados aparecem na home (o resto fica em /recados). */
    quantidade: 3,
    verMural: "Ver o mural todo",
    escrever: "Deixar um recado",
    /** Quando ainda não há recado aprovado. */
    vazio: "Ainda não tem recado por aqui. Que tal ser a primeira pessoa a escrever?",
  },

  // --------------------------------------------------------------------------
  // Confirmação de presença: a resposta de verdade é em /confirmar (busca
  // pelo nome) ou pelo link do convite (/c/...). Aqui é só o convite a ir.
  // --------------------------------------------------------------------------
  rsvp: {
    rotulo: "Confirmação",
    titulo: "Conta pra gente se *você vem*",
    texto: "Responda até {prazo}. Depois dessa data, fale direto com a gente.",
    fotos: [
      { arquivo: "dsc06384.jpg", alt: "" },
      { arquivo: "dsc05969.jpg", alt: "" },
    ] satisfies Foto[],
    cartao: {
      titulo: "Cartão-resposta",
      texto:
        "Digite seu nome como está no convite e responda por todos do seu convite de uma vez. Leva um minuto, e dá para mudar depois.",
      botao: "Confirmar presença",
    },
  },

  // --------------------------------------------------------------------------
  // Dúvidas: perguntas e respostas vêm do banco; o contato também.
  // --------------------------------------------------------------------------
  duvidas: {
    menu: "Dúvidas",
    rotulo: "Dúvidas",
    titulo: "Perguntas *frequentes*",
  },

  // --------------------------------------------------------------------------
  // Menu do topo e rodapé.
  // --------------------------------------------------------------------------
  menu: {
    /** Botão de destaque no menu (leva a /confirmar). */
    cta: "Confirmar presença",
    /** Links extras, depois das seções (páginas internas). */
    extras: [{ texto: "Galeria", link: "/galeria" }],
  },
  rodape: {
    /** Frase em itálico no rodapé. */
    frase: "“…que a mão do Senhor fez isto.” Isaías 41:20",
    links: [
      { texto: "Galeria", link: "/galeria" },
      { texto: "Lista de presentes", link: "/presentes" },
      { texto: "Mural de recados", link: "/recados" },
      { texto: "Manual dos padrinhos", link: "/padrinhos" },
      { texto: "Confirmar presença", link: "/confirmar" },
    ],
  },
} satisfies {
  secoes: SecaoHome[];
  historia: Secao & {
    momentos: { ano: string; titulo: string; texto: string; foto: Foto }[];
  };
  album: Secao;
  casamento: Omit<Secao, "titulo">;
  programacao: Secao;
  traje: Secao;
  presentes: Secao;
  recados: Secao & { quantidade: number };
  rsvp: Secao;
  duvidas: Secao;
  [k: string]: unknown;
};

export type HomeContent = typeof home;
