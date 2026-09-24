"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import SeletorAvatar from "@/components/perfil/SeletorAvatar";
import { Alerta, chamar, type Mensagem } from "@/components/perfil/comum";
import { BOTAO, BOTAO_SECUNDARIO, CAMPO, CARTAO, ROTULO } from "@/components/ui";
import { APELIDO_MAX, validarApelido } from "@/lib/perfil/regras";

export default function BoasVindasClient({
  userId,
  apelidoInicial,
  fotoUrl,
  avatarPronto,
}: {
  userId: string;
  apelidoInicial: string;
  fotoUrl: string | null;
  avatarPronto: string | null;
}) {
  const router = useRouter();
  const [passo, setPasso] = useState<1 | 2>(1);
  const [apelido, setApelido] = useState(apelidoInicial);
  const [apelidoSalvo, setApelidoSalvo] = useState(apelidoInicial);
  const [ocupado, setOcupado] = useState<"apelido" | "concluir" | "pular" | null>(null);
  const [mensagem, setMensagem] = useState<Mensagem>(null);

  // Concluir e pular fazem a mesma coisa no banco: marcam a configuração
  // como feita e, se não houver foto nem avatar, sorteiam um avatar pronto.
  async function finalizar(modo: "concluir" | "pular") {
    setMensagem(null);
    setOcupado(modo);
    const erro = await chamar("/api/perfil/boas-vindas", "POST");
    if (erro) {
      setOcupado(null);
      setMensagem({ tipo: "erro", texto: erro });
      return;
    }
    router.push("/painel/buscar");
    router.refresh();
  }

  async function salvarApelido(e: FormEvent) {
    e.preventDefault();
    setMensagem(null);
    const limpo = apelido.trim();
    setApelido(limpo);
    if (limpo === apelidoSalvo) {
      setPasso(2);
      return;
    }
    const erroLocal = validarApelido(limpo);
    if (erroLocal) {
      setMensagem({ tipo: "erro", texto: erroLocal });
      return;
    }
    setOcupado("apelido");
    const erro = await chamar("/api/perfil", "PATCH", { apelido: limpo });
    setOcupado(null);
    if (erro) {
      setMensagem({ tipo: "erro", texto: erro });
      return;
    }
    setApelidoSalvo(limpo);
    setPasso(2);
  }

  return (
    <div className="px-seguro flex min-h-screen flex-col items-center bg-canvas pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] sm:justify-center">
      <Link href="/" className="mb-6 block rounded-md" aria-label="Caça-leads">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-principal.svg" alt="Caça-leads" width={808} height={212} className="h-10 w-auto" />
      </Link>

      <main className={`${CARTAO} w-full max-w-lg p-5 sm:p-8`}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-primary">Passo {passo} de 2</p>
          <button
            type="button"
            onClick={() => finalizar("pular")}
            disabled={ocupado !== null}
            className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline disabled:opacity-60"
          >
            {ocupado === "pular" ? "Pulando…" : "Pular por agora"}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2" aria-hidden="true">
          <span className="h-1.5 rounded-full bg-primary" />
          <span className={`h-1.5 rounded-full ${passo === 2 ? "bg-primary" : "bg-line"}`} />
        </div>

        {passo === 1 ? (
          <form onSubmit={salvarApelido} className="mt-6">
            <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">Boas-vindas ao Caça-leads!</h1>
            <p className="mt-2 text-ink-2">
              Como você quer aparecer por aqui? O apelido vai para o rank público dos
              caçadores de leads.
            </p>
            <label htmlFor="apelido" className={`${ROTULO} mt-6`}>
              Apelido
            </label>
            <input
              id="apelido"
              type="text"
              required
              autoFocus
              maxLength={APELIDO_MAX}
              autoComplete="nickname"
              value={apelido}
              onChange={(e) => setApelido(e.target.value)}
              onBlur={() => setApelido((a) => a.trim())}
              className={CAMPO}
              aria-describedby="ajuda-apelido"
            />
            <p id="ajuda-apelido" className="mt-1.5 text-sm text-muted">
              De 3 a 20 caracteres e único. Você pode trocar depois no Perfil.
            </p>
            <div className="mt-4">
              <Alerta mensagem={mensagem} />
            </div>
            <button type="submit" disabled={ocupado !== null} className={`${BOTAO} mt-4 w-full`}>
              {ocupado === "apelido" ? "Salvando…" : "Continuar"}
            </button>
          </form>
        ) : (
          <div className="mt-6">
            <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">Escolha seu avatar</h1>
            <p className="mt-2 mb-5 text-ink-2">
              Envie uma foto sua ou escolha um dos avatares prontos. Se não escolher
              nenhum, sorteamos um para você.
            </p>
            <SeletorAvatar
              userId={userId}
              apelido={apelidoSalvo}
              fotoUrl={fotoUrl}
              avatarPronto={avatarPronto}
            />
            <div className="mt-4">
              <Alerta mensagem={mensagem} />
            </div>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMensagem(null);
                  setPasso(1);
                }}
                disabled={ocupado !== null}
                className={`${BOTAO_SECUNDARIO} flex-1 sm:flex-none`}
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => finalizar("concluir")}
                disabled={ocupado !== null}
                className={`${BOTAO} flex-1`}
              >
                {ocupado === "concluir" ? "Entrando…" : "Concluir"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
