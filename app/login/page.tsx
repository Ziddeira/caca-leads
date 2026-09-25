import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";
import { metadadosPagina } from "@/lib/site";

export const metadata = metadadosPagina({
  titulo: "Entrar",
  descricao: "Entre na sua conta do Ártemis Prospect e continue a caça por clientes que ainda não têm site.",
  caminho: "/login",
});

export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
