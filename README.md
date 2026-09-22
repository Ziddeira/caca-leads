# Caça-leads

SaaS de prospecção de leads para web designers independentes.

## Variáveis de ambiente

Cadastre estas duas variáveis na Vercel (Settings > Environment Variables)
e, se for rodar localmente, copie `.env.example` para `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Os valores ficam em Supabase > Project Settings > API.

## Banco de dados (Supabase)

O script `supabase/profiles.sql` cria a tabela `profiles` (plano, créditos
de desbloqueio, buscas restantes), com RLS e as permissões necessárias.
Cole o conteúdo desse arquivo no SQL Editor do Supabase e rode.

## Desenvolvimento local

```bash
npm install
npm run dev
```

## Deploy

Projeto conectado à Vercel. Cada push nesta branch gera um deploy de
pré-visualização automático.
