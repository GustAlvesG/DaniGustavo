import { PRIVACY_POLICY_VERSION } from "@casamento/shared";
import type { Metadata } from "next";
import { PLATFORM_NAME } from "@/components/plataforma/brand";

export const metadata: Metadata = { title: "Política de privacidade" };

/*
 * Fase 6, frente B: política de privacidade da plataforma (LGPD). O aceite no cadastro grava
 * `PRIVACY_POLICY_VERSION` (packages/shared/src/signup.ts): mudou o texto, suba a versão.
 * O aviso de privacidade de cada evento (convidados) é outro texto, da frente C.
 * TODO(conteudo): texto revisado por advogado; este é um rascunho provisório.
 */
export default function Privacidade() {
  return (
    <article className="plataforma-wrap plataforma-texto max-w-measure py-16">
      <h1 className="font-display text-display-md">Política de privacidade</h1>
      <p className="text-suave">Versão {PRIVACY_POLICY_VERSION}. Texto provisório.</p>

      <h2>Quais dados tratamos</h2>
      <ul>
        <li>Da sua conta: nome, e-mail e a senha (guardada só como resumo criptográfico).</li>
        <li>Da sua organização e dos seus eventos: o que você cadastra no painel.</li>
        <li>
          Dos convidados: nomes, contatos e respostas que vocês e eles informam, só para o evento.
        </li>
        <li>
          Técnicos: um resumo do endereço IP, para evitar abusos, sem guardar o endereço em si.
        </li>
      </ul>

      <h2>Para que usamos</h2>
      <p>
        Para prestar o serviço, enviar os e-mails necessários (como a confirmação do cadastro e os
        avisos do evento), cobrar a assinatura e cumprir obrigações legais. Não vendemos dados.
      </p>

      <h2>Com quem compartilhamos</h2>
      <p>
        Com o parceiro de pagamentos (para processar presentes e assinaturas) e com os serviços de
        hospedagem e e-mail que fazem {PLATFORM_NAME} funcionar.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Você pode pedir acesso, correção, exportação ou exclusão dos seus dados. A exportação e a
        exclusão da conta ficam no painel; os convidados fazem os pedidos pela página de privacidade
        de cada evento.
      </p>
    </article>
  );
}
