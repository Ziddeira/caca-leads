"use client";

import { useState } from "react";
import Avatar from "@/components/Avatar";
import { IconeBloquear } from "@/components/Icones";
import { ALERTA_ERRO, BOTAO_NEUTRO, CARTAO, EstadoVazio } from "@/components/ui";
import { chamarApi, dataHoraCompleta } from "@/components/comunidade/api";
import { urlAvatar } from "@/lib/comunidade/tipos";
import type { Bloqueado } from "@/lib/mensagens/tipos";

export default function ListaBloqueados({ inicial }: { inicial: Bloqueado[] }) {
  const [lista, setLista] = useState(inicial);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function desbloquear(apelido: string) {
    if (!window.confirm(`Desbloquear ${apelido}? A conversa não reabre sozinha: vai ser preciso um pedido novo.`)) return;
    setErro(null);
    setEnviando(apelido);
    const r = await chamarApi("/api/mensagens/bloqueios", "POST", { apelido, bloquear: false });
    setEnviando(null);
    if (!r.ok) return setErro(r.erro);
    setLista((l) => l.filter((b) => b.apelido !== apelido));
  }

  if (lista.length === 0) {
    return (
      <EstadoVazio
        icone={<IconeBloquear width={26} height={26} />}
        titulo="Ninguém bloqueado"
        texto="Para bloquear alguém, abra a conversa com a pessoa e toque no menu “…”."
      />
    );
  }

  return (
    <>
      {erro && (
        <p role="alert" className={`${ALERTA_ERRO} mb-3`}>
          {erro}
        </p>
      )}
      <ul className={`${CARTAO} divide-y divide-line-2`}>
        {lista.map((b) => (
          <li key={b.apelido ?? b.desde} className="flex items-center gap-3 px-3 py-3 sm:px-4">
            <Avatar fotoUrl={urlAvatar(b.foto_path)} avatarPronto={b.avatar_pronto} apelido={b.apelido} tamanho={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{b.apelido ?? "Conta removida"}</p>
              <p className="text-xs text-muted">Bloqueado em {dataHoraCompleta(b.desde)}</p>
            </div>
            {b.apelido && (
              <button
                type="button"
                onClick={() => desbloquear(b.apelido!)}
                disabled={enviando === b.apelido}
                className={BOTAO_NEUTRO}
              >
                Desbloquear
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
