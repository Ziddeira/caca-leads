import type { Metadata } from "next";
import { SEM_INDEXACAO } from "@/lib/site";

// A página é um componente de cliente e não pode exportar metadados;
// eles ficam aqui. Tela de conta: fora do Google.
export const metadata: Metadata = { title: "Esqueci minha senha", robots: SEM_INDEXACAO };

export default function EsqueciSenhaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
