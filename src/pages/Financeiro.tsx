import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Search, Download, ArrowDownCircle, ArrowUpCircle } from "lucide-react";

const statusColors: Record<string, string> = {
  pendente: "bg-warning/20 text-warning border-warning/30",
  conciliado: "bg-success/20 text-success border-success/30",
  divergente: "bg-destructive/20 text-destructive border-destructive/30",
  ignorado: "bg-muted text-muted-foreground",
};

export default function Financeiro() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [competence, setCompetence] = useState<string>("");
  const [businessFilter, setBusinessFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    entry_date: "", competence_month: "", business_unit: "", movement_account: "",
    movement_description: "", counterparty_name: "", amount_in: "", amount_out: "",
  });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["financial-entries", competence, businessFilter, search],
    queryFn: async () => {
      let q = supabase.from("financial_entries").select("*").order("entry_date", { ascending: false }).limit(200);
      if (competence) q = q.eq("competence_month", competence);
      if (businessFilter) q = q.eq("business_unit", businessFilter);
      if (search) q = q.or(`movement_description.ilike.%${search}%,counterparty_name.ilike.%${search}%`);
      const { data } = await q;
      return data ?? [];
    },
  });

  const createEntry = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("financial_entries").insert({
        entry_date: form.entry_date,
        competence_month: form.competence_month,
        business_unit: form.business_unit,
        movement_account: form.movement_account,
        movement_description: form.movement_description,
        counterparty_name: form.counterparty_name,
        amount_in: Number(form.amount_in) || 0,
        amount_out: Number(form.amount_out) || 0,
        source_type: "manual" as const,
        user_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento criado!");
      queryClient.invalidateQueries({ queryKey: ["financial-entries"] });
      setDialogOpen(false);
      setForm({ entry_date: "", competence_month: "", business_unit: "", movement_account: "", movement_description: "", counterparty_name: "", amount_in: "", amount_out: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const exportCSV = () => {
    const headers = ["Data", "Negócio", "Conta Mov.", "Descrição", "Fornecedor/Cliente", "Entrada", "Saída", "Status", "Origem"];
    const rows = entries.map((e) => [e.entry_date, e.business_unit, e.movement_account, e.movement_description, e.counterparty_name, e.amount_in, e.amount_out, e.conciliation_status, e.source_type]);
    const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "movimentacao_financeira.csv"; a.click();
  };

  const totalIn = entries.reduce((s, e) => s + Number(e.amount_in || 0), 0);
  const totalOut = entries.reduce((s, e) => s + Number(e.amount_out || 0), 0);
  const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display">Movimentação Financeira</h1>
          <p className="text-muted-foreground mt-1">Lançamentos financeiros do grupo</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Novo Lançamento</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Lançamento</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input type="date" placeholder="Data" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
                <Input placeholder="Competência (ex: 2025-03)" value={form.competence_month} onChange={(e) => setForm({ ...form, competence_month: e.target.value })} />
                <Input placeholder="Negócio" value={form.business_unit} onChange={(e) => setForm({ ...form, business_unit: e.target.value })} />
                <Input placeholder="Conta Movimentação" value={form.movement_account} onChange={(e) => setForm({ ...form, movement_account: e.target.value })} />
                <Input placeholder="Descrição" value={form.movement_description} onChange={(e) => setForm({ ...form, movement_description: e.target.value })} />
                <Input placeholder="Fornecedor/Cliente" value={form.counterparty_name} onChange={(e) => setForm({ ...form, counterparty_name: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <Input type="number" placeholder="Entrada (R$)" value={form.amount_in} onChange={(e) => setForm({ ...form, amount_in: e.target.value })} />
                  <Input type="number" placeholder="Saída (R$)" value={form.amount_out} onChange={(e) => setForm({ ...form, amount_out: e.target.value })} />
                </div>
                <Button className="w-full" onClick={() => createEntry.mutate()} disabled={!form.entry_date}>Salvar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <ArrowDownCircle className="h-8 w-8 text-success" />
            <div>
              <p className="text-sm text-muted-foreground">Total Entradas</p>
              <p className="text-xl font-bold font-display">{fmt(totalIn)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <ArrowUpCircle className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-sm text-muted-foreground">Total Saídas</p>
              <p className="text-xl font-bold font-display">{fmt(totalOut)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">$</span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saldo</p>
              <p className="text-xl font-bold font-display">{fmt(totalIn - totalOut)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por descrição ou fornecedor..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Input placeholder="Competência" className="w-40" value={competence} onChange={(e) => setCompetence(e.target.value)} />
        <Input placeholder="Negócio" className="w-40" value={businessFilter} onChange={(e) => setBusinessFilter(e.target.value)} />
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Negócio</TableHead>
              <TableHead>Conta Mov.</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Fornecedor/Cliente</TableHead>
              <TableHead className="text-right">Entrada</TableHead>
              <TableHead className="text-right">Saída</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Origem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : entries.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum lançamento encontrado</TableCell></TableRow>
            ) : entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap">{e.entry_date}</TableCell>
                <TableCell>{e.business_unit}</TableCell>
                <TableCell>{e.movement_account}</TableCell>
                <TableCell className="max-w-[200px] truncate">{e.movement_description}</TableCell>
                <TableCell>{e.counterparty_name}</TableCell>
                <TableCell className="text-right text-success font-medium">{Number(e.amount_in) ? fmt(Number(e.amount_in)) : "-"}</TableCell>
                <TableCell className="text-right text-destructive font-medium">{Number(e.amount_out) ? fmt(Number(e.amount_out)) : "-"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusColors[e.conciliation_status] || ""}>
                    {e.conciliation_status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{e.source_type}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
