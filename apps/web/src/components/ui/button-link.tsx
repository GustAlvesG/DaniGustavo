import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonStyles, type ButtonStyleOptions } from "./button-styles";

export type ButtonLinkProps = ComponentProps<typeof Link> & Omit<ButtonStyleOptions, "className">;

/** Link com a aparência de botão (navegação, não ação). Server Component. */
export function ButtonLink({ variant, size, block, className, ...rest }: ButtonLinkProps) {
  return <Link {...rest} className={buttonStyles({ variant, size, block, className })} />;
}
