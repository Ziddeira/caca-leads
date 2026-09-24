"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import Avatar from "@/components/Avatar";
import { IconeCamera } from "@/components/Icones";
import {
  ALERTA_AVISO,
  ALERTA_ERRO,
  ALERTA_SUCESSO,
  BOTAO,
  BOTAO_SECUNDARIO,
  CAMPO,
  CARTAO as CARTAO_BASE,
  ROTULO,
  TituloPagina,
} from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { DadosPerfil } from "@/lib/perfil/dados";
import RecorteFoto from "@/components/RecorteFoto";
import { ErroFoto, abrirFoto, liberarFoto, recortarFoto, type AreaRecorte } from "@/lib/perfil/imagem";
import {
  APELIDO_MAX,
  FOTO_BUCKET,
  FOTO_TIPOS,
  SENHA_MIN,
  mascararTelefone,
  situacaoTelefone,
  soDigitos,
  validarApelido,
  validarTelefone,
} from "@/lib/perfil/regras";

const CARTAO = `${CARTAO_BASE} p-5 sm:p-6`;
const TITULO_CARTAO = "text-lg font-bold text-ink";
const AJUDA = "mt-1.5 text-sm text-muted";

type Mensagem = { tipo: "ok" | "erro"; texto: string } | null;

function Alerta({ mensagem }: { mensagem: Mensagem }) {
  if (!mensagem) return null;
  return mensagem.tipo === "ok" ? (
    <p role="status" className={ALERTA_SUCESSO}>
      {mensagem.texto}
    </p>
  ) : (
    <p role="alert" className={ALERTA_ERRO}>
      {mensagem.texto}
    </p>
  );
}

async function chamar(url: string, metodo: string, corpo?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: corpo ? { "Content-Type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    if (res.ok) return null;
    const dados = await res.json().catch(() => ({}));
    return dados.erro || "Não foi possível salvar agora.";
  } catch {
    return "Não foi possível falar com o servidor agora.";
  }
}

export default function PerfilClient({
  userId,
  email,
  emailPendente,
  avisoEmail,
  perfil,
  pendente,
}: {
  userId: string;
  email: string;
  emailPendente: string | null;
  avisoEmail: "confirmado" | "parcial" | null;
  perfil: DadosPerfil | null;
  pendente: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        titulo="Perfil"
        descricao="Seus dados de cadastro. Nada aqui muda seu plano, créditos ou buscas."
      />

      {pendente && (
        <p role="alert" className={ALERTA_AVISO}>
          O perfil ainda não foi ativado no banco. Rode o script
          supabase/etapa5-perfil.sql no Supabase para liberar apelido, foto e telefone.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          <CartaoFoto userId={userId} perfil={perfil} email={email} desativado={pendente} />
          <CartaoDados perfil={perfil} desativado={pendente} />
        </div>
        <div className="flex flex-col gap-6">
          <CartaoEmail email={email} emailPendente={emailPendente} aviso={avisoEmail} />
          <CartaoSenha />
        </div>
      </div>
    </div>
  );
}

// Foto ------------------------------------------------------------------
function CartaoFoto({
  userId,
  perfil,
  email,
  desativado,
}: {
  userId: string;
  perfil: DadosPerfil | null;
  email: string;
  desativado: boolean;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState<"enviar" | "remover" | null>(null);
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  const [recortando, setRecortando] = useState<HTMLImageElement | null>(null);
  const botaoFoto = useRef<HTMLButtonElement>(null);

  // 1º passo: confere o arquivo e abre a janela de recorte.
  async function escolher(arquivo: File | undefined) {
    if (entrada.current) entrada.current.value = "";
    if (!arquivo) return;
    setMensagem(null);
    try {
      setRecortando(await abrirFoto(arquivo));
    } catch (e) {
      setMensagem({
        tipo: "erro",
        texto: e instanceof ErroFoto ? e.message : "Não foi possível abrir a imagem.",
      });
    }
  }

  function fecharRecorte() {
    if (recortando) liberarFoto(recortando);
    setRecortando(null);
    botaoFoto.current?.focus();
  }

  // 2º passo: gera o quadrado recortado (até 512×512) e envia.
  async function enviar(area: AreaRecorte) {
    if (!recortando) return;
    const imagem = recortando;
    setEnviando("enviar");
    try {
      const foto = await recortarFoto(imagem, area);
      fecharRecorte();
      const supabase = createClient();
      // Nome novo a cada envio: o link muda e ninguém vê a foto antiga em cache.
      const path = `${userId}/${Date.now()}.${foto.extensao}`;
      const { error } = await supabase.storage
        .from(FOTO_BUCKET)
        .upload(path, foto.blob, { contentType: foto.tipo, cacheControl: "31536000", upsert: false });
      if (error) {
        console.error("[perfil] Falha no envio da foto:", error.message);
        setMensagem({ tipo: "erro", texto: "Não foi possível enviar a foto. Tente de novo." });
        return;
      }
      const erro = await chamar("/api/perfil/foto", "POST", { path });
      if (erro) {
        // Não ficou gravada no perfil: apaga o arquivo que acabou de subir.
        await supabase.storage.from(FOTO_BUCKET).remove([path]);
        setMensagem({ tipo: "erro", texto: erro });
        return;
      }
      setMensagem({ tipo: "ok", texto: "Foto atualizada." });
      router.refresh();
    } catch (e) {
      fecharRecorte();
      setMensagem({
        tipo: "erro",
        texto: e instanceof ErroFoto ? e.message : "Não foi possível processar a imagem.",
      });
    } finally {
      setEnviando(null);
    }
  }

  async function remover() {
    setMensagem(null);
    setEnviando("remover");
    const erro = await chamar("/api/perfil/foto", "DELETE");
    setEnviando(null);
    if (erro) {
      setMensagem({ tipo: "erro", texto: erro });
      return;
    }
    setMensagem({ tipo: "ok", texto: "Foto removida." });
    router.refresh();
  }

  return (
    <section aria-labelledby="titulo-foto" className={CARTAO}>
      <h2 id="titulo-foto" className={TITULO_CARTAO}>
        Foto de perfil
      </h2>
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <Avatar fotoUrl={perfil?.fotoUrl ?? null} apelido={perfil?.apelido ?? email} tamanho={96} />
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <input
            ref={entrada}
            id="foto"
            type="file"
            accept={FOTO_TIPOS.join(",")}
            className="sr-only"
            disabled={desativado || enviando !== null}
            onChange={(e) => escolher(e.target.files?.[0])}
          />
          <button
            ref={botaoFoto}
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={desativado || enviando !== null}
            className={`${BOTAO} w-full sm:w-auto`}
          >
            <IconeCamera />
            {enviando === "enviar" ? "Enviando…" : perfil?.fotoUrl ? "Trocar foto" : "Enviar foto"}
          </button>
          {perfil?.fotoUrl && (
            <button
              type="button"
              onClick={remover}
              disabled={desativado || enviando !== null}
              className={`${BOTAO_SECUNDARIO} w-full sm:w-auto`}
            >
              {enviando === "remover" ? "Removendo…" : "Remover foto"}
            </button>
          )}
        </div>
      </div>
      <p className={`${AJUDA} text-center sm:text-left`}>
        JPG, PNG ou WEBP de até 2 MB. Você ajusta o recorte antes de enviar; a
        foto salva é quadrada, de no máximo 512×512, e fica visível para outros
        usuários.
      </p>
      {recortando && (
        <RecorteFoto imagem={recortando} onCancelar={fecharRecorte} onConfirmar={enviar} />
      )}
      <div className="mt-3">
        <Alerta mensagem={mensagem} />
      </div>
    </section>
  );
}

// Apelido e telefone ----------------------------------------------------
function CartaoDados({ perfil, desativado }: { perfil: DadosPerfil | null; desativado: boolean }) {
  const router = useRouter();
  const [apelido, setApelido] = useState(perfil?.apelido ?? "");
  const [telefone, setTelefone] = useState(mascararTelefone(perfil?.telefone ?? ""));
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem>(null);

  const situacao = situacaoTelefone(perfil?.telefone ?? null, perfil?.telefoneVerificadoEm ?? null);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setMensagem(null);
    const limpo = apelido.trim();
    setApelido(limpo);
    const digitos = soDigitos(telefone);
    const erroLocal = validarApelido(limpo) ?? validarTelefone(digitos);
    if (erroLocal) {
      setMensagem({ tipo: "erro", texto: erroLocal });
      return;
    }
    setSalvando(true);
    const erro = await chamar("/api/perfil", "PATCH", { apelido: limpo, telefone: digitos });
    setSalvando(false);
    if (erro) {
      setMensagem({ tipo: "erro", texto: erro });
      return;
    }
    setMensagem({ tipo: "ok", texto: "Dados salvos." });
    router.refresh();
  }

  return (
    <section aria-labelledby="titulo-dados" className={CARTAO}>
      <h2 id="titulo-dados" className={TITULO_CARTAO}>
        Apelido e telefone
      </h2>
      <form onSubmit={salvar} className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor="apelido" className={ROTULO}>
            Apelido
          </label>
          <input
            id="apelido"
            type="text"
            required
            maxLength={APELIDO_MAX}
            autoComplete="nickname"
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            onBlur={() => setApelido((a) => a.trim())}
            disabled={desativado}
            className={CAMPO}
            aria-describedby="ajuda-apelido"
          />
          <p id="ajuda-apelido" className={AJUDA}>
            De 3 a 20 caracteres, sem espaço no começo ou no fim. Precisa ser único:
            é o nome que vai aparecer no rank público. ({[...apelido].length}/{APELIDO_MAX})
          </p>
        </div>

        <div>
          <label htmlFor="telefone" className={ROTULO}>
            Telefone <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input
            id="telefone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="(11) 91234-5678"
            value={telefone}
            onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
            disabled={desativado}
            className={CAMPO}
            aria-describedby="ajuda-telefone"
          />
          <p id="ajuda-telefone" className={AJUDA}>
            {situacao === "verificado"
              ? "Telefone verificado."
              : "Só para cadastro. Não enviamos SMS e o número não aparece para outros usuários."}
          </p>
        </div>

        <Alerta mensagem={mensagem} />

        <button type="submit" disabled={desativado || salvando} className={`${BOTAO} w-full sm:w-auto sm:self-start`}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </form>
    </section>
  );
}

// E-mail ----------------------------------------------------------------
function CartaoEmail({
  email,
  emailPendente,
  aviso,
}: {
  email: string;
  emailPendente: string | null;
  aviso: "confirmado" | "parcial" | null;
}) {
  const [novo, setNovo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pendente, setPendente] = useState(emailPendente);
  const [mensagem, setMensagem] = useState<Mensagem>(
    aviso === "confirmado"
      ? { tipo: "ok", texto: "E-mail confirmado. A partir de agora, entre com o endereço novo." }
      : aviso === "parcial"
        ? {
            tipo: "ok",
            texto: "Confirmação recebida. Falta clicar no link enviado para o outro endereço.",
          }
        : null,
  );

  async function trocar(e: FormEvent) {
    e.preventDefault();
    setMensagem(null);
    const destino = novo.trim().toLowerCase();
    if (destino === email.toLowerCase()) {
      setMensagem({ tipo: "erro", texto: "Esse já é o seu e-mail atual." });
      return;
    }
    setEnviando(true);
    try {
      const supabase = createClient();
      const volta = encodeURIComponent("/painel/perfil?email=confirmado");
      const { error } = await supabase.auth.updateUser(
        { email: destino },
        { emailRedirectTo: `${window.location.origin}/auth/callback?next=${volta}` },
      );
      if (error) {
        setMensagem({ tipo: "erro", texto: traduzErroEmail(error.message, error.status) });
        return;
      }
      setPendente(destino);
      setNovo("");
      setMensagem({
        tipo: "ok",
        texto: `Enviamos um link de confirmação para ${destino}. Abra o link neste mesmo navegador.`,
      });
    } catch {
      setMensagem({ tipo: "erro", texto: "Não foi possível falar com o servidor agora." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section aria-labelledby="titulo-email" className={CARTAO}>
      <h2 id="titulo-email" className={TITULO_CARTAO}>
        E-mail de acesso
      </h2>
      <p className="mt-1.5 text-sm text-ink-2">
        Atual: <strong className="break-all text-ink">{email}</strong>
      </p>
      {pendente && (
        <p className={`${ALERTA_AVISO} mt-3`}>
          Aguardando confirmação de <strong className="break-all">{pendente}</strong>. Até
          você clicar no link, o login continua com o e-mail atual.
        </p>
      )}
      <form onSubmit={trocar} className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor="novo-email" className={ROTULO}>
            Novo e-mail
          </label>
          <input
            id="novo-email"
            type="email"
            required
            autoComplete="email"
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            className={CAMPO}
            placeholder="novo@exemplo.com"
          />
          <p className={AJUDA}>
            O login só muda depois que você confirmar pelo link enviado ao endereço
            novo. Dependendo da configuração, o endereço atual também recebe um link
            para confirmar. Até lá, continue entrando com o e-mail atual.
          </p>
        </div>
        <Alerta mensagem={mensagem} />
        <button type="submit" disabled={enviando} className={`${BOTAO} w-full sm:w-auto sm:self-start`}>
          {enviando ? "Enviando…" : "Trocar e-mail"}
        </button>
      </form>
    </section>
  );
}

function traduzErroEmail(msg: string, status?: number) {
  if (status === 429 || msg.includes("rate limit") || msg.includes("security purposes")) {
    return "Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo.";
  }
  if (msg.includes("already been registered") || msg.includes("already registered")) {
    return "Já existe uma conta com esse e-mail.";
  }
  if (msg.toLowerCase().includes("invalid")) {
    return "E-mail inválido.";
  }
  return "Não foi possível pedir a troca agora. Tente de novo em instantes.";
}

// Senha -----------------------------------------------------------------
function CartaoSenha() {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [repetir, setRepetir] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem>(null);

  async function trocar(e: FormEvent) {
    e.preventDefault();
    setMensagem(null);
    if (nova !== repetir) {
      setMensagem({ tipo: "erro", texto: "As duas senhas novas não são iguais." });
      return;
    }
    setSalvando(true);
    const erro = await chamar("/api/perfil/senha", "POST", { senhaAtual: atual, novaSenha: nova });
    setSalvando(false);
    if (erro) {
      setMensagem({ tipo: "erro", texto: erro });
      return;
    }
    setAtual("");
    setNova("");
    setRepetir("");
    setMensagem({ tipo: "ok", texto: "Senha trocada. Use a senha nova no próximo login." });
  }

  return (
    <section aria-labelledby="titulo-senha" className={CARTAO}>
      <h2 id="titulo-senha" className={TITULO_CARTAO}>
        Senha
      </h2>
      <form onSubmit={trocar} className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor="senha-atual" className={ROTULO}>
            Senha atual
          </label>
          <input
            id="senha-atual"
            type="password"
            required
            autoComplete="current-password"
            value={atual}
            onChange={(e) => setAtual(e.target.value)}
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor="senha-nova" className={ROTULO}>
            Nova senha
          </label>
          <input
            id="senha-nova"
            type="password"
            required
            minLength={SENHA_MIN}
            autoComplete="new-password"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            className={CAMPO}
            placeholder={`Mínimo ${SENHA_MIN} caracteres`}
          />
        </div>
        <div>
          <label htmlFor="senha-repetir" className={ROTULO}>
            Repita a nova senha
          </label>
          <input
            id="senha-repetir"
            type="password"
            required
            minLength={SENHA_MIN}
            autoComplete="new-password"
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
            className={CAMPO}
          />
        </div>
        <Alerta mensagem={mensagem} />
        <button type="submit" disabled={salvando} className={`${BOTAO} w-full sm:w-auto sm:self-start`}>
          {salvando ? "Salvando…" : "Trocar senha"}
        </button>
      </form>
    </section>
  );
}
