# Ártemis Prospect — Manual da marca v1.0

Especificação da identidade visual do Ártemis Prospect (antigo "Caça-leads"). Este documento é a fonte da verdade para nome, logo, cores, tipografia, ícones, componentes e mascote. Todos os valores são exatos: use-os como estão.

---

## 1. Nome

- Nome oficial: **Ártemis Prospect** (com acento no "Á", "Prospect" com P maiúsculo).
- No logo, o nome aparece em caixa alta: **ÁRTEMIS** e, abaixo, **PROSPECT**.
- Em texto corrido, escreva "Ártemis Prospect". Nunca "Artemis" sem acento, "ArtemisProspect" junto ou "Ártemis" sozinho em títulos de página.
- Posicionamento: ferramenta para web designers independentes acharem negócios locais que ainda não têm site, com o WhatsApp pronto para chamar.

---

## 2. Logotipo

### 2.1 Símbolo

Um "A" angular em forma de ponta de flecha, com um losango branco no centro (a mira: lead travado), dentro de quatro cantoneiras de HUD.

`public/brand/simbolo.svg`

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><path d="M4 14V4h10M50 4h10v10M4 50v10h10M60 50v10H50" stroke="#3D3D3D" stroke-width="2.5" stroke-linecap="square"/><polygon points="32,10 54,54 43,54 32,31 21,54 10,54" fill="#FFD60A"/><polygon points="32,40 36,45 32,50 28,45" fill="#FFFFFF"/></svg>
```

`public/brand/favicon.svg` (sem cantoneiras, para 48 px ou menos)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0A0A0A"/><polygon points="32,8 56,56 44,56 32,31 20,56 8,56" fill="#FFD60A"/><polygon points="32,40 36.5,45.5 32,51 27.5,45.5" fill="#FFFFFF"/></svg>
```

### 2.2 Assinatura tipográfica

- Linha 1: `ÁRTEMIS`, Chakra Petch 700 **itálico**, `letter-spacing: 0.02em`, `line-height: 0.9`, cor `#FFFFFF`.
- Linha 2: traço de 44 × 4 px em `#FFD60A`, 14 px de espaço e depois `PROSPECT` em Chakra Petch 600, `letter-spacing: 0.55em`, cor `#FFD60A`.
- Proporção: o tamanho de `PROSPECT` é 24% do tamanho de `ÁRTEMIS` (ex.: 92 px e 22 px). O espaço entre as linhas é 11% do tamanho de `ÁRTEMIS`.

### 2.3 Versões

| Versão | Montagem | Uso |
|---|---|---|
| Horizontal (padrão) | Símbolo à esquerda, assinatura à direita. Altura do símbolo ≈ 1,6× o tamanho de `ÁRTEMIS`. Espaço entre eles = 0,35× o tamanho de `ÁRTEMIS`. | Cabeçalho do site, sidebar, propostas, overlays |
| Vertical | Símbolo em cima, assinatura centralizada embaixo. | Espaços quadrados ou altos, stories, capas |
| Símbolo | Só o símbolo. | Ícone de app, favicon, avatar, marca d'água |
| Só o nome | Só a assinatura. | Quando o símbolo já aparece por perto |

Componente de referência (HTML e CSS):

```html
<div class="logo">
  <img src="/brand/simbolo.svg" alt="" class="logo__symbol">
  <div class="logo__text">
    <span class="logo__name">ÁRTEMIS</span>
    <span class="logo__sub"><i class="logo__bar"></i>PROSPECT</span>
  </div>
</div>
```

```css
.logo{display:flex;align-items:center;gap:calc(var(--s)*0.35)}
.logo{--s:22px} /* tamanho de ÁRTEMIS; na sidebar use 22px, no hero use 64px ou mais */
.logo__symbol{width:calc(var(--s)*1.6);height:calc(var(--s)*1.6)}
.logo__text{display:flex;flex-direction:column;gap:calc(var(--s)*0.11)}
.logo__name{font-family:'Chakra Petch',sans-serif;font-weight:700;font-style:italic;font-size:var(--s);line-height:.9;letter-spacing:.02em;color:#FFFFFF}
.logo__sub{display:flex;align-items:center;gap:calc(var(--s)*0.15);font-family:'Chakra Petch',sans-serif;font-weight:600;font-size:calc(var(--s)*0.24);letter-spacing:.55em;color:#FFD60A}
.logo__bar{display:block;width:calc(var(--s)*0.48);height:max(2px,calc(var(--s)*0.043));background:#FFD60A}
```

### 2.4 Logo sobre fundos

O amarelo só aparece no logo quando o fundo é preto ou escuro. Amarelo sobre branco não se lê.

| Fundo | "A" | Losango | Cantoneiras | ÁRTEMIS | PROSPECT | Traço |
|---|---|---|---|---|---|---|
| Preto `#0A0A0A` (principal) | `#FFD60A` | `#FFFFFF` | `#3D3D3D` | `#FFFFFF` | `#FFD60A` | `#FFD60A` |
| Branco `#FFFFFF` | `#0A0A0A` | `#0A0A0A` | `#D4D4D4` | `#0A0A0A` | `#0A0A0A` | `#FFD60A` |
| Amarelo `#FFD60A` | `#0A0A0A` | `#0A0A0A` | `#B89A00` | `#0A0A0A` | `#0A0A0A` | `#0A0A0A` |
| Monocromático branco (fotos, fundos coloridos) | `#FFFFFF` | `#FFFFFF` | `#8A8A8A` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| Monocromático preto (impressão em 1 cor) | `#0A0A0A` | `#0A0A0A` | `#A3A3A3` | `#0A0A0A` | `#0A0A0A` | `#0A0A0A` |

Sobre foto: sempre com uma película escura por cima e a versão principal.

### 2.5 Área de proteção e tamanho mínimo

- Área de proteção: `x` = 1/4 da altura do símbolo, livre nos quatro lados. Nada invade: texto, borda da tela ou outro logo.
- Horizontal: mínimo de 140 px de largura (35 mm impresso).
- Símbolo: mínimo de 24 px (8 mm).
- Abaixo de 48 px: use o `favicon.svg`, sem cantoneiras.

### 2.6 Não faça

- Não distorça (esticar ou achatar).
- Não troque as cores: só amarelo, preto e branco.
- Não gire.
- Não aplique efeitos: brilho neon, sombra ou degradê.
- Não troque a fonte do nome.
- Não aplique sobre fundo poluído sem película.

---

## 3. Cores

### 3.1 Principais

| Nome | HEX | RGB | CMYK | Uso |
|---|---|---|---|---|
| Amarelo Ártemis | `#FFD60A` | 255 214 10 | 0 16 96 0 | Botão primário, destaques, estado ativo |
| Preto | `#0A0A0A` | 10 10 10 | 0 0 0 96 | Fundo principal |
| Branco | `#FFFFFF` | 255 255 255 | 0 0 0 0 | Títulos e texto principal |

### 3.2 Apoio de interface

| Nome | HEX | Uso |
|---|---|---|
| Superfície | `#121212` | Cards e painéis |
| Sidebar | `#0F0F0F` | Fundo da barra lateral |
| Divisória | `#1F1F1F` | Linhas finas, rodapés |
| Borda | `#262626` | Contorno de cards e divisórias |
| Borda de input | `#2E2E2E` | Campos de formulário |
| Borda de botão neutro | `#3D3D3D` | Botão "Desbloquear", cantoneiras do símbolo |
| Score baixo | `#525252` | Contorno do badge de score baixo |
| Texto terciário | `#737373` | Legendas, notas pequenas |
| Texto secundário | `#A3A3A3` | Descrições, menu inativo |
| Texto de campo | `#D4D4D4` | Valor digitado em inputs |
| Amarelo hover | `#FFB800` | Botão primário ao passar o mouse |
| Amarelo 9% | `rgba(255,214,10,0.09)` | Fundo do item ativo da sidebar |

### 3.3 Proporção de uso

Cerca de 70% preto, 20% branco e 10% amarelo. O amarelo não vira fundo de seção inteira: ele marca o que precisa de ação ou atenção.

### 3.4 Contraste

- Nunca texto amarelo sobre fundo branco.
- Nunca texto preto sobre `#121212` ou `#0A0A0A`.
- Texto sobre amarelo é sempre `#0A0A0A`.

### 3.5 Tokens

```css
:root{
  --ap-yellow:#FFD60A;
  --ap-yellow-hover:#FFB800;
  --ap-yellow-soft:rgba(255,214,10,0.09);
  --ap-black:#0A0A0A;
  --ap-white:#FFFFFF;
  --ap-surface:#121212;
  --ap-sidebar:#0F0F0F;
  --ap-divider:#1F1F1F;
  --ap-border:#262626;
  --ap-border-input:#2E2E2E;
  --ap-border-strong:#3D3D3D;
  --ap-gray-600:#525252;
  --ap-text-3:#737373;
  --ap-text-2:#A3A3A3;
  --ap-text-field:#D4D4D4;
  --ap-font-display:'Chakra Petch','Arial Narrow',sans-serif;
  --ap-font-body:'Manrope','Helvetica Neue',sans-serif;
}
```

---

## 4. Tipografia

Duas famílias gratuitas do Google Fonts:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,500;0,600;0,700;1,700&family=Manrope:wght@400;500;600;700;800&display=swap">
```

| Família | Peso | Uso |
|---|---|---|
| Chakra Petch | 700 itálico | Logo e títulos grandes (hero) |
| Chakra Petch | 700 | Títulos de seção, botões, números e scores |
| Chakra Petch | 600 | Rótulos em CAIXA ALTA com `letter-spacing: 0.2em` a `0.3em`; etiquetas |
| Manrope | 400 | Parágrafos |
| Manrope | 600 | Menus, campos, labels de formulário |
| Manrope | 700–800 | Nomes de leads, destaques em texto |

Hierarquia de referência:

| Elemento | Fonte | Tamanho | Cor |
|---|---|---|---|
| Título do hero | Chakra Petch 700 itálico, CAIXA ALTA | 64–72 px (desktop), 40 px (celular) | `#FFFFFF`, com o trecho-chave em `#FFD60A` |
| Título de página | Chakra Petch 700 | 36–48 px | `#FFFFFF` |
| Rótulo de seção | Chakra Petch 600, CAIXA ALTA, `letter-spacing: .3em` | 13 px | `#FFD60A` |
| Texto | Manrope 400, `line-height: 1.55` | 15–19 px | `#A3A3A3` |

---

## 5. Ícones

### 5.1 Ícone da marca

| Uso | Tamanho | Arquivo |
|---|---|---|
| App / PWA | 512 px e 192 px | Símbolo em quadrado `#0A0A0A` com raio de 22%, borda `#2E2E2E` |
| Apple touch | 180 px | Idem |
| Favicon | 48, 32 e 16 px | `favicon.svg` (sem cantoneiras) |
| Avatar de redes / Twitch | Círculo | Fundo `#FFD60A`, "A" e losango `#0A0A0A`, cantoneiras `#B89A00` |

### 5.2 Ícones de interface

- Grade de 24 × 24 px, traço de 2 px, sem preenchimento e pontas retas (`stroke-linecap: square`).
- Cor branca ou cinza (`#A3A3A3`); amarelo só no estado ativo.
- Sem sombra e sem cor extra. Pode usar lucide ajustando só a cor e o traço.
- Set atual: Buscar, Meus leads, Score, Rank do mês, Comunidade, Meu plano, Perfil, Administração, Notificações, WhatsApp, Desbloquear e Localização.

---

## 6. Componentes

### 6.1 Formas

- Sem `border-radius` nos componentes de interface (exceto o ícone do app e o avatar).
- Canto cortado nas peças grandes: `clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));`
- Canto cortado nas peças pequenas: mesmo polígono com 7 px.
- O corte fica sempre nos cantos superior direito e inferior esquerdo.

```css
.ap-cut{clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px))}
.ap-cut-s{clip-path:polygon(0 0,calc(100% - 7px) 0,100% 7px,100% 100%,7px 100%,0 calc(100% - 7px))}
```

### 6.2 Botões

| Tipo | Estilo |
|---|---|
| Primário | Fundo `#FFD60A` (hover `#FFB800`), texto `#0A0A0A`, Chakra Petch 700, 16 px, CAIXA ALTA, `letter-spacing: .08em`, `padding: 17px 28px`, `.ap-cut`. Ícone de seta opcional. **Um por tela.** |
| Secundário | Sem fundo, borda 1 px `#FFFFFF`, texto `#FFFFFF`, mesma fonte, `padding: 16px 26px`. |
| Ação pequena (WhatsApp) | Fundo `#FFD60A`, texto `#0A0A0A`, Chakra Petch 700, 13 px, `letter-spacing: .06em`, `padding: 10px 14px`, `.ap-cut-s`. |
| Neutro (Desbloquear) | Borda 1 px `#3D3D3D`, texto `#D4D4D4`, Chakra Petch 600, 13 px, ícone de cadeado de 13 px, `padding: 9px 12px`. |

### 6.3 Etiquetas

Chakra Petch 600, 11 px, CAIXA ALTA, `letter-spacing: .08em`, `padding: 3px 8px`.

| Etiqueta | Estilo |
|---|---|
| SEM SITE | Fundo `#FFD60A`, texto `#0A0A0A` |
| DEPENDE DO BOOKING / AIRBNB | Borda 1 px e texto `#FFD60A` |
| SÓ INSTAGRAM / SÓ APP | Borda 1 px e texto `#FFFFFF` |
| Contador (ex.: 48 LEADS) | Fundo `#FFD60A`, texto `#0A0A0A`, 12 px, `padding: 6px 10px` |

Regra: preenchido = mais urgente; contorno amarelo = oportunidade; contorno branco = informativo.

### 6.4 Badge de score

Quadrado de 48 px (56 px em destaque), `.ap-cut-s`, Chakra Petch 700, 20 px.

| Faixa | Estilo |
|---|---|
| Alto (80+) | Fundo `#FFD60A`, número `#0A0A0A` |
| Médio (70–79) | Borda 2 px `#FFD60A`, número `#FFD60A` |
| Baixo (abaixo de 70) | Borda 2 px `#525252`, número `#FFFFFF` |

Se o código já tiver faixas de score definidas, mantenha as faixas do código.

### 6.5 Cantoneiras de mira

Quatro cantos de 24 × 24 px com borda de 3 px em `#FFD60A`, envolvendo o elemento com 12–14 px de respiro. Use em **um só elemento por tela**: o que deve prender o olhar (ex.: o card de exemplo de leads na landing).

### 6.6 Grade de fundo

```css
.ap-grid{background-color:#0A0A0A;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:48px 48px}
```

Só em áreas de destaque, como o hero. Nunca atrás de texto longo.

### 6.7 Cards, inputs e sidebar

- Card: fundo `#121212`, borda 1 px `#262626`, sem raio. Linhas internas separadas por borda `#262626`.
- Input: fundo `#0A0A0A`, borda 1 px `#2E2E2E`, texto `#D4D4D4`, placeholder `#737373`, ícone `#737373`; em foco, borda `#FFD60A`.
- Sidebar: fundo `#0F0F0F`, borda direita 1 px `#1F1F1F`, logo horizontal no topo (`--s: 22px`). Item: Manrope 600, 15 px, `#A3A3A3`, `padding: 12px 14px`, ícone de 19 px. Item ativo: fundo `rgba(255,214,10,.09)`, texto e ícone `#FFD60A`, borda esquerda 3 px `#FFD60A`.

---

## 7. Mascote

A Ártemis em estilo chibi: cabelo amarelo ondulado com risca no meio, vestido preto sem manga, arco de madeira segurado na diagonal e sandálias marrons, com contorno marrom-escuro grosso. Arquivo oficial: `public/brand/artemis-mascote.png` (imagem enviada pelo dono da marca; ela é a referência-mestre).

**Função:** humanizar a ferramenta. Ela aparece para comemorar, orientar e quebrar o gelo, nunca só para enfeitar.

**Onde ela aparece:**

- Site e app: **só** nas páginas 404 e 500 e no aviso de limite do plano (as três com ela chorando), e no tour guiado do primeiro acesso (cabeça, com as expressões de `public/artemis/`). Nas demais telas (landing, estados vazios) vai o símbolo da marca.
- Redes e lives: avatar, figurinhas, overlay e thumbnails.

**Regras:**

- Sempre sobre fundo claro. No tema escuro, coloque a mascote dentro de um card ou círculo branco (`#FFFFFF`). O cabelo some sobre o amarelo e o vestido some sobre o preto.
- Não recolorir, não distorcer, sempre com a proporção original.
- Um mascote só: ela não divide espaço com outros personagens nem com o símbolo em tamanho grande.
- Para uso em escala, vetorize a imagem-mestre e crie as expressões a partir do vetor.

---

## 8. Tom de comunicação

- Direto e prático, falando com o web designer como um colega de trabalho.
- Verbos de ação e resultado: "Ache", "Busque", "Chame no WhatsApp".
- Vocabulário de caça e mira pode aparecer com moderação ("lead na mira", "alvo"), sem virar piada em todo texto.
- Títulos curtos. O amarelo marca a promessa principal, como "ainda não têm site".

---

*Ártemis Prospect · Manual da marca · v1.0 · 2026*
