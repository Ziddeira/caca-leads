"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { ALERTA_ERRO, ALERTA_SUCESSO, BOTAO, BOTAO_SECUNDARIO, CAMPO, ROTULO } from "@/components/ui";
import { IconeAjuda } from "@/components/Icones";
import {
  ANEXO_MAX_BYTES,
  ANEXO_TIPOS,
  ASSUNTOS,
  DESCRICAO_MAX,
  LIMITE_CHAMADOS_ABERTOS,
  SUPORTE_BUCKET,
  type Assunto,
} from "@/lib/suporte/regras";

// Botão flutuante "Preciso de ajuda", em todas as páginas do painel.
// No celular fica logo acima do menu de baixo (e o painel ganhou espaço
// extra no fim da página, para o botão não cobrir conteúdo); no
// computador, no canto inferior direito.
export default function BotaoAjuda() {
  const [aberto, setAberto] = useState(false);
  const fechar = useCallback(() => setAberto(false), []);
  const pathname = usePathname();
  // Dentro de uma conversa, o botão cobriria a caixa de mensagem.
  if (/^\/painel\/mensagens\/\d+/.test(pathname)) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 inline-flex min-h-11 items-center gap-2 border border-line-strong bg-surface px-4 py-2.5 text-sm font-semibold text-ink shadow-[0_8px_24px_var(--color-sombra)] transition hover:border-ink-2 md:right-6 md:bottom-6"
      >
        <IconeAjuda width={20} height={20} />
        <span>
          <span className="max-[380px]:sr-only">Preciso de </span>ajuda
        </span>
      </button>
      {aberto && <JanelaAjuda onFechar={fechar} />}
    </>
  );
}

function JanelaAjuda({ onFechar }: { onFechar: () => void }) {
  const id = useId();
  const pathname = usePathname();
  const [assunto, setAssunto] = useState<Assunto | "">("");
  const [descricao, setDescricao] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<number | null>(null);
  const primeiroCampo = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    primeiroCampo.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    // Trava a rolagem da página por trás da janela.
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [onFechar]);

  function escolherArquivo(f: File | undefined) {
    setErro(null);
    if (!f) return setArquivo(null);
    if (!ANEXO_TIPOS[f.type]) return setErro("Anexe uma imagem JPG, PNG ou WEBP.");
    if (f.size > ANEXO_MAX_BYTES) return setErro("A imagem pode ter no máximo 5 MB.");
    setArquivo(f);
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!assunto) return setErro("Escolha o assunto.");
    if (!descricao.trim()) return setErro("Descreva o que aconteceu.");

    setErro(null);
    setEnviando(true);
    try {
      let anexo: string | null = null;
      if (arquivo) {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Sua sessão expirou. Entre de novo.");
        // Pasta do próprio usuário: as regras do bucket só deixam enviar
        // para ela (e só imagem, até 5 MB).
        anexo = `${user.id}/${Date.now()}.${ANEXO_TIPOS[arquivo.type]}`;
        const { error } = await supabase.storage
          .from(SUPORTE_BUCKET)
          .upload(anexo, arquivo, { contentType: arquivo.type, upsert: false });
        if (error) throw new Error("Não foi possível enviar a imagem. Confira o tamanho (até 5 MB) e o tipo.");
      }

      const res = await fetch("/api/suporte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assunto,
          descricao,
          anexo,
          pagina: pathname + window.location.search,
        }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(corpo.erro || "Não foi possível enviar agora.");
      setEnviado(Number(corpo.id));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar agora.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-veu sm:items-center sm:p-6"
      onClick={(ev) => ev.target === ev.currentTarget && !enviando && onFechar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        className="max-h-dvh w-full max-w-md overflow-y-auto overscroll-contain border border-line bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-cartao sm:rounded-lg sm:p-6 sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <h2 id={`${id}-titulo`} className="text-lg font-bold text-ink">
          Preciso de ajuda
        </h2>

        {enviado !== null ? (
          <div className="mt-3 space-y-4">
            <p role="status" className={ALERTA_SUCESSO}>
              Chamado #{enviado} enviado! A resposta aparece no sino e em Meus chamados.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/painel/suporte" onClick={onFechar} className={`${BOTAO_SECUNDARIO} flex-1 sm:flex-none`}>
                Ver meus chamados
              </Link>
              <button type="button" onClick={onFechar} className={`${BOTAO} flex-1 sm:flex-none`}>
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-2">
              Conte o que houve. Junto vão, automaticamente, o e-mail da conta, o plano, o saldo, a página em que você
              está e o navegador — assim a gente resolve mais rápido.
            </p>

            <form onSubmit={enviar} noValidate className="mt-4 space-y-4">
              <div>
                <label htmlFor={`${id}-assunto`} className={ROTULO}>
                  Assunto
                </label>
                <select
                  ref={primeiroCampo}
                  id={`${id}-assunto`}
                  required
                  className={CAMPO}
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value as Assunto)}
                >
                  <option value="" disabled>
                    Escolha…
                  </option>
                  {Object.entries(ASSUNTOS).map(([valor, nome]) => (
                    <option key={valor} value={valor}>
                      {nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${id}-descricao`} className={ROTULO}>
                  Descrição
                </label>
                <textarea
                  id={`${id}-descricao`}
                  required
                  rows={5}
                  maxLength={DESCRICAO_MAX}
                  className={`${CAMPO} resize-y`}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted">
                  {descricao.length}/{DESCRICAO_MAX}
                </p>
              </div>

              <div>
                <label htmlFor={`${id}-anexo`} className={ROTULO}>
                  Imagem <span className="font-normal text-muted">(opcional, até 5 MB)</span>
                </label>
                <input
                  id={`${id}-anexo`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="block min-h-11 w-full text-sm text-ink-2 file:mr-3 file:min-h-11 file:border file:border-line-strong file:bg-transparent file:px-4 file:font-semibold file:text-campo"
                  onChange={(e) => escolherArquivo(e.target.files?.[0])}
                />
                {arquivo && <p className="mt-1 break-all text-xs text-muted">{arquivo.name}</p>}
              </div>

              <p className="text-xs text-muted">
                Cada conta pode ter até {LIMITE_CHAMADOS_ABERTOS} chamados abertos ao mesmo tempo.
              </p>

              {erro && (
                <p role="alert" className={ALERTA_ERRO}>
                  {erro}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={enviando} onClick={onFechar} className={`${BOTAO_SECUNDARIO} flex-1 sm:flex-none`}>
                  Cancelar
                </button>
                <button type="submit" disabled={enviando} className={`${BOTAO} flex-1 sm:flex-none`}>
                  {enviando ? "Enviando…" : "Enviar"}
                </button>
              </div>
              <Link href="/painel/suporte" onClick={onFechar} className="inline-flex min-h-11 items-center text-sm font-semibold text-destaque hover:underline">
                Ver meus chamados
              </Link>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
