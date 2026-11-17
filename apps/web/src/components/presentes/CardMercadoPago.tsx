"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Script from "next/script";
import { Button, Select, TextField } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import type { CardSubmit } from "./CardSimulado";
import styles from "./pagamento.module.css";

/*
 * Cartão com o SDK JS oficial do Mercado Pago (Core Methods + Secure Fields).
 * Número, validade e CVV são iframes do Mercado Pago: os dados vão direto para
 * eles e voltam como um token de uso único. Só o token chega ao nosso servidor.
 * Docs: github.com/mercadopago/sdk-js (docs/fields.md, docs/core-methods.md).
 */

type Field = {
  mount(id: string): Field;
  unmount(): void;
  on(event: string, cb: (data: { bin?: string | null; errorMessages?: unknown[] }) => void): Field;
};
type PayerCost = { installments: number; recommended_message: string };
type MercadoPagoInstance = {
  fields: {
    create(type: string, options: Record<string, unknown>): Field;
    createCardToken(data: {
      cardholderName: string;
      identificationType: string;
      identificationNumber: string;
    }): Promise<{ id: string } | void>;
  };
  getPaymentMethods(p: { bin: string }): Promise<{
    results: { id: string; payment_type_id: string }[];
  }>;
  getInstallments(p: {
    amount: string;
    bin: string;
    locale?: string;
  }): Promise<{ payer_costs: PayerCost[] }[]>;
};
declare global {
  interface Window {
    MercadoPago?: new (key: string, opts?: { locale?: string }) => MercadoPagoInstance;
  }
}

const SDK_URL = "https://sdk.mercadopago.com/js/v2";

// Estilo dos campos seguros: o mesmo dos nossos campos (Cormorant, tinta).
const fieldStyle = {
  fontFamily: "Georgia, serif",
  fontSize: "18px",
  color: "#1b2a4a",
  placeholderColor: "#46557a",
  height: "46px",
};

export function CardMercadoPago({
  publicKey,
  totalCents,
  disabled,
  onSubmit,
}: {
  publicKey: string;
  totalCents: number;
  disabled?: boolean;
  onSubmit: (card: CardSubmit) => Promise<void>;
}) {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const mp = useRef<MercadoPagoInstance | null>(null);
  const [bin, setBin] = useState<string | null>(null);
  const [method, setMethod] = useState<{ id: string; type: string } | null>(null);
  const [costs, setCosts] = useState<PayerCost[]>([]);
  const [installments, setInstallments] = useState(1);
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Monta os campos seguros quando o SDK carrega.
  useEffect(() => {
    if (!ready || !window.MercadoPago) return;
    const instance = new window.MercadoPago(publicKey, { locale: "pt-BR" });
    mp.current = instance;
    const fields = [
      instance.fields
        .create("cardNumber", {
          placeholder: "0000 0000 0000 0000",
          srLabel: "Número do cartão",
          style: fieldStyle,
        })
        .mount("mp-numero")
        .on("binChange", ({ bin: b }) => setBin(b ?? null)),
      instance.fields
        .create("expirationDate", { placeholder: "MM/AA", srLabel: "Validade", style: fieldStyle })
        .mount("mp-validade"),
      instance.fields
        .create("securityCode", { placeholder: "123", srLabel: "CVV", style: fieldStyle })
        .mount("mp-cvv"),
    ];
    return () => fields.forEach((f) => f.unmount());
  }, [ready, publicKey]);

  // Bandeira e parcelas a partir dos 6 a 8 primeiros dígitos.
  useEffect(() => {
    const instance = mp.current;
    if (!instance || !bin) return;
    let cancelled = false;
    (async () => {
      const methods = await instance.getPaymentMethods({ bin });
      const first = methods.results[0];
      if (!cancelled && first) setMethod({ id: first.id, type: first.payment_type_id });
      const options = await instance.getInstallments({
        amount: (totalCents / 100).toFixed(2),
        bin,
        locale: "pt-BR",
      });
      if (!cancelled) setCosts(options[0]?.payer_costs ?? []);
    })().catch(() => setError("Não reconhecemos este cartão. Confira o número."));
    return () => {
      cancelled = true;
    };
  }, [bin, totalCents]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const instance = mp.current;
    if (!instance || !method) return setError("Digite o número do cartão.");
    const digits = cpf.replace(/\D/g, "");
    if (digits.length !== 11) return setError("CPF do titular: digite os 11 números.");
    setBusy(true);
    try {
      const token = await instance.fields.createCardToken({
        cardholderName: name.trim(),
        identificationType: "CPF",
        identificationNumber: digits,
      });
      if (!token?.id) throw new Error("sem token");
      await onSubmit({
        token: token.id,
        paymentMethodId: method.id,
        paymentType: method.type === "debit_card" ? "debit_card" : "credit_card",
        installments,
        identification: { type: "CPF", number: digits },
      });
    } catch {
      setError("Algum dado do cartão não confere. Revise número, validade e CVV.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Script
        src={SDK_URL}
        strategy="afterInteractive"
        onReady={() => setReady(true)}
        onError={() => setLoadError(true)}
      />
      {loadError ? (
        <p className="text-lg" role="alert">
          O formulário do cartão não carregou. Recarregue a página ou pague com Pix.
        </p>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-5" data-testid="card-form">
          <SecureField id="mp-numero" label="Número do cartão" />
          <TextField
            label="Nome no cartão"
            autoComplete="cc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled}
          />
          <div className="grid grid-cols-2 gap-4">
            <SecureField id="mp-validade" label="Validade" />
            <SecureField id="mp-cvv" label="CVV" />
          </div>
          <TextField
            label="CPF do titular"
            inputMode="numeric"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            disabled={disabled}
          />
          <Select
            label="Parcelas"
            value={installments}
            onChange={(e) => setInstallments(Number(e.target.value))}
            disabled={disabled || costs.length === 0}
          >
            {costs.length === 0 ? (
              <option value={1}>1x de {formatBRL(totalCents)}</option>
            ) : (
              costs
                .filter((c) => c.installments <= 12)
                .map((c) => (
                  <option key={c.installments} value={c.installments}>
                    {c.recommended_message}
                  </option>
                ))
            )}
          </Select>
          {error ? (
            <p className="text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" block loading={busy || !ready} disabled={disabled}>
            Pagar {formatBRL(totalCents)}
          </Button>
        </form>
      )}
    </>
  );
}

/** Moldura de um campo seguro (o iframe do Mercado Pago entra no div). */
function SecureField({ id, label }: { id: string; label: string }) {
  return (
    <div className="flex flex-col">
      {/* O iframe recebe o próprio rótulo acessível (srLabel); este é o visível. */}
      <span className="self-start text-lg font-medium text-ink">{label}</span>
      <div id={id} className={`mt-2.5 ${styles.mpCampo}`} />
    </div>
  );
}
