import { exigirAdminPagina } from "@/lib/admin/acesso";
import { BOTAO, CAMPO } from "@/components/ui";
import { FalhaCarregar, Secao } from "../comum";
import UsuariosClient, { type Conta, type RegistroAuditoria } from "./UsuariosClient";

export const dynamic = "force-dynamic";

// Administração > Usuários: busca por e-mail ou apelido e ajuste de
// plano e saldo. Sem busca, mostra as 20 contas mais novas.
export default async function UsuariosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const supabase = await exigirAdminPagina();
  const { q } = await searchParams;
  const termo = (q ?? "").trim().slice(0, 100);

  const { data, error } = await supabase.rpc("admin_buscar_usuarios", { p_termo: termo });
  const contas = (data ?? []) as Conta[];

  // Histórico de ajustes dessas contas. Leitura direta: a regra de RLS
  // da tabela admin_auditoria só deixa administradores verem.
  const ids = contas.map((c) => c.id);
  const { data: auditoria } = ids.length
    ? await supabase
        .from("admin_auditoria")
        .select("id, alvo_id, admin_email, acao, antes, depois, motivo, criado_em")
        .in("alvo_id", ids)
        .order("criado_em", { ascending: false })
        .limit(300)
    : { data: [] };

  return (
    <div>
      <form method="get" className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="busca-usuario" className="sr-only">E-mail ou apelido</label>
        <input
          id="busca-usuario"
          name="q"
          type="search"
          defaultValue={termo}
          placeholder="Buscar por e-mail ou apelido"
          className={`${CAMPO} sm:max-w-md`}
        />
        <button type="submit" className={BOTAO}>Buscar</button>
      </form>

      <div className="mt-6">
        <Secao titulo={termo ? `Resultado para “${termo}”` : "Contas mais recentes"}>
          {error ? (
            <FalhaCarregar error={error} />
          ) : contas.length === 0 ? (
            <p className="text-sm text-ink-2">Nenhuma conta encontrada.</p>
          ) : (
            <UsuariosClient contas={contas} auditoria={(auditoria ?? []) as RegistroAuditoria[]} />
          )}
        </Secao>
      </div>
    </div>
  );
}
