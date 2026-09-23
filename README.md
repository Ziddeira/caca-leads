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
