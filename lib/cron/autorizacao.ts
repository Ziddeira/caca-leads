import "server-only";
import { timingSafeEqual } from "node:crypto";

// As rotas agendadas (app/api/cron/*) só aceitam chamadas da Vercel Cron.
// A Vercel manda "Authorization: Bearer <CRON_SECRET>" sozinha quando a
// variável CRON_SECRET está cadastrada no projeto.
export function cronAutorizado(request: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || segredo.length < 16) return false;
  const recebido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}
