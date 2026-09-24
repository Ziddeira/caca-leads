// Regras do perfil usadas tanto na tela quanto no servidor. O banco
// (supabase/etapa5-perfil.sql) confere tudo de novo — isto aqui só serve
// para mostrar o erro na hora, sem esperar a resposta do servidor.

export const APELIDO_MIN = 3;
export const APELIDO_MAX = 20;

export const FOTO_BUCKET = "avatares";
export const FOTO_MAX_BYTES = 2 * 1024 * 1024;
export const FOTO_MAX_LADO = 512;
export const FOTO_TIPOS = ["image/jpeg", "image/png", "image/webp"] as const;

// Devolve a mensagem de erro, ou null se o apelido é válido. O apelido
// deve chegar aqui já sem espaços no começo e no fim (use .trim()).
export function validarApelido(apelido: string): string | null {
  if (apelido !== apelido.trim()) {
    return "O apelido não pode começar nem terminar com espaço.";
  }
  const tamanho = [...apelido].length;
  if (tamanho < APELIDO_MIN || tamanho > APELIDO_MAX) {
    return `O apelido precisa ter de ${APELIDO_MIN} a ${APELIDO_MAX} caracteres.`;
  }
  if (/[\u0000-\u001f\u007f]/.test(apelido)) {
    return "O apelido tem caracteres inválidos.";
  }
  return null;
}

// Telefone brasileiro: só os dígitos, DDD + 8 ou 9 números.
export function soDigitos(valor: string) {
  return valor.replace(/\D/g, "");
}

export function validarTelefone(digitos: string): string | null {
  if (digitos === "") return null; // campo opcional
  if (!/^[1-9][0-9]\d{8,9}$/.test(digitos)) {
    return "Telefone inválido. Use o DDD e o número, ex.: (11) 91234-5678.";
  }
  return null;
}

// Máscara enquanto digita: (11) 91234-5678 ou (11) 1234-5678.
export function mascararTelefone(valor: string) {
  const d = soDigitos(valor).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

// Situação do telefone. A verificação por SMS ainda NÃO existe: quando
// for criada, ela preenche profiles.telefone_verificado_em (a coluna já
// existe e volta a ficar vazia sozinha sempre que o número muda) e esta
// função passa a devolver "verificado".
export type SituacaoTelefone = "vazio" | "nao_verificado" | "verificado";

export function situacaoTelefone(
  telefone: string | null,
  verificadoEm: string | null,
): SituacaoTelefone {
  if (!telefone) return "vazio";
  return verificadoEm ? "verificado" : "nao_verificado";
}

export const SENHA_MIN = 6;
