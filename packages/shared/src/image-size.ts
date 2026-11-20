/**
 * Largura e altura de uma imagem a partir dos primeiros bytes do arquivo
 * (JPEG, PNG ou WebP), sem dependência. Serve para o `next/image` saber a
 * proporção das fotos de `public/fotos` sem que alguém precise digitar o
 * tamanho de cada uma em `content/home.ts`.
 */
export type ImageSize = { width: number; height: number };

export function imageSize(buf: Uint8Array): ImageSize | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length < 24) return null;

  // PNG: assinatura de 8 bytes, depois o bloco IHDR com largura e altura.
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  // WebP: "RIFF" .... "WEBP" e um dos três formatos de bloco.
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 4) === "WEBP" && buf.length >= 30) {
    const chunk = ascii(buf, 12, 4);
    if (chunk === "VP8 ") {
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
    if (chunk === "VP8L") {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") {
      const w = buf[24]! | (buf[25]! << 8) | (buf[26]! << 16);
      const h = buf[27]! | (buf[28]! << 8) | (buf[29]! << 16);
      return { width: w + 1, height: h + 1 };
    }
    return null;
  }

  // JPEG: percorre os marcadores até um SOF (início de quadro).
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1]!;
      if (marker === 0xff) {
        i += 1;
        continue;
      }
      const length = view.getUint16(i + 2);
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
      i += 2 + length;
    }
  }
  return null;
}

function ascii(buf: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...buf.subarray(start, start + length));
}
