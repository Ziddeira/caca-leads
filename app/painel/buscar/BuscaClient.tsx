"use client";

import { useMemo, useState } from "react";
import type { LeadResultado, Situacao } from "@/lib/leads/classificacao";
import {
  MSG_PADRAO_HOSPEDAGEM,
  MSG_PADRAO_NEGOCIOS,
  linkWhatsapp,
  montarMensagem,
} from "@/lib/leads/mensagens";
import EtiquetaSituacao from "@/components/leads/EtiquetaSituacao";

type Modo = "negocios" | "hospedagem";

interface Perfil {
  plano: string;
  buscasRestantes: number;
  creditosDesbloqueio: number;
}

const ROTULO_PLANO: Record<string, string> = {
  gratis: "Grátis",
  solo: "Solo",
  pro: "Pro",
};

const ORDENS = {
  pontuacao: (a: LeadResultado, b: LeadResultado) => b.pontuacao - a.pontuacao,
  avaliacoes: (a: LeadResultado, b: LeadResultado) => b.avaliacoes - a.avaliacoes,
  nota: (a: LeadResultado, b: LeadResultado) => b.nota - a.nota || b.avaliacoes - a.avaliacoes,
  nome: (a: LeadResultado, b: LeadResultado) => a.nome.localeCompare(b.nome, "pt-BR"),
} as const;

function dividirLista(valor: string): string[] {
  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const parte of valor.split(",")) {
    const item = parte.trim();
    const chave = item.toLowerCase();
    if (item && !vistos.has(chave)) {
      vistos.add(chave);
      resultado.push(item);
    }
  }
  return resultado;
}

export default function BuscaClient({ perfilInicial }: { perfilInicial: Perfil }) {
  const [nicho, setNicho] = useState("");
  const [areas, setAreas] = useState("");
  const [modo, setModo] = useState<Modo>("negocios");
  const [perfil, setPerfil] = useState(perfilInicial);
  const [leads, setLeads] = useState<LeadResultado[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [buscaFeita, setBuscaFeita] = useState(false);
  const [desbloqueando, setDesbloqueando] = useState<Record<string, boolean>>({});

  const [minNota, setMinNota] = useState(0);
  const [minAvaliacoes, setMinAvaliacoes] = useState(0);
  const [textoEndereco, setTextoEndereco] = useState("");
  const [apenasCelular, setApenasCelular] = useState(false);
  const [apenasAberto, setApenasAberto] = useState(true);
  const [esconderDesbloqueados, setEsconderDesbloqueados] = useState(false);
  const [ordenarPor, setOrdenarPor] = useState<keyof typeof ORDENS>("pontuacao");
  const [situacoesAtivas, setSituacoesAtivas] = useState<Record<Situacao, boolean>>({
    sem_site: true,
    booking: true,
    rede_social: true,
    site_proprio: false,
  });

  const termos = useMemo(() => dividirLista(nicho), [nicho]);
  const listaAreas = useMemo(() => dividirLista(areas), [areas]);
  const estimativaBuscas = termos.length * listaAreas.length;
  const podeHospedagem = perfil.plano === "pro";

  const contagens = useMemo(() => {
    const c: Record<Situacao, number> = { sem_site: 0, booking: 0, rede_social: 0, site_proprio: 0 };
    for (const l of leads) c[l.situacao]++;
    return c;
  }, [leads]);

  const leadsFiltrados = useMemo(() => {
    const texto = textoEndereco.trim().toLowerCase();
    return leads
      .filter(
        (l) =>
          situacoesAtivas[l.situacao] &&
          l.nota >= minNota &&
          l.avaliacoes >= minAvaliacoes &&
          (!apenasCelular || l.temCelular) &&
          (!apenasAberto || l.aberto) &&
          (!esconderDesbloqueados || !l.contato) &&
          (!texto || l.bairro.toLowerCase().includes(texto)),
      )
      .sort(ORDENS[ordenarPor]);
  }, [
    leads,
    situacoesAtivas,
    minNota,
    minAvaliacoes,
    apenasCelular,
    apenasAberto,
    esconderDesbloqueados,
    textoEndereco,
    ordenarPor,
  ]);

  function alternarModo(novoModo: Modo) {
    if (novoModo === "hospedagem" && !podeHospedagem) return;
    setModo(novoModo);
  }

  async function buscar() {
    setErro(null);
    setAviso(null);
    if (!termos.length) return setErro("Digite ao menos um nicho.");
    if (!listaAreas.length) return setErro("Digite ao menos uma região.");
    if (modo === "hospedagem" && !podeHospedagem) {
      return setErro("O modo Hospedagem é exclusivo do plano Pro.");
    }
    if (estimativaBuscas > perfil.buscasRestantes) {
      return setErro(
        `Isso gastaria ${estimativaBuscas} busca(s), mas você só tem ${perfil.buscasRestantes} disponível(is).`,
      );
    }

    setCarregando(true);
    try {
      const res = await fetch("/api/leads/buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicho, areas, modo }),
      });
      const dados = await res.json();
      if (!res.ok) {
        setErro(dados.erro || "Não foi possível buscar agora.");
        return;
      }
      setLeads(dados.leads as LeadResultado[]);
      setPerfil((p) => ({ ...p, buscasRestantes: dados.buscasRestantes }));
      setAviso(dados.aviso || null);
      setBuscaFeita(true);
    } catch {
      setErro("Não foi possível falar com o servidor agora.");
    } finally {
      setCarregando(false);
    }
  }

  async function desbloquear(lead: LeadResultado) {
    if (perfil.creditosDesbloqueio < 1) {
      setErro("Você não tem créditos de desbloqueio disponíveis.");
      return;
    }
    setDesbloqueando((d) => ({ ...d, [lead.id]: true }));
    try {
      const res = await fetch("/api/leads/desbloquear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: lead.id }),
      });
      const dados = await res.json();
      if (!res.ok && dados.creditosRestantes === undefined) {
        setErro(dados.erro || "Não foi possível desbloquear agora.");
        return;
      }
      setPerfil((p) => ({ ...p, creditosDesbloqueio: dados.creditosRestantes }));
      if (dados.erro) {
        setErro(dados.erro);
      }
      if (dados.contato) {
        setLeads((atual) =>
          atual.map((l) => (l.id === lead.id ? { ...l, contato: dados.contato } : l)),
        );
      }
    } catch {
      setErro("Não foi possível falar com o servidor agora.");
    } finally {
      setDesbloqueando((d) => ({ ...d, [lead.id]: false }));
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Buscar leads</h1>
      <p className="mt-2 max-w-2xl text-ink-2">
        Busca no Google Maps e separa quem não tem site, quem depende de Airbnb/Booking e
        quem só usa app ou rede social.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-4 py-3 text-sm">
        <span className="font-semibold text-ink">Plano {ROTULO_PLANO[perfil.plano] ?? perfil.plano}</span>
        <span className="text-ink-2">
          <strong className="text-ink">{perfil.buscasRestantes}</strong> busca(s) restante(s)
        </span>
        <span className="text-ink-2">
          <strong className="text-ink">{perfil.creditosDesbloqueio}</strong> crédito(s) de desbloqueio
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(23,32,51,.04),0_4px_16px_rgba(23,32,51,.05)]">
        <div className="flex gap-2 rounded-full bg-canvas p-1 w-fit">
          <button
            type="button"
            onClick={() => alternarModo("negocios")}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              modo === "negocios" ? "bg-surface text-ink shadow-sm" : "text-ink-2"
            }`}
          >
            Negócios
          </button>
          <button
            type="button"
            onClick={() => alternarModo("hospedagem")}
            disabled={!podeHospedagem}
            title={!podeHospedagem ? "Disponível no plano Pro" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              modo === "hospedagem" ? "bg-surface text-ink shadow-sm" : "text-ink-2"
            } ${!podeHospedagem ? "cursor-not-allowed opacity-50" : ""}`}
          >
            Hospedagem {!podeHospedagem && "🔒"}
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="nicho" className="mb-1 block text-sm font-semibold text-ink-2">
              {modo === "hospedagem" ? "Tipos de hospedagem (separe por vírgula)" : "Nicho (pode separar por vírgula)"}
            </label>
            <input
              id="nicho"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus:border-primary focus:ring-4 focus:ring-primary-soft"
              placeholder={modo === "hospedagem" ? "chalé, cabana, pousada" : "barbearia, salão de beleza"}
              value={nicho}
              onChange={(e) => setNicho(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="areas" className="mb-1 block text-sm font-semibold text-ink-2">
              Regiões (separe por vírgula)
            </label>
            <input
              id="areas"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus:border-primary focus:ring-4 focus:ring-primary-soft"
              placeholder="Centro Palhoça SC, Pagani Palhoça SC"
              value={areas}
              onChange={(e) => setAreas(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {estimativaBuscas > 0
              ? `${termos.length} termo(s) × ${listaAreas.length} região(ões): vai gastar ${estimativaBuscas} busca(s) do seu saldo (até ${estimativaBuscas * 3} chamadas à API do Google).`
              : "Até 3 páginas de resultado do Google por busca."}
          </p>
          <button
            type="button"
            onClick={buscar}
            disabled={carregando}
            className="rounded-md bg-primary px-6 py-2.5 font-semibold text-primary-ink transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
          >
            {carregando ? "Buscando..." : "Buscar leads"}
          </button>
        </div>

        {erro && (
          <div className="mt-3 rounded-md border border-[#F6CACA] bg-[#FDECEC] px-3 py-2 text-sm text-danger">
            {erro}
          </div>
        )}
        {aviso && (
          <div className="mt-3 rounded-md border border-hot/30 bg-hot-soft px-3 py-2 text-sm text-[#8A5A00]">
            {aviso}
          </div>
        )}
      </div>

      {buscaFeita && (
        <div className="mt-6 grid gap-5 lg:grid-cols-[260px_1fr]">
          <aside className="flex flex-col gap-3">
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="mb-3 text-sm font-bold text-ink">Categorias</h2>
              <div className="flex flex-col gap-2 text-sm">
                {(
                  [
                    ["sem_site", "Sem site"],
                    ["booking", "Depende do Airbnb/Booking"],
                    ["rede_social", "Só app ou rede social"],
                    ["site_proprio", "Site próprio"],
                  ] as [Situacao, string][]
                ).map(([chave, rotulo]) => (
                  <label key={chave} className="flex items-center justify-between gap-2 text-ink-2">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={situacoesAtivas[chave]}
                        onChange={(e) =>
                          setSituacoesAtivas((s) => ({ ...s, [chave]: e.target.checked }))
                        }
                      />
                      {rotulo}
                    </span>
                    <span className="font-semibold text-muted">{contagens[chave]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="mb-3 text-sm font-bold text-ink">Filtros</h2>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Nota mínima</label>
                  <select
                    className="w-full rounded-md border border-line px-2 py-1.5 text-sm"
                    value={minNota}
                    onChange={(e) => setMinNota(parseFloat(e.target.value))}
                  >
                    <option value={0}>Qualquer</option>
                    <option value={3.5}>3,5+</option>
                    <option value={4}>4,0+</option>
                    <option value={4.5}>4,5+</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Avaliações</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-md border border-line px-2 py-1.5 text-sm"
                    value={minAvaliacoes}
                    onChange={(e) => setMinAvaliacoes(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
              <label className="mb-1 mt-3 block text-xs font-semibold text-ink-2">Bairro contém</label>
              <input
                className="w-full rounded-md border border-line px-2 py-1.5 text-sm"
                placeholder="ex.: Centro"
                value={textoEndereco}
                onChange={(e) => setTextoEndereco(e.target.value)}
              />
              <div className="mt-3 flex flex-col gap-2 text-sm text-ink-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={apenasCelular} onChange={(e) => setApenasCelular(e.target.checked)} />
                  Só com celular
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={apenasAberto} onChange={(e) => setApenasAberto(e.target.checked)} />
                  Só em funcionamento
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={esconderDesbloqueados}
                    onChange={(e) => setEsconderDesbloqueados(e.target.checked)}
                  />
                  Esconder já desbloqueados
                </label>
              </div>
            </div>
          </aside>

          <main>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink-2">
                {leadsFiltrados.length} de {leads.length} leads
              </p>
              <select
                className="rounded-md border border-line px-2 py-1.5 text-sm"
                value={ordenarPor}
                onChange={(e) => setOrdenarPor(e.target.value as keyof typeof ORDENS)}
              >
                <option value="pontuacao">Maior pontuação</option>
                <option value="avaliacoes">Mais avaliações</option>
                <option value="nota">Melhor nota</option>
                <option value="nome">Nome (A–Z)</option>
              </select>
            </div>

            <div className="flex flex-col gap-3">
              {leadsFiltrados.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  carregando={!!desbloqueando[lead.id]}
                  onDesbloquear={() => desbloquear(lead)}
                />
              ))}
              {!leadsFiltrados.length && (
                <div className="rounded-lg border border-line bg-surface p-10 text-center text-ink-2">
                  Nenhum lead com esses filtros. Ajuste a nota mínima ou ative mais categorias.
                </div>
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

function LeadCard({
  lead,
  carregando,
  onDesbloquear,
}: {
  lead: LeadResultado;
  carregando: boolean;
  onDesbloquear: () => void;
}) {
  const eHospedagem = lead.modo === "hospedagem" || lead.situacao === "booking";
  const modeloMsg = eHospedagem ? MSG_PADRAO_HOSPEDAGEM : MSG_PADRAO_NEGOCIOS;
  const plataforma = lead.plataforma || (eHospedagem ? "Airbnb ou Booking" : "redes sociais");
  const quente = lead.pontuacao >= 60;

  return (
    <article className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
          quente ? "bg-hot-soft text-[#8A5A00]" : "bg-canvas text-ink"
        }`}
        title={`Pontuação de lead: ${lead.pontuacao} de 100`}
      >
        {lead.pontuacao}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-ink">{lead.nome}</h3>
          <EtiquetaSituacao situacao={lead.situacao} plataforma={lead.plataforma} />
          {lead.tipo && <span className="text-xs text-muted">{lead.tipo}</span>}
        </div>
        <p className="mt-1 truncate text-sm text-ink-2">{lead.bairro || lead.area}</p>
        <div className="mt-1 flex items-center gap-3 text-sm text-ink-2">
          {lead.nota ? (
            <span>
              <span className="text-hot">★</span> {lead.nota.toFixed(1).replace(".", ",")}{" "}
              <span className="text-muted">({lead.avaliacoes})</span>
            </span>
          ) : (
            <span className="text-muted">Sem avaliações</span>
          )}
          {!lead.aberto && <span className="text-danger">Fechado</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {lead.contato ? (
          <>
            {lead.contato.whatsapp ? (
              <a
                target="_blank"
                rel="noopener"
                href={linkWhatsapp(lead.contato.whatsapp, montarMensagem(modeloMsg, lead.nome, plataforma))}
                className="rounded-md bg-wa px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110"
              >
                WhatsApp
              </a>
            ) : (
              <span className="text-sm text-ink-2">{lead.contato.telefone || "Sem telefone"}</span>
            )}
            {lead.contato.maps && (
              <a
                target="_blank"
                rel="noopener"
                href={lead.contato.maps}
                className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-canvas"
              >
                Maps
              </a>
            )}
            {lead.contato.site && (
              <a
                target="_blank"
                rel="noopener"
                href={lead.contato.site}
                className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-canvas"
              >
                Link
              </a>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={onDesbloquear}
            disabled={carregando}
            className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-ink transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
          >
            {carregando ? "Desbloqueando..." : "Desbloquear (1 crédito)"}
          </button>
        )}
      </div>
    </article>
  );
}
