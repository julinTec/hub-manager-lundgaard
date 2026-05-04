import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, CheckCircle, XCircle, Link2, ArrowLeftRight, Search, ArrowLeft } from "lucide-react";
import { parseOfx, type ParsedOfxTx } from "@/lib/parseOfx";

const statusColors: Record<string, string> = {
  pendente: "bg-warning/20 text-warning border-warning/30",
  conciliado: "bg-success/20 text-success border-success/30",
  divergente: "bg-destructive/20 text-destructive border-destructive/30",
  sugerido: "bg-primary/20 text-primary border-primary/30",
  confirmado: "bg-success/20 text-success border-success/30",
  rejeitado: "bg-destructive/20 text-destructive border-destructive/30",
};

export default function Conciliacao() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  // Fetch bank statement entries
  const { data: statements = [] } = useQuery({
    queryKey: ["bank-statements"],
    queryFn: async () => {
      const { data } = await supabase.from("bank_statement_entries").select("*").order("transaction_date", { ascending: false }).limit(200);
      return data ?? [];
    },
  });

  // Fetch financial entries for matching
  const { data: financialEntries = [] } = useQuery({
    queryKey: ["financial-entries-conciliation"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_entries").select("*").eq("conciliation_status", "pendente").order("entry_date", { ascending: false }).limit(200);
      return data ?? [];
    },
  });

  // Fetch existing matches
  const { data: matches = [] } = useQuery({
    queryKey: ["conciliation-matches"],
    queryFn: async () => {
      const { data } = await supabase.from("conciliation_matches").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Upload PDF/OFX handler
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop();

    if (ext !== "ofx" && ext !== "pdf") {
      toast.error("Formato inválido. Envie um extrato em PDF ou OFX.");
      e.target.value = "";
      return;
    }

    let transactions: ParsedOfxTx[] = [];

    try {
      if (ext === "ofx") {
        const text = await file.text();
        transactions = parseOfx(text);
        if (transactions.length === 0) {
          toast.error("Nenhuma transação encontrada no OFX.");
          e.target.value = "";
          return;
        }
      } else {
        // PDF -> edge function (AI)
        const toastId = toast.loading("Lendo PDF do extrato com IA, pode levar alguns segundos...");
        const buf = await file.arrayBuffer();
        // base64 encode
        let binary = "";
        const bytes = new Uint8Array(buf);
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
        }
        const fileBase64 = btoa(binary);

        const { data, error } = await supabase.functions.invoke("parse-bank-statement-pdf", {
          body: { fileBase64, fileName: file.name },
        });
        toast.dismiss(toastId);

        if (error) {
          toast.error(`Erro ao processar PDF: ${error.message}`);
          e.target.value = "";
          return;
        }
        if (data?.error) {
          toast.error(data.error);
          e.target.value = "";
          return;
        }
        transactions = (data?.transactions ?? []) as ParsedOfxTx[];
        if (transactions.length === 0) {
          toast.error("Nenhuma transação reconhecida no PDF.");
          e.target.value = "";
          return;
        }
      }
    } catch (err: any) {
      toast.error(`Erro ao ler arquivo: ${err.message ?? err}`);
      e.target.value = "";
      return;
    }

    // Create import batch
    const { data: batch, error: batchError } = await supabase.from("import_batches").insert({
      file_name: file.name,
      source_kind: "extrato_bancario",
      row_count: transactions.length,
      imported_by: user?.id,
      status: "processando" as const,
    }).select().single();

    if (batchError || !batch) {
      toast.error("Erro ao criar lote de importação");
      return;
    }

    let successCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const t = transactions[i];
      try {
        const { error } = await supabase.from("bank_statement_entries").insert({
          transaction_date: t.date,
          description: t.description,
          amount: t.amount,
          direction: t.direction,
          import_batch_id: batch.id,
          raw_payload: { source: ext, index: i, raw: (t as any).raw ?? null },
        });
        if (error) throw error;
        successCount++;
      } catch (err: any) {
        errors.push(`Transação ${i + 1}: ${err.message}`);
      }
    }

    // Update batch
    await supabase.from("import_batches").update({
      status: errors.length === 0 ? "concluido" as const : "parcial" as const,
      success_count: successCount,
      error_count: errors.length,
      error_log: errors.length > 0 ? errors : null,
    }).eq("id", batch.id);

    toast.success(`Importação concluída: ${successCount} transações${errors.length > 0 ? `, ${errors.length} erros` : ""}`);
    queryClient.invalidateQueries({ queryKey: ["bank-statements"] });
    e.target.value = "";
  }, [user, queryClient]);

  // Suggest matches
  const suggestMatches = useMutation({
    mutationFn: async () => {
      let matchCount = 0;
      const pendingStatements = statements.filter((s) => s.conciliation_status === "pendente");

      for (const stmt of pendingStatements) {
        // Find financial entries with same amount and close date
        const candidates = financialEntries.filter((fe) => {
          const feAmount = stmt.direction === "entrada" ? Number(fe.amount_in) : Number(fe.amount_out);
          const amountMatch = Math.abs(feAmount - Number(stmt.amount)) < 0.01;
          const dateDiff = Math.abs(new Date(fe.entry_date).getTime() - new Date(stmt.transaction_date).getTime());
          const dateMatch = dateDiff < 5 * 24 * 60 * 60 * 1000; // 5 days
          return amountMatch && dateMatch;
        });

        if (candidates.length > 0) {
          const best = candidates[0];
          let score = 50;
          if (Math.abs(new Date(best.entry_date).getTime() - new Date(stmt.transaction_date).getTime()) < 86400000) score += 30;
          if (best.movement_description && stmt.description && best.movement_description.toLowerCase().includes(stmt.description.toLowerCase().slice(0, 10))) score += 20;

          await supabase.from("conciliation_matches").insert({
            bank_statement_entry_id: stmt.id,
            financial_entry_id: best.id,
            match_score: Math.min(score, 100),
            match_type: "automatico" as const,
            status: "sugerido" as const,
          });
          matchCount++;
        }
      }
      return matchCount;
    },
    onSuccess: (count) => {
      toast.success(`${count} sugestões de conciliação geradas`);
      queryClient.invalidateQueries({ queryKey: ["conciliation-matches"] });
    },
  });

  // Confirm match
  const confirmMatch = useMutation({
    mutationFn: async (matchId: string) => {
      const match = matches.find((m) => m.id === matchId);
      if (!match) throw new Error("Match não encontrado");

      await supabase.from("conciliation_matches").update({ status: "confirmado" as const, confirmed_by: user?.id, confirmed_at: new Date().toISOString() }).eq("id", matchId);
      await supabase.from("bank_statement_entries").update({ conciliation_status: "conciliado" as const }).eq("id", match.bank_statement_entry_id);
      await supabase.from("financial_entries").update({ conciliation_status: "conciliado" as const }).eq("id", match.financial_entry_id);
    },
    onSuccess: () => {
      toast.success("Conciliação confirmada");
      queryClient.invalidateQueries();
    },
  });

  const rejectMatch = useMutation({
    mutationFn: async (matchId: string) => {
      await supabase.from("conciliation_matches").update({ status: "rejeitado" as const }).eq("id", matchId);
    },
    onSuccess: () => {
      toast.success("Match rejeitado");
      queryClient.invalidateQueries({ queryKey: ["conciliation-matches"] });
    },
  });

  const conciliadoCount = statements.filter((s) => s.conciliation_status === "conciliado").length;
  const pendenteCount = statements.filter((s) => s.conciliation_status === "pendente").length;
  const totalEntradas = statements.filter((s) => s.direction === "entrada").reduce((s, e) => s + Number(e.amount), 0);
  const totalSaidas = statements.filter((s) => s.direction === "saida").reduce((s, e) => s + Number(e.amount), 0);
  const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  const suggestedMatches = matches.filter((m) => m.status === "sugerido");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display">Conciliação Bancária</h1>
          <p className="text-muted-foreground mt-1">Compare extratos com lançamentos internos</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
          <label className="cursor-pointer">
            <Button variant="outline" asChild>
              <span><Upload className="h-4 w-4 mr-2" /> Upload Extrato (PDF ou OFX)</span>
            </Button>
            <input type="file" accept=".ofx,.pdf,application/pdf" className="hidden" onChange={handleUpload} />

          </label>
          <Button onClick={() => suggestMatches.mutate()} disabled={suggestMatches.isPending}>
            <Link2 className="h-4 w-4 mr-2" /> Sugerir Conciliações
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card><CardContent className="pt-6 text-center">
          <p className="text-2xl font-bold font-display text-success">{conciliadoCount}</p>
          <p className="text-xs text-muted-foreground">Conciliado</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <p className="text-2xl font-bold font-display text-warning">{pendenteCount}</p>
          <p className="text-xs text-muted-foreground">Pendente</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <p className="text-2xl font-bold font-display">{suggestedMatches.length}</p>
          <p className="text-xs text-muted-foreground">Sugestões</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <p className="text-2xl font-bold font-display text-success">{fmt(totalEntradas)}</p>
          <p className="text-xs text-muted-foreground">Entradas</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <p className="text-2xl font-bold font-display text-destructive">{fmt(totalSaidas)}</p>
          <p className="text-xs text-muted-foreground">Saídas</p>
        </CardContent></Card>
      </div>

      {/* Match Suggestions */}
      {suggestedMatches.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><ArrowLeftRight className="h-5 w-5" /> Sugestões de Conciliação</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Extrato</TableHead>
                  <TableHead>Lançamento</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suggestedMatches.map((m) => {
                  const stmt = statements.find((s) => s.id === m.bank_statement_entry_id);
                  const fe = financialEntries.find((f) => f.id === m.financial_entry_id);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm">{stmt?.transaction_date} - {stmt?.description} ({fmt(Number(stmt?.amount || 0))})</TableCell>
                      <TableCell className="text-sm">{fe?.entry_date} - {fe?.movement_description} ({fmt(Number(fe?.amount_in || fe?.amount_out || 0))})</TableCell>
                      <TableCell><Badge variant="outline">{m.match_score}%</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => confirmMatch.mutate(m.id)} className="text-success"><CheckCircle className="h-4 w-4" /></Button>
                          <Button size="sm" variant="outline" onClick={() => rejectMatch.mutate(m.id)} className="text-destructive"><XCircle className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Bank Statement Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Extrato Bancário Importado</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Direção</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statements.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum extrato importado. Faça upload de um arquivo CSV.</TableCell></TableRow>
            ) : statements.filter((s) => !search || s.description?.toLowerCase().includes(search.toLowerCase())).map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.transaction_date}</TableCell>
                <TableCell className="max-w-[300px] truncate">{s.description}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={s.direction === "entrada" ? "text-success" : "text-destructive"}>
                    {s.direction}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium">{fmt(Number(s.amount))}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusColors[s.conciliation_status] || ""}>{s.conciliation_status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
