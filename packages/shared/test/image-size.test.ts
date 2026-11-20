import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { imageSize } from "../src/image-size.ts";

describe("imageSize", () => {
  it("lê o tamanho de um PNG", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer);
    view.setUint32(16, 640);
    view.setUint32(20, 480);
    expect(imageSize(png)).toEqual({ width: 640, height: 480 });
  });

  it("lê o tamanho de um JPEG mínimo (APP0 e depois SOF0)", () => {
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58,
      0x03, 0x20, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01,
    ]);
    expect(imageSize(jpeg)).toEqual({ width: 800, height: 600 });
  });

  it("devolve null para o que não reconhece", () => {
    expect(imageSize(new Uint8Array(40))).toBeNull();
  });

  // Fotos reais do casamento (importadas pelo content:import-legacy).
  const dir = join(__dirname, "..", "..", "db", "legacy", "dani-gustavo", "fotos");
  it.skipIf(!existsSync(dir))("lê todas as fotos do casamento", () => {
    const files = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const size = imageSize(readFileSync(join(dir, f)));
      expect(size, f).not.toBeNull();
      expect(size!.width, f).toBeGreaterThan(100);
      expect(size!.height, f).toBeGreaterThan(100);
    }
  });
});
