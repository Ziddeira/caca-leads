import { exigirAdminPagina } from "@/lib/admin/acesso";
import { FalhaCarregar, Secao, Tabela, dataHora } from "../comum";

export const dynamic = "force-dynamic";

interface Erro {
  id: number;
  origem: string;
  mensagem: string;
  detalhe: Record<string, unknown> | null;
  user_id: string | null;
  criado_em: string;
}

const NOME_ORIGEM: Record<string, string> = {
  webhook_asaas: "Webhook do Asaas",
  verificar_vendas: "Verificação de vendas",
  busca: "Busca",
  notificacoes: "Notificações",
};

// Administração > Erros: falhas das rotinas do servidor (tabela
// erros_servidor, etapa 11). A leitura é direta na tabela: a regra de RLS
// só deixa administradores verem as linhas. Erros com mais de 90 dias
// somem sozinhos.
export default async function ErrosPage({ searchParams }: { searchParams: Promise<{ origem?: string }> }) {
  const supabase = await exigirAdminPagina();
  const { origem } = await searchParams;
  const filtro = origem && origem in NOME_ORIGEM ? origem : null;

  let consulta = supabase
    .from("erros_servidor")
    .select("id, origem, mensagem, detalhe, user_id, criado_em")
    .order("criado_em", { ascending: false })
    .limit(200);
  if (filtro) consulta = consulta.eq("origem", filtro);
  const { data, error } = await consulta;
  if (error) return <FalhaCarregar error={error} />;
  const erros = (data ?? []) as Erro[];

  const filtros = [{ id: null, nome: "Todos" }, ...Object.entries(NOME_ORIGEM).map(([id, nome]) => ({ id, nome }))];

  return (
    <div>
      <nav aria-label="Filtrar por origem" className="mb-4 flex flex-wrap gap-2">
        {filtros.map((f) => (
          <a
            key={f.id ?? "todos"}
            href={f.id ? `?origem=${f.id}` : "?"}
            aria-current={filtro === f.id ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${
              filtro === f.id ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-ink-2 hover:text-ink"
            }`}
          >
            {f.nome}
          </a>
        ))}
      </nav>

      <Secao titulo="Falhas registradas" descricao="As 200 mais recentes.">
        {erros.length === 0 ? (
          <p className="text-sm text-ink-2">Nenhum erro registrado. Tudo certo por aqui.</p>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Rotina</th>
                <th>Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {erros.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap align-top">{dataHora(e.criado_em)}</td>
                  <td className="whitespace-nowrap align-top font-semibold text-ink">{NOME_ORIGEM[e.origem] ?? e.origem}</td>
                  <td className="align-top">
                    <span className="block break-words text-ink">{e.mensagem}</span>
                    {e.detalhe && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-primary">Detalhes</summary>
                        <pre className="mt-1 max-w-xl overflow-x-auto whitespace-pre-wrap break-all rounded bg-canvas p-2 text-xs text-ink-2">
                          {JSON.stringify(e.detalhe, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Secao>
    </div>
  );
}
