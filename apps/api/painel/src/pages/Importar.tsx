import {
  IMPORT_COLUMNS,
  IMPORT_MAX_BYTES,
  type ImportPreview,
  type ImportResult,
} from "@casamento/shared";
import { useState } from "react";
import { api, errorMessage } from "../api.ts";
import { plural } from "../format.ts";
import { Badge, FormError, PageHeader, useToast } from "../ui.tsx";
import "../tools.css";
import { ea, eh } from "../nav.ts";

/* Importar convidados de CSV ou XLSX: escolher → prévia validada → confirmar. */

export function Importar() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<null | "preview" | "import">(null);
  const [error, setError] = useState<string | null>(null);

  const post = async <T,>(path: string, f: File) => {
    const form = new FormData();
    form.append("file", f);
    return api<T>(`/invitations/import${path}`, { method: "POST", body: form });
  };

  async function choose(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview(null);
    setResult(null);
    setError(null);
    if (f.size > IMPORT_MAX_BYTES) {
      setError("O arquivo passa de 2 MB. Divida a planilha.");
      return;
    }
    setBusy("preview");
    try {
      setPreview((await post<{ preview: ImportPreview }>("/preview", f)).preview);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!file) return;
    setBusy("import");
    setError(null);
    try {
      const r = (await post<{ result: ImportResult }>("", file)).result;
      setResult(r);
      setPreview(null);
      toast(`${plural(r.created.invitations, "convite importado", "convites importados")}.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const withErrors = preview?.rows.filter((r) => r.errors.length > 0) ?? [];
  const canImport =
    !!preview && !preview.fileError && preview.errorCount === 0 && preview.toCreate.invitations > 0;

  return (
    <div className="stack stack--lg">
      <a className="back" href={eh("/convites")}>
        ← Convites
      </a>
      <PageHeader
        title="Importar convidados"
        subtitle="Planilha CSV ou XLSX, uma linha por pessoa. Nada é gravado antes da sua confirmação."
      />

      {result && (
        <section className="alert alert--ok stack" role="status" aria-labelledby="imp-ok">
          <h2 id="imp-ok">Importação concluída</h2>
          <p>
            {plural(result.created.invitations, "convite criado", "convites criados")} com{" "}
            {plural(result.created.guests, "pessoa", "pessoas")}.
            {result.skipped.invitations > 0 &&
              ` ${plural(result.skipped.invitations, "convite já existia e foi ignorado", "convites já existiam e foram ignorados")}.`}
          </p>
          <div className="actions">
            <a className="button" href={eh("/convites")}>
              Ver convites
            </a>
            <a
              className="button button--ghost"
              href={eh(`/convites/qr?ids=${result.ids.join(",")}`)}
            >
              Imprimir QR dos novos convites
            </a>
          </div>
        </section>
      )}

      <section className="card stack" aria-labelledby="imp-arquivo">
        <h2 id="imp-arquivo">Escolha a planilha</h2>
        <div className="actions">
          <label className="button file-button">
            {busy === "preview"
              ? "Lendo a planilha…"
              : file
                ? "Escolher outro arquivo"
                : "Escolher arquivo"}
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={busy !== null}
              onChange={(e) => {
                void choose(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <a className="button button--ghost" href={ea("/invitations/import/modelo.xlsx")} download>
            Baixar modelo (XLSX)
          </a>
          <a className="button button--ghost" href={ea("/invitations/import/modelo.csv")} download>
            Baixar modelo (CSV)
          </a>
        </div>
        {file && <p className="muted small">Arquivo: {file.name}</p>}
        <FormError message={error} />
      </section>

      {preview && (
        <section className="card stack" aria-labelledby="imp-previa">
          <h2 id="imp-previa">Prévia</h2>
          {preview.fileError ? (
            <p className="alert alert--error" role="alert">
              {preview.fileError}
            </p>
          ) : (
            <>
              <dl className="tally">
                <div>
                  <dt>Convites novos</dt>
                  <dd>{preview.toCreate.invitations}</dd>
                </div>
                <div>
                  <dt>Pessoas</dt>
                  <dd>{preview.toCreate.guests}</dd>
                </div>
                <div>
                  <dt>Já no painel</dt>
                  <dd>{preview.duplicates.invitations}</dd>
                </div>
                <div>
                  <dt>Erros</dt>
                  <dd className={preview.errorCount ? "tone-error" : undefined}>
                    {preview.errorCount}
                  </dd>
                </div>
              </dl>
              {preview.errorCount > 0 && (
                <div className="alert alert--error stack" role="alert">
                  <p>
                    <strong>
                      {plural(withErrors.length, "linha precisa", "linhas precisam")} de correção.
                    </strong>{" "}
                    Corrija na planilha, salve e escolha o arquivo de novo.
                  </p>
                  <ul className="plain error-list">
                    {withErrors.map((r) => (
                      <li key={r.line}>
                        <strong>Linha {r.line}</strong>
                        {r.name ? ` (${r.name})` : ""}: {r.errors.join(" ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.warnings.length > 0 && (
                <div className="alert alert--info">
                  <ul className="plain">
                    {preview.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="table-wrap">
                <table className="table table--import">
                  <thead>
                    <tr>
                      <th scope="col">Linha</th>
                      <th scope="col">Situação</th>
                      <th scope="col">Convite</th>
                      <th scope="col">Nome</th>
                      <th scope="col">Lado</th>
                      <th scope="col">Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.line} className={r.errors.length ? "row-error" : undefined}>
                        <td>
                          <span className="muted small">Linha </span>
                          {r.line}
                        </td>
                        <td>
                          {r.errors.length ? (
                            <Badge tone="error">{plural(r.errors.length, "erro", "erros")}</Badge>
                          ) : r.duplicate ? (
                            <Badge tone="muted">Já existe</Badge>
                          ) : (
                            <Badge tone="ok">Pronto</Badge>
                          )}
                        </td>
                        <td>{r.invitation || "—"}</td>
                        <td>{r.name || "—"}</td>
                        <td>{r.side || "—"}</td>
                        <td>{r.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="actions">
            <button className="button" disabled={!canImport || busy !== null} onClick={confirm}>
              {busy === "import"
                ? "Importando…"
                : canImport
                  ? `Importar ${plural(preview.toCreate.invitations, "convite", "convites")} (${plural(preview.toCreate.guests, "pessoa", "pessoas")})`
                  : "Importar"}
            </button>
            {!canImport && !preview.fileError && preview.errorCount === 0 && (
              <p className="muted small">
                Nada novo para importar: todos os convites já estão no painel.
              </p>
            )}
          </div>
        </section>
      )}

      <section className="card stack" aria-labelledby="imp-colunas">
        <h2 id="imp-colunas">Colunas da planilha</h2>
        <p className="muted small">
          A primeira linha tem os nomes das colunas (maiúsculas e acentos não importam). Linhas com
          o mesmo <strong>convite</strong> viram um convite só. Convite com nome igual a um que já
          está no painel é ignorado, então dá para reimportar a mesma planilha sem duplicar.
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Coluna</th>
                <th scope="col">Obrigatória</th>
                <th scope="col">O que preencher</th>
              </tr>
            </thead>
            <tbody>
              {IMPORT_COLUMNS.map((c) => (
                <tr key={c.key}>
                  <td>
                    <code>{c.key}</code>
                  </td>
                  <td>{c.required ? "Sim" : "Não"}</td>
                  <td>{c.help}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          No Excel, salve como <strong>Pasta de Trabalho do Excel (.xlsx)</strong> ou{" "}
          <strong>CSV (separado por vírgulas)</strong>; o CSV do Excel em português usa ponto e
          vírgula e funciona do mesmo jeito. Do Google Planilhas: Arquivo → Fazer download → .xlsx
          ou .csv. Arquivo .xls antigo não é aceito. Até 1.000 pessoas por arquivo.
        </p>
      </section>
    </div>
  );
}
