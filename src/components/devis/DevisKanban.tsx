import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  PIPELINE_STATUSES,
  STATUS_LABELS,
  STATUS_COLUMN_ACCENT,
  STATUS_BADGE_CLASSES,
  requiresValidation,
} from "@/lib/devisStatus";
import { cn } from "@/lib/utils";

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

interface DevisKanbanProps {
  devis: any[];
  clientsById: Record<string, any>;
  profilesById: Record<string, any>;
}

function DevisCard({ devis, clientsById, profilesById, dragging = false }: any) {
  const navigate = useNavigate();
  const client = clientsById[devis.client_id];
  const responsavel = profilesById[devis.commercial_responsible];

  return (
    <Card
      onClick={() => !dragging && navigate(`/comercial/devis/${devis.id}`)}
      className={cn(
        "p-3 cursor-pointer hover:shadow-md transition-shadow space-y-2 bg-card",
        dragging && "opacity-50",
      )}
    >
      <div className="font-medium text-sm line-clamp-2">{client?.name || devis.title || "—"}</div>
      <div className="text-base font-semibold text-primary">{fmtBRL(devis.total_amount)}</div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate">
          {responsavel?.full_name || responsavel?.email || "Sem responsável"}
        </span>
        <span>{devis.meeting_date ? format(parseISO(devis.meeting_date), "dd/MM") : "—"}</span>
      </div>
    </Card>
  );
}

function DraggableCard({ devis, clientsById, profilesById }: any) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: devis.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}>
      <DevisCard
        devis={devis}
        clientsById={clientsById}
        profilesById={profilesById}
        dragging={isDragging}
      />
    </div>
  );
}

function Column({ status, devis, clientsById, profilesById }: any) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="flex-shrink-0 w-72">
      <Card
        className={cn(
          "border-t-4 p-3 h-full flex flex-col",
          STATUS_COLUMN_ACCENT[status] ?? "border-t-border",
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-sm">{STATUS_LABELS[status]}</div>
          <Badge variant="outline" className={cn("text-xs", STATUS_BADGE_CLASSES[status])}>
            {devis.length}
          </Badge>
        </div>
        <div
          ref={setNodeRef}
          className={cn(
            "space-y-2 min-h-[200px] flex-1 rounded-md p-1 transition-colors",
            isOver && "bg-accent/50",
          )}
        >
          {devis.map((d: any) => (
            <DraggableCard
              key={d.id}
              devis={d}
              clientsById={clientsById}
              profilesById={profilesById}
            />
          ))}
          {devis.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-6">Vazio</div>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function DevisKanban({ devis, clientsById, profilesById }: DevisKanbanProps) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    PIPELINE_STATUSES.forEach((s) => (map[s] = []));
    devis.forEach((d: any) => {
      if (map[d.status]) map[d.status].push(d);
    });
    return map;
  }, [devis]);

  const activeDevis = devis.find((d: any) => d.id === activeId);

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const newStatus = String(over.id);
    const card = devis.find((d: any) => d.id === active.id);
    if (!card || card.status === newStatus) return;
    if (!PIPELINE_STATUSES.includes(newStatus as any)) return;

    // Bloqueio: status que exige validação comercial
    if (requiresValidation(newStatus) && !card.validated_at) {
      toast.error("É necessário validar a proposta antes de enviá-la ao cliente");
      return;
    }

    // Optimistic update
    queryClient.setQueryData(["devis"], (old: any[] | undefined) =>
      (old ?? []).map((d) => (d.id === card.id ? { ...d, status: newStatus } : d)),
    );

    const { error } = await supabase
      .from("devis")
      .update({ status: newStatus as any })
      .eq("id", card.id);

    if (error) {
      toast.error("Erro ao atualizar status: " + error.message);
      queryClient.invalidateQueries({ queryKey: ["devis"] });
    } else {
      toast.success(`Movido para "${STATUS_LABELS[newStatus]}"`);
      queryClient.invalidateQueries({ queryKey: ["devis"] });
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            devis={grouped[status]}
            clientsById={clientsById}
            profilesById={profilesById}
          />
        ))}
      </div>
      <DragOverlay>
        {activeDevis && (
          <DevisCard
            devis={activeDevis}
            clientsById={clientsById}
            profilesById={profilesById}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
