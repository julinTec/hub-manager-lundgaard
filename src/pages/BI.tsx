import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, BriefcaseBusiness, DollarSign, ShoppingCart } from "lucide-react";

const dashboards = [
  {
    id: "comercial",
    title: "Dashboard Comercial",
    icon: ShoppingCart,
  },
  {
    id: "financeiro",
    title: "Dashboard Financeiro",
    icon: DollarSign,
  },
  {
    id: "operacao",
    title: "Dashboard Operação",
    icon: BriefcaseBusiness,
  },
] as const;

type DashboardId = (typeof dashboards)[number]["id"];

export default function BI() {
  const [selectedDashboard, setSelectedDashboard] = useState<DashboardId | null>(null);
  const activeDashboard = dashboards.find((dashboard) => dashboard.id === selectedDashboard);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display">Dashboards Gerenciais</h1>
        <p className="text-muted-foreground mt-1">Indicadores consolidados e integração com ferramentas de BI</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {dashboards.map((dashboard) => {
          const Icon = dashboard.icon;
          const isActive = selectedDashboard === dashboard.id;

          return (
            <Card
              key={dashboard.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedDashboard(dashboard.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedDashboard(dashboard.id);
                }
              }}
              className={`cursor-pointer border transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md ${
                isActive ? "border-primary bg-primary/5 shadow-sm" : "border-dashed"
              }`}
            >
              <CardHeader className="space-y-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">{dashboard.title}</CardTitle>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {activeDashboard && (
        <Card className="overflow-hidden border-primary/20">
          <CardHeader className="border-b bg-muted/30">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-primary" />
              <CardTitle className="text-xl">{activeDashboard.title}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex min-h-[420px] items-center justify-center bg-background p-6">
              <div className="text-center">
                <BarChart3 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">BI selecionado</p>
                <p className="mt-1 text-sm text-muted-foreground">{activeDashboard.title} será exibido aqui.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
