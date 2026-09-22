import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-6 text-center">
        <div className="max-w-md rounded-lg border border-line bg-surface p-8 shadow-[0_1px_2px_rgba(23,32,51,.04),0_4px_16px_rgba(23,32,51,.05)]">
          <h1 className="text-lg font-bold text-ink">Configuração pendente</h1>
          <p className="mt-2 text-sm text-ink-2">
            As variáveis NEXT_PUBLIC_SUPABASE_URL e
            NEXT_PUBLIC_SUPABASE_ANON_KEY ainda não estão configuradas neste
            ambiente.
          </p>
        </div>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar email={user.email ?? null} />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
