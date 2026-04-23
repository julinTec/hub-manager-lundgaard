import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, PieChart, Globe } from "lucide-react";

export default function BI() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display">Consolidação / BI</h1>
        <p className="text-muted-foreground mt-1">Indicadores consolidados e integração com ferramentas de BI</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-dashed">
          <CardHeader>
            <BarChart3 className="h-8 w-8 text-muted-foreground mb-2" />
            <CardTitle className="text-lg">Receita x Despesa por Empresa</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Visualize a performance financeira de cada unidade de negócio. Em breve: gráficos comparativos e drill-down.
            </p>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <TrendingUp className="h-8 w-8 text-muted-foreground mb-2" />
            <CardTitle className="text-lg">Fluxo de Caixa</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Acompanhe entradas e saídas ao longo do tempo. Em breve: projeções e cenários.
            </p>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <PieChart className="h-8 w-8 text-muted-foreground mb-2" />
            <CardTitle className="text-lg">Indicadores Gerenciais</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              KPIs consolidados: margem, inadimplência, prazo médio, rentabilidade. Em breve.
            </p>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <Globe className="h-8 w-8 text-muted-foreground mb-2" />
            <CardTitle className="text-lg">API para BI Externo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Endpoints REST disponíveis para Power BI, Metabase e outras ferramentas. Configuração na aba Administração.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
