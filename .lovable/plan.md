## Trocar exportação de CSV para XLSX

Na página **Movimentação Financeira** (`src/pages/Financeiro.tsx`) o botão "Exportar CSV" gera um arquivo `.csv`. Vou trocar pela exportação em `.xlsx` (Excel nativo).

### Mudanças

1. **Dependência**: adicionar a biblioteca `xlsx` (SheetJS) ao projeto.
2. **`src/pages/Financeiro.tsx`**:
   - Importar `* as XLSX from "xlsx"`.
   - Substituir a função `exportCSV` por `exportXLSX`, que monta uma planilha com os mesmos cabeçalhos (Data, Negócio, Conta Mov., Descrição, Fornecedor/Cliente, Entrada, Saída, Status, Origem) usando `XLSX.utils.aoa_to_sheet`, cria um workbook e baixa como `movimentacao_financeira.xlsx` via `XLSX.writeFile`.
   - Atualizar o botão para "Exportar XLSX" chamando a nova função.
   - Valores numéricos (`amount_in`, `amount_out`) serão convertidos para `Number` para que o Excel reconheça como número.

Sem alterações em banco, edge functions ou outras páginas.
