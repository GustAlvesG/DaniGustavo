import {
  COMPANY_TYPES,
  COMPANY_TYPE_LABELS,
  PaymentAccountInput,
  type CompanyType,
  type PaymentAccountPersonType,
} from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { errorMessage } from "../api.ts";
import { parseBRL } from "../format.ts";
import { Field, FormError } from "../ui.tsx";

/*
 * Fase 5, frente C: formulário de cadastro da subconta (organização ou anfitrião). Os dados
 * vão ao provedor e não ficam no nosso banco (só nome, e-mail e o documento mascarado), então
 * o formulário avisa isso e valida com o mesmo schema da API antes de enviar.
 */

interface Draft {
  personType: PaymentAccountPersonType;
  name: string;
  document: string;
  email: string;
  mobilePhone: string;
  birthDate: string;
  companyType: CompanyType | "";
  income: string;
  postalCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
}

const EMPTY: Draft = {
  personType: "individual",
  name: "",
  document: "",
  email: "",
  mobilePhone: "",
  birthDate: "",
  companyType: "",
  income: "",
  postalCode: "",
  street: "",
  number: "",
  complement: "",
  district: "",
};

export function ContaRecebimentoForm({
  onSubmit,
  submitLabel = "Cadastrar conta",
  defaults,
}: {
  onSubmit: (input: PaymentAccountInput) => Promise<void>;
  submitLabel?: string;
  defaults?: Partial<Pick<Draft, "name" | "email">>;
}) {
  const [d, setD] = useState<Draft>({ ...EMPTY, ...defaults });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const company = d.personType === "company";
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setD((cur) => ({ ...cur, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const income = parseBRL(d.income);
    const parsed = PaymentAccountInput.safeParse({
      personType: d.personType,
      name: d.name,
      document: d.document,
      email: d.email,
      mobilePhone: d.mobilePhone,
      birthDate: company ? undefined : d.birthDate || undefined,
      companyType: company ? d.companyType || undefined : undefined,
      incomeCents: income ?? undefined,
      address: {
        postalCode: d.postalCode,
        street: d.street,
        number: d.number,
        complement: d.complement || undefined,
        district: d.district,
      },
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Confira os dados do formulário.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate aria-labelledby="conta-form">
      <div>
        <h2 id="conta-form">Cadastrar conta de recebimento</h2>
        <p className="muted small">
          Estes dados vão direto ao provedor de pagamento, que cria a conta e analisa o cadastro. O
          painel guarda só o nome, o e-mail e o final do documento.
        </p>
      </div>
      <div className="form-grid">
        <Field label="Tipo de conta">
          <select
            value={d.personType}
            onChange={(e) => set("personType", e.target.value as PaymentAccountPersonType)}
          >
            <option value="individual">Pessoa física</option>
            <option value="company">Pessoa jurídica</option>
          </select>
        </Field>
        <Field label={company ? "Razão social" : "Nome completo"}>
          <input value={d.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" />
        </Field>
        <Field label={company ? "CNPJ" : "CPF"}>
          <input
            inputMode="numeric"
            value={d.document}
            onChange={(e) => set("document", e.target.value)}
            autoComplete="off"
          />
        </Field>
        {company ? (
          <Field label="Tipo de empresa">
            <select
              value={d.companyType}
              onChange={(e) => set("companyType", e.target.value as CompanyType | "")}
            >
              <option value="">Escolha…</option>
              {COMPANY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {COMPANY_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Data de nascimento">
            <input
              type="date"
              value={d.birthDate}
              onChange={(e) => set("birthDate", e.target.value)}
            />
          </Field>
        )}
        <Field label="E-mail">
          <input
            type="email"
            value={d.email}
            onChange={(e) => set("email", e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Celular" hint="DDD + número.">
          <input
            inputMode="tel"
            value={d.mobilePhone}
            onChange={(e) => set("mobilePhone", e.target.value)}
          />
        </Field>
        <Field
          label={company ? "Faturamento mensal (R$)" : "Renda mensal (R$)"}
          hint="Uma estimativa: o provedor pede para liberar a conta."
        >
          <input
            inputMode="decimal"
            value={d.income}
            onChange={(e) => set("income", e.target.value)}
          />
        </Field>
        <Field label="CEP">
          <input
            inputMode="numeric"
            value={d.postalCode}
            onChange={(e) => set("postalCode", e.target.value)}
          />
        </Field>
        <Field label="Rua">
          <input value={d.street} onChange={(e) => set("street", e.target.value)} />
        </Field>
        <Field label="Número">
          <input value={d.number} onChange={(e) => set("number", e.target.value)} />
        </Field>
        <Field label="Complemento (opcional)">
          <input value={d.complement} onChange={(e) => set("complement", e.target.value)} />
        </Field>
        <Field label="Bairro">
          <input value={d.district} onChange={(e) => set("district", e.target.value)} />
        </Field>
      </div>
      <FormError message={error} />
      <div className="actions">
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Enviando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
