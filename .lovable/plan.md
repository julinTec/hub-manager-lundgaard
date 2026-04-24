

# Plano: Formatação BRL, status clicável e export PDF padrão Lundgaard Jensen

## 1. Formatação dos valores em BRL com pontos e vírgulas

**Problema:** No modal "Novo Devis" e na edição, os campos `Valor total` e `Valor de entrada` mostram `100000` e `50000.00` (puro). O usuário quer `100.000,00` e `50.000,00` no padrão pt-BR (ponto = milhar, vírgula = decimal).

**Solução:** criar um componente `CurrencyInputBRL` em `src/components/ui/currency-input-brl.tsx` que:
- Mostra o valor formatado como `100.000,00` enquanto o usuário digita
- Internamente armazena o número (como string em centavos ou float) e expõe `value: number`
- Aceita digitação livre (ignora não-dígitos, divide por 100 para definir os decimais)

Aplicar nos pontos onde hoje aparece `<Input type="number">` para valores monetários:
- `src/pages/Comercial.tsx` → modal Novo Devis (Valor total, Valor de entrada)
- `src/pages/DevisDetail.tsx` → edição (Valor total, Valor de entrada)
- Qualquer outro form de Financeiro / Operação que use moeda (verificar e aplicar para consistência)

A leitura permanece com `fmtBRL()` (Intl pt-BR), que já está correta — só os **inputs** estão mostrando o número cru.

## 2. Status alterável diretamente ao clicar (sem precisar abrir "Editar")

**Problema:** Em `/comercial/devis/:id`, o badge de status só vira `Select` quando o usuário aperta "Editar".

**Solução em `src/pages/DevisDetail.tsx`:**
- Substituir o badge somente-leitura por um **`Popover`** (ou `DropdownMenu`) clicável que mostra a lista de status disponíveis, com indicação de bloqueio (🔒) para os que exigem validação.
- Ao escolher um novo status: chamar `supabase.from("devis").update({ status }).eq("id", id)` direto, exibir toast e invalidar queries — sem entrar no modo edição global.
- Manter a regra `requiresValidation(status) && !devis.validated_at` → desabilitar a opção e mostrar tooltip "Valide a proposta antes".
- Cursor `pointer` + hover sutil no badge para indicar que é clicável.

(Opcional, mesma feature no Kanban: já funciona via drag — não mexer.)

## 3. Exportar Devis em PDF no padrão do contrato Lundgaard Jensen

**Referência:** documento `DE202511065` em anexo — contrato bilíngue PT/FR com:
- Cabeçalho com logo Lundgaard Jensen (mundo dourado) e título grande
- Seções numeradas (I. Identificação, II. Objeto, escopo A/B/C com valores, III. Honorários, IV. Prazo)
- Rodapé fixo: `Rua João Cordeiro, 831 – Praia de Iracema | +55 (85) 9 94066042 | +55 (85) 9 30379931` + paginação `Página X de Y`
- Última página com bloco de assinatura: `LUNDGAARD JENSEN ADVOCACIA E CONSULTORIA INTERNACIONAL — CONTRATADO / LAW FIRM` + duas testemunhas (Nome / CPF / Assinatura)
- Marca `lundgaardjensen.com | @lundgaard.jensen DE{numero}` no rodapé direito

### Implementação

**a) Novo botão "Exportar PDF"** em `src/pages/DevisDetail.tsx` (cabeçalho, ao lado de "Editar"). Habilitado sempre.

**b) Novo componente `src/components/devis/DevisPdfTemplate.tsx`** — uma página HTML/CSS estilizada (A4, margens, fontes serif para contrato), renderizada num container fora-da-tela (`position: absolute; left: -9999px`) que reproduz fielmente o template:
- Cabeçalho com logo (`src/assets/logo-banner.png` já existe)
- Título "CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS" (ou versão FR/EN/ES baseada no idioma detectado, se houver — fallback PT)
- Seção I — dados do cliente (nome, documento, endereço se disponível)
- Seção I — dados fixos do contratado (Lundgaard Jensen completo, conforme o anexo)
- Seção II — Objeto + parser do `proposal_structure` ou `scope_description` para listar itens A, B, C com valores em `BRL X.XXX,XX`
- Seção III — Honorários (total + entrada 50%)
- Seção IV — Prazo (deadline_date)
- Rodapé com endereço/contatos + número `DE{ano}{mes}{seq}` (gerar a partir do `id` ou criar coluna `devis_number` — ver técnica abaixo)
- Página final com assinaturas + testemunhas

**c) Geração do PDF** com `html2canvas` + `jspdf` (libs leves, client-side, sem dependência de servidor):
- Adicionar via `npm` (já permitido)
- Renderizar o template, capturar como canvas, gerar PDF A4 multipágina
- Nome do arquivo: `Devis-{numero}-{cliente}.pdf`

**d) Numeração da Devis (`DE{AAAA}{MM}{NNN}`):**
- Adicionar coluna `devis_number TEXT UNIQUE` em `public.devis` via migration
- Trigger BEFORE INSERT que gera o número sequencial do mês: `'DE' || to_char(now(),'YYYYMM') || lpad(seq::text,3,'0')`
- Para devis já existentes: backfill com base em `created_at`
- Exibir o número no cabeçalho do detalhe e na lista

**e) Idioma do contrato:** se `proposal_structure` contém marcadores em FR/EN/ES (já gerados pela edge function `analyze-meeting-report`), o template detecta e troca os títulos das seções automaticamente (mapa pt→fr/en/es). Versão bilíngue (PT + FR lado a lado) fica para uma evolução futura — nesta entrega entregamos **um idioma por export**, escolhido automaticamente pelo conteúdo.

## Arquivos afetados

- **Criar:** `src/components/ui/currency-input-brl.tsx`
- **Criar:** `src/components/devis/DevisPdfTemplate.tsx`
- **Criar:** `src/lib/exportDevisPdf.ts` (helper html2canvas + jspdf)
- **Editar:** `src/pages/Comercial.tsx` (usar CurrencyInputBRL no modal)
- **Editar:** `src/pages/DevisDetail.tsx` (CurrencyInputBRL, status clicável via Popover, botão Exportar PDF, exibir devis_number)
- **Migration:** adicionar `devis_number` + trigger + backfill
- **Dependências novas:** `html2canvas`, `jspdf`

## Fora do escopo (posso fazer depois se quiser)

- Versão bilíngue PT/FR lado a lado no mesmo PDF
- Assinatura digital / e-sign integrado
- Salvar PDF gerado no Storage automaticamente

