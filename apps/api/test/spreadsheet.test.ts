import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planImport } from "../src/admin/guest-import.ts";
import {
  buildXlsx,
  decodeText,
  detectDelimiter,
  parseCsv,
  readSpreadsheet,
  readXlsx,
  writeZip,
} from "../src/admin/spreadsheet.ts";

const enc = new TextEncoder();
const EXEMPLO = join(import.meta.dirname, "..", "..", "..", "docs", "exemplos");
const HEADER =
  "convite;lado;nome;tipo;faixa_etaria;telefone;email;acompanhante;max_pessoas;restricao_alimentar";

describe("CSV", () => {
  it("separador ; ou , e aspas com quebra de linha", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter('a,"b;x",c\n')).toBe(",");
    expect(parseCsv('a;"b ""c"";\nd"\r\n1;2\n')).toEqual([
      ["a", 'b "c";\nd'],
      ["1", "2"],
    ]);
  });

  it("UTF-8 com BOM e Windows-1252 do Excel antigo", () => {
    expect(decodeText(enc.encode("\uFEFFFamília"))).toBe("Família");
    expect(decodeText(new Uint8Array([0x46, 0x61, 0x6d, 0xed, 0x6c, 0x69, 0x61]))).toBe("Família");
  });
});

describe("XLSX", () => {
  it("lê o que o próprio gerador escreve (ida e volta)", () => {
    const rows = [
      ["convite", "nome"],
      ["Família <Á & B>", 'Zé "Quinho"'],
    ];
    expect(readXlsx(buildXlsx(rows))).toEqual(rows);
  });

  it("lê um XLSX no formato do Excel: textos compartilhados, números, booleanos e lacunas", () => {
    const x = (s: string) => enc.encode(s);
    const zip = writeZip([
      {
        name: "xl/workbook.xml",
        data: x(
          '<workbook xmlns:r="r"><sheets><sheet name="Lista" sheetId="3" r:id="rId7"/><sheet name="Outra" sheetId="1" r:id="rId1"/></sheets></workbook>',
        ),
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        data: x(
          '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId7" Type="t" Target="worksheets/sheet3.xml"/></Relationships>',
        ),
      },
      {
        name: "xl/sharedStrings.xml",
        data: x(
          '<sst><si><t>convite</t></si><si><r><rPr><b/></rPr><t>Fam</t></r><r><t xml:space="preserve">ília &amp; cia</t></r><rPh><t>ignorar</t></rPh></si><si><t>Ana</t></si></sst>',
        ),
      },
      { name: "xl/worksheets/sheet1.xml", data: x("<worksheet><sheetData/></worksheet>") },
      {
        name: "xl/worksheets/sheet3.xml",
        data: x(
          '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>tel</t></is></c></row>' +
            '<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="s"><v>2</v></c><c r="C3"><v>24999990000</v></c><c r="D3" t="b"><v>1</v></c><c r="E3" s="2"/></row></sheetData></worksheet>',
        ),
      },
    ]);
    expect(readXlsx(zip)).toEqual([
      ["convite", "", "tel"],
      [],
      ["Família & cia", "Ana", "24999990000", "sim", ""],
    ]);
  });

  it("detecta o formato pelo conteúdo e recusa .xls antigo", () => {
    expect(readSpreadsheet(buildXlsx([["a"]])).format).toBe("xlsx");
    expect(readSpreadsheet(enc.encode("a;b")).format).toBe("csv");
    expect(() => readSpreadsheet(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toThrow(/\.xls antigo/);
    expect(() => readSpreadsheet(enc.encode("PK\u0003\u0004lixo"))).toThrow(/corrompido/);
  });
});

const WEDDING_SIDES = [
  { key: "dani", label: "Dani" },
  { key: "gustavo", label: "Gustavo" },
];

describe("planImport", () => {
  const plan = (csv: string, existing: { label: string; guestNames: string[] }[] = []) =>
    planImport("lista.csv", enc.encode(csv), existing, WEDDING_SIDES);

  it("importa o exemplo de 50 convidados (CSV e XLSX) sem erros", () => {
    for (const file of ["convidados-exemplo.csv", "convidados-exemplo.xlsx"]) {
      const p = planImport(file, readFileSync(join(EXEMPLO, file)), [], WEDDING_SIDES).preview;
      expect(p.fileError).toBeNull();
      expect(p.errorCount).toBe(0);
      expect(p.toCreate).toEqual({ invitations: 22, guests: 50 });
    }
  });

  it("agrupa por convite, deduz máximo, acompanhante e contato", () => {
    const { preview, create } = plan(
      `${HEADER}\nFamília Silva;Dani;Ana Silva;adulto;;(24) 99999-0001;ANA@exemplo.com;sim;;\n` +
        "família  silva;dani;Lia Silva;Criança;3 a 7 anos;;;;;Sem lactose\n",
    );
    expect(preview.errorCount).toBe(0);
    expect(create).toHaveLength(1);
    const inv = create[0]!.input;
    expect(inv).toMatchObject({
      label: "Família Silva",
      side: "dani",
      maxGuests: 3,
      allowPlusOne: true,
      contactPhone: "(24) 99999-0001",
      contactEmail: "ana@exemplo.com",
    });
    expect(inv.guests[1]).toMatchObject({
      isChild: true,
      ageRange: "3-7",
      dietaryNotes: "Sem lactose",
    });
  });

  it("aponta erros linha a linha em pt-BR", () => {
    const { preview, create } = plan(
      `${HEADER}\n` +
        ";Dani;Sem Convite;;;;;;;\n" +
        "Família X;Noiva;Ana;adulto;;;;;;\n" +
        "Família X;Dani;B;crianca;;12;email-ruim;talvez;;\n" +
        "Família X;Dani;Ana;adulto;5-9;;;;0;\n" +
        "Família Y;Dani;Bia;;;;;;1;\nFamília Y;Gustavo;Caio;;;;;;;\n",
    );
    expect(create).toHaveLength(0);
    expect(preview.toCreate.invitations).toBe(0);
    const errs = (line: number) => preview.rows.find((r) => r.line === line)!.errors;
    expect(errs(2)).toContain("Falta o nome do convite (coluna convite).");
    expect(errs(3)).toContain("Lado “Noiva” não reconhecido: use Dani ou Gustavo.");
    expect(errs(4)).toEqual(
      expect.arrayContaining([
        "Nome do convidado: informe pelo menos 2 letras.",
        "Criança precisa da faixa etária: 0-2, 3-7 ou 8-12.",
        "Telefone “12” incompleto: informe com DDD.",
        "E-mail “email-ruim” inválido.",
        "Acompanhante “talvez”: use sim ou não.",
      ]),
    );
    expect(errs(5)).toEqual(
      expect.arrayContaining([
        "Faixa etária “5-9” não reconhecida: use 0-2, 3-7 ou 8-12.",
        "Máximo de pessoas “0”: use um número inteiro de 1 a 30.",
        "“Ana” aparece duas vezes no convite “Família X” (linha 3).",
      ]),
    );
    expect(errs(7)).toEqual(
      expect.arrayContaining([
        "O convite “Família Y” está com lados diferentes (veja a linha 6).",
        "O convite “Família Y” tem 2 convidados, mas o máximo de pessoas é 1.",
      ]),
    );
  });

  it("colunas obrigatórias, cabeçalhos alternativos e colunas desconhecidas", () => {
    expect(plan("nome;lado\nAna;Dani\n").preview.fileError).toMatch(
      /Faltam colunas obrigatórias: convite/,
    );
    const p = plan(
      "Grupo,Lado,Convidado,E-mail,Cor favorita\nCasa,Gustavo,Rui Lima,,azul\n",
    ).preview;
    expect(p.errorCount).toBe(0);
    expect(p.warnings).toContain("Coluna “Cor favorita” não reconhecida: foi ignorada.");
    expect(plan(HEADER).preview.fileError).toMatch(/só tem o cabeçalho/);
  });

  it("reimportar não duplica: convite com o mesmo nome é ignorado com aviso", () => {
    const csv = `${HEADER}\nFamília Silva;Dani;Ana Silva;;;;;;;\nOutro;Dani;Ana Souza;;;;;;;\n`;
    const { preview, create } = plan(csv, [
      { label: "FAMILIA SILVA", guestNames: ["Ana Silva"] },
      { label: "Vizinhos", guestNames: ["Ana Souza"] },
    ]);
    expect(preview.duplicates).toEqual({ invitations: 1, guests: 1 });
    expect(preview.toCreate).toEqual({ invitations: 1, guests: 1 });
    expect(create.map((c) => c.input.label)).toEqual(["Outro"]);
    expect(preview.rows[0]!.duplicate).toBe(true);
    expect(preview.warnings).toEqual(
      expect.arrayContaining([
        "O convite “FAMILIA SILVA” já existe no painel: as linhas 2 serão ignoradas.",
        "Linha 3: “Ana Souza” já está no convite “Vizinhos” do painel. Confira se não é a mesma pessoa.",
      ]),
    );
  });
});
