import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Captura todas as páginas com a classe `.devis-pdf-page` dentro do container
 * e gera um PDF A4 multipágina.
 */
export async function exportDevisPdfFromContainer(container: HTMLElement, fileName: string) {
  const pages = Array.from(container.querySelectorAll<HTMLElement>(".devis-pdf-page"));
  if (pages.length === 0) throw new Error("Nenhuma página encontrada para exportar");

  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    if (i > 0) pdf.addPage();
    // ajusta mantendo proporção, centraliza verticalmente se sobrar espaço
    const ratio = canvas.height / canvas.width;
    const renderH = pageW * ratio;
    if (renderH <= pageH) {
      pdf.addImage(imgData, "JPEG", 0, 0, pageW, renderH);
    } else {
      // se ultrapassar, encaixa pela altura
      const renderW = pageH / ratio;
      pdf.addImage(imgData, "JPEG", (pageW - renderW) / 2, 0, renderW, pageH);
    }
  }

  pdf.save(fileName);
}
