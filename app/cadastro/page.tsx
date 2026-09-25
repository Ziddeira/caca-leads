import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";
import { metadadosPagina } from "@/lib/site";

export const metadata = metadadosPagina({
  titulo: "Criar conta grátis",
  descricao:
    "Crie sua conta grátis no Ártemis Prospect e encontre empresas sem site para prospectar, com o WhatsApp pronto para chamar. Sem cartão.",
  caminho: "/cadastro",
});

export default function CadastroPage() {
  return (
    <Suspense>
      <AuthForm mode="cadastro" />
    </Suspense>
  );
}
