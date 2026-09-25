import { ListaEsqueleto } from "@/components/leads/CartaoLeadEsqueleto";

// Aparece na hora em que a pessoa clica em "Meus leads", enquanto a lista
// é lida do banco.
export default function Carregando() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-ink sm:text-4xl">Meus leads</h1>
      <div className="esqueleto mt-3 h-4 w-64 max-w-full" />
      <ListaEsqueleto />
    </div>
  );
}
