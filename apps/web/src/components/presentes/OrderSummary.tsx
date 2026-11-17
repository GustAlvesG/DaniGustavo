import type { OrderView } from "@casamento/shared";
import { cx } from "@/lib/cx";
import { formatBRL } from "@/lib/format";
import { artFor, GiftIcon } from "./GiftIcon";
import presentes from "./presentes.module.css";
import styles from "./pagamento.module.css";

/** Resumo do pedido: o presente num cartão de fio duplo, com valor e cotas. */
export function OrderSummary({ order, className }: { order: OrderView; className?: string }) {
  const { gift } = order;
  return (
    <section className={cx("cartao", className)} aria-label="Resumo do presente">
      <div className={presentes.selo}>
        <GiftIcon name={artFor(`${gift.slug} ${gift.title}`, gift.openAmount)} />
      </div>
      <h2 className={presentes.cardTitulo}>{gift.title}</h2>
      <p className="mb-6 text-suave">De {order.buyerName}, para Dani &amp; Gustavo.</p>
      <dl className={styles.resumo}>
        {!gift.openAmount && order.quantity > 1 ? (
          <div>
            <dt>Cotas</dt>
            <dd>{order.quantity}</dd>
          </div>
        ) : null}
        {order.feeCents > 0 ? (
          <>
            <div>
              <dt>Presente</dt>
              <dd>{formatBRL(order.amountCents)}</dd>
            </div>
            <div>
              <dt>Taxa do cartão</dt>
              <dd>{formatBRL(order.feeCents)}</dd>
            </div>
          </>
        ) : null}
        <div className={styles.resumoTotal}>
          <dt>Total</dt>
          <dd data-testid="summary-total">{formatBRL(order.totalCents)}</dd>
        </div>
      </dl>
      {order.message ? (
        <blockquote className="mt-6 border-l-2 border-serenity pl-4 text-suave italic">
          “{order.message}”
        </blockquote>
      ) : null}
    </section>
  );
}
