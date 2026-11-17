/**
 * Fotos da página /galeria. Mesmo esquema de content/home.ts: coloque o
 * arquivo em `apps/web/public/fotos/` e acrescente uma linha aqui. A ordem
 * da lista é a ordem na página (em colunas, de cima para baixo).
 *
 * `legenda` é opcional (aparece em itálico embaixo da polaroid).
 */
import type { Foto } from "./home";

export const galeria = {
  titulo: "Galeria",
  /** Frase abaixo do título enquanto as fotos oficiais não chegam. */
  avisoPreWedding:
    "Por enquanto, o pré-wedding. As fotos oficiais chegam aqui em breve, depois do casamento.",
  fotos: [
    { arquivo: "dsc06378.jpg", alt: "Casal caminhando no campo dourado ao pôr do sol" },
    { arquivo: "dsc06230.jpg", alt: "Abraço testa com testa na luz dourada" },
    { arquivo: "dsc04828copiar.jpg", alt: "Close do casal em preto e branco" },
    { arquivo: "dsc06264.jpg", alt: "Casal de costas, de mãos dadas, olhando o pôr do sol" },
    { arquivo: "img_7871.jpg", alt: "Casal abraçado, com o sol se pondo atrás" },
    { arquivo: "dsc04745.jpg", alt: "Casal de mãos dadas, ela olhando para a câmera" },
    { arquivo: "dsc05667.jpg", alt: "Beijo do casal com as montanhas ao fundo" },
    { arquivo: "img_8083.jpg", alt: "Casal de branco caminhando de mãos dadas no crepúsculo azul" },
    { arquivo: "dsc06205.jpg", alt: "Close do casal na luz de fim de tarde" },
    { arquivo: "dsc04934.jpg", alt: "Casal rindo, caminhando entre os pinheiros" },
    { arquivo: "dsc06384.jpg", alt: "Casal de costas caminhando no capim dourado" },
    { arquivo: "img_8038.jpg", alt: "Silhuetas do casal no céu do entardecer" },
    { arquivo: "dsc065521.jpg", alt: "Casal no topo do morro sob céu azul intenso" },
    { arquivo: "dsc05197.jpg", alt: "Casal abraçado no bosque de pinheiros" },
    { arquivo: "img_7977.jpg", alt: "Casal pequeno no topo da pedra, com trilha e montanhas" },
    { arquivo: "dsc06040.jpg", alt: "Beijo do casal com o véu ao vento" },
    { arquivo: "img-20261117-wa0020.jpg", alt: "Casal de braços dados, rindo, no bosque" },
    { arquivo: "dsc06216.jpg", alt: "Casal abraçado ao pé do Cristo, sob céu azul" },
    { arquivo: "dsc05969.jpg", alt: "Casal de branco se beijando no campo dourado" },
    { arquivo: "dsc04643.jpg", alt: "Casal abraçado na trilha entre os pinheiros" },
    { arquivo: "dsc062981.jpg", alt: "Casal caminhando de mãos dadas no calçamento de pedra" },
    { arquivo: "img_8091.jpg", alt: "Casal abraçado à noite, em preto e branco" },
    { arquivo: "dsc06398.jpg", alt: "Casal caminhando no capim, em direção ao pôr do sol" },
    { arquivo: "img-20261117-wa0019.jpg", alt: "Casal abraçado no bosque, ela sorrindo" },
    { arquivo: "dsc05465.jpg", alt: "Casal em preto e branco ao lado de um carro antigo" },
    { arquivo: "dsc06426.jpg", alt: "Casal de costas caminhando no campo ao entardecer" },
    { arquivo: "img_7846.jpg", alt: "Casal de costas na estrada de terra, com o sol se pondo" },
  ] satisfies (Foto & { legenda?: string })[] as (Foto & { legenda?: string })[],
};
