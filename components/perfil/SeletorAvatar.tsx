"use client";

// Escolha da imagem do perfil: enviar a própria foto (com o recorte) ou
// escolher um dos avatares prontos. Usado na página Perfil e na tela de
// boas-vindas. Cada escolha é salva na hora.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import AvatarPronto from "@/components/AvatarPronto";
import RecorteFoto from "@/components/RecorteFoto";
import { IconeCamera } from "@/components/Icones";
import { BOTAO, BOTAO_SECUNDARIO } from "@/components/ui";
import { Alerta, chamar, type Mensagem } from "@/components/perfil/comum";
import { createClient } from "@/lib/supabase/client";
import { AVATARES_PRONTOS, type AvatarProntoId } from "@/lib/perfil/avatares";
import { ErroFoto, abrirFoto, liberarFoto, recortarFoto, type AreaRecorte } from "@/lib/perfil/imagem";
import { FOTO_BUCKET, FOTO_TIPOS } from "@/lib/perfil/regras";

export default function SeletorAvatar({
  userId,
  apelido,
  fotoUrl,
  avatarPronto,
  desativado = false,
  semAvataresProntos = false,
}: {
  userId: string;
  apelido: string | null;
  fotoUrl: string | null;
  avatarPronto: string | null;
  desativado?: boolean;
  // true enquanto o script da etapa 6 não foi rodado.
  semAvataresProntos?: boolean;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const botaoFoto = useRef<HTMLButtonElement>(null);
  const [ocupado, setOcupado] = useState<"enviar" | "remover" | AvatarProntoId | null>(null);
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  const [recortando, setRecortando] = useState<HTMLImageElement | null>(null);
  // Mostra a escolha na hora, antes de a página recarregar os dados.
  const [escolhaLocal, setEscolhaLocal] = useState<
    { foto: string | null; pronto: string | null } | null
  >(null);

  const fotoAtual = escolhaLocal ? escolhaLocal.foto : fotoUrl;
  const prontoAtual = escolhaLocal ? escolhaLocal.pronto : avatarPronto;
  const bloqueado = desativado || ocupado !== null;

  // Foto própria, 1º passo: confere o arquivo e abre o recorte.
  async function escolherArquivo(arquivo: File | undefined) {
    if (entrada.current) entrada.current.value = "";
    if (!arquivo) return;
    setMensagem(null);
    try {
      setRecortando(await abrirFoto(arquivo));
    } catch (e) {
      setMensagem({
        tipo: "erro",
        texto: e instanceof ErroFoto ? e.message : "Não foi possível abrir a imagem.",
      });
    }
  }

  function fecharRecorte() {
    if (recortando) liberarFoto(recortando);
    setRecortando(null);
    botaoFoto.current?.focus();
  }

  // Foto própria, 2º passo: gera o quadrado recortado (até 512×512) e envia.
  async function enviarFoto(area: AreaRecorte) {
    if (!recortando) return;
    setOcupado("enviar");
    try {
      const foto = await recortarFoto(recortando, area);
      fecharRecorte();
      const supabase = createClient();
      // Nome novo a cada envio: o link muda e ninguém vê a foto antiga em cache.
      const path = `${userId}/${Date.now()}.${foto.extensao}`;
      const { error } = await supabase.storage
        .from(FOTO_BUCKET)
        .upload(path, foto.blob, { contentType: foto.tipo, cacheControl: "31536000", upsert: false });
      if (error) {
        console.error("[perfil] Falha no envio da foto:", error.message);
        setMensagem({ tipo: "erro", texto: "Não foi possível enviar a foto. Tente de novo." });
        return;
      }
      const erro = await chamar("/api/perfil/foto", "POST", { path });
      if (erro) {
        // Não ficou gravada no perfil: apaga o arquivo que acabou de subir.
        await supabase.storage.from(FOTO_BUCKET).remove([path]);
        setMensagem({ tipo: "erro", texto: erro });
        return;
      }
      setEscolhaLocal({ foto: URL.createObjectURL(foto.blob), pronto: null });
      setMensagem({ tipo: "ok", texto: "Foto atualizada." });
      router.refresh();
    } catch (e) {
      fecharRecorte();
      setMensagem({
        tipo: "erro",
        texto: e instanceof ErroFoto ? e.message : "Não foi possível processar a imagem.",
      });
    } finally {
      setOcupado(null);
    }
  }

  async function removerFoto() {
    setMensagem(null);
    setOcupado("remover");
    const erro = await chamar("/api/perfil/foto", "DELETE");
    setOcupado(null);
    if (erro) {
      setMensagem({ tipo: "erro", texto: erro });
      return;
    }
    setEscolhaLocal({ foto: null, pronto: prontoAtual });
    setMensagem({ tipo: "ok", texto: "Foto removida." });
    router.refresh();
  }

  async function escolherPronto(id: AvatarProntoId) {
    setMensagem(null);
    setOcupado(id);
    const erro = await chamar("/api/perfil/avatar", "POST", { avatar: id });
    setOcupado(null);
    if (erro) {
      setMensagem({ tipo: "erro", texto: erro });
      return;
    }
    setEscolhaLocal({ foto: null, pronto: id });
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <Avatar fotoUrl={fotoAtual} avatarPronto={prontoAtual} apelido={apelido} tamanho={96} />
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <input
            ref={entrada}
            type="file"
            accept={FOTO_TIPOS.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            disabled={bloqueado}
            onChange={(e) => escolherArquivo(e.target.files?.[0])}
          />
          <button
            ref={botaoFoto}
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={bloqueado}
            className={`${BOTAO} w-full sm:w-auto`}
          >
            <IconeCamera />
            {ocupado === "enviar" ? "Enviando…" : fotoAtual ? "Trocar foto" : "Enviar minha foto"}
          </button>
          {fotoAtual && (
            <button
              type="button"
              onClick={removerFoto}
              disabled={bloqueado}
              className={`${BOTAO_SECUNDARIO} w-full sm:w-auto`}
            >
              {ocupado === "remover" ? "Removendo…" : "Remover foto"}
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-sm text-muted sm:text-left">
        JPG, PNG ou WEBP de até 2 MB. Você ajusta o recorte antes de enviar.
      </p>

      {!semAvataresProntos && (
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-ink-2">Ou escolha um avatar pronto</legend>
          <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-6">
            {AVATARES_PRONTOS.map(({ id, nome }) => {
              const escolhido = !fotoAtual && prontoAtual === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={escolhido}
                  aria-label={nome}
                  title={nome}
                  disabled={bloqueado}
                  onClick={() => escolherPronto(id)}
                  className={`flex aspect-square min-h-11 items-center justify-center rounded-full p-1 transition disabled:cursor-wait ${
                    escolhido
                      ? "ring-3 ring-primary ring-offset-2 ring-offset-surface"
                      : "hover:scale-105 hover:ring-2 hover:ring-line"
                  } ${ocupado === id ? "animate-pulse" : ""}`}
                >
                  <AvatarPronto id={id} tamanho={56} className="h-full w-full" />
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="mt-3">
        <Alerta mensagem={mensagem} />
      </div>

      {recortando && (
        <RecorteFoto imagem={recortando} onCancelar={fecharRecorte} onConfirmar={enviarFoto} />
      )}
    </div>
  );
}
