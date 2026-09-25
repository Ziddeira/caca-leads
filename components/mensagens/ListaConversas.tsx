"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import { IconeBuscar, IconeImagem, IconeMensagens, IconeVisto, IconeVistoDuplo } from "@/components/Icones";
import { ALERTA_ERRO, BOTAO_NEUTRO, CAMPO, CARTAO, EstadoVazio } from "@/components/ui";
import { chamarApi, tempoRelativo } from "@/components/comunidade/api";
import { urlAvatar } from "@/lib/comunidade/tipos";
import { BUSCA_MAX } from "@/lib/mensagens/regras";
import type { Conversa, EstadoChat } from "@/lib/mensagens/tipos";
import { useChat } from "./Contexto";
import { useMensagens } from "./Resumo";

// Lista de conversas: pedidos recebidos (aceitar ou recusar), conversas
// (não lidas em destaque) e pedidos enviados. Busca pelo apelido e
// atualiza sozinha pelo tempo real.
export default function ListaConversas({
  inicial,
  estado,
}: {
  inicial: Conversa[];
  estado: EstadoChat;
}) {
  const campo = useId();
  const tempoReal = useMensagens();
  const [conversas, setConversas] = useState(inicial);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const buscaAtual = useRef("");
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recarregar = useCallback(async () => {
    const termo = buscaAtual.current;
    const r = await chamarApi<{ conversas: Conversa[] }>(
      `/api/mensagens/conversas${termo ? `?busca=${encodeURIComponent(termo)}` : ""}`,
    );
    // Uma resposta antiga (de outra busca) não sobrescreve a atual.
    if (termo !== buscaAtual.current) return;
    setCarregando(false);
    if (!r.ok || !r.dados) return setErro(r.erro);
    setErro(null);
    setConversas(r.dados.conversas);
  }, []);

  const agendar = useCallback(
    (ms: number) => {
      if (espera.current) clearTimeout(espera.current);
      espera.current = setTimeout(recarregar, ms);
    },
    [recarregar],
  );

  // Chegou mensagem, pedido ou aceite: recarrega a lista.
  useEffect(() => tempoReal?.ouvir(() => agendar(500)), [tempoReal, agendar]);
  useEffect(() => () => {
    if (espera.current) clearTimeout(espera.current);
  }, []);

  function mudarBusca(valor: string) {
    setBusca(valor);
    buscaAtual.current = valor.trim();
    setCarregando(true);
    agendar(300);
  }

  const recebidos = conversas.filter((c) => c.situacao === "pendente" && !c.eu_pedi);
  const enviados = conversas.filter((c) => c.situacao === "pendente" && c.eu_pedi);
  const abertas = conversas.filter((c) => c.situacao !== "pendente");
  const vazio = conversas.length === 0;

  return (
    <div>
      {estado.limite_ativas !== null && (
        <p className="mb-4 border border-line bg-surface px-3 py-2.5 text-sm text-ink-2">
          Plano Grátis: <strong className="text-ink">{Math.min(estado.ativas, estado.limite_ativas)}</strong> de{" "}
          {estado.limite_ativas} conversas abertas. Você responde pedidos, mas só o{" "}
          <Link href="/painel/plano" className="font-semibold text-primary hover:underline">
            Solo e o Pro
          </Link>{" "}
          iniciam conversas e não têm limite.
        </p>
      )}
      {estado.suspenso && (
        <p className={`${ALERTA_ERRO} mb-4`}>
          Sua conta está suspensa da comunidade
          {estado.suspenso_ate ? ` até ${new Date(estado.suspenso_ate).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}` : ""}.
          Você lê suas conversas, mas não envia mensagens nem pedidos.
        </p>
      )}

      <label htmlFor={campo} className="sr-only">
        Buscar conversa por apelido
      </label>
      <div className="relative">
        <IconeBuscar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input
          id={campo}
          type="search"
          value={busca}
          onChange={(e) => mudarBusca(e.target.value)}
          maxLength={BUSCA_MAX}
          placeholder="Buscar por apelido"
          autoComplete="off"
          className={`${CAMPO} pl-10`}
        />
      </div>
      {erro && (
        <p role="alert" className={`${ALERTA_ERRO} mt-3`}>
          {erro}
        </p>
      )}

      <div aria-busy={carregando} className="mt-5 space-y-8">
        {vazio ? (
          busca.trim() ? (
            <p className="text-sm text-ink-2">Nenhuma conversa com “{busca.trim()}”.</p>
          ) : (
            <EstadoVazio
              icone={<IconeMensagens width={26} height={26} />}
              titulo="Nenhuma conversa ainda"
              texto={
                estado.acesso_total ? (
                  <>
                    Abra o perfil de alguém na{" "}
                    <Link href="/painel/comunidade" className="font-semibold text-primary hover:underline">
                      Comunidade
                    </Link>{" "}
                    e toque em “Pedir conversa”. A conversa começa quando a pessoa aceitar.
                  </>
                ) : (
                  "Quando alguém te enviar um pedido de conversa, ele aparece aqui para você aceitar ou recusar."
                )
              }
            />
          )
        ) : (
          <>
            {recebidos.length > 0 && (
              <Secao titulo="Pedidos recebidos" total={recebidos.length}>
                {recebidos.map((c) => (
                  <PedidoRecebido key={c.id} conversa={c} onMudou={() => agendar(0)} />
                ))}
              </Secao>
            )}
            {abertas.length > 0 && (
              <Secao titulo="Conversas">
                {abertas.map((c) => (
                  <ItemConversa key={c.id} conversa={c} />
                ))}
              </Secao>
            )}
            {enviados.length > 0 && (
              <Secao titulo="Pedidos enviados" total={enviados.length}>
                {enviados.map((c) => (
                  <PedidoEnviado key={c.id} conversa={c} onMudou={() => agendar(0)} />
                ))}
              </Secao>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Secao({ titulo, total, children }: { titulo: string; total?: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-display text-[13px] font-semibold uppercase tracking-[0.2em] text-ink-2">
        {titulo}
        {total !== undefined && <span className="ml-2 text-primary">{total}</span>}
      </h2>
      <ul className={`${CARTAO} divide-y divide-line-2`}>{children}</ul>
    </section>
  );
}

function Pessoa({ conversa: c, tamanho = 44 }: { conversa: Conversa; tamanho?: number }) {
  return (
    <Avatar
      fotoUrl={urlAvatar(c.outro.foto_path)}
      avatarPronto={c.outro.avatar_pronto}
      apelido={c.outro.apelido}
      tamanho={tamanho}
    />
  );
}

function ItemConversa({ conversa: c }: { conversa: Conversa }) {
  const naoLida = c.nao_lidas > 0;
  const u = c.ultima;
  let previa = "Conversa aberta. Diga oi!";
  if (u) previa = u.texto || (u.imagem ? "Imagem" : "");
  const situacao =
    c.situacao === "encerrada" ? "Conversa encerrada" : c.situacao !== "aceita" ? "Sem conversa aberta" : null;

  return (
    <li>
      <Link
        href={`/painel/mensagens/${c.id}`}
        className={`flex min-h-16 items-center gap-3 px-3 py-3 transition hover:bg-white/[0.04] sm:px-4 ${
          naoLida ? "bg-primary-soft" : ""
        }`}
      >
        <Pessoa conversa={c} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={`truncate ${naoLida ? "font-bold text-ink" : "font-semibold text-ink"}`}>
              {c.outro.apelido ?? "Conta removida"}
            </span>
            <span className={`shrink-0 text-xs ${naoLida ? "font-semibold text-primary" : "text-muted"}`}>
              {tempoRelativo(u?.criado_em ?? c.atualizado_em)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            {u?.minha &&
              (u.lida ? (
                <>
                  <IconeVistoDuplo width={16} height={16} className="shrink-0 text-primary" />
                  <span className="sr-only">Lida.</span>
                </>
              ) : (
                <>
                  <IconeVisto width={16} height={16} className="shrink-0 text-ink-3" />
                  <span className="sr-only">Enviada.</span>
                </>
              ))}
            {u?.imagem && <IconeImagem width={16} height={16} className="shrink-0 text-ink-3" />}
            <span className={`truncate text-sm ${naoLida ? "font-semibold text-ink" : "text-ink-2"}`}>
              {u?.minha && <span className="text-muted">Você: </span>}
              {previa}
            </span>
            {naoLida && (
              <span className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 font-display text-[11px] font-bold leading-5 text-primary-ink tabular-nums">
                {c.nao_lidas > 99 ? "99+" : c.nao_lidas}
                <span className="sr-only"> não lidas</span>
              </span>
            )}
          </span>
          {(situacao || c.fora_do_limite) && (
            <span className="mt-0.5 block text-xs text-muted">
              {situacao ?? "Fora do limite do plano Grátis: só leitura"}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

function PedidoRecebido({ conversa: c, onMudou }: { conversa: Conversa; onMudou: () => void }) {
  const { executar } = useChat();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function responder(acao: "aceitar" | "encerrar") {
    setErro(null);
    setEnviando(true);
    const r = await executar(() => chamarApi(`/api/mensagens/conversas/${c.id}`, "POST", { acao }));
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    onMudou();
  }

  return (
    <li className="px-3 py-3 sm:px-4">
      <div className="flex items-center gap-3">
        <Pessoa conversa={c} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{c.outro.apelido ?? "Conta removida"}</p>
          <p className="text-sm text-ink-2">Quer conversar com você · {tempoRelativo(c.pedido_em)}</p>
        </div>
      </div>
      {c.outro.apelido && (
        <Link
          href={`/painel/comunidade/u/${encodeURIComponent(c.outro.apelido)}`}
          className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
        >
          Ver perfil antes de responder
        </Link>
      )}
      {erro && (
        <p role="alert" className={`${ALERTA_ERRO} mt-2`}>
          {erro}
        </p>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <button type="button" onClick={() => responder("encerrar")} disabled={enviando} className={BOTAO_NEUTRO}>
          Recusar
        </button>
        <button
          type="button"
          onClick={() => responder("aceitar")}
          disabled={enviando}
          className={`${BOTAO_NEUTRO} border-primary! text-primary!`}
        >
          Aceitar
        </button>
      </div>
    </li>
  );
}

function PedidoEnviado({ conversa: c, onMudou }: { conversa: Conversa; onMudou: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function cancelar() {
    if (!window.confirm(`Cancelar o pedido para ${c.outro.apelido ?? "esta pessoa"}?`)) return;
    setErro(null);
    setEnviando(true);
    const r = await chamarApi(`/api/mensagens/conversas/${c.id}`, "POST", { acao: "encerrar" });
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    onMudou();
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-3 sm:px-4">
      <Pessoa conversa={c} tamanho={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">{c.outro.apelido ?? "Conta removida"}</p>
        <p className="text-sm text-muted">Esperando resposta · enviado {tempoRelativo(c.pedido_em)}</p>
        {erro && (
          <p role="alert" className={`${ALERTA_ERRO} mt-2`}>
            {erro}
          </p>
        )}
      </div>
      <button type="button" onClick={cancelar} disabled={enviando} className={BOTAO_NEUTRO}>
        Cancelar
      </button>
    </li>
  );
}
