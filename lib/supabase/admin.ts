import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente com a chave "service_role": só existe no servidor e é o único
// que pode chamar as funções SQL que aplicam pagamentos (processar o
// webhook, registrar assinatura/cobrança). Nunca importe isto num
// componente "use client".
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
