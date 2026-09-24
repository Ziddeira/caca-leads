# Caça-leads

SaaS de prospecção de leads para web designers independentes.

## Variáveis de ambiente

Cadastre estas variáveis na Vercel (Settings > Environment Variables)
e, se for rodar localmente, copie `.env.example` para `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GOOGLE_PLACES_API_KEY` — chave server-only da Places API (New) do
  Google Cloud, usada pela busca de leads. Nunca é exposta ao navegador.
- `SUPABASE_SERVICE_ROLE_KEY` — chave `service_role` do Supabase,
  server-only. Usada só pelo webhook e pelas rotas de pagamento para
  chamar as funções SQL que aplicam pagamentos.
- `ASAAS_API_KEY` — chave da API do Asaas, server-only.
- `ASAAS_ENV` — `sandbox` (testes) ou `producao`.
- `ASAAS_WEBHOOK_TOKEN` — segredo que você inventa e cadastra igual no
  webhook do Asaas; a rota recusa (401) qualquer evento sem ele.

Os valores do Supabase ficam em Supabase > Project Settings > API. A
chave do Google é gerada no Google Cloud Console, com a "Places API
(New)" ativada no projeto.

## Banco de dados (Supabase)

Rode os scripts abaixo **nessa ordem**, colando o conteúdo inteiro de
cada um no SQL Editor do Supabase:

1. `supabase/profiles.sql` — cria a tabela `profiles` (plano, créditos
   de desbloqueio, buscas restantes), com RLS e as permissões necessárias.
2. `supabase/etapa2-busca-desbloqueio.sql` — cria as tabelas `buscas`,
   `chamadas_google` e `leads_desbloqueados`, e as funções `iniciar_busca`
   e `desbloquear_lead` (security definer) que descontam saldo e créditos
   de forma atômica, sem depender de nenhuma permissão de escrita do
   usuário nessas tabelas.
3. `supabase/etapa3-planos-pagamentos.sql` — planos e pagamentos com
   Asaas: tabelas `assinaturas`, `cobrancas` e `pagamentos_eventos`
   (auditoria de todo evento recebido), a função `processar_evento_asaas`
   (aplica pagamentos de forma idempotente, só o servidor pode chamar),
   `meu_plano` e o vencimento automático para o Grátis. Também atualiza
   `iniciar_busca` e `desbloquear_lead` para aplicarem o vencimento.
4. `supabase/etapa4-cache-leads-comunidade.sql` — guarda em cache (por no
   máximo 30 dias, conforme a política de cache da Google Maps Platform)
   os dados de contato de cada lead desbloqueado, para "Meus leads" abrir
   sem chamar o Google a cada visita; cria a função `salvar_dados_lead` e
   a lista de espera da Comunidade (`interesse_comunidade` e a função
   `quero_ser_avisado_comunidade`). Não mexe em planos nem créditos.
5. `supabase/etapa5-perfil.sql` — perfil do usuário: colunas `apelido`
   (único, com apelido padrão para quem não escolher), `foto_path`,
   `telefone` e `telefone_verificado_em` (reservada para a verificação
   por SMS futura); funções `atualizar_perfil` e `definir_foto_perfil`
   (só mexem nesses campos, sempre no perfil de quem está logado); cria o
   bucket `avatares` no Storage com limite de 2 MB, só JPG/PNG/WEBP, e as
   regras para cada usuário só mexer na própria pasta. Não mexe em planos
   nem créditos.
6. `supabase/etapa6-boas-vindas.sql` — tela de boas-vindas no primeiro
   acesso e avatares prontos: colunas `avatar_pronto` e
   `configuracao_inicial_em` (contas que já existiam são marcadas como
   concluídas e não veem a tela); funções `definir_apelido`,
   `definir_avatar_pronto` e `concluir_configuracao_inicial` (sorteia um
   avatar para quem pular). A lista de avatares em `avatares_prontos()`
   precisa ser igual à de `lib/perfil/avatares.ts`. Não mexe em planos
   nem créditos.
7. `supabase/etapa7-funil-vendas.sql` — funil de leads e venda fechada:
   colunas `situacao`, `anotacao` (até 500 caracteres) e
   `ultimo_contato_em` em `leads_desbloqueados`; tabela `vendas` (nasce
   "pendente_verificacao", com os campos de verificação e pontos já
   criados e vazios); funções `atualizar_situacao_lead`,
   `salvar_anotacao_lead` e `registrar_venda`. Só dá para registrar venda
   de lead que o próprio usuário desbloqueou, uma por lead, e o usuário
   não consegue gravar verificação nem pontos. Não mexe em planos nem
   créditos.

### Links dos e-mails (Supabase Auth)

Em Supabase > Authentication > URL Configuration > Redirect URLs, deixe
liberado `https://<seu-domínio>/auth/callback**` (com os dois asteriscos,
para aceitar o `?next=...` usado na troca de e-mail e no "esqueci minha
senha"). Adicione também a URL de pré-visualização da Vercel, se usar.

## Webhook do Asaas

No painel do Asaas: Integrações > Webhooks > Adicionar webhook.

- URL: `https://<seu-domínio-de-produção>/api/asaas/webhook`
- Token de autenticação: o mesmo valor de `ASAAS_WEBHOOK_TOKEN`
- Versão da API: v3; tipo de envio: sequencial
- Eventos: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`,
  `PAYMENT_OVERDUE`, `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`,
  `PAYMENT_REPROVED_BY_RISK_ANALYSIS`, `PAYMENT_REFUNDED`,
  `PAYMENT_CHARGEBACK_REQUESTED`, `SUBSCRIPTION_DELETED`,
  `SUBSCRIPTION_INACTIVATED`

Para auditar os pagamentos, no SQL Editor:

```sql
select recebido_em, evento, valor, asaas_payment_id, resultado
from pagamentos_eventos order by recebido_em desc;
```

## Desenvolvimento local

```bash
npm install
npm run dev
```

## Deploy

Projeto conectado à Vercel. Cada push nesta branch gera um deploy de
pré-visualização automático.
