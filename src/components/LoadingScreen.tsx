import { Loader2 } from "lucide-react";

export function LoadingScreen({ message = "Carregando..." }: { message?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-display font-bold text-foreground">Hub de Gestão</h1>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
        <span className="text-sm">{message}</span>
      </div>
    </div>
  );
}
