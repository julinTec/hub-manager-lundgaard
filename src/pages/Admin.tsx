import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Users, ScrollText, Plus, Pencil, Trash2, Settings, Building2, BriefcaseBusiness, WalletCards, ShieldCheck, Save, Bell, Palette, Hash, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

type SystemSettings = {
  companyName: string;
  companyDocument: string;
  companyEmail: string;
  companyPhone: string;
  companyAddress: string;
  systemDisplayName: string;
  primaryColor: string;
  footerText: string;
  supportEmail: string;
  proposalPrefix: string;
  proposalValidityDays: string;
  proposalDownPaymentPercent: string;
  proposalFinalPaymentPercent: string;
  proposalTemplate: string;
  proposalTerms: string;
  proposalExecutionDeadline: string;
  proposalWarranty: string;
  proposalSignature: string;
  proposalSequence: string;
  proposalNumberFormat: string;
  financialEntryPrefix: string;
  servicePrefix: string;
  defaultCurrency: string;
  defaultBankAccount: string;
  defaultCostCenter: string;
  defaultIncomeCategory: string;
  defaultExpenseCategory: string;
  defaultDueDay: string;
  requireBusinessUnit: boolean;
  requireCostCenter: boolean;
  requireEntryDescription: boolean;
  allowRetroactiveEntries: boolean;
  conciliationDayTolerance: string;
  conciliationValueTolerance: string;
  conciliationAutoSuggest: boolean;
  conciliationAutoApproveExact: boolean;
  conciliationBlockDivergent: boolean;
  conciliationWeightValue: string;
  conciliationWeightDate: string;
  conciliationWeightDescription: string;
  conciliationWeightDocument: string;
  defaultHomePage: string;
  auditSensitiveChanges: boolean;
  administrativeNotifications: boolean;
  notifyProposalSent: boolean;
  notifyProposalAccepted: boolean;
  notifyProposalRejected: boolean;
  notifyPendingCharge: boolean;
  notifyDelayedService: boolean;
  notifyConciliationDivergence: boolean;
  notificationEmail: string;
  defaultLanguage: string;
  timezone: string;
  dateFormat: string;
  recordsPerPage: string;
  compactMode: boolean;
  confirmBeforeDelete: boolean;
  blockDeleteConciliatedEntries: boolean;
  logRetentionDays: string;
  allowLogExport: boolean;
  transactionalEmailEnabled: boolean;
  whatsappEnabled: boolean;
  bankImportEnabled: boolean;
  webhooksEnabled: boolean;
  externalBiEnabled: boolean;
};

const defaultSystemSettings: SystemSettings = {
  companyName: "",
  companyDocument: "",
  companyEmail: "",
  companyPhone: "",
  companyAddress: "",
  systemDisplayName: "",
  primaryColor: "primary",
  footerText: "",
  supportEmail: "",
  proposalPrefix: "DE",
  proposalValidityDays: "7",
  proposalDownPaymentPercent: "50",
  proposalFinalPaymentPercent: "50",
  proposalTemplate: "completo",
  proposalTerms: "",
  proposalExecutionDeadline: "",
  proposalWarranty: "",
  proposalSignature: "",
  proposalSequence: "1",
  proposalNumberFormat: "prefixo-ano-mes-sequencial",
  financialEntryPrefix: "FIN",
  servicePrefix: "SRV",
  defaultCurrency: "brl",
  defaultBankAccount: "",
  defaultCostCenter: "",
  defaultIncomeCategory: "",
  defaultExpenseCategory: "",
  defaultDueDay: "10",
  requireBusinessUnit: true,
  requireCostCenter: false,
  requireEntryDescription: true,
  allowRetroactiveEntries: true,
  conciliationDayTolerance: "3",
  conciliationValueTolerance: "1.00",
  conciliationAutoSuggest: true,
  conciliationAutoApproveExact: false,
  conciliationBlockDivergent: true,
  conciliationWeightValue: "40",
  conciliationWeightDate: "25",
  conciliationWeightDescription: "20",
  conciliationWeightDocument: "15",
  defaultHomePage: "hub",
  auditSensitiveChanges: true,
  administrativeNotifications: false,
  notifyProposalSent: false,
  notifyProposalAccepted: true,
  notifyProposalRejected: true,
  notifyPendingCharge: true,
  notifyDelayedService: true,
  notifyConciliationDivergence: true,
  notificationEmail: "",
  defaultLanguage: "pt-BR",
  timezone: "America/Sao_Paulo",
  dateFormat: "dd/MM/yyyy",
  recordsPerPage: "25",
  compactMode: false,
  confirmBeforeDelete: true,
  blockDeleteConciliatedEntries: true,
  logRetentionDays: "365",
  allowLogExport: true,
  transactionalEmailEnabled: false,
  whatsappEnabled: false,
  bankImportEnabled: false,
  webhooksEnabled: false,
  externalBiEnabled: false,
};

export default function Admin() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{ user_id: string; currentRole: string } | null>(null);
  const [newRole, setNewRole] = useState("gerencial");

  // Form state for creating user
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("gerencial");

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*");
      return data ?? [];
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("*");
      return data ?? [];
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["admin-logs"],
    queryFn: async () => {
      const { data } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  const getUserRole = (userId: string): string => {
    const r = roles.find((r) => r.user_id === userId);
    return r?.role ?? "—";
  };

  const invokeManageUsers = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-users", { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const createUser = useMutation({
    mutationFn: () =>
      invokeManageUsers({
        action: "create",
        email: formEmail,
        password: formPassword,
        full_name: formName,
        role: formRole,
      }),
    onSuccess: () => {
      toast.success("Usuário criado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      setCreateOpen(false);
      setFormName("");
      setFormEmail("");
      setFormPassword("");
      setFormRole("gerencial");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateRole = useMutation({
    mutationFn: ({ user_id, role }: { user_id: string; role: string }) =>
      invokeManageUsers({ action: "update-role", user_id, role }),
    onSuccess: () => {
      toast.success("Perfil atualizado!");
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      setEditOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteUser = useMutation({
    mutationFn: (user_id: string) =>
      invokeManageUsers({ action: "delete", user_id }),
    onSuccess: () => {
      toast.success("Usuário removido!");
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display">Opções / Usuários</h1>
          <p className="text-muted-foreground mt-1">Gerencie usuários e perfis do sistema</p>
        </div>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users"><Users className="h-4 w-4 mr-2" />Usuários</TabsTrigger>
          <TabsTrigger value="logs"><ScrollText className="h-4 w-4 mr-2" />Logs</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="h-4 w-4 mr-2" />Opções do Sistema</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Novo Usuário</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Novo Usuário</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createUser.mutate();
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label>Nome completo</Label>
                    <Input value={formName} onChange={(e) => setFormName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Senha</Label>
                    <Input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} required minLength={6} />
                  </div>
                  <div className="space-y-2">
                    <Label>Perfil</Label>
                    <Select value={formRole} onValueChange={setFormRole}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="gerencial">Gerencial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="outline">Cancelar</Button>
                    </DialogClose>
                    <Button type="submit" disabled={createUser.isPending}>
                      {createUser.isPending ? "Criando..." : "Criar"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Edit Role Dialog */}
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Alterar Perfil</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Novo Perfil</Label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="gerencial">Gerencial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancelar</Button>
                  </DialogClose>
                  <Button
                    disabled={updateRole.isPending}
                    onClick={() => {
                      if (editTarget) updateRole.mutate({ user_id: editTarget.user_id, role: newRole });
                    }}
                  >
                    {updateRole.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : profiles.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum usuário</TableCell></TableRow>
                ) : (
                  profiles.map((p) => {
                    const role = getUserRole(p.user_id);
                    const isSelf = p.user_id === user?.id;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.full_name || "—"}</TableCell>
                        <TableCell>{p.email}</TableCell>
                        <TableCell>
                          <Badge variant={role === "admin" ? "default" : "secondary"}>
                            {role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditTarget({ user_id: p.user_id, currentRole: role });
                                setNewRole(role === "admin" || role === "gerencial" ? role : "gerencial");
                                setEditOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {!isSelf && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tem certeza que deseja excluir o usuário <strong>{p.full_name || p.email}</strong>? Esta ação não pode ser desfeita.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteUser.mutate(p.user_id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Excluir
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Entidade</TableHead>
                  <TableHead>Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum log registrado</TableCell></TableRow>
                ) : logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-sm">{new Date(l.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell>{l.action}</TableCell>
                    <TableCell>{l.entity_type}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{JSON.stringify(l.details)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 to-accent/10">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building2 className="h-5 w-5 text-primary" />
                  Dados da Empresa
                </CardTitle>
                <CardDescription>Informações usadas em propostas, relatórios e documentos.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome da empresa</Label>
                    <Input placeholder="Lundgaard" />
                  </div>
                  <div className="space-y-2">
                    <Label>CNPJ</Label>
                    <Input placeholder="00.000.000/0000-00" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>E-mail institucional</Label>
                  <Input type="email" placeholder="contato@empresa.com" />
                </div>
                <div className="space-y-2">
                  <Label>Endereço</Label>
                  <Textarea placeholder="Endereço completo da empresa" />
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-accent/30 bg-gradient-to-br from-accent/10 to-secondary/40">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BriefcaseBusiness className="h-5 w-5 text-accent" />
                  Preferências Comerciais
                </CardTitle>
                <CardDescription>Parâmetros padrão para propostas e negociações.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Prefixo da proposta</Label>
                    <Input placeholder="DE" />
                  </div>
                  <div className="space-y-2">
                    <Label>Validade padrão</Label>
                    <Input type="number" placeholder="7" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Entrada padrão (%)</Label>
                    <Input type="number" placeholder="50" />
                  </div>
                  <div className="space-y-2">
                    <Label>Modelo padrão</Label>
                    <Select defaultValue="completo">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="completo">Completo</SelectItem>
                        <SelectItem value="resumido">Resumido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Observação padrão</Label>
                  <Textarea placeholder="Texto padrão exibido nas propostas" />
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-muted bg-gradient-to-br from-secondary/50 to-background">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <WalletCards className="h-5 w-5 text-primary" />
                  Configurações Financeiras
                </CardTitle>
                <CardDescription>Preferências para lançamentos e conciliação financeira.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Moeda padrão</Label>
                    <Select defaultValue="brl">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="brl">BRL</SelectItem>
                        <SelectItem value="usd">USD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tolerância de dias</Label>
                    <Input type="number" placeholder="3" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Conta bancária padrão</Label>
                  <Input placeholder="Selecione ou informe a conta padrão" />
                </div>
                <div className="flex items-center justify-between rounded-md border bg-background/70 p-3">
                  <div>
                    <Label>Sugestões automáticas de conciliação</Label>
                    <p className="text-sm text-muted-foreground">Usar valor, data e descrição para sugerir vínculos.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-destructive/20 bg-gradient-to-br from-destructive/10 to-background">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-5 w-5 text-destructive" />
                  Permissões e Segurança
                </CardTitle>
                <CardDescription>Controles administrativos, auditoria e notificações.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Página inicial padrão</Label>
                  <Select defaultValue="hub">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hub">Hub</SelectItem>
                      <SelectItem value="bi">BI / Business Intelligence</SelectItem>
                      <SelectItem value="financeiro">Financeiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-md border bg-background/70 p-3">
                  <div>
                    <Label>Registrar alterações sensíveis</Label>
                    <p className="text-sm text-muted-foreground">Auditar exclusões e mudanças de perfil.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between rounded-md border bg-background/70 p-3">
                  <div className="flex items-start gap-2">
                    <Bell className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <Label>Notificações administrativas</Label>
                      <p className="text-sm text-muted-foreground">Avisar sobre propostas aprovadas e conciliações divergentes.</p>
                    </div>
                  </div>
                  <Switch />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => toast.success("Opções do sistema salvas!") }>
              <Save className="h-4 w-4 mr-2" />
              Salvar Opções
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
