Plano para corrigir a regra dos cards indicadores na página Comercial:

1. Alterar os cálculos dos indicadores para considerar avanço histórico no funil, não apenas o status atual.
   - Devis Enviados: contar propostas que estão em `enviada_ao_cliente` e também as que já avançaram para `aguardando_aceite` ou `aceita`, além de propostas com `sent_at` preenchido.
   - Devis Aguardando: contar propostas em `aguardando_aceite` e também as que já foram aceitas (`aceita` ou `accepted_at` preenchido), pois elas passaram por essa etapa.
   - Devis Aceitos: manter contagem de propostas aceitas e soma do valor total, preferindo `accepted_at` preenchido ou status `aceita`.

2. Manter o visual atual dos cards sem mudanças.

3. Validar com TypeScript após a alteração.