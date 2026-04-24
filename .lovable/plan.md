

# Plano atualizado: Botão "Enviar" + link de aceite no e-mail

Mantém tudo do plano anterior (botão "Enviar ao cliente" só em `pronta_para_envio`, dialog com Para/Assunto/Mensagem, PDF anexo, status muda para `enviada_ao_cliente` após envio) e **acrescenta o link de aceite no corpo do e-mail**.

## Boa notícia: a infra de aceite já existe

O projeto já tem:
- Coluna `devis.accept_token` (UUID único, gerado automaticamente em cada devis)
- Edge function pública `accept-devis-proposal` que aceita GET (preview) e POST (registra aceite)
- Página `/aceitar-proposta/:token` (`AceitarProposta.tsx`) que mostra a proposta e tem o botão "Aceitar proposta"
- Ao aceitar: registra `accepted_at`, IP, muda status para `cobranca_pendente`, cria cobrança financeira inicial (50%) e o serviço na Operação automaticamente

Ou seja: **só precisamos colocar o link no e-mail**. Toda a mecânica de aceite já está pronta e funcionando — sem travas, sem login exigido, um clique e pronto.

## O que muda no plano

### 1. Link de aceite no corpo do e-mail

A mensagem padrão passa a incluir um link destacado. Formato:

```
{ORIGIN}/aceitar-proposta/{accept_token}
```

Onde `{ORIGIN}` é a URL pública do app (detectada automaticamente — `window.location.origin` no momento de envio, passada para a edge function).

### 2. Texto padrão atualizado (PT — exemplo)

```
Prezado(a) {nome_cliente},

Conforme conversado, segue em anexo a proposta de prestação de serviços
da Lundgaard Jensen Advocacia e Consultoria Internacional, referente ao
contrato {devis_number}.

Para aceitar a proposta de forma rápida e segura, basta clicar no link
abaixo:

👉 ACEITAR PROPOSTA: {accept_url}

Permanecemos à disposição para esclarecer quaisquer dúvidas.

Atenciosamente,
Equipe Lundgaard Jensen
lundgaardjensen.com
```

Versões equivalentes em FR / EN / ES (mesmo detector de idioma já usado no PDF).

### 3. E-mail em HTML (não só texto plano)

Pra o link ficar como botão clicável e bonito, a edge function envia **HTML + texto**:
- HTML: cabeçalho com nome do escritório, parágrafos, **botão verde "Aceitar Proposta"** linkando pro `accept_url`, rodapé com contatos
- Texto: mesma mensagem em formato simples (fallback para clientes que bloqueiam HTML), com a URL escrita por extenso

A textarea no dialog continua editando o texto da mensagem; o botão de aceite é injetado automaticamente abaixo da mensagem (não fica no campo editável pra evitar o usuário apagar sem querer). Um aviso no dialog: *"O link de aceite será adicionado automaticamente ao final do e-mail."*

### 4. Sem travas no aceite — confirmado

A edge function `accept-devis-proposal` **já é pública** (não exige JWT, aceita qualquer um com o token UUID), faz tudo num clique:
- Cliente abre o link → vê a proposta renderizada → clica "Aceitar proposta" → fim
- Sem login, sem cadastro, sem captcha, sem confirmação dupla
- Idempotente: se clicar duas vezes, mostra "já aceita" sem duplicar cobrança
- Token UUID v4 (impossível adivinhar) é a única "trava" — e isso é segurança mínima necessária pra ninguém aceitar a proposta de outro cliente por engano

### 5. Notificação interna do aceite

Quando o cliente aceita:
- `devis.status` vira `cobranca_pendente` (já implementado)
- `devis.accepted_at` e `accepted_ip` registrados (já implementado)
- Cobrança de 50% criada em `financial_entries` (já implementado)
- Serviço criado em `services` para a Operação (já implementado)
- Linha em `audit_logs` com ação `devis_accepted_charge_created` (já implementado)

No frontend, a página de detalhe do devis já reflete tudo isso assim que o usuário interno recarregar (queries do React Query revalidam). **Bônus opcional:** ativar Realtime na tabela `devis` pra a tela atualizar sozinha quando o cliente aceitar — me avisa se quiser, fica em ~5 min.

## Resumo das mudanças no plano (só os deltas)

- **Edge function `send-devis-proposal`** passa a receber também `accept_url` (ou monta ela a partir de `origin` + `accept_token` que vem do frontend) e gera **HTML do e-mail** com botão de aceite estilizado, além do texto plano
- **`SendDevisDialog.tsx`** monta o `accept_url` com `window.location.origin` + `/aceitar-proposta/{accept_token}` e passa pra função; mostra um preview do link no dialog antes de enviar
- **Texto padrão** dos 4 idiomas inclui menção ao link

## Sem mudanças em

- Página `AceitarProposta.tsx` (já está pronta)
- Edge function `accept-devis-proposal` (já está pronta e sem travas)
- Schema do banco (`accept_token` já existe; `sent_at` continua sendo a única coluna nova)

## Continua igual ao plano anterior

- Botão "📧 Enviar ao cliente" só aparece em `status === pronta_para_envio`
- Resend como provedor de envio (peço a `RESEND_API_KEY` quando aprovar)
- PDF gerado com o mesmo template Lundgaard Jensen e anexado
- Após envio, status muda automaticamente para `enviada_ao_cliente`
- Migration adicionando `devis.sent_at`

Aprove e eu sigo. Assim que confirmar, peço a `RESEND_API_KEY` e implemento tudo de uma vez.

