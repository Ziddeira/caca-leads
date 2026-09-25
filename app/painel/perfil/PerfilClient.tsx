"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import SeletorAvatar from "@/components/perfil/SeletorAvatar";
import SeletorTema from "@/components/tema/SeletorTema";
import { IconeGoogle } from "@/components/BotaoGoogle";
import { IconeCadeado } from "@/components/Icones";
import { Alerta, chamar, type Mensagem } from "@/components/perfil/comum";
import {
  ALERTA_AVISO,
  BOTAO,
  BOTAO_SECUNDARIO,
  CAMPO,
  CARTAO as CARTAO_BASE,
  ROTULO,
  TituloPagina,
} from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { DadosPerfil } from "@/lib/perfil/dados";
import {
  APELIDO_MAX,
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

export default function PerfilClient({
  userId,
  email,
  emailPendente,
  avisoEmail,
  perfil,
  pendente,
  mostrarVendas,
  acesso,
}: {
  userId: string;
  email: string;
  emailPendente: string | null;
  avisoEmail: "confirmado" | "parcial" | null;
  perfil: DadosPerfil | null;
  pendente: "etapa5" | "etapa6" | null;
  // null = etapa 14 (Comunidade) ainda não rodada no banco.
  mostrarVendas: boolean | null;
  acesso: FormasDeEntrar;
}) {
  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        titulo="Perfil"
        descricao="Seus dados de cadastro. Nada aqui muda seu plano, créditos ou buscas."
      />

      {pendente === "etapa5" && (
        <p role="alert" className={ALERTA_AVISO}>
          O perfil ainda não foi ativado no banco. Rode o script
          supabase/etapa5-perfil.sql no Supabase para liberar apelido, foto e telefone.
        </p>
      )}
      {pendente === "etapa6" && (
        <p role="alert" className={ALERTA_AVISO}>
          Os avatares prontos ainda não foram ativados no banco. Rode o script
          supabase/etapa6-boas-vindas.sql no Supabase para liberá-los.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          <CartaoFoto userId={userId} perfil={perfil} email={email} pendente={pendente} />
          <CartaoDados perfil={perfil} desativado={pendente === "etapa5"} />
          <CartaoComunidade apelido={perfil?.apelido ?? null} mostrarVendas={mostrarVendas} />
        </div>
        <div className="flex flex-col gap-6">
          <CartaoAcesso acesso={acesso} />
          <CartaoEmail email={email} emailPendente={emailPendente} aviso={avisoEmail} />
          <CartaoAparencia />
          {/* Quem entra só pelo Google não tem senha para trocar. */}
          {acesso.senha && <CartaoSenha />}
          <CartaoTour />
        </div>
      </div>
    </div>
  );
}

// Comunidade -------------------------------------------------------------
// Escolhe se o número de vendas verificadas aparece no perfil público da
// Comunidade. Começa desligado.
function CartaoComunidade({ apelido, mostrarVendas }: { apelido: string | null; mostrarVendas: boolean | null }) {
  const [ligado, setLigado] = useState(!!mostrarVendas);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem>(null);

  async function trocar(valor: boolean) {
    setMensagem(null);
    setLigado(valor);
    setSalvando(true);
    const erro = await chamar("/api/perfil/comunidade", "POST", { mostrarVendas: valor });
    setSalvando(false);
    if (erro) {
      setLigado(!valor);
      setMensagem({ tipo: "erro", texto: erro });
      return;
    }
    setMensagem({ tipo: "ok", texto: valor ? "Suas vendas verificadas aparecem no seu perfil." : "Suas vendas não aparecem mais no seu perfil." });
  }

  return (
    <section id="comunidade" aria-labelledby="titulo-comunidade" className={CARTAO}>
      <h2 id="titulo-comunidade" className={TITULO_CARTAO}>
        Comunidade
      </h2>
      <p className="mt-1 mb-4 text-sm text-ink-2">
        Seu perfil na comunidade mostra apelido, foto e posts. Nunca mostra e-mail nem telefone.
      </p>
      {mostrarVendas === null ? (
        <p className={ALERTA_AVISO}>
          A Comunidade ainda não foi ativada no banco. Rode as 3 partes supabase/etapa14-1, etapa14-2 e
          etapa14-3 no Supabase.
        </p>
      ) : (
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={ligado}
            disabled={salvando}
            onChange={(e) => trocar(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-destaque"
          />
          <span className="text-sm text-campo">
            Mostrar o número das minhas vendas verificadas no meu perfil da comunidade
          </span>
        </label>
      )}
      <div className="mt-3">
        <Alerta mensagem={mensagem} />
      </div>
      {apelido && mostrarVendas !== null && (
        <Link
          href={`/painel/comunidade/u/${encodeURIComponent(apelido)}`}
          className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-destaque hover:underline"
        >
          Ver meu perfil na comunidade
        </Link>
      )}
    </section>
  );
}

// Tour guiado da Ártemis ----------------------------------------------
// Abre a tela de Buscar com ?tour=1; o tour (components/tour/TourArtemis.tsx)
// começa sozinho lá.
// Tema claro, escuro ou do sistema. Fica salvo no perfil e vale em
// qualquer aparelho (no celular, também pelo ícone no topo).
function CartaoAparencia() {
  return (
    <section aria-labelledby="titulo-aparencia" className={CARTAO}>
      <h2 id="titulo-aparencia" className={TITULO_CARTAO}>
        Aparência
      </h2>
      <p className="mt-1 mb-4 text-sm text-ink-2">
        Escolha o tema do site. &quot;Sistema&quot; segue o modo claro ou escuro do seu celular ou
        computador. A escolha vale em qualquer aparelho em que você entrar.
      </p>
      <SeletorTema salvar className="max-w-sm" />
    </section>
  );
}

function CartaoTour() {
  const router = useRouter();
  return (
    <section aria-labelledby="titulo-tour" className={CARTAO}>
      <h2 id="titulo-tour" className={TITULO_CARTAO}>
        Tour guiado
      </h2>
      <p className="mt-1 mb-4 text-sm text-ink-2">
        A Ártemis mostra de novo, em 5 passos, onde fica cada coisa no painel.
      </p>
      <button
        type="button"
        onClick={() => router.push("/painel/buscar?tour=1")}
        className={BOTAO_SECUNDARIO}
      >
        Rever o tour
      </button>
    </section>
  );
}

// Foto ou avatar pronto ------------------------------------------------
function CartaoFoto({
  userId,
  perfil,
  email,
  pendente,
}: {
  userId: string;
  perfil: DadosPerfil | null;
  email: string;
  pendente: "etapa5" | "etapa6" | null;
}) {
  return (
    <section aria-labelledby="titulo-foto" className={CARTAO}>
      <h2 id="titulo-foto" className={TITULO_CARTAO}>
        Foto de perfil
      </h2>
      <p className="mt-1 mb-4 text-sm text-ink-2">
        Aparece no menu e, mais adiante, no rank público.
      </p>
      <SeletorAvatar
        userId={userId}
        apelido={perfil?.apelido ?? email}
        fotoUrl={perfil?.fotoUrl ?? null}
        avatarPronto={perfil?.avatarPronto ?? null}
        desativado={pendente === "etapa5"}
        semAvataresProntos={pendente !== null}
      />
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

// Formas de entrar ---------------------------------------------------------
interface FormasDeEntrar {
  senha: boolean;
  google: boolean;
}

function CartaoAcesso({ acesso }: { acesso: FormasDeEntrar }) {
  const itens = [
    acesso.senha && { chave: "senha", icone: <IconeCadeado className="shrink-0 text-ink-2" />, texto: "E-mail e senha" },
    acesso.google && { chave: "google", icone: <IconeGoogle tamanho={20} />, texto: "Conta do Google" },
  ].filter((i) => !!i);

  return (
    <section aria-labelledby="titulo-acesso" className={CARTAO}>
      <h2 id="titulo-acesso" className={TITULO_CARTAO}>
        Como você entra
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {itens.map((item) => (
          <li
            key={item.chave}
            className="flex min-h-11 items-center gap-3 border border-line-input bg-canvas px-3 py-2 text-campo"
          >
            {item.icone}
            <span className="font-semibold">{item.texto}</span>
          </li>
        ))}
      </ul>
      {acesso.google && acesso.senha && (
        <p className={AJUDA}>
          As duas formas abrem a mesma conta, com o mesmo plano, créditos e histórico.
        </p>
      )}
      {acesso.google && !acesso.senha && (
        <p className={AJUDA}>
          Sua conta não tem senha: você entra pelo botão &quot;Entrar com o Google&quot;. Se
          quiser entrar também com e-mail e senha, use &quot;Esqueci minha senha&quot; na tela
          de login para criar uma.
        </p>
      )}
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
        <button type="submit" disabled={enviando} className={`${BOTAO_SECUNDARIO} w-full sm:w-auto sm:self-start`}>
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
        <button type="submit" disabled={salvando} className={`${BOTAO_SECUNDARIO} w-full sm:w-auto sm:self-start`}>
          {salvando ? "Salvando…" : "Trocar senha"}
        </button>
      </form>
    </section>
  );
}
