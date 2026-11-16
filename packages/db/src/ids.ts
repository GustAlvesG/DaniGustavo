import { ulid } from "ulid";

/** ULID aleatório para `invitations.token` e `gift_orders.public_id`. */
export function newPublicId(): string {
  return ulid();
}
