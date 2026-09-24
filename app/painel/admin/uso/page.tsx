import { exigirAdminPagina } from "@/lib/admin/acesso";
import { NOME_TIPO_CHAMADA, PRECO_USD_POR_CHAMADA, custoUsd, formatarUsd } from "@/lib/admin/custos";
import { CARTAO } from "@/components/ui";
import { FalhaCarregar, NOME_PLANO, Numero, Secao, Tabela, dataDoDia, inteiro } from "../comum";

export const dynamic = "force-dynamic";

interface Uso {
  mes: string;
  buscas_mes: number;
  desbloqueios_mes: number;
  chamadas_por_tipo: Record<string, number>;
  chamadas_por_dia: { dia: string; tipos: Record<string, number> }[];
}

interface Consumidor {
  user_id: string;
  email: string | null;
  apelido: string | null;
  plano: string;
  chamadas: number;
  buscas: number;
  desbloqueios: number;
}

const TIPOS = Object.keys(NOME_TIPO_CHAMADA);
const soma = (t: Record<string, number>) => Object.values(t).reduce((a, b) => a + b, 0);

// Administração > Uso e custo. Números do mês corrente (Brasília), da
// tabela chamadas_google (etapa 2), buscas e desbloqueios.
export default async function UsoPage() {
  const supabase = await exigirAdminPagina();
  const [uso, top] = await Promise.all([
    supabase.rpc("admin_uso_custo"),
    supabase.rpc("admin_top_consumidores", { p_limite: 10 }),
  ]);
  if (uso.error) return <FalhaCarregar error={uso.error} />;
  const u = uso.data as Uso;
  const consumidores = (top.data ?? []) as Consumidor[];

  const totalChamadas = soma(u.chamadas_por_tipo);
  const chamadasBusca = u.chamadas_por_tipo.places_text_search ?? 0;
  const media = u.buscas_mes ? chamadasBusca / u.buscas_mes : 0;

  // Um ponto por dia do mês até hoje, mesmo nos dias sem chamada.
  const porDia = new Map(u.chamadas_por_dia.map((d) => [d.dia, d.tipos]));
  const [ano, mes] = u.mes.split("-").map(Number);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const dias: { dia: string; tipos: Record<string, number>; total: number }[] = [];
  for (let d = 1; d <= 31; d++) {
    const dia = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (dia > hoje || new Date(`${dia}T12:00:00Z`).getUTCMonth() + 1 !== mes) break;
    const tipos = porDia.get(dia) ?? {};
    dias.push({ dia, tipos, total: soma(tipos) });
  }
  const maior = Math.max(1, ...dias.map((d) => d.total));

  return (
    <div>
      <Secao titulo="Neste mês">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Numero rotulo="Buscas" valor={inteiro(u.buscas_mes)} />
          <Numero rotulo="Desbloqueios" valor={inteiro(u.desbloqueios_mes)} />
          <Numero
            rotulo="Custo estimado no Google"
            valor={formatarUsd(custoUsd(u.chamadas_por_tipo))}
            dica={`${inteiro(totalChamadas)} chamadas, sem descontar a franquia grátis`}
          />
          <Numero
            rotulo="Chamadas por busca"
            valor={media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
            dica="Páginas de resultado pedidas ao Google, em média"
          />
        </div>
      </Secao>

      <Secao titulo="Chamadas ao Google por dia" descricao="Total de chamadas de cada dia do mês. Passe o mouse (ou toque) numa barra para ver o número.">
        <div className={`${CARTAO} p-4`}>
          <div
            role="img"
            aria-label={`Gráfico de barras com as chamadas ao Google por dia; o maior dia teve ${inteiro(maior)} chamadas. Os números estão na tabela abaixo.`}
            className="flex h-40 items-end gap-0.5"
          >
            {dias.map((d) => (
              <div
                key={d.dia}
                title={`${dataDoDia(d.dia)}: ${inteiro(d.total)} chamada(s)`}
                className="group flex h-full min-w-0 flex-1 items-end"
              >
                <div
                  className="w-full rounded-t bg-primary transition group-hover:brightness-125"
                  style={{ height: d.total ? `${Math.max(2, (d.total / maior) * 100)}%` : "0" }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between border-t border-line pt-1 text-xs text-muted">
            <span>{dias.length ? dataDoDia(dias[0].dia).slice(0, 5) : ""}</span>
            <span>máx. {inteiro(maior)}/dia</span>
            <span>{dias.length ? dataDoDia(dias[dias.length - 1].dia).slice(0, 5) : ""}</span>
          </div>
        </div>

        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-primary">Ver a tabela por dia e por tipo</summary>
          <Tabela>
            <thead>
              <tr>
                <th>Dia</th>
                {TIPOS.map((t) => (
                  <th key={t} className="text-right">{NOME_TIPO_CHAMADA[t]}</th>
                ))}
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {dias.filter((d) => d.total).reverse().map((d) => (
                <tr key={d.dia}>
                  <td>{dataDoDia(d.dia)}</td>
                  {TIPOS.map((t) => (
                    <td key={t} className="text-right tabular-nums">{inteiro(d.tipos[t] ?? 0)}</td>
                  ))}
                  <td className="text-right font-semibold tabular-nums">{inteiro(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </details>

        <p className="mt-2 text-xs text-muted">
          Preço usado por chamada:{" "}
          {TIPOS.map((t) => `${NOME_TIPO_CHAMADA[t]} ${formatarUsd(PRECO_USD_POR_CHAMADA[t])}`).join(" · ")}. Ajuste em
          lib/admin/custos.ts se o Google mudar a tabela.
        </p>
      </Secao>

      <Secao titulo="Quem mais consome" descricao="Os 10 usuários com mais chamadas ao Google neste mês.">
        {top.error ? (
          <FalhaCarregar error={top.error} />
        ) : consumidores.length === 0 ? (
          <p className="text-sm text-ink-2">Ninguém usou o Google neste mês ainda.</p>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Plano</th>
                <th className="text-right">Chamadas</th>
                <th className="text-right">Buscas</th>
                <th className="text-right">Desbloqueios</th>
              </tr>
            </thead>
            <tbody>
              {consumidores.map((c) => (
                <tr key={c.user_id}>
                  <td>
                    <span className="block font-semibold text-ink">{c.apelido ?? "—"}</span>
                    <span className="block text-xs text-muted">{c.email ?? "sem e-mail"}</span>
                  </td>
                  <td>{NOME_PLANO[c.plano] ?? c.plano}</td>
                  <td className="text-right tabular-nums">{inteiro(Number(c.chamadas))}</td>
                  <td className="text-right tabular-nums">{inteiro(Number(c.buscas))}</td>
                  <td className="text-right tabular-nums">{inteiro(Number(c.desbloqueios))}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Secao>
    </div>
  );
}
