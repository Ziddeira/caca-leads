"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ALERTA_ERRO, ALERTA_SUCESSO, BOTAO, BOTAO_SECUNDARIO, CAMPO, CARTAO, ROTULO } from "@/components/ui";

export interface Aviso {
  id: number;
  titulo: string;
  texto: string;
  link: string | null;
  inicio_em: string;
  fim_em: string;
  plano_alvo: string | null;
  criado_em: string;
  entregues: number;
  lidas: number;
}

const PARA_QUEM: Record<string, string> = { "": "Todos", gratis: "Só plano Grátis", solo: "Só plano Solo", pro: "Só plano Pro" };

// Páginas do painel que o aviso pode abrir (nunca um site de fora).
const LINKS = [
  { valor: "", nome: "Sem link" },
  { valor: "/painel/buscar", nome: "Buscar" },
  { valor: "/painel/meus-leads", nome: "Meus leads" },
  { valor: "/painel/score", nome: "Score" },
  { valor: "/painel/rank", nome: "Rank do mês" },
  { valor: "/painel/comunidade", nome: "Comunidade" },
  { valor: "/painel/plano", nome: "Meu plano" },
  { valor: "/painel/perfil", nome: "Perfil" },
];

function dataDoDia(aaaammdd: string) {
  const [a, m, d] = aaaammdd.split("-");
  return `${d}/${m}/${a}`;
}

function somarDias(aaaammdd: string, dias: number) {
  const d = new Date(`${aaaammdd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export default function AvisosClient({ avisos, hoje }: { avisos: Aviso[]; hoje: string }) {
  const router = useRouter();
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [link, setLink] = useState("");
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(somarDias(hoje, 7));
  const [plano, setPlano] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/admin/avisos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, texto, link, inicio, fim, plano }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(corpo.erro || "Não foi possível salvar.");
      setSucesso(
        inicio <= hoje
          ? `Aviso publicado e entregue agora para ${corpo.entregues} pessoa(s).`
          : `Aviso agendado: começa a aparecer em ${dataDoDia(inicio)}.`,
      );
      setTitulo("");
      setTexto("");
      setLink("");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-bold text-ink">Novo aviso</h2>
        <p className="mt-0.5 text-sm text-ink-2">
          Aparece no sino de quem você escolher, entre a data de início e a de fim. Quem se cadastrar durante o
          período também recebe.
        </p>
        <form onSubmit={enviar} className={`${CARTAO} mt-3 space-y-4 p-4 sm:p-5`}>
          <div>
            <label htmlFor="aviso-titulo" className={ROTULO}>Título</label>
            <input id="aviso-titulo" required maxLength={120} className={CAMPO} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            <p className="mt-1 text-xs text-muted">{titulo.length}/120</p>
          </div>
          <div>
            <label htmlFor="aviso-texto" className={ROTULO}>Texto</label>
            <textarea id="aviso-texto" required maxLength={600} rows={4} className={`${CAMPO} resize-y`} value={texto} onChange={(e) => setTexto(e.target.value)} />
            <p className="mt-1 text-xs text-muted">{texto.length}/600</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="aviso-link" className={ROTULO}>Link (opcional)</label>
              <select id="aviso-link" className={CAMPO} value={link} onChange={(e) => setLink(e.target.value)}>
                {LINKS.map((l) => (
                  <option key={l.valor} value={l.valor}>{l.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="aviso-plano" className={ROTULO}>Para quem</label>
              <select id="aviso-plano" className={CAMPO} value={plano} onChange={(e) => setPlano(e.target.value)}>
                {Object.entries(PARA_QUEM).map(([valor, nome]) => (
                  <option key={valor} value={valor}>{nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="aviso-inicio" className={ROTULO}>Começa em</label>
              <input id="aviso-inicio" type="date" required className={CAMPO} value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div>
              <label htmlFor="aviso-fim" className={ROTULO}>Termina em (inclusive)</label>
              <input id="aviso-fim" type="date" required min={inicio} className={CAMPO} value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
          {erro && <p role="alert" className={ALERTA_ERRO}>{erro}</p>}
          {sucesso && <p role="status" className={ALERTA_SUCESSO}>{sucesso}</p>}
          <button type="submit" disabled={enviando} className={`${BOTAO} w-full sm:w-auto`}>
            {enviando ? "Enviando…" : inicio <= hoje ? "Publicar aviso" : "Agendar aviso"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Avisos enviados</h2>
        {avisos.length === 0 ? (
          <p className="mt-2 text-sm text-ink-2">Nenhum aviso ainda.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {avisos.map((a) => (
              <li key={a.id}>
                <CartaoAviso aviso={a} hoje={hoje} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CartaoAviso({ aviso: a, hoje }: { aviso: Aviso; hoje: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const situacao = a.fim_em < hoje ? "Encerrado" : a.inicio_em > hoje ? "Agendado" : "No ar";
  const entregues = Number(a.entregues);
  const lidas = Number(a.lidas);

  async function apagar() {
    setApagando(true);
    setErro(null);
    const res = await fetch(`/api/admin/avisos?id=${a.id}`, { method: "DELETE" });
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(corpo.erro || "Não foi possível apagar.");
      setApagando(false);
      return;
    }
    router.refresh();
  }

  return (
    <article className={`${CARTAO} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-words font-bold text-ink">{a.titulo}</h3>
        <span
          className={`border px-2 py-[3px] font-display text-[11px] font-semibold uppercase leading-tight tracking-[0.08em] ${
            situacao === "No ar" ? "border-primary bg-primary text-primary-ink" : situacao === "Agendado" ? "border-destaque text-destaque" : "border-line-strong text-ink-2"
          }`}
        >
          {situacao}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-line break-words text-sm text-ink-2">{a.texto}</p>
      <p className="mt-2 text-xs text-muted">
        {dataDoDia(a.inicio_em)} a {dataDoDia(a.fim_em)} · {PARA_QUEM[a.plano_alvo ?? ""]}
        {a.link && ` · abre ${a.link}`}
      </p>
      <p className="mt-1 text-sm font-semibold text-ink">
        {lidas} de {entregues} leram
        {entregues > 0 && ` (${Math.round((lidas / entregues) * 100)}%)`}
      </p>
      {erro && <p role="alert" className={`mt-2 ${ALERTA_ERRO}`}>{erro}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {confirmando ? (
          <>
            <button type="button" disabled={apagando} onClick={() => setConfirmando(false)} className={BOTAO_SECUNDARIO}>
              Voltar
            </button>
            <button type="button" disabled={apagando} onClick={apagar} className={`${BOTAO} bg-danger!`}>
              {apagando ? "Apagando…" : "Apagar do sino de todos"}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmando(true)} className={BOTAO_SECUNDARIO}>
            Apagar
          </button>
        )}
      </div>
    </article>
  );
}
