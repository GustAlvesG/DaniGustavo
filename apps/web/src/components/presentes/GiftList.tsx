"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MAX_QUANTITY,
  OPEN_AMOUNT_MIN_CENTS,
  type Gift,
  type GiftCategory,
} from "@casamento/shared";
import { createOrderAction, type OrderFormState } from "@/app/[host]/(site)/presentes/actions";
import { Button, Checkbox, TextArea, TextField } from "@/components/ui";
import { cx } from "@/lib/cx";
import { formatBRL } from "@/lib/format";
import { filterGifts, parseReais, PRICE_RANGES, quotaText } from "@/lib/presentes";
import { artFor, GiftIcon } from "./GiftIcon";
import styles from "./presentes.module.css";

/*
 * Lista com filtros (categoria e faixa de preço, filtrados no navegador: a
 * lista é pequena e já veio inteira do servidor) e o formulário do presente
 * num <dialog> nativo, que já cuida do foco, do Esc e do fundo inerte.
 */

export function GiftList({
  gifts,
  categories,
  requiresCpf = false,
  paymentsAvailable = true,
}: {
  gifts: Gift[];
  categories: GiftCategory[];
  /** O provedor (Asaas) exige o CPF de quem paga: o formulário pede o campo. */
  requiresCpf?: boolean;
  /**
   * O evento tem conta pronta para receber? Sem ela, a lista aparece com um aviso no lugar do
   * botão (a API também recusa o pedido com 409).
   */
  paymentsAvailable?: boolean;
}) {
  const [category, setCategory] = useState("todos");
  const [range, setRange] = useState("todos");
  const [chosen, setChosen] = useState<Gift | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const usedCategories = categories.filter((c) => gifts.some((g) => g.category === c.slug));
  const visible = useMemo(() => filterGifts(gifts, category, range), [gifts, category, range]);
  const items = visible.filter((g) => !g.openAmount);
  const open = visible.filter((g) => g.openAmount);

  // O Next guarda a página anterior escondida (<Activity>) ao navegar para o
  // pagamento; os efeitos são desmontados, então fechamos o diálogo modal aqui
  // para ele não deixar a próxima página inerte.
  useEffect(() => {
    const dialog = dialogRef.current;
    return () => dialog?.close();
  }, []);

  function choose(g: Gift) {
    setChosen(g);
    dialogRef.current?.showModal();
  }

  return (
    <>
      {paymentsAvailable ? null : (
        <p className={styles.indisponivel} role="status" data-testid="presentes-indisponiveis">
          Os presentes ainda não podem ser enviados por aqui: o recebimento está sendo preparado.
          Volte em breve, vai ser uma alegria receber o seu carinho!
        </p>
      )}
      <div className={styles.filtros}>
        <ChipGroup
          legend="Categoria"
          name="categoria"
          value={category}
          onChange={setCategory}
          options={[
            { value: "todos", label: "Todos" },
            ...usedCategories.map((c) => ({ value: c.slug, label: c.label })),
          ]}
        />
        <ChipGroup
          legend="Preço da cota"
          name="faixa"
          value={range}
          onChange={setRange}
          options={PRICE_RANGES.map((r) => ({ value: r.id, label: r.label }))}
        />
      </div>

      <p className={styles.contagem} aria-live="polite">
        {visible.length === 1 ? "1 presente" : `${visible.length} presentes`}
      </p>

      {visible.length === 0 ? (
        <p className={styles.vazio}>
          Nenhum presente nessa combinação. Tente outra faixa de preço.
        </p>
      ) : (
        <ul className={styles.grade} data-testid="gift-grid">
          {items.map((g) => (
            <li key={g.slug} className={styles.item}>
              <GiftCard gift={g} available={paymentsAvailable} onChoose={() => choose(g)} />
            </li>
          ))}
          {open.map((g) => (
            <li key={g.slug} className={cx(styles.item, styles.livre)}>
              <OpenAmountCard gift={g} available={paymentsAvailable} onChoose={() => choose(g)} />
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="presente-titulo"
        onClose={() => setChosen(null)}
        // Clique no fundo escuro fecha (o <dialog> ocupa só o cartão).
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        {chosen ? (
          <OrderForm
            key={chosen.slug}
            gift={chosen}
            requiresCpf={requiresCpf}
            onClose={() => dialogRef.current?.close()}
          />
        ) : null}
      </dialog>
    </>
  );
}

function ChipGroup({
  legend,
  name,
  value,
  onChange,
  options,
}: {
  legend: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <fieldset className={styles.filtro}>
      <legend>{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className={styles.chip}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** No lugar do botão, quando o evento ainda não recebe presentes. */
function EmBreve() {
  return <p className={styles.emBreve}>Disponível em breve</p>;
}

function GiftCard({
  gift,
  available,
  onChoose,
}: {
  gift: Gift;
  available: boolean;
  onChoose: () => void;
}) {
  const soldOut = gift.quotaLeft === 0;
  const titleId = useId();
  return (
    <article
      className={cx("cartao", styles.card, soldOut && styles.esgotado)}
      aria-labelledby={titleId}
      data-gift={gift.slug}
    >
      {soldOut ? <span className={styles.carimbo}>Presenteado</span> : null}
      {gift.image ? (
        // Foto enviada pelo painel (/uploads, repassado à API): tamanho livre, sem next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.foto} src={gift.image} alt="" loading="lazy" decoding="async" />
      ) : (
        <div className={styles.selo}>
          <GiftIcon name={artFor(`${gift.slug} ${gift.title}`)} />
        </div>
      )}
      <h2 id={titleId} className={styles.cardTitulo}>
        {gift.title}
      </h2>
      {gift.description ? <p className={styles.cardTexto}>{gift.description}</p> : null}
      <div className={styles.cardRodape}>
        <p className={styles.preco}>
          <strong>{formatBRL(gift.priceCents)}</strong>
          {gift.quotaTotal > 1 ? <span>por cota</span> : null}
        </p>
        <p className={styles.cota}>{quotaText(gift)}</p>
        {available || soldOut ? (
          <Button
            variant={soldOut ? "secondary" : "primary"}
            block
            disabled={soldOut}
            onClick={onChoose}
            aria-label={soldOut ? `${gift.title}: já presenteado` : `Presentear: ${gift.title}`}
          >
            {soldOut ? "Já presenteado" : "Presentear"}
          </Button>
        ) : (
          <EmBreve />
        )}
      </div>
    </article>
  );
}

function OpenAmountCard({
  gift,
  available,
  onChoose,
}: {
  gift: Gift;
  available: boolean;
  onChoose: () => void;
}) {
  return (
    <article className={cx("surface-marinho", styles.livreCard)} data-gift={gift.slug}>
      <div className={styles.selo}>
        <GiftIcon name="envelope" />
      </div>
      <div>
        <h2 className={cx(styles.cardTitulo, "text-ink")}>{gift.title}</h2>
        <p className={styles.cardTexto}>
          {gift.description ?? "Escolha o valor que quiser."} A partir de{" "}
          {formatBRL(OPEN_AMOUNT_MIN_CENTS)}, no Pix ou no cartão.
        </p>
      </div>
      {available ? (
        <Button onClick={onChoose} aria-label={`Presentear: ${gift.title}`}>
          Presentear
        </Button>
      ) : (
        <EmBreve />
      )}
    </article>
  );
}

const idle: OrderFormState = { status: "idle" };

/** "52998224725" → "529.982.247-25", enquanto a pessoa digita. */
const maskCpf = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");

function OrderForm({
  gift,
  onClose,
  requiresCpf,
}: {
  gift: Gift;
  onClose: () => void;
  requiresCpf: boolean;
}) {
  const [state, action, pending] = useActionState(createOrderAction, idle);
  // Campos controlados: continuam preenchidos se a ação devolver um erro.
  const [quantity, setQuantity] = useState(1);
  const [valor, setValor] = useState(String(gift.priceCents / 100).replace(".", ","));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [message, setMessage] = useState("");
  const [wall, setWall] = useState(true);

  const maxQty = Math.min(gift.quotaLeft, MAX_QUANTITY);
  const total = gift.openAmount ? (parseReais(valor) ?? 0) : gift.priceCents * quantity;
  const err = state.status === "error" ? state : null;
  type Field = Extract<OrderFormState, { status: "error" }>["field"];
  const fieldError = (f: Field) => (err && err.field === f ? err.message : undefined);

  return (
    <div className={cx("cartao-resp surface-papel relative", styles.dialogCorpo)}>
      <button type="button" className={styles.fechar} onClick={onClose} aria-label="Fechar">
        <svg
          viewBox="0 0 16 16"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="m3.5 3.5 9 9M12.5 3.5l-9 9" />
        </svg>
      </button>

      <form action={action} className="flex flex-col gap-6" noValidate data-testid="order-form">
        <div className="pr-10">
          <div className={cx(styles.selo, "mb-4! size-16!")}>
            <GiftIcon
              name={artFor(`${gift.slug} ${gift.title}`, gift.openAmount)}
              className="size-8"
            />
          </div>
          <h2 id="presente-titulo" className="titulo text-display-sm! my-0!">
            {gift.title}
          </h2>
          <p className="mt-1 text-ink-soft">
            {gift.openAmount
              ? "Você escolhe o valor."
              : gift.quotaTotal > 1
                ? `${formatBRL(gift.priceCents)} por cota. ${quotaText(gift)}.`
                : formatBRL(gift.priceCents)}
          </p>
        </div>

        <input type="hidden" name="giftSlug" value={gift.slug} />

        {gift.openAmount ? (
          <TextField
            label="Valor em reais"
            hint={`A partir de ${formatBRL(OPEN_AMOUNT_MIN_CENTS)}. Ex.: 150,00`}
            name="valor"
            inputMode="decimal"
            autoComplete="off"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            error={fieldError("amount")}
          />
        ) : gift.quotaTotal > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span id="cotas-rotulo" className="text-lg font-medium">
              Cotas
            </span>
            <input type="hidden" name="quantity" value={quantity} />
            <div className={styles.stepper} role="group" aria-labelledby="cotas-rotulo">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Menos uma cota"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="size-4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M3.5 8h9" />
                </svg>
              </button>
              <span className={styles.numero} aria-live="polite" aria-atomic="true">
                <span
                  key={quantity}
                  className="animate-roll-in motion-reduce:animate-fade-in"
                  data-motion="keep"
                >
                  {quantity}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                disabled={quantity >= maxQty}
                aria-label="Mais uma cota"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="size-4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M3.5 8h9M8 3.5v9" />
                </svg>
              </button>
            </div>
            {fieldError("quantity") ? (
              <p className="w-full text-sm text-danger">{fieldError("quantity")}</p>
            ) : null}
          </div>
        ) : (
          <input type="hidden" name="quantity" value="1" />
        )}

        <p className={styles.total}>
          <span>Total</span>
          <strong data-testid="order-total">{formatBRL(total)}</strong>
        </p>

        <TextField
          label="Seu nome"
          name="buyerName"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldError("buyerName")}
          required
        />
        <TextField
          label="Seu e-mail"
          hint="Para mandar o comprovante."
          name="buyerEmail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError("buyerEmail")}
          required
        />
        {requiresCpf ? (
          <TextField
            label="Seu CPF"
            hint="O Asaas, que processa o pagamento, exige o CPF de quem paga. Nós só repassamos ao Asaas: o CPF não fica guardado no site."
            name="buyerCpf"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(maskCpf(e.target.value))}
            error={fieldError("buyerCpf")}
            required
          />
        ) : null}
        <TextArea
          label="Recado para os noivos"
          optional
          name="message"
          rows={3}
          maxLength={500}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          error={fieldError("message")}
        />
        {message.trim() ? (
          <Checkbox
            name="showOnWall"
            label="Pode mostrar o recado no mural do site"
            hint="Só aparece depois que os noivos aprovarem."
            checked={wall}
            onChange={(e) => setWall(e.target.checked)}
          />
        ) : null}

        {/* Honeypot: fora da tela e do teclado; só robôs preenchem. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Não preencha este campo
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <div role="alert" aria-live="assertive">
          {err && !err.field ? (
            <div className="flex flex-col gap-2 border-l-2 border-danger pl-5">
              <p className="text-lg">{err.message}</p>
              {err.soldOut ? (
                <Link
                  href="/presentes"
                  onClick={onClose}
                  className="text-accent underline underline-offset-[0.22em]"
                >
                  Ver a lista atualizada
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        <Button type="submit" size="lg" block loading={pending}>
          Presentear
        </Button>
        <p className="text-sm text-ink-soft">
          Na próxima tela você paga com Pix ou cartão. As cotas ficam reservadas para você por 30
          minutos. Usamos seu nome e e-mail só para o comprovante e para os noivos agradecerem.
          {requiresCpf ? " O CPF vai só para o processador de pagamento." : ""}
        </p>
      </form>
    </div>
  );
}
