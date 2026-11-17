import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

/*
 * Planilhas sem dependência: leitor de CSV (vírgula, ponto e vírgula ou tab; UTF-8 com ou
 * sem BOM, ou Windows-1252 do Excel antigo), leitor mínimo de XLSX (zip pelo diretório
 * central + inflateRaw do node:zlib; primeira planilha, textos compartilhados e inline) e
 * um gerador de XLSX simples para o modelo de importação.
 */

export class SpreadsheetError extends Error {}

/* ------------------------------------------------------------------ texto e CSV */

/** UTF-8 (com ou sem BOM); se não for UTF-8 válido, Windows-1252 (CSV antigo do Excel). */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Separador mais frequente na primeira linha, fora de aspas (o Excel pt-BR usa ";"). */
export function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch in counts) counts[ch]!++;
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]!;
  return n > 0 ? best : ",";
}

/** CSV (RFC 4180): aspas duplas, "" dentro de aspas, quebras de linha CRLF ou LF. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/* ------------------------------------------------------------------ ZIP */

const MAX_ENTRY_BYTES = 20 * 1024 * 1024;

/** Lê os arquivos de um ZIP pelo diretório central (o mesmo caminho que o Excel usa). */
export function readZip(bytes: Uint8Array): Map<string, () => Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new SpreadsheetError("Arquivo XLSX corrompido (fim do ZIP não encontrado).");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map<string, () => Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) {
      throw new SpreadsheetError("Arquivo XLSX corrompido (diretório do ZIP inválido).");
    }
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    files.set(name, () => {
      if (view.getUint32(local, true) !== 0x04034b50) {
        throw new SpreadsheetError("Arquivo XLSX corrompido (entrada do ZIP inválida).");
      }
      const start =
        local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + compressed);
      if (method === 0) return data;
      if (method !== 8) throw new SpreadsheetError("XLSX com compressão não suportada.");
      try {
        return new Uint8Array(inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES }));
      } catch {
        throw new SpreadsheetError("Não deu para descompactar o XLSX. Salve de novo no Excel.");
      }
    });
  }
  return files;
}

/** ZIP com compressão deflate (para o modelo XLSX). */
export function writeZip(entries: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = enc.encode(name);
    const packed = new Uint8Array(deflateRawSync(data));
    const crc = crc32(data);
    const head = new Uint8Array(30 + nameBytes.length);
    const h = new DataView(head.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true); // nomes em UTF-8
    h.setUint16(8, 8, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, packed.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, nameBytes.length, true);
    head.set(nameBytes, 30);
    const dir = new Uint8Array(46 + nameBytes.length);
    const d = new DataView(dir.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x0800, true);
    d.setUint16(10, 8, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, packed.length, true);
    d.setUint32(24, data.length, true);
    d.setUint16(28, nameBytes.length, true);
    d.setUint32(42, offset, true);
    dir.set(nameBytes, 46);
    locals.push(head, packed);
    central.push(dir);
    offset += head.length + packed.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  const parts = [...locals, ...central, end];
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

/* ------------------------------------------------------------------ XLSX */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function xmlDecode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

const xmlEncode = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Texto de um <si> ou <is>: junta os <t> (inclusive dos trechos formatados), sem fonética. */
function richText(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of clean.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += m[1];
  return xmlDecode(out);
}

/** "AB12" → índice da coluna (0 = A). */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "").toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Primeira planilha do XLSX como linhas de texto. A linha i do resultado é a linha i+1 do
 * Excel (linhas vazias viram arrays vazios), para os erros apontarem a linha certa.
 */
export function readXlsx(bytes: Uint8Array): string[][] {
  const files = readZip(bytes);
  const text = (name: string) => {
    const get = files.get(name);
    return get ? new TextDecoder().decode(get()) : null;
  };

  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbook = text("xl/workbook.xml");
  const rels = text("xl/_rels/workbook.xml.rels");
  const firstSheet = workbook && /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  if (firstSheet && rels) {
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      if (m[0].includes(`Id="${firstSheet}"`)) {
        const target = /Target="([^"]+)"/.exec(m[0])?.[1];
        if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
      }
    }
  }
  const sheet = text(sheetPath);
  if (!sheet) throw new SpreadsheetError("O XLSX não tem planilha. Salve de novo no Excel.");

  const shared: string[] = [];
  const sst = text("xl/sharedStrings.xml");
  if (sst)
    for (const m of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(richText(m[1]!));

  const rows: string[][] = [];
  let nextRow = 0;
  for (const m of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rAttr = /\br="(\d+)"/.exec(m[1]!)?.[1];
    const index = rAttr ? Number(rAttr) - 1 : nextRow;
    nextRow = index + 1;
    const cells: string[] = [];
    let nextCol = 0;
    for (const c of (m[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!;
      const ref = /\br="([A-Z]+\d*)"/i.exec(attrs)?.[1];
      const col = ref ? columnIndex(ref) : nextCol;
      nextCol = col + 1;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      const body = c[2] ?? "";
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr")
        value = richText(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "");
      else if (type === "b") value = v === "1" ? "sim" : "não";
      else value = v === undefined ? "" : xmlDecode(v);
      while (cells.length < col) cells.push("");
      cells[col] = value;
    }
    while (rows.length < index) rows.push([]);
    rows[index] = cells;
  }
  return rows;
}

/** XLSX de uma planilha só, com texto inline e a primeira linha em negrito. */
export function buildXlsx(rows: string[][], sheetName = "Convidados"): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const colName = (i: number) => {
    let s = "";
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
      s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  };
  const sheetRows = rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">` +
        row
          .map(
            (v, c) =>
              `<c r="${colName(c)}${r + 1}" t="inlineStr"${r === 0 ? ' s="1"' : ""}>` +
              `<is><t xml:space="preserve">${xmlEncode(v)}</t></is></c>`,
          )
          .join("") +
        "</row>",
    )
    .join("");
  const widths = (rows[0] ?? [])
    .map((_, c) => {
      const w = Math.min(40, Math.max(10, ...rows.map((r) => (r[c] ?? "").length + 2)));
      return `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`;
    })
    .join("");
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const files: Record<string, string> = {
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      "</Types>",
    "_rels/.rels":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      `<Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/>` +
      "</Relationships>",
    "xl/workbook.xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${ns} xmlns:r="${rel}">` +
      `<sheets><sheet name="${xmlEncode(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      `<Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/>` +
      "</Relationships>",
    "xl/styles.xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ${ns}>` +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      "</styleSheet>",
    "xl/worksheets/sheet1.xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${ns}>` +
      `<cols>${widths}</cols><sheetData>${sheetRows}</sheetData></worksheet>`,
  };
  return writeZip(Object.entries(files).map(([name, xml]) => ({ name, data: enc.encode(xml) })));
}

/** Detecta pelo conteúdo: ZIP (PK) é XLSX; o resto é tratado como CSV. */
export function readSpreadsheet(bytes: Uint8Array): { format: "csv" | "xlsx"; rows: string[][] } {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return { format: "xlsx", rows: readXlsx(bytes) };
  }
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    throw new SpreadsheetError(
      "Formato .xls antigo não é aceito. No Excel, use Salvar como → Pasta de Trabalho (.xlsx) ou CSV.",
    );
  }
  return { format: "csv", rows: parseCsv(decodeText(bytes)) };
}
