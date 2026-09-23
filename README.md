# Caça-leads

SaaS de prospecção de leads para web designers independentes.

## Variáveis de ambiente

Cadastre estas variáveis na Vercel (Settings > Environment Variables)
e, se for rodar localmente, copie `.env.example` para `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GOOGLE_PLACES_API_KEY` — chave server-only da Places API (New) do
  Google Cloud, usada pela busca de leads. Nunca é exposta ao navegador.

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

## Desenvolvimento local

```bash
npm install
npm run dev
```

## Deploy

Projeto conectado à Vercel. Cada push nesta branch gera um deploy de
pré-visualização automático.
