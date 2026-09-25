# E-mails de autenticação do Supabase — Ártemis Prospect

Estes e-mails não ficam no código: são configurados no painel do Supabase.

**Onde colar:** Supabase → seu projeto → **Authentication → Emails** (em
algumas versões, *Authentication → Email Templates*). Para cada modelo abaixo,
troque o **Subject** (assunto) e o **Message body** (corpo, em HTML) e clique
em **Save**.

Observações:

- Não mude as variáveis entre chaves duplas (`{{ .ConfirmationURL }}`,
  `{{ .Email }}`, `{{ .NewEmail }}`). O Supabase troca cada uma pelo valor
  certo na hora do envio.
- O símbolo no topo é a imagem `https://caca-leads.vercel.app/brand/icon-192.png`.
  Ela só existe depois que este rebranding for publicado em produção. Até lá,
  o e-mail mostra só o nome, que é texto e aparece de qualquer jeito.
- Os e-mails usam fundo claro (branco), porque muitos leitores de e-mail
  forçam o fundo branco. Seguindo o manual (2.4, "Logo sobre fundos"), sobre o
  branco o nome fica em preto e o traço fica em amarelo. O botão é amarelo
  com texto preto.
- O nome do remetente (*Sender name*) fica em **Authentication → SMTP
  Settings**, quando você usa SMTP próprio. Sugestão: `Ártemis Prospect`.

---

## 1. Confirmar cadastro (Confirm signup)

**Assunto**

```
Confirme seu cadastro no Ártemis Prospect
```

**Corpo (HTML)**

```html
<div style="margin:0;padding:32px 16px;background:#F4F4F4;font-family:'Helvetica Neue',Arial,sans-serif;color:#0A0A0A">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E5E5;padding:32px">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
      <tr>
        <td style="padding-right:12px;vertical-align:middle">
          <img src="https://caca-leads.vercel.app/brand/icon-192.png" width="44" height="44" alt="" style="display:block;border:0">
        </td>
        <td style="vertical-align:middle">
          <div style="font-size:22px;font-weight:700;font-style:italic;letter-spacing:0.02em;line-height:1">ÁRTEMIS</div>
          <div style="font-size:10px;font-weight:700;letter-spacing:0.55em;margin-top:4px"><span style="display:inline-block;width:18px;height:2px;background:#FFD60A;vertical-align:middle;margin-right:6px"></span>PROSPECT</div>
        </td>
      </tr>
    </table>
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">Confirme seu e-mail</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#404040">
      Falta só um passo para começar a achar clientes que ainda não têm site.
      Clique no botão abaixo para confirmar o endereço {{ .Email }}.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#FFD60A;color:#0A0A0A;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.08em;text-transform:uppercase;padding:14px 24px">Confirmar cadastro</a>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#737373">
      Se você não criou uma conta no Ártemis Prospect, é só ignorar este e-mail.
    </p>
  </div>
</div>
```

---

## 2. Redefinir senha (Reset password)

**Assunto**

```
Redefina sua senha do Ártemis Prospect
```

**Corpo (HTML)**

```html
<div style="margin:0;padding:32px 16px;background:#F4F4F4;font-family:'Helvetica Neue',Arial,sans-serif;color:#0A0A0A">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E5E5;padding:32px">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
      <tr>
        <td style="padding-right:12px;vertical-align:middle">
          <img src="https://caca-leads.vercel.app/brand/icon-192.png" width="44" height="44" alt="" style="display:block;border:0">
        </td>
        <td style="vertical-align:middle">
          <div style="font-size:22px;font-weight:700;font-style:italic;letter-spacing:0.02em;line-height:1">ÁRTEMIS</div>
          <div style="font-size:10px;font-weight:700;letter-spacing:0.55em;margin-top:4px"><span style="display:inline-block;width:18px;height:2px;background:#FFD60A;vertical-align:middle;margin-right:6px"></span>PROSPECT</div>
        </td>
      </tr>
    </table>
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">Crie uma senha nova</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#404040">
      Recebemos um pedido para redefinir a senha da conta {{ .Email }}.
      Clique no botão abaixo para escolher a senha nova.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#FFD60A;color:#0A0A0A;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.08em;text-transform:uppercase;padding:14px 24px">Redefinir senha</a>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#737373">
      Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.
    </p>
  </div>
</div>
```

---

## 3. Link mágico (Magic link)

**Assunto**

```
Seu link de acesso ao Ártemis Prospect
```

**Corpo (HTML)**

```html
<div style="margin:0;padding:32px 16px;background:#F4F4F4;font-family:'Helvetica Neue',Arial,sans-serif;color:#0A0A0A">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E5E5;padding:32px">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
      <tr>
        <td style="padding-right:12px;vertical-align:middle">
          <img src="https://caca-leads.vercel.app/brand/icon-192.png" width="44" height="44" alt="" style="display:block;border:0">
        </td>
        <td style="vertical-align:middle">
          <div style="font-size:22px;font-weight:700;font-style:italic;letter-spacing:0.02em;line-height:1">ÁRTEMIS</div>
          <div style="font-size:10px;font-weight:700;letter-spacing:0.55em;margin-top:4px"><span style="display:inline-block;width:18px;height:2px;background:#FFD60A;vertical-align:middle;margin-right:6px"></span>PROSPECT</div>
        </td>
      </tr>
    </table>
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">Entre com um clique</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#404040">
      Use o botão abaixo para entrar na sua conta do Ártemis Prospect.
      O link vale por pouco tempo e só funciona uma vez.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#FFD60A;color:#0A0A0A;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.08em;text-transform:uppercase;padding:14px 24px">Entrar agora</a>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#737373">
      Se você não pediu este link, ignore este e-mail.
    </p>
  </div>
</div>
```

---

## 4. Trocar e-mail (Change email address) — opcional

O Perfil tem a opção "Trocar e-mail", então vale atualizar este modelo também.

**Assunto**

```
Confirme seu novo e-mail no Ártemis Prospect
```

**Corpo (HTML)**

```html
<div style="margin:0;padding:32px 16px;background:#F4F4F4;font-family:'Helvetica Neue',Arial,sans-serif;color:#0A0A0A">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E5E5;padding:32px">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
      <tr>
        <td style="padding-right:12px;vertical-align:middle">
          <img src="https://caca-leads.vercel.app/brand/icon-192.png" width="44" height="44" alt="" style="display:block;border:0">
        </td>
        <td style="vertical-align:middle">
          <div style="font-size:22px;font-weight:700;font-style:italic;letter-spacing:0.02em;line-height:1">ÁRTEMIS</div>
          <div style="font-size:10px;font-weight:700;letter-spacing:0.55em;margin-top:4px"><span style="display:inline-block;width:18px;height:2px;background:#FFD60A;vertical-align:middle;margin-right:6px"></span>PROSPECT</div>
        </td>
      </tr>
    </table>
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">Confirme o novo e-mail</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#404040">
      Você pediu para trocar o e-mail da sua conta de {{ .Email }} para
      {{ .NewEmail }}. Clique no botão abaixo para confirmar.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#FFD60A;color:#0A0A0A;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.08em;text-transform:uppercase;padding:14px 24px">Confirmar novo e-mail</a>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#737373">
      Se não foi você que pediu, ignore este e-mail: nada muda na sua conta.
    </p>
  </div>
</div>
```
