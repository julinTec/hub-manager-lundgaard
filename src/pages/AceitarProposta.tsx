import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, AlertCircle, Calendar, FileText } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import logo from "@/assets/logo.svg";

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/accept-devis-proposal`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type Preview = {
  title: string;
  client_name: string | null;
  total_amount: number;
  down_payment_amount: number;
  deadline_date: string | null;
  scope_description: string | null;
  proposal_structure: string | null;
  accepted_at: string | null;
};

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

export default function AceitarProposta() {
  const { token } = useParams();
  const [state, setState] = useState<"loading" | "not_found" | "ready" | "accepting" | "success" | "already" | "error">("loading");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${FN_URL}?token=${token}`, {
          headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
        });
        if (res.status === 404) return setState("not_found");
        if (!res.ok) {
          setErrorMsg("Não foi possível carregar a proposta.");
          return setState("error");
        }
        const data: Preview = await res.json();
        setPreview(data);
        setState(data.accepted_at ? "already" : "ready");
      } catch {
        setErrorMsg("Erro de conexão.");
        setState("error");
      }
    })();
  }, [token]);

  const handleAccept = async () => {
    setState("accepting");
    try {
      const res = await fetch(`${FN_URL}?token=${token}`, {
        method: "POST",
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
      });
      if (!res.ok) {
        setErrorMsg("Não foi possível registrar o aceite.");
        return setState("error");
      }
      const data: Preview = await res.json();
      setPreview(data);
      setState("success");
    } catch {
      setErrorMsg("Erro de conexão.");
      setState("error");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <img src={logo} alt="Lundgaard Hub" className="h-8 w-auto" />
          <span className="font-semibold text-foreground">Lundgaard Hub</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 md:py-12">
        {state === "loading" && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-3" />
            Carregando proposta...
          </div>
        )}

        {state === "not_found" && (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h1 className="text-xl font-semibold mb-2">Proposta não encontrada</h1>
              <p className="text-muted-foreground">O link pode ter expirado ou estar incorreto.</p>
            </CardContent>
          </Card>
        )}

        {state === "error" && (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-3" />
              <h1 className="text-xl font-semibold mb-2">Algo deu errado</h1>
              <p className="text-muted-foreground">{errorMsg}</p>
              <Button className="mt-4" onClick={() => window.location.reload()}>Tentar novamente</Button>
            </CardContent>
          </Card>
        )}

        {(state === "ready" || state === "accepting" || state === "already" || state === "success") && preview && (
          <div className="space-y-6">
            {(state === "success" || state === "already") && (
              <Card className="border-green-500/40 bg-green-500/5">
                <CardContent className="py-6 flex items-start gap-4">
                  <CheckCircle2 className="h-10 w-10 text-green-600 flex-shrink-0" />
                  <div>
                    <h2 className="text-xl font-semibold text-green-700 dark:text-green-400">
                      {state === "success" ? "Proposta aceita com sucesso!" : "Esta proposta já foi aceita"}
                    </h2>
                    {preview.accepted_at && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Em {format(parseISO(preview.accepted_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    )}
                    <p className="text-sm mt-2">
                      Proposta aceita! Em breve você receberá a cobrança inicial de <strong>50%</strong> do valor total
                      ({fmtBRL(preview.down_payment_amount)}) para iniciarmos os próximos passos.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">{preview.title}</CardTitle>
                {preview.client_name && (
                  <p className="text-muted-foreground">Para: <span className="font-medium text-foreground">{preview.client_name}</span></p>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Valor total</div>
                    <div className="text-2xl font-bold mt-1">{fmtBRL(preview.total_amount)}</div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Entrada (50%)</div>
                    <div className="text-2xl font-bold mt-1">{fmtBRL(preview.down_payment_amount)}</div>
                  </div>
                </div>

                {preview.deadline_date && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Prazo:</span>
                    <span className="font-medium">{format(parseISO(preview.deadline_date), "dd/MM/yyyy")}</span>
                  </div>
                )}

                {preview.scope_description && (
                  <div>
                    <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
                      <FileText className="h-4 w-4" /> Escopo
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{preview.scope_description}</p>
                  </div>
                )}

                {preview.proposal_structure && (
                  <div>
                    <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
                      <FileText className="h-4 w-4" /> Estrutura da proposta
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{preview.proposal_structure}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {state === "ready" && (
              <div className="flex flex-col items-center gap-3 pt-2">
                <Button size="lg" className="w-full sm:w-auto px-10" onClick={handleAccept}>
                  Aceitar proposta
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Ao aceitar, você confirma a contratação dos serviços conforme descritos acima.
                </p>
              </div>
            )}
            {state === "accepting" && (
              <div className="flex justify-center pt-2">
                <Button size="lg" disabled className="px-10">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registrando aceite...
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
