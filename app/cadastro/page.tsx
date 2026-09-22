import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export default function CadastroPage() {
  return (
    <Suspense>
      <AuthForm mode="cadastro" />
    </Suspense>
  );
}
