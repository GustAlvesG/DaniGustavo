"use client";

import { useState, type FormEvent } from "react";
import { Button, Select, TextField } from "@/components/ui";
import { formatBRL } from "@/lib/format";

/** O que o formulário de cartão entrega: token e escolhas, nunca o número. */
export type CardSubmit = {
  token: string;
  paymentMethodId: string;
  paymentType: "credit_card" | "debit_card";
  installments: number;
  identification?: { type: string; number: string };
};

const luhn = (digits: string) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return digits.length >= 13 && sum % 10 === 0;
};

const formatNumber = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, "$1 ");

/**
 * Cartão do modo simulado. Imita a tokenização: o "token" leva só os 4
 * últimos dígitos (o provedor simulado aprova ou recusa por eles) e o número
 * em si nunca sai do navegador.
 */
export function CardSimulado({
  totalCents,
  disabled,
  onSubmit,
}: {
  totalCents: number;
  disabled?: boolean;
  onSubmit: (card: CardSubmit) => Promise<void>;
}) {
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [installments, setInstallments] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const digits = number.replace(/\D/g, "");
    const next: Record<string, string> = {};
    if (!luhn(digits)) next.number = "Número do cartão inválido. Confira os dígitos.";
    if (name.trim().length < 3) next.name = "Escreva o nome como está no cartão.";
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) next.expiry = "Use o formato MM/AA.";
    if (!/^\d{3,4}$/.test(cvv)) next.cvv = "O código tem 3 ou 4 números.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    await onSubmit({
      token: `sim_${digits.slice(-4)}_${Date.now().toString(36)}`,
      paymentMethodId: digits.startsWith("5") ? "master" : "visa",
      paymentType: "credit_card",
      installments,
    });
    setBusy(false);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5" data-testid="card-form">
      <p className="text-sm text-ink-soft">
        Simulação: use 4111 1111 1111 1111 para aprovar ou 4000 0000 0000 0002 para recusar.
        Qualquer nome, validade futura e CVV.
      </p>
      <TextField
        label="Número do cartão"
        inputMode="numeric"
        autoComplete="cc-number"
        value={number}
        onChange={(e) => setNumber(formatNumber(e.target.value))}
        error={errors.number}
        disabled={disabled}
      />
      <TextField
        label="Nome no cartão"
        autoComplete="cc-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        disabled={disabled}
      />
      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Validade"
          placeholder="MM/AA"
          inputMode="numeric"
          autoComplete="cc-exp"
          value={expiry}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, "").slice(0, 4);
            setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
          }}
          error={errors.expiry}
          disabled={disabled}
        />
        <TextField
          label="CVV"
          inputMode="numeric"
          autoComplete="cc-csc"
          value={cvv}
          onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
          error={errors.cvv}
          disabled={disabled}
        />
      </div>
      <Select
        label="Parcelas"
        value={installments}
        onChange={(e) => setInstallments(Number(e.target.value))}
        disabled={disabled}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n === 1
              ? `1x de ${formatBRL(totalCents)}`
              : `${n}x de ${formatBRL(Math.ceil(totalCents / n))}`}
          </option>
        ))}
      </Select>
      <Button type="submit" size="lg" block loading={busy} disabled={disabled}>
        Pagar {formatBRL(totalCents)}
      </Button>
    </form>
  );
}
