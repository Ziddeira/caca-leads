// Tema do site: claro, escuro ou "seguir o sistema". As cores de cada
// tema ficam em app/globals.css; aqui só a escolha e onde ela é guardada.
//
// A escolha fica em três lugares:
// - no atributo data-tema-escolha do <html> (o que a tela mostra agora);
// - num cookie, lido por um script no <head> antes da primeira pintura,
//   para não piscar a cor errada ao carregar a página;
// - no perfil (coluna profiles.tema, etapa 17), para valer em qualquer
//   aparelho em que a pessoa entrar.
// data-tema (sem "-escolha") é o tema de fato aplicado: "sistema" vira
// "claro" ou "escuro" conforme o aparelho.

export type Tema = "claro" | "escuro" | "sistema";
export type TemaAplicado = "claro" | "escuro";

export const TEMAS: Tema[] = ["claro", "escuro", "sistema"];
export const TEMA_PADRAO: Tema = "escuro";
export const COOKIE_TEMA = "ap-tema";

export function temaValido(valor: unknown): valor is Tema {
  return typeof valor === "string" && (TEMAS as string[]).includes(valor);
}

// Script do <head>: lê o cookie e aplica o tema antes de o navegador
// pintar a página. Fica em uma linha e sem dependências de propósito.
export const SCRIPT_TEMA = `(function(){try{var m=document.cookie.match(/(?:^|; )${COOKIE_TEMA}=([^;]*)/);var e=m?decodeURIComponent(m[1]):"${TEMA_PADRAO}";if(e!=="claro"&&e!=="escuro"&&e!=="sistema")e="${TEMA_PADRAO}";var r=e==="sistema"?(matchMedia("(prefers-color-scheme: light)").matches?"claro":"escuro"):e;var h=document.documentElement;h.setAttribute("data-tema",r);h.setAttribute("data-tema-escolha",e)}catch(x){}})()`;

// Mesmo script, mas com a escolha vinda do perfil (painel): aplica e
// grava no cookie deste aparelho.
export function scriptTemaDoPerfil(tema: Tema) {
  return `(function(){try{var e=${JSON.stringify(tema)};document.cookie="${COOKIE_TEMA}="+e+"; path=/; max-age=31536000; SameSite=Lax";var r=e==="sistema"?(matchMedia("(prefers-color-scheme: light)").matches?"claro":"escuro"):e;var h=document.documentElement;h.setAttribute("data-tema",r);h.setAttribute("data-tema-escolha",e)}catch(x){}})()`;
}
