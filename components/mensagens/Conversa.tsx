"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import Avatar from "@/components/Avatar";
import {
  IconeBandeira,
  IconeBloquear,
  IconeFechar,
  IconeImagem,
  IconeMandar,
  IconeMais,
  IconeSeta,
  IconeVisto,
  IconeVistoDuplo,
} from "@/components/Icones";
import { ALERTA_AVISO, ALERTA_ERRO, ALERTA_SUCESSO, BOTAO, BOTAO_NEUTRO, BOTAO_SECUNDARIO, CAMPO } from "@/components/ui";
import { chamarApi } from "@/components/comunidade/api";
import Janela from "@/components/comunidade/Janela";
import { createClient } from "@/lib/supabase/client";
import { urlAvatar } from "@/lib/comunidade/tipos";
import { ErroImagem, caminhoImagem, conferirImagem, reduzirImagem } from "@/lib/comunidade/imagem";
import {
  DETALHE_DENUNCIA_MAX,
  LINK_IMAGEM_SEG,
  MENSAGEM_MAX,
  MENSAGENS_BUCKET,
  MOTIVOS_DENUNCIA,
  type MotivoDenuncia,
} from "@/lib/mensagens/regras";
import type { Conversa as TipoConversa, EstadoChat, Mensagem } from "@/lib/mensagens/tipos";
import { useChat } from "./Contexto";
import { useMensagens, type EventoChat } from "./Resumo";

const POR_PAGINA = 40;
const FUSO = "America/Sao_Paulo";

// Mensagem na tela: a do servidor, ou uma "enviando…" ainda sem id real.
type Item = Mensagem & { enviando?: boolean; urlLocal?: string };

export default function Conversa({
  conversaInicial,
  mensagensIniciais,
  userId,
  estado,
}: {
  conversaInicial: TipoConversa;
  mensagensIniciais: Mensagem[];
  userId: string;
  estado: EstadoChat;
}) {
  const router = useRouter();
  const tempoReal = useMensagens();
  const { executar, mostrarRegras } = useChat();
  const [conversa, setConversa] = useState(conversaInicial);
  const [mensagens, setMensagens] = useState<Item[]>(mensagensIniciais);
  const [temAnteriores, setTemAnteriores] = useState(mensagensIniciais.length === POR_PAGINA);
  const [carregandoAnteriores, setCarregandoAnteriores] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [denunciando, setDenunciando] = useState(false);
  const lista = useRef<HTMLDivElement>(null);
  const noFim = useRef(true);
  const rolarParaFim = useRef<"sempre" | "se-no-fim" | null>("sempre");
  const id = conversa.id;
  const apelido = conversa.outro.apelido;

  // Rolagem: começa no fim; mensagem nova só puxa para baixo se a
  // pessoa já estava lendo o fim (ou se foi ela quem mandou).
  useLayoutEffect(() => {
    const el = lista.current;
    if (!el || !rolarParaFim.current) return;
    if (rolarParaFim.current === "sempre" || noFim.current) el.scrollTop = el.scrollHeight;
    rolarParaFim.current = null;
  }, [mensagens]);

  function aoRolar() {
    const el = lista.current;
    if (el) noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  const recarregarConversa = useCallback(async () => {
    const r = await chamarApi<{ conversa: TipoConversa }>(`/api/mensagens/conversas/${id}`);
    if (r.ok && r.dados?.conversa) setConversa(r.dados.conversa);
  }, [id]);

  // Abriu a conversa (ou chegou mensagem com a tela visível) = leu.
  const marcarLidas = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const r = await chamarApi<{ marcadas: number }>(`/api/mensagens/conversas/${id}/lidas`, "POST");
    if (r.ok && (r.dados?.marcadas ?? 0) > 0) tempoReal?.atualizar();
  }, [id, tempoReal]);

  // Busca as mensagens mais novas e junta com as da tela (usado quando a
  // pessoa volta para a aba: o celular pode ter perdido o tempo real).
  const sincronizar = useCallback(async () => {
    const r = await chamarApi<{ mensagens: Mensagem[] }>(`/api/mensagens/conversas/${id}/mensagens`);
    if (!r.ok || !r.dados) return;
    const novas = r.dados.mensagens;
    rolarParaFim.current = "se-no-fim";
    setMensagens((atuais) => {
      const porId = new Map(atuais.filter((m) => m.id > 0).map((m) => [m.id, m]));
      novas.forEach((m) => porId.set(m.id, m));
      const pendentes = atuais.filter((m) => m.id < 0);
      return [...[...porId.values()].sort((a, b) => a.id - b.id), ...pendentes];
    });
    void marcarLidas();
    void recarregarConversa();
  }, [id, marcarLidas, recarregarConversa]);

  useEffect(() => {
    void marcarLidas();
    function aoVoltar() {
      if (document.visibilityState === "visible") void sincronizar();
    }
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [marcarLidas, sincronizar]);

  // Tempo real: mensagem nova, "lida" nas minhas, e mudanças na conversa
  // (aceite, encerramento).
  useEffect(() => {
    if (!tempoReal) return;
    return tempoReal.ouvir((e: EventoChat) => {
      const linha = e.new as Record<string, unknown> | undefined;
      if (!linha || !("id" in linha)) return;
      if (e.table === "chat_conversas") {
        if (linha.id === id) void recarregarConversa();
        return;
      }
      if (linha.conversa_id !== id) return;
      const m: Mensagem = {
        id: linha.id as number,
        minha: linha.autor_id === userId,
        texto: (linha.texto as string) ?? "",
        imagem: (linha.imagem as string | null) ?? null,
        criado_em: linha.criado_em as string,
        lida_em: (linha.lida_em as string | null) ?? null,
      };
      if (e.eventType === "INSERT") {
        rolarParaFim.current = m.minha ? "sempre" : "se-no-fim";
        setMensagens((atuais) => (atuais.some((x) => x.id === m.id) ? atuais : [...atuais, m]));
        if (!m.minha) void marcarLidas();
      } else if (e.eventType === "UPDATE") {
        setMensagens((atuais) => atuais.map((x) => (x.id === m.id ? { ...x, lida_em: m.lida_em } : x)));
      }
    });
  }, [tempoReal, id, userId, marcarLidas, recarregarConversa]);

  async function carregarAnteriores() {
    const primeira = mensagens.find((m) => m.id > 0);
    if (!primeira) return;
    const el = lista.current;
    const alturaAntes = el?.scrollHeight ?? 0;
    setCarregandoAnteriores(true);
    const r = await chamarApi<{ mensagens: Mensagem[] }>(`/api/mensagens/conversas/${id}/mensagens?antes=${primeira.id}`);
    setCarregandoAnteriores(false);
    if (!r.ok || !r.dados) return setErroAcao(r.erro);
    const antigas = r.dados.mensagens;
    setTemAnteriores(antigas.length === POR_PAGINA);
    setMensagens((atuais) => [...antigas.filter((a) => !atuais.some((x) => x.id === a.id)), ...atuais]);
    // Mantém na tela a mesma mensagem que a pessoa estava vendo.
    requestAnimationFrame(() => {
      if (el) el.scrollTop += el.scrollHeight - alturaAntes;
    });
  }

  async function agir(acao: "aceitar" | "encerrar", confirmacao?: string) {
    if (confirmacao && !window.confirm(confirmacao)) return;
    setErroAcao(null);
    const r = await executar(() =>
      chamarApi<{ situacao: string }>(`/api/mensagens/conversas/${id}`, "POST", { acao }),
    );
    if (!r.ok) return setErroAcao(r.erro);
    tempoReal?.atualizar();
    if (r.dados?.situacao === "cancelada" || r.dados?.situacao === "recusada") {
      router.push("/painel/mensagens");
      router.refresh();
      return;
    }
    await recarregarConversa();
  }

  async function bloquear(sim: boolean) {
    if (!apelido) return;
    const texto = sim
      ? `Bloquear ${apelido}? A conversa é encerrada, some da sua lista e ${apelido} não consegue mais te mandar pedido. Dá para desbloquear depois.`
      : `Desbloquear ${apelido}? A conversa não reabre sozinha: vai ser preciso um pedido novo.`;
    if (!window.confirm(texto)) return;
    setErroAcao(null);
    const r = await chamarApi("/api/mensagens/bloqueios", "POST", { apelido, bloquear: sim });
    if (!r.ok) return setErroAcao(r.erro);
    tempoReal?.atualizar();
    if (sim) {
      router.push("/painel/mensagens");
      router.refresh();
      return;
    }
    await recarregarConversa();
  }

  const minhas = mensagens.filter((m) => m.minha);
  const podeDenunciar = mensagens.some((m) => !m.minha && m.id > 0);

  return (
    <div className="fixed inset-x-0 top-[calc(4rem+1px+env(safe-area-inset-top))] bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] z-20 flex flex-col bg-canvas md:static md:mx-auto md:h-[calc(100dvh-9rem)] md:max-w-3xl md:border md:border-line">
      {/* Topo: voltar, pessoa e menu */}
      <header className="px-seguro flex min-h-16 shrink-0 items-center gap-2 border-b border-line-2 bg-surface md:px-4">
        <Link
          href="/painel/mensagens"
          aria-label="Voltar para as mensagens"
          className="-ml-2 flex min-h-11 min-w-11 items-center justify-center text-ink-2 transition hover:text-ink"
        >
          <IconeSeta className="rotate-180" />
        </Link>
        <Avatar
          fotoUrl={urlAvatar(conversa.outro.foto_path)}
          avatarPronto={conversa.outro.avatar_pronto}
          apelido={apelido}
          tamanho={36}
        />
        <div className="min-w-0 flex-1">
          {apelido ? (
            <Link
              href={`/painel/comunidade/u/${encodeURIComponent(apelido)}`}
              className="block truncate font-semibold text-ink hover:underline"
            >
              {apelido}
            </Link>
          ) : (
            <span className="block truncate font-semibold text-ink">Conta removida</span>
          )}
          <span className="block truncate text-xs text-muted">{textoSituacao(conversa)}</span>
        </div>
        <MenuConversa
          conversa={conversa}
          podeDenunciar={podeDenunciar}
          onRegras={mostrarRegras}
          onEncerrar={() =>
            void agir(
              "encerrar",
              conversa.situacao === "aceita"
                ? `Desfazer a conversa com ${apelido ?? "esta pessoa"}? Ninguém mais consegue mandar mensagens nela. O histórico continua aqui.`
                : conversa.eu_pedi
                  ? "Cancelar o seu pedido de conversa?"
                  : "Recusar este pedido de conversa?",
            )
          }
          onBloquear={() => void bloquear(!conversa.eu_bloqueei)}
          onDenunciar={() => setDenunciando(true)}
        />
      </header>

      {erroAcao && (
        <p role="alert" className={`${ALERTA_ERRO} mx-3 mt-2 md:mx-4`}>
          {erroAcao}
        </p>
      )}
      {aviso && (
        <p role="status" className={`${ALERTA_SUCESSO} mx-3 mt-2 md:mx-4`}>
          {aviso}
        </p>
      )}

      {/* Mensagens */}
      <div
        ref={lista}
        onScroll={aoRolar}
        className="px-seguro min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 md:px-4"
        aria-live="polite"
        aria-relevant="additions"
      >
        {temAnteriores && (
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={carregarAnteriores}
              disabled={carregandoAnteriores}
              className={BOTAO_NEUTRO}
            >
              {carregandoAnteriores ? "Carregando…" : "Carregar anteriores"}
            </button>
          </div>
        )}
        {mensagens.length === 0 ? (
          <p className="mx-auto mt-8 max-w-sm text-center text-sm text-ink-2">
            {conversa.situacao === "aceita"
              ? "Conversa aberta. Mande a primeira mensagem!"
              : conversa.situacao === "pendente"
                ? "Nenhuma mensagem ainda. As mensagens só podem ser enviadas depois que o pedido for aceito."
                : "Nenhuma mensagem nesta conversa."}
          </p>
        ) : (
          <ol className="space-y-1.5">
            {mensagens.map((m, i) => {
              const dia = diaDe(m.criado_em);
              const novoDia = i === 0 || diaDe(mensagens[i - 1].criado_em) !== dia;
              const ultimaMinha = m.minha && m === minhas[minhas.length - 1];
              return (
                <li key={m.id}>
                  {novoDia && (
                    <p className="my-3 text-center font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">
                      {rotuloDia(m.criado_em)}
                    </p>
                  )}
                  <Balao mensagem={m} mostrarSituacao={ultimaMinha} />
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Rodapé: responder, aceitar ou aviso */}
      <div className="px-seguro shrink-0 border-t border-line-2 bg-surface pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-4 md:pb-3">
        <Rodape conversa={conversa} estado={estado} onAgir={agir} onBloquear={() => void bloquear(false)}>
          <Envio
            conversaId={id}
            userId={userId}
            onEnviando={(temp) => {
              rolarParaFim.current = "sempre";
              setMensagens((atuais) => [...atuais, temp]);
            }}
            onEnviada={(tempId, m) => {
              setMensagens((atuais) => {
                const semTemp = atuais.filter((x) => x.id !== tempId);
                return semTemp.some((x) => x.id === m.id) ? semTemp : [...semTemp, m];
              });
            }}
            onFalhou={(tempId) => setMensagens((atuais) => atuais.filter((x) => x.id !== tempId))}
            executar={executar}
          />
        </Rodape>
        <p className="mt-1.5 text-center text-[11px] leading-snug text-muted">
          Conversa privada. Se alguém denunciar, as últimas mensagens vão para a administração.{" "}
          <button type="button" onClick={mostrarRegras} className="font-semibold underline hover:text-ink">
            Regras
          </button>
        </p>
      </div>

      {denunciando && (
        <JanelaDenuncia
          conversaId={id}
          apelido={apelido}
          onFechar={() => setDenunciando(false)}
          onFeito={(bloqueou) => {
            setDenunciando(false);
            tempoReal?.atualizar();
            if (bloqueou) {
              router.push("/painel/mensagens");
              router.refresh();
              return;
            }
            setAviso("Denúncia enviada. A administração vai ler as últimas mensagens e decidir.");
          }}
        />
      )}
    </div>
  );
}

function textoSituacao(c: TipoConversa) {
  switch (c.situacao) {
    case "aceita":
      return c.fora_do_limite ? "Só leitura (limite do plano Grátis)" : "Conversa aberta";
    case "pendente":
      return c.eu_pedi ? "Pedido enviado, esperando resposta" : "Quer conversar com você";
    case "encerrada":
      return "Conversa encerrada";
    default:
      return "Sem conversa aberta";
  }
}

function diaDe(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: FUSO });
}

function rotuloDia(iso: string) {
  const dia = diaDe(iso);
  const hoje = diaDe(new Date().toISOString());
  const ontem = diaDe(new Date(Date.now() - 86400000).toISOString());
  if (dia === hoje) return "Hoje";
  if (dia === ontem) return "Ontem";
  return dia;
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
}

function Balao({ mensagem: m, mostrarSituacao }: { mensagem: Item; mostrarSituacao: boolean }) {
  return (
    <div className={`flex ${m.minha ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] border px-3 py-2 sm:max-w-[70%] ${
          m.minha ? "border-destaque/30 bg-primary-soft" : "border-line bg-surface"
        } ${m.enviando ? "opacity-70" : ""}`}
      >
        {m.imagem && <ImagemMensagem path={m.imagem} urlLocal={m.urlLocal} />}
        {m.texto && (
          <p className={`whitespace-pre-wrap break-words text-[15px] text-ink ${m.imagem ? "mt-2" : ""}`}>{m.texto}</p>
        )}
        <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted">
          <time dateTime={m.criado_em}>{hora(m.criado_em)}</time>
          {m.minha &&
            (m.enviando ? (
              <span>· enviando…</span>
            ) : m.lida_em ? (
              <>
                <IconeVistoDuplo width={15} height={15} className="text-destaque" />
                <span className={mostrarSituacao ? "" : "sr-only"}>Lida</span>
              </>
            ) : (
              <>
                <IconeVisto width={15} height={15} />
                <span className={mostrarSituacao ? "" : "sr-only"}>Enviada</span>
              </>
            ))}
        </p>
      </div>
    </div>
  );
}

// O bucket é privado: cada imagem abre por um link temporário, que só
// as duas pessoas da conversa conseguem gerar (regra do Storage).
const cacheLinks = new Map<string, { url: string; ate: number }>();

function ImagemMensagem({ path, urlLocal }: { path: string; urlLocal?: string }) {
  const [url, setUrl] = useState<string | null>(() => {
    const guardado = cacheLinks.get(path);
    return urlLocal ?? (guardado && guardado.ate > Date.now() ? guardado.url : null);
  });
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (url) return;
    let ativo = true;
    createClient()
      .storage.from(MENSAGENS_BUCKET)
      .createSignedUrl(path, LINK_IMAGEM_SEG)
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error || !data?.signedUrl) return setFalhou(true);
        cacheLinks.set(path, { url: data.signedUrl, ate: Date.now() + (LINK_IMAGEM_SEG - 60) * 1000 });
        setUrl(data.signedUrl);
      });
    return () => {
      ativo = false;
    };
  }, [path, url]);

  if (falhou) return <p className="text-sm text-muted">Imagem indisponível.</p>;
  if (!url) return <div className="esqueleto h-48 w-56 max-w-full" aria-label="Carregando imagem" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Imagem enviada na conversa" className="max-h-72 w-auto max-w-full border border-line object-contain" />
    </a>
  );
}

function Rodape({
  conversa: c,
  estado,
  onAgir,
  onBloquear,
  children,
}: {
  conversa: TipoConversa;
  estado: EstadoChat;
  onAgir: (acao: "aceitar" | "encerrar", confirmacao?: string) => Promise<void>;
  onBloquear: () => void;
  children: React.ReactNode;
}) {
  const [enviando, setEnviando] = useState(false);

  async function responder(acao: "aceitar" | "encerrar") {
    setEnviando(true);
    await onAgir(acao);
    setEnviando(false);
  }

  if (c.eu_bloqueei) {
    return (
      <p className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm text-ink-2">
        Você bloqueou esta pessoa.
        <button type="button" onClick={onBloquear} className={BOTAO_NEUTRO}>
          Desbloquear
        </button>
      </p>
    );
  }
  if (c.situacao === "pendente" && !c.eu_pedi) {
    return (
      <div className="py-1">
        <p className="text-sm text-ink-2">
          <strong className="text-ink">{c.outro.apelido ?? "Esta pessoa"}</strong> quer conversar com você. Nada é
          entregue até você aceitar.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" onClick={() => responder("encerrar")} disabled={enviando} className={BOTAO_NEUTRO}>
            Recusar
          </button>
          <button type="button" onClick={() => responder("aceitar")} disabled={enviando} className={BOTAO}>
            Aceitar
          </button>
        </div>
      </div>
    );
  }
  if (c.situacao === "pendente") {
    return (
      <p className="py-2 text-sm text-ink-2">
        Pedido enviado. Quando <strong className="text-ink">{c.outro.apelido ?? "a pessoa"}</strong> aceitar, vocês
        podem conversar.
      </p>
    );
  }
  if (c.situacao !== "aceita") {
    return <p className="py-2 text-sm text-ink-2">Esta conversa foi encerrada. Não dá para mandar mensagens nela.</p>;
  }
  if (estado.suspenso) {
    return (
      <p className={`${ALERTA_ERRO} my-1`}>
        Sua conta está suspensa da comunidade: você lê a conversa, mas não envia mensagens.
      </p>
    );
  }
  if (c.fora_do_limite) {
    return (
      <p className={`${ALERTA_AVISO} my-1`}>
        No plano Grátis você responde em até {estado.limite_ativas ?? 3} conversas abertas. Desfaça outra conversa ou{" "}
        <Link href="/painel/plano" className="font-semibold underline">
          assine o Solo ou o Pro
        </Link>
        .
      </p>
    );
  }
  if (!c.pode_enviar) {
    return <p className="py-2 text-sm text-ink-2">Não é possível enviar mensagens nesta conversa.</p>;
  }
  return <>{children}</>;
}

function Envio({
  conversaId,
  userId,
  onEnviando,
  onEnviada,
  onFalhou,
  executar,
}: {
  conversaId: number;
  userId: string;
  onEnviando: (m: Item) => void;
  onEnviada: (tempId: number, m: Mensagem) => void;
  onFalhou: (tempId: number) => void;
  executar: ReturnType<typeof useChat>["executar"];
}) {
  const campo = useId();
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<{ file: File; url: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const caixa = useRef<HTMLTextAreaElement>(null);
  const escolher = useRef<HTMLInputElement>(null);
  const contador = useRef(0);
  const tamanho = [...texto].length;

  // A caixa cresce com o texto até ~5 linhas.
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [texto]);

  useEffect(() => () => {
    if (arquivo) URL.revokeObjectURL(arquivo.url);
  }, [arquivo]);

  function escolherImagem(f: File | undefined) {
    setErro(null);
    if (escolher.current) escolher.current.value = "";
    if (!f) return;
    try {
      conferirImagem(f);
    } catch (e) {
      return setErro(e instanceof ErroImagem ? e.message : "Não foi possível usar essa imagem.");
    }
    setArquivo({ file: f, url: URL.createObjectURL(f) });
  }

  async function enviar(e?: FormEvent) {
    e?.preventDefault();
    if (enviando) return;
    const conteudo = texto.trim();
    if (!conteudo && !arquivo) return;
    if ([...conteudo].length > MENSAGEM_MAX) return setErro(`A mensagem pode ter no máximo ${MENSAGEM_MAX} caracteres.`);
    setErro(null);
    setEnviando(true);

    const supabase = createClient();
    let path: string | null = null;
    const anexo = arquivo;
    if (anexo) {
      try {
        const pronta = await reduzirImagem(anexo.file);
        path = `${conversaId}/${caminhoImagem(userId, pronta.extensao)}`;
        const { error } = await supabase.storage
          .from(MENSAGENS_BUCKET)
          .upload(path, pronta.blob, { contentType: pronta.tipo, upsert: false });
        if (error) throw new ErroImagem("Não foi possível enviar a imagem nesta conversa. Tente de novo.");
      } catch (err) {
        setEnviando(false);
        return setErro(err instanceof ErroImagem ? err.message : "Não foi possível enviar a imagem.");
      }
    }

    const tempId = -++contador.current;
    onEnviando({
      id: tempId,
      minha: true,
      texto: conteudo,
      imagem: path,
      urlLocal: anexo?.url,
      criado_em: new Date().toISOString(),
      lida_em: null,
      enviando: true,
    });
    setTexto("");
    setArquivo(null);

    const r = await executar(() =>
      chamarApi<{ mensagem: Mensagem }>(`/api/mensagens/conversas/${conversaId}/mensagens`, "POST", {
        texto: conteudo,
        imagem: path,
      }),
    );
    setEnviando(false);
    if (!r.ok || !r.dados) {
      onFalhou(tempId);
      // Devolve o texto para a pessoa não perder o que escreveu.
      setTexto((atual) => atual || conteudo);
      if (r.erro) setErro(r.erro);
      return;
    }
    onEnviada(tempId, r.dados.mensagem);
    caixa.current?.focus();
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // No computador, Enter envia e Shift+Enter pula linha. No celular
    // (tela de toque), Enter pula linha e quem envia é o botão.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !window.matchMedia("(pointer: coarse)").matches) {
      e.preventDefault();
      void enviar();
    }
  }

  return (
    <form onSubmit={enviar}>
      {erro && (
        <p role="alert" className={`${ALERTA_ERRO} mb-2`}>
          {erro}
        </p>
      )}
      {arquivo && (
        <div className="mb-2 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={arquivo.url} alt="Imagem escolhida" className="h-16 w-16 border border-line object-cover" />
          <button
            type="button"
            onClick={() => setArquivo(null)}
            disabled={enviando}
            className="flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-ink-2 hover:text-ink"
          >
            <IconeFechar width={16} height={16} />
            Tirar imagem
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={escolher}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => escolherImagem(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => escolher.current?.click()}
          disabled={enviando}
          aria-label="Anexar imagem (JPG, PNG ou WEBP, até 5 MB)"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center border border-line-input text-ink-2 transition hover:text-ink"
        >
          <IconeImagem />
        </button>
        <label htmlFor={campo} className="sr-only">
          Mensagem
        </label>
        <textarea
          ref={caixa}
          id={campo}
          rows={1}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={aoTeclar}
          maxLength={MENSAGEM_MAX + 50}
          placeholder="Escreva uma mensagem"
          enterKeyHint="send"
          className={`${CAMPO} min-h-11 resize-none py-2.5 leading-snug`}
        />
        <button
          type="submit"
          disabled={enviando || (!texto.trim() && !arquivo)}
          aria-label="Enviar"
          className="ap-cut-s flex min-h-11 min-w-11 shrink-0 items-center justify-center bg-primary text-primary-ink transition hover:bg-primary-hover disabled:opacity-50"
        >
          <IconeMandar />
        </button>
      </div>
      {tamanho > MENSAGEM_MAX - 200 && (
        <p className={`mt-1 text-right text-xs tabular-nums ${tamanho > MENSAGEM_MAX ? "text-danger" : "text-muted"}`}>
          {tamanho}/{MENSAGEM_MAX}
        </p>
      )}
    </form>
  );
}

function MenuConversa({
  conversa: c,
  podeDenunciar,
  onRegras,
  onEncerrar,
  onBloquear,
  onDenunciar,
}: {
  conversa: TipoConversa;
  podeDenunciar: boolean;
  onRegras: () => void;
  onEncerrar: () => void;
  onBloquear: () => void;
  onDenunciar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!aberto) return;
    function fora(e: PointerEvent) {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  const item = "flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm font-semibold transition hover:bg-realce-2";
  const escolher = (fn: () => void) => () => {
    setAberto(false);
    fn();
  };
  const textoEncerrar =
    c.situacao === "aceita"
      ? "Desfazer conversa"
      : c.situacao === "pendente"
        ? c.eu_pedi
          ? "Cancelar pedido"
          : "Recusar pedido"
        : null;

  return (
    <div ref={caixa} className="relative shrink-0">
      <button
        type="button"
        aria-label="Opções da conversa"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto((v) => !v)}
        className="-mr-2 flex min-h-11 min-w-11 items-center justify-center text-ink-2 transition hover:text-ink"
      >
        <IconeMais />
      </button>
      {aberto && (
        <div
          id={id}
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-56 border border-line-strong bg-surface py-1 shadow-[0_12px_32px_var(--color-sombra)]"
        >
          {textoEncerrar && (
            <button type="button" role="menuitem" onClick={escolher(onEncerrar)} className={`${item} text-ink-2 hover:text-ink`}>
              <IconeFechar width={18} height={18} />
              {textoEncerrar}
            </button>
          )}
          {c.outro.apelido && (
            <button type="button" role="menuitem" onClick={escolher(onBloquear)} className={`${item} text-danger`}>
              <IconeBloquear width={18} height={18} />
              {c.eu_bloqueei ? "Desbloquear" : "Bloquear"}
            </button>
          )}
          {podeDenunciar && (
            <button type="button" role="menuitem" onClick={escolher(onDenunciar)} className={`${item} text-danger`}>
              <IconeBandeira width={18} height={18} />
              Denunciar conversa
            </button>
          )}
          <button type="button" role="menuitem" onClick={escolher(onRegras)} className={`${item} text-ink-2 hover:text-ink`}>
            Regras das mensagens
          </button>
        </div>
      )}
    </div>
  );
}

function JanelaDenuncia({
  conversaId,
  apelido,
  onFechar,
  onFeito,
}: {
  conversaId: number;
  apelido: string | null;
  onFechar: () => void;
  onFeito: (bloqueou: boolean) => void;
}) {
  const campo = useId();
  const [motivo, setMotivo] = useState<MotivoDenuncia | null>(null);
  const [detalhe, setDetalhe] = useState("");
  const [bloquear, setBloquear] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!motivo) return setErro("Escolha o motivo.");
    setErro(null);
    setEnviando(true);
    const r = await chamarApi(`/api/mensagens/conversas/${conversaId}/denunciar`, "POST", {
      motivo,
      detalhe: detalhe.trim(),
      bloquear: bloquear && !!apelido,
    });
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    onFeito(bloquear && !!apelido);
  }

  return (
    <Janela titulo="Denunciar conversa" onFechar={onFechar} travada={enviando}>
      <form onSubmit={enviar} className="space-y-4">
        <p className={ALERTA_AVISO}>
          As últimas 30 mensagens desta conversa (as suas e as de {apelido ?? "outra pessoa"}, com as imagens) vão
          para a administração do Ártemis, que vai ler e decidir. {apelido ?? "A pessoa"} não fica sabendo quem
          denunciou.
        </p>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-campo">Qual o problema?</legend>
          <div className="space-y-1">
            {(Object.keys(MOTIVOS_DENUNCIA) as MotivoDenuncia[]).map((m) => (
              <label
                key={m}
                className={`flex min-h-11 cursor-pointer items-center gap-3 border px-3 text-sm transition ${
                  motivo === m ? "border-destaque bg-primary-soft text-ink" : "border-line text-ink-2 hover:text-ink"
                }`}
              >
                <input
                  type="radio"
                  name={`${campo}-motivo`}
                  value={m}
                  checked={motivo === m}
                  onChange={() => setMotivo(m)}
                  className="accent-destaque"
                />
                {MOTIVOS_DENUNCIA[m]}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={`${campo}-detalhe`} className="mb-1.5 block text-sm font-semibold text-campo">
            Detalhe <span className="font-normal text-muted">(opcional)</span>
          </label>
          <textarea
            id={`${campo}-detalhe`}
            value={detalhe}
            onChange={(e) => setDetalhe(e.target.value)}
            maxLength={DETALHE_DENUNCIA_MAX}
            rows={3}
            className={`${CAMPO} resize-y`}
          />
        </div>
        {apelido && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={bloquear}
              onChange={(e) => setBloquear(e.target.checked)}
              className="h-5 w-5 accent-destaque"
            />
            Bloquear {apelido} também
          </label>
        )}
        {erro && (
          <p role="alert" className={ALERTA_ERRO}>
            {erro}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>
            Cancelar
          </button>
          <button type="submit" disabled={enviando} className={BOTAO}>
            {enviando ? "Enviando…" : "Enviar denúncia"}
          </button>
        </div>
      </form>
    </Janela>
  );
}
