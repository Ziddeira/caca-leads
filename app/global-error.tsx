"use client";

// Último recurso: erro no próprio layout raiz. Aqui o globals.css e as
// fontes não carregam, então o visual vai todo em estilo inline, com as
// cores do manual e fontes do sistema.
export default function ErroGeral({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          background: "#0A0A0A",
          color: "#FFFFFF",
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
        }}
      >
        <title>Erro · Ártemis Prospect</title>
        <p style={{ margin: 0, fontSize: 64, fontWeight: 700, fontStyle: "italic", color: "#FFD60A" }}>500</p>
        <h1 style={{ margin: 0, fontSize: 26 }}>Algo deu errado por aqui</h1>
        <p style={{ margin: 0, maxWidth: 420, color: "#A3A3A3" }}>
          Tivemos um problema para abrir o Ártemis Prospect. Tente de novo em instantes.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            marginTop: 8,
            minHeight: 44,
            padding: "12px 24px",
            border: 0,
            cursor: "pointer",
            background: "#FFD60A",
            color: "#0A0A0A",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
          }}
        >
          Tentar de novo
        </button>
      </body>
    </html>
  );
}
