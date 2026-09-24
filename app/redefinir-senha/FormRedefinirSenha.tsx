"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { ALERTA_ERRO, BOTAO, CAMPO, ROTULO } from "@/components/ui";
import { SENHA_MIN } from "@/lib/perfil/regras";

export default function FormRedefinirSenha() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha !== confirmacao) {
      setErro("As duas senhas não são iguais.");
      return;
    }
    setSalvando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) {
      setErro(
        error.message.includes("different from the old password")
          ? "A nova senha precisa ser diferente da anterior."
          : "Não foi possível salvar a senha. Peça um link novo e tente de novo.",
      );
      return;
    }
    router.push("/painel/buscar");
    router.refresh();
  }

  return (
    <form onSubmit={salvar} className="mt-6 flex flex-col gap-4">
      <div>
        <label htmlFor="nova-senha" className={ROTULO}>
          Nova senha
        </label>
        <input
          id="nova-senha"
          type="password"
          required
          minLength={SENHA_MIN}
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className={CAMPO}
          placeholder={`Mínimo ${SENHA_MIN} caracteres`}
        />
      </div>
      <div>
        <label htmlFor="confirmar-senha" className={ROTULO}>
          Repita a nova senha
        </label>
        <input
          id="confirmar-senha"
          type="password"
          required
          minLength={SENHA_MIN}
          autoComplete="new-password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          className={CAMPO}
        />
      </div>
      {erro && (
        <div role="alert" className={ALERTA_ERRO}>
          {erro}
        </div>
      )}
      <button type="submit" disabled={salvando} className={`${BOTAO} mt-2 w-full text-base!`}>
        {salvando ? "Salvando…" : "Salvar senha nova"}
      </button>
    </form>
  );
}
