"use client";

// Troca de tema (claro, escuro ou "seguir o sistema"). Ver lib/tema.ts.
import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import {
  COOKIE_TEMA,
  SCRIPT_TEMA,
  TEMA_PADRAO,
  scriptTemaDoPerfil,
  temaValido,
  type Tema,
  type TemaAplicado,
} from "@/lib/tema";

const CONSULTA_CLARO = "(prefers-color-scheme: light)";

function lerCookie(): Tema {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_TEMA}=([^;]*)`));
  const valor = m ? decodeURIComponent(m[1]) : null;
  return temaValido(valor) ? valor : TEMA_PADRAO;
}

function resolver(escolha: Tema): TemaAplicado {
  if (escolha !== "sistema") return escolha;
  return window.matchMedia(CONSULTA_CLARO).matches ? "claro" : "escuro";
}

// Aplica o tema na hora e guarda neste aparelho (cookie de 1 ano).
export function aplicarTema(escolha: Tema) {
  document.cookie = `${COOKIE_TEMA}=${escolha}; path=/; max-age=31536000; SameSite=Lax`;
  const html = document.documentElement;
  html.setAttribute("data-tema", resolver(escolha));
  html.setAttribute("data-tema-escolha", escolha);
  atualizarCorDaBarra();
}

// Cor da barra do navegador no celular: a mesma do fundo do tema,
// lida da variável CSS para não repetir a cor aqui.
function atualizarCorDaBarra() {
  const cor = getComputedStyle(document.documentElement).getPropertyValue("--color-canvas").trim();
  if (!cor) return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = cor;
}

// A escolha atual, lida do <html>. No servidor não se sabe (null).
function assinar(aviso: () => void) {
  const observador = new MutationObserver(aviso);
  observador.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-tema-escolha"],
  });
  return () => observador.disconnect();
}

function escolhaAtual(): Tema {
  const valor = document.documentElement.getAttribute("data-tema-escolha");
  return temaValido(valor) ? valor : TEMA_PADRAO;
}

export function useTema(): Tema | null {
  return useSyncExternalStore(assinar, escolhaAtual, () => null);
}

// Script que roda como texto no servidor e vira "text/plain" no
// navegador: executa só no carregamento da página (antes da primeira
// pintura) e não gera aviso do React nas navegações internas.
function ScriptEmLinha({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// Vai no <head> do layout raiz. O script aplica o tema do cookie antes
// da primeira pintura (sem clarão branco nem escuro errado). O efeito
// reaplica depois que o React assume a página e acompanha o aparelho
// quando a escolha é "seguir o sistema".
export function ScriptTema() {
  return <ScriptEmLinha html={SCRIPT_TEMA} />;
}

export function TemaDoAparelho() {
  useLayoutEffect(() => {
    aplicarTema(lerCookie());
  }, []);

  useEffect(() => {
    const consulta = window.matchMedia(CONSULTA_CLARO);
    function mudou() {
      if (escolhaAtual() === "sistema") aplicarTema("sistema");
    }
    consulta.addEventListener("change", mudou);
    return () => consulta.removeEventListener("change", mudou);
  }, []);

  return null;
}

// Vai no layout do painel: a escolha salva no perfil vale em qualquer
// aparelho. Se o perfil ainda não tem escolha (null), fica a do
// aparelho.
export function TemaDoPerfil({ tema }: { tema: Tema | null }) {
  useLayoutEffect(() => {
    if (tema && tema !== lerCookie()) aplicarTema(tema);
  }, [tema]);

  if (!tema) return null;
  return <ScriptEmLinha html={scriptTemaDoPerfil(tema)} />;
}
