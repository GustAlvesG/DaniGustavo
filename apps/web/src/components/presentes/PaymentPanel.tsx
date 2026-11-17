"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cardFeeCents, type OrderStatus, type OrderView } from "@casamento/shared";
import {
  payWithCardAction,
  simulateApprovalAction,
  type CardActionResult,
} from "@/app/(site)/presentes/actions";
import { MonogramDG } from "@/components/brand";
import { Button, ButtonLink, Checkbox, TextField } from "@/components/ui";
import { cx } from "@/lib/cx";
import { formatBRL } from "@/lib/format";
import { timeLeft } from "@/lib/presentes";
import { CardMercadoPago } from "./CardMercadoPago";
import { CardSimulado, type CardSubmit } from "./CardSimulado";
import { SimulatedQr } from "./SimulatedQr";
import styles from "./pagamento.module.css";

/*
 * Painel de pagamento: Pix primeiro e já selecionado; cartão na outra aba.
 * Enquanto o Pix está aberto, o navegador pergunta o status ao Route Handler
 * /api/pedidos/{id} a cada 3 s (pausa com a aba escondida). Pago, o carimbo é
 * batido sobre o QR e a pessoa segue para o agradecimento.
 */

const POLL_MS = 3_000;
const STAMP_MS = 1_300;

export function PaymentPanel({ order }: { order: OrderView }) {
  const router = useRouter();
  const [tab, setTab] = useState<"pix" | "card">("pix");
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const thanks = `/presentes/obrigado/${order.publicId}`;
  const done = useRef(false);

  const celebrate = useCallback(() => {
    if (done.current) return;
    done.current = true;
    setStatus("paid");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => router.push(thanks), reduce ? 400 : STAMP_MS);
  }, [router, thanks]);

  // Status ao vivo do Pix.
  useEffect(() => {
    if (status !== "pending") return;
    let stopped = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/pedidos/${order.publicId}`, { cache: "no-store" });
        if (!res.ok || stopped) return;
        const body = (await res.json()) as { status: OrderStatus };
        if (body.status === "paid") celebrate();
        else if (body.status !== "pending") setStatus(body.status);
      } catch {
        // Sem rede por um instante: tenta de novo no próximo ciclo.
      }
    };
    const timer = window.setInterval(check, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [status, order.publicId, celebrate]);

  if (status === "expired" || status === "failed") {
    return (
      <div className="flex flex-col gap-5" role="alert" data-testid="payment-expired">
        <h2 className="titulo text-display-sm! my-0!">O tempo do Pix acabou</h2>
        <p className="text-lg">
          O pedido ficou 30 minutos sem pagamento e as cotas voltaram para a lista. Se ainda quiser
          presentear, é só escolher de novo.
        </p>
        <div>
          <ButtonLink href="/presentes">Voltar à lista de presentes</ButtonLink>
        </div>
      </div>
    );
  }

  const paid = status === "paid";
  return (
    <div className="flex flex-col">
      <div className={styles.abas} role="tablist" aria-label="Forma de pagamento">
        <TabButton id="pix" current={tab} onSelect={setTab} disabled={paid}>
          Pix
        </TabButton>
        <TabButton id="card" current={tab} onSelect={setTab} disabled={paid}>
          Cartão
        </TabButton>
      </div>

      <div
        role="tabpanel"
        id="painel-pix"
        aria-labelledby="aba-pix"
        hidden={tab !== "pix"}
        data-testid="pix-panel"
      >
        <PixPanel order={order} paid={paid} onSimulatedApproval={celebrate} />
      </div>
      <div
        role="tabpanel"
        id="painel-card"
        aria-labelledby="aba-card"
        hidden={tab !== "card"}
        data-testid="card-panel"
      >
        {tab === "card" ? <CardPanel order={order} paid={paid} onApproved={celebrate} /> : null}
      </div>

      <p className="sr-only" aria-live="assertive">
        {paid ? "Presente enviado." : ""}
      </p>
    </div>
  );
}

function TabButton({
  id,
  current,
  onSelect,
  disabled,
  children,
}: {
  id: "pix" | "card";
  current: string;
  onSelect: (id: "pix" | "card") => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const selected = current === id;
  return (
    <button
      type="button"
      role="tab"
      id={`aba-${id}`}
      aria-selected={selected}
      aria-controls={`painel-${id}`}
      tabIndex={selected ? 0 : -1}
      className={styles.aba}
      disabled={disabled}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          const next = id === "pix" ? "card" : "pix";
          onSelect(next);
          document.getElementById(`aba-${next}`)?.focus();
        }
      }}
    >
      {children}
    </button>
  );
}

/** Carimbo "Presente enviado" batido sobre o QR ou o formulário. */
function Stamp() {
  return (
    <div className={styles.carimbo} data-testid="stamp">
      <div>
        <MonogramDG bold={10} className="w-14" />
        <span>
          Presente
          <br />
          enviado
        </span>
      </div>
    </div>
  );
}

function PixPanel({
  order,
  paid,
  onSimulatedApproval,
}: {
  order: OrderView;
  paid: boolean;
  onSimulatedApproval: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const pix = order.pix;

  useEffect(() => {
    // Relógio só no navegador (o HTML do servidor não sabe a hora de quem abre).
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const t = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, []);

  if (!pix && !paid) {
    return <p className="text-lg">O Pix deste pedido não está disponível. Pague com cartão.</p>;
  }

  async function copy() {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix.code);
    } catch {
      // Sem permissão: seleciona o texto para a pessoa copiar na mão.
      (document.getElementById("pix-codigo") as HTMLInputElement | null)?.select();
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  async function simulate() {
    setSimulating(true);
    setSimError(null);
    const r = await simulateApprovalAction(order.publicId);
    setSimulating(false);
    if (r.ok) onSimulatedApproval();
    else setSimError(r.message ?? "Não deu para simular agora.");
  }

  return (
    <div className="flex flex-col gap-5">
      <div className={styles.qrBox} data-estado={paid ? "paid" : "pending"}>
        <figure className="moldura-papel m-0">
          <span className="canto a" aria-hidden="true" />
          <span className="canto b" aria-hidden="true" />
          <span className="canto c" aria-hidden="true" />
          <span className="canto d" aria-hidden="true" />
          {pix?.qrImageBase64 ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem em data URI vinda do Mercado Pago
            <img
              src={`data:image/png;base64,${pix.qrImageBase64}`}
              alt="QR code do Pix"
              className={cx(styles.qr, paid && styles.qrPago)}
            />
          ) : (
            <SimulatedQr
              code={pix?.code ?? order.publicId}
              className={cx(styles.qr, "text-marinho", paid && styles.qrPago)}
            />
          )}
          {order.provider === "simulado" ? (
            <figcaption className={styles.simulacao}>Simulação: não pague este QR</figcaption>
          ) : (
            <figcaption>Aponte a câmera do app do banco</figcaption>
          )}
        </figure>
        {paid ? <Stamp /> : null}
      </div>

      {pix && !paid ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <TextField
              id="pix-codigo"
              label="Pix copia e cola"
              hint="No app do banco, escolha Pix copia e cola."
              readOnly
              value={pix.code}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1"
              inputClassName={styles.codigo}
            />
            <Button variant="secondary" onClick={copy} className="shrink-0">
              {copied ? "Código copiado" : "Copiar código"}
            </Button>
          </div>
          <p className={styles.status} role="status" data-testid="pix-status">
            <span className={styles.ponto} aria-hidden="true" data-motion="keep" />
            <span>
              Aguardando o pagamento.
              {now !== null ? ` O código vale por mais ${timeLeft(order.expiresAt, now)}.` : ""}
            </span>
          </p>
        </>
      ) : null}

      {order.provider === "simulado" && !paid ? (
        <div className={styles.dev}>
          <p>
            Modo de simulação: ainda não há conta no Mercado Pago, então nenhum dinheiro de verdade
            é cobrado. O botão abaixo faz o papel do banco e aprova este Pix.
          </p>
          {simError ? <p className="text-danger">{simError}</p> : null}
          <div>
            <Button variant="secondary" onClick={simulate} loading={simulating}>
              Simular pagamento aprovado
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CardPanel({
  order,
  paid,
  onApproved,
}: {
  order: OrderView;
  paid: boolean;
  onApproved: () => void;
}) {
  const [coverFee, setCoverFee] = useState(false);
  const [result, setResult] = useState<CardActionResult | null>(null);
  const fee = cardFeeCents(order.amountCents, order.card.feePercent);
  const total = order.amountCents + (coverFee ? fee : 0);

  async function submit(card: CardSubmit) {
    setResult(null);
    const r = await payWithCardAction(order.publicId, { ...card, coverFee });
    setResult(r);
    if (r.ok && r.outcome === "approved") onApproved();
  }

  const message = result && (!result.ok || result.outcome !== "approved") ? result.message : null;

  return (
    <div className="relative flex flex-col gap-6">
      {paid ? <Stamp /> : null}
      {fee > 0 ? (
        <Checkbox
          label={`Quero cobrir a taxa do cartão (${formatBRL(fee)})`}
          hint="Assim o valor do presente chega inteiro para os noivos."
          checked={coverFee}
          onChange={(e) => setCoverFee(e.target.checked)}
          disabled={paid}
        />
      ) : null}
      <p className="flex items-baseline justify-between border-y border-line-soft py-3">
        <span>Total no cartão</span>
        <strong className="font-display text-2xl font-medium" data-testid="card-total">
          {formatBRL(total)}
        </strong>
      </p>

      {order.card.publicKey ? (
        <CardMercadoPago
          publicKey={order.card.publicKey}
          totalCents={total}
          disabled={paid}
          onSubmit={submit}
        />
      ) : (
        <CardSimulado totalCents={total} disabled={paid} onSubmit={submit} />
      )}

      <div role="alert" aria-live="assertive">
        {message ? (
          <p
            className={cx(
              "border-l-2 pl-5 text-lg",
              result?.ok && result.outcome === "pending" ? "border-accent" : "border-danger",
            )}
          >
            {message}
          </p>
        ) : null}
      </div>
      <p className="text-sm text-ink-soft">
        Os dados do cartão vão direto para o processador de pagamento; o número não passa pelo nosso
        servidor. Parcelas com juros do cartão por conta de quem paga.
      </p>
    </div>
  );
}
