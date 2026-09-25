"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DadosLead } from "@/lib/leads/dadosLead";
import {
  MSG_ERRO_FUNIL,
  MSG_FALTA_ETAPA7,
  ROTULO_FUNIL,
  SITUACOES_FUNIL,
  contagemFunil,
  type SituacaoFunil,
  type VendaResumo,
} from "@/lib/leads/funil";
import {
  MSG_PADRAO_HOSPEDAGEM,
  MSG_PADRAO_NEGOCIOS,
  linkWhatsapp,
  montarMensagem,
} from "@/lib/leads/mensagens";
import EtiquetaSituacao from "@/components/leads/EtiquetaSituacao";
import CartaoLeadEsqueleto from "@/components/leads/CartaoLeadEsqueleto";
import FunilLead, { type FunilEstado } from "@/components/leads/FunilLead";
import FormVenda from "@/components/leads/FormVenda";
import FormRetorno from "@/components/leads/FormRetorno";
import RetornoLead from "@/components/leads/RetornoLead";
import { MSG_FALTA_ETAPA10, statusRetorno, type RetornoLead as Retorno } from "@/lib/leads/retorno";
import { ALERTA_AVISO, BOTAO_NEUTRO, BOTAO_WHATSAPP, CAMPO, CARTAO } from "@/components/ui";
import {
  IconeAtualizar,
  IconeBuscar,
  IconeEstrela,
  IconeLink,
  IconeMapa,
  IconeTelefone,
  IconeWhatsapp,
} from "@/components/Icones";

export interface LeadSalvo {
  placeId: string;
  desbloqueadoEm: string;
  // null = sem cache válido: os dados são buscados depois que a página abre.
  dados: DadosLead | null;
  situacao: SituacaoFunil;
  anotacao: string | null;
  ultimoContatoEm: string | null;
  venda: VendaResumo | null;
  retorno: Retorno | null;
}

// "retorno" = só os leads com retorno agendado, do mais próximo ao mais
// distante (os atrasados vêm primeiro).
type FiltroFunil = "todos" | "retorno" | SituacaoFunil;

type Estado = { dados: DadosLead | null; carregando: boolean; erro: string | null };

// Quantos leads sem cache são buscados ao mesmo tempo (poucos, para não
// estourar a cota do Google de uma vez).
const SIMULTANEOS = 3;

export default function MeusLeadsClient({
  leads,
  funilAtivo,
  erroFunil = null,
  retornoAtivo = false,
}: {
  leads: LeadSalvo[];
  funilAtivo: boolean;
  erroFunil?: string | null;
  // false = a etapa 10 ainda não foi rodada no Supabase.
  retornoAtivo?: boolean;
}) {
  const [estados, setEstados] = useState<Record<string, Estado>>(() =>
    Object.fromEntries(
      leads.map((l) => [l.placeId, { dados: l.dados, carregando: !l.dados, erro: null }]),
    ),
  );
  const [filtro, setFiltro] = useState("");
  const [funis, setFunis] = useState<Record<string, FunilEstado>>(() =>
    Object.fromEntries(
      leads.map((l) => [
        l.placeId,
        { situacao: l.situacao, anotacao: l.anotacao, ultimoContatoEm: l.ultimoContatoEm, venda: l.venda },
      ]),
    ),
  );
  const [filtroFunil, setFiltroFunil] = useState<FiltroFunil>("todos");
  const [salvando, setSalvando] = useState<Record<string, boolean>>({});
  const [errosFunil, setErrosFunil] = useState<Record<string, string | null>>({});
  const [vendaAberta, setVendaAberta] = useState<string | null>(null);
  const [retornos, setRetornos] = useState<Record<string, Retorno | null>>(() =>
    Object.fromEntries(leads.map((l) => [l.placeId, l.retorno])),
  );
  const [retornoAberto, setRetornoAberto] = useState<string | null>(null);
  // Relógio da tela: a cada minuto, um retorno que passou vira "atrasado".
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Troca a situação na hora (sem esperar o servidor) e desfaz se o banco
  // recusar. A data do último contato vem do banco.
  async function mudarSituacao(placeId: string, situacao: SituacaoFunil) {
    const anterior = funis[placeId];
    setFunis((f) => ({ ...f, [placeId]: { ...f[placeId], situacao } }));
    setSalvando((s) => ({ ...s, [placeId]: true }));
    setErrosFunil((e) => ({ ...e, [placeId]: null }));
    try {
      const res = await fetch("/api/leads/funil", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId, situacao }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(corpo.erro || "Não foi possível mudar a situação.");
      setFunis((f) => ({ ...f, [placeId]: { ...f[placeId], ultimoContatoEm: corpo.ultimoContatoEm ?? null } }));
    } catch (err) {
      setFunis((f) => ({ ...f, [placeId]: anterior }));
      const msg = err instanceof Error ? err.message : "Não foi possível mudar a situação.";
      setErrosFunil((e) => ({ ...e, [placeId]: msg }));
    } finally {
      setSalvando((s) => ({ ...s, [placeId]: false }));
    }
  }

  // Devolve a mensagem de erro, ou null se salvou.
  async function salvarAnotacao(placeId: string, texto: string): Promise<string | null> {
    try {
      const res = await fetch("/api/leads/funil", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId, anotacao: texto }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) return corpo.erro || "Não foi possível salvar a anotação.";
      setFunis((f) => ({ ...f, [placeId]: { ...f[placeId], anotacao: corpo.anotacao ?? null } }));
      return null;
    } catch {
      return "Não foi possível salvar a anotação.";
    }
  }

  const fecharVenda = useCallback(() => setVendaAberta(null), []);
  const fecharRetorno = useCallback(() => setRetornoAberto(null), []);

  const comRetorno = useMemo(() => leads.filter((l) => retornos[l.placeId]).length, [leads, retornos]);
  const atrasados = useMemo(
    () => leads.filter((l) => retornos[l.placeId] && statusRetorno(retornos[l.placeId]!.em, agora) === "atrasado").length,
    [leads, retornos, agora],
  );

  function vendaRegistrada(placeId: string, venda: VendaResumo) {
    setFunis((f) => ({
      ...f,
      [placeId]: { ...f[placeId], situacao: "fechado", venda, ultimoContatoEm: new Date().toISOString() },
    }));
    setErrosFunil((e) => ({ ...e, [placeId]: null }));
    setVendaAberta(null);
  }

  const contagem = useMemo(() => {
    const c = Object.fromEntries(SITUACOES_FUNIL.map((s) => [s, 0])) as Record<SituacaoFunil, number>;
    for (const l of leads) c[funis[l.placeId]?.situacao ?? "desbloqueado"]++;
    return c;
  }, [leads, funis]);

  const atualizar = useCallback(async (placeId: string) => {
    setEstados((e) => ({ ...e, [placeId]: { ...e[placeId], carregando: true, erro: null } }));
    try {
      const res = await fetch("/api/leads/atualizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok || !corpo.dados) {
        throw new Error(corpo.erro || "Não foi possível carregar os dados deste lead.");
      }
      setEstados((e) => ({ ...e, [placeId]: { dados: corpo.dados, carregando: false, erro: null } }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Não foi possível carregar os dados deste lead.";
      setEstados((e) => ({ ...e, [placeId]: { ...e[placeId], carregando: false, erro: msg } }));
    }
  }, []);

  // Só roda para leads sem cache válido; os demais já vieram do banco.
  useEffect(() => {
    const fila = leads.filter((l) => !l.dados).map((l) => l.placeId);
    if (!fila.length) return;
    let cancelado = false;
    async function trabalhador() {
      while (!cancelado && fila.length) {
        const id = fila.shift();
        if (id) await atualizar(id);
      }
    }
    Promise.all(Array.from({ length: Math.min(SIMULTANEOS, fila.length) }, trabalhador));
    return () => {
      cancelado = true;
    };
  }, [leads, atualizar]);

  // O filtro por situação usa a situação atual (já com as trocas feitas
  // nesta visita); o filtro de texto, o nome e o bairro.
  const visiveis = useMemo(() => {
    const texto = filtro.trim().toLowerCase();
    const lista = leads.filter((l) => {
      if (filtroFunil === "retorno") {
        if (!retornos[l.placeId]) return false;
      } else if (filtroFunil !== "todos" && funis[l.placeId]?.situacao !== filtroFunil) return false;
      if (!texto) return true;
      const d = estados[l.placeId]?.dados;
      return !!d && `${d.nome} ${d.bairro}`.toLowerCase().includes(texto);
    });
    if (filtroFunil === "retorno") {
      // Datas ISO do banco: comparar como instante, do mais próximo ao mais distante.
      const t = (l: LeadSalvo) => new Date(retornos[l.placeId]!.em).getTime();
      lista.sort((a, b) => t(a) - t(b));
    }
    return lista;
  }, [leads, estados, filtro, filtroFunil, funis, retornos]);

  const rotuloFiltro =
    filtroFunil === "todos" ? "" : filtroFunil === "retorno" ? "Retornos" : ROTULO_FUNIL[filtroFunil];

  const leadVenda = vendaAberta ? leads.find((l) => l.placeId === vendaAberta) : null;
  const leadRetorno = retornoAberto ? leads.find((l) => l.placeId === retornoAberto) : null;
  const dadosRetorno = leadRetorno ? estados[leadRetorno.placeId]?.dados : null;

  return (
    <div className="mt-6">
      {funilAtivo ? (
        <div
          role="group"
          aria-label="Filtrar por situação"
          className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
        >
          <BotaoFiltro ativo={filtroFunil === "todos"} onClick={() => setFiltroFunil("todos")}>
            Todos <span className="font-normal opacity-80">({leads.length})</span>
          </BotaoFiltro>
          {retornoAtivo && (
            <BotaoFiltro
              ativo={filtroFunil === "retorno"}
              onClick={() => setFiltroFunil("retorno")}
              titulo={`Com retorno agendado: ${comRetorno}${atrasados ? ` (${atrasados} atrasado${atrasados === 1 ? "" : "s"})` : ""}`}
            >
              Retornos <span className="font-normal opacity-80">({comRetorno})</span>
              {atrasados > 0 && (
                <span
                  className={`ml-0.5 px-1.5 text-xs ${
                    filtroFunil === "retorno" ? "bg-primary-ink text-destaque" : "bg-danger-soft text-danger"
                  }`}
                >
                  {atrasados} atrasado{atrasados === 1 ? "" : "s"}
                </span>
              )}
            </BotaoFiltro>
          )}
          {SITUACOES_FUNIL.map((s) => (
            <BotaoFiltro
              key={s}
              ativo={filtroFunil === s}
              onClick={() => setFiltroFunil(s)}
              titulo={`${ROTULO_FUNIL[s]}: ${contagem[s]}`}
            >
              {contagemFunil(s, contagem[s])}
            </BotaoFiltro>
          ))}
        </div>
      ) : (
        <p className={`${ALERTA_AVISO} mb-4`}>
          {/^(42703|PGRST204)\b/.test(erroFunil ?? "") ? MSG_FALTA_ETAPA7 : MSG_ERRO_FUNIL}{" "}
          <span className="break-words text-xs opacity-80">(código: {erroFunil ?? "?"})</span>
        </p>
      )}
      {funilAtivo && !retornoAtivo && <p className={`${ALERTA_AVISO} mb-4`}>{MSG_FALTA_ETAPA10}</p>}

      {leads.length > 4 && (
        <div className="relative mb-4 max-w-md">
          <label htmlFor="filtro-leads" className="sr-only">
            Filtrar por nome ou bairro
          </label>
          <IconeBuscar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            id="filtro-leads"
            type="search"
            className={`${CAMPO} pl-10!`}
            placeholder="Filtrar por nome ou bairro"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        </div>
      )}

      <ul className="grid gap-3 lg:grid-cols-2">
        {visiveis.map((lead) => {
          const estado = estados[lead.placeId];
          return (
            <li key={lead.placeId}>
              {estado?.dados ? (
                <CartaoLead dados={estado.dados} desbloqueadoEm={lead.desbloqueadoEm}>
                  {funilAtivo && funis[lead.placeId] && (
                    <>
                      <FunilLead
                        funil={funis[lead.placeId]}
                        salvandoSituacao={!!salvando[lead.placeId]}
                        onMudarSituacao={(s) => mudarSituacao(lead.placeId, s)}
                        onMarcarFechado={() => setVendaAberta(lead.placeId)}
                        onSalvarAnotacao={(t) => salvarAnotacao(lead.placeId, t)}
                      />
                      {retornoAtivo && (
                        <RetornoLead
                          placeId={lead.placeId}
                          retorno={retornos[lead.placeId] ?? null}
                          agora={agora}
                          onAgendar={() => setRetornoAberto(lead.placeId)}
                        />
                      )}
                      {errosFunil[lead.placeId] && (
                        <p role="alert" className="mt-2 text-sm text-danger">
                          {errosFunil[lead.placeId]}
                        </p>
                      )}
                    </>
                  )}
                </CartaoLead>
              ) : estado?.erro ? (
                <CartaoErro erro={estado.erro} onTentar={() => atualizar(lead.placeId)} />
              ) : (
                <CartaoLeadEsqueleto />
              )}
            </li>
          );
        })}
      </ul>

      {!visiveis.length && (
        <p className="mt-2 border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-2">
          {filtro.trim()
            ? `Nenhum lead com “${filtro}”${rotuloFiltro ? ` em “${rotuloFiltro}”` : ""}. Tente só uma parte do nome ou o bairro.`
            : filtroFunil === "retorno"
              ? "Nenhum retorno agendado. Use “Agendar retorno” no cartão de um lead."
              : `Nenhum lead em “${rotuloFiltro}” por enquanto.`}
        </p>
      )}

      {leadVenda && (
        <FormVenda
          placeId={leadVenda.placeId}
          nomeLead={estados[leadVenda.placeId]?.dados?.nome ?? "este lead"}
          desbloqueadoEm={leadVenda.desbloqueadoEm}
          onCancelar={fecharVenda}
          onRegistrada={(v) => vendaRegistrada(leadVenda.placeId, v)}
        />
      )}

      {leadRetorno && (
        <FormRetorno
          placeId={leadRetorno.placeId}
          lead={{
            nome: dadosRetorno?.nome ?? "este lead",
            telefone: dadosRetorno?.telefone ?? null,
            situacao: ROTULO_FUNIL[funis[leadRetorno.placeId]?.situacao ?? "desbloqueado"],
          }}
          retorno={retornos[leadRetorno.placeId] ?? null}
          onFechar={fecharRetorno}
          onSalvo={(r) => setRetornos((atual) => ({ ...atual, [leadRetorno.placeId]: r }))}
        />
      )}
    </div>
  );
}

function BotaoFiltro({
  ativo,
  onClick,
  titulo,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  titulo?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      title={titulo}
      onClick={onClick}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap border px-4 text-sm font-semibold transition ${
        ativo ? "border-destaque bg-primary-soft text-destaque" : "border-line bg-surface text-ink-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p));
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

function CartaoLead({
  dados,
  desbloqueadoEm,
  children,
}: {
  dados: DadosLead;
  desbloqueadoEm: string;
  children?: ReactNode;
}) {
  const eHospedagem = dados.situacao === "booking";
  const modeloMsg = eHospedagem ? MSG_PADRAO_HOSPEDAGEM : MSG_PADRAO_NEGOCIOS;
  const plataforma = dados.plataforma || (eHospedagem ? "Airbnb ou Booking" : "redes sociais");
  const data = new Date(desbloqueadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return (
    <article className={`${CARTAO} flex h-full flex-col p-4 sm:p-5`}>
      <div className="flex items-start gap-3">
        <div
          className="ap-cut-s flex h-11 w-11 shrink-0 items-center justify-center bg-line font-display text-sm font-bold text-ink"
          aria-hidden="true"
        >
          {iniciais(dados.nome)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-sans text-base font-extrabold text-ink">{dados.nome}</h3>
          {dados.bairro && <p className="mt-0.5 text-sm text-ink-2">{dados.bairro}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-2">
        <EtiquetaSituacao situacao={dados.situacao} plataforma={dados.plataforma} />
        {dados.nota > 0 && (
          <span className="inline-flex items-center gap-1">
            <IconeEstrela className="text-ink-2" />
            <span className="font-semibold text-ink">{dados.nota.toFixed(1).replace(".", ",")}</span>
            <span className="text-muted">({dados.avaliacoes} avaliações)</span>
          </span>
        )}
      </div>

      <p className="mt-2 flex items-center gap-2 text-sm">
        <IconeTelefone width={16} height={16} className="shrink-0 text-muted" />
        {dados.telefone ? (
          <a href={`tel:${dados.telefone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center font-semibold text-ink underline-offset-2 hover:underline">
            {dados.telefone}
          </a>
        ) : (
          <span className="text-muted">Sem telefone no Google</span>
        )}
      </p>

      <div className="mt-4 flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
        {dados.whatsapp && (
          <a
            target="_blank"
            rel="noopener"
            href={linkWhatsapp(dados.whatsapp, montarMensagem(modeloMsg, dados.nome, plataforma))}
            className={BOTAO_WHATSAPP}
          >
            <IconeWhatsapp width={18} height={18} />
            WhatsApp
          </a>
        )}
        {dados.maps && (
          <a target="_blank" rel="noopener" href={dados.maps} className={BOTAO_NEUTRO}>
            <IconeMapa width={18} height={18} />
            Maps
          </a>
        )}
        {dados.site && (
          <a target="_blank" rel="noopener" href={dados.site} className={BOTAO_NEUTRO}>
            <IconeLink width={18} height={18} />
            Link
          </a>
        )}
      </div>

      {children}

      <p className="mt-auto pt-3 text-xs text-muted">Desbloqueado em {data}</p>
    </article>
  );
}

function CartaoErro({ erro, onTentar }: { erro: string; onTentar: () => void }) {
  return (
    <div className={`${CARTAO} flex h-full flex-col items-start gap-3 p-4 sm:p-5`}>
      <p className="text-sm font-semibold text-ink">Lead desbloqueado</p>
      <p className="text-sm text-danger">{erro}</p>
      <button type="button" onClick={onTentar} className={BOTAO_NEUTRO}>
        <IconeAtualizar width={18} height={18} />
        Tentar de novo
      </button>
      <p className="text-xs text-muted">Tentar de novo não gasta crédito.</p>
    </div>
  );
}
