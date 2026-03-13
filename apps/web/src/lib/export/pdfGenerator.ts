import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import type { ReportSnapshot } from "@inspect-ai/contracts";

interface ExportNodeOptions {
  reportNode: HTMLElement;
  snapshot: ReportSnapshot;
}

function waitForImage(image: HTMLImageElement) {
  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const done = () => {
      image.removeEventListener("load", done);
      image.removeEventListener("error", done);
      resolve();
    };

    image.addEventListener("load", done);
    image.addEventListener("error", done);
  });
}

export async function waitForStableReport(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(images.map((image) => waitForImage(image)));
  await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
}

async function renderReportCanvas(node: HTMLElement) {
  await waitForStableReport(node);

  return await html2canvas(node, {
    backgroundColor: "#090b12",
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true,
    allowTaint: false,
    logging: false,
    ignoreElements: (element) => element.getAttribute("data-export-ignore") === "true",
  });
}

function sanitizeFileSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function buildFileBase(snapshot: ReportSnapshot) {
  const addressPart = sanitizeFileSegment(snapshot.inputs.address || "inspection-report");
  return `${addressPart}-${snapshot.reportId.slice(0, 8)}`;
}

export async function exportReportPdf({ reportNode, snapshot }: ExportNodeOptions) {
  const canvas = await renderReportCanvas(reportNode);
  const pdf = new jsPDF({
    orientation: "p",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;
  const imageData = canvas.toDataURL("image/png");

  pdf.addImage(imageData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imageData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(`${buildFileBase(snapshot)}.pdf`);
}

export async function exportReportPoster({ reportNode, snapshot }: ExportNodeOptions) {
  const canvas = await renderReportCanvas(reportNode);
  const poster = document.createElement("canvas");
  poster.width = 1080;
  poster.height = 1920;
  const ctx = poster.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas context unavailable.");
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, poster.height);
  gradient.addColorStop(0, "#121826");
  gradient.addColorStop(1, "#090b12");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, poster.width, poster.height);

  ctx.fillStyle = "rgba(61,220,255,0.15)";
  ctx.beginPath();
  ctx.arc(920, 220, 220, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#E7ECF3";
  ctx.font = "700 62px 'Space Grotesk', sans-serif";
  ctx.fillText("Inspect.AI", 72, 112);

  ctx.font = "500 34px 'Manrope', sans-serif";
  ctx.fillStyle = "#95A0B7";
  ctx.fillText(snapshot.inputs.address || "Rental inspection snapshot", 72, 164, 780);

  const frameX = 72;
  const frameY = 240;
  const frameWidth = 936;
  const frameHeight = 1180;

  ctx.fillStyle = "#121826";
  ctx.strokeStyle = "rgba(231,236,243,0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(frameX, frameY, frameWidth, frameHeight, 36);
  ctx.fill();
  ctx.stroke();

  const scale = Math.min(frameWidth / canvas.width, frameHeight / canvas.height);
  const drawWidth = canvas.width * scale;
  const drawHeight = canvas.height * scale;
  const drawX = frameX + (frameWidth - drawWidth) / 2;
  const drawY = frameY + 36;

  ctx.drawImage(canvas, drawX, drawY, drawWidth, drawHeight);

  const footerY = 1540;
  ctx.fillStyle = "#3DDCFF";
  ctx.font = "700 72px 'Space Grotesk', sans-serif";
  ctx.fillText(String(snapshot.propertyRiskScore), 72, footerY);

  ctx.fillStyle = "#95A0B7";
  ctx.font = "500 28px 'Manrope', sans-serif";
  ctx.fillText("Property risk score", 72, footerY + 42);
  ctx.fillText(`Mode: ${snapshot.inputs.mode.toUpperCase()}`, 360, footerY + 42);
  ctx.fillText(`Hazards: ${snapshot.hazards.length}`, 580, footerY + 42);

  const outcome = snapshot.recommendation?.outcome || "Review";
  ctx.fillStyle = "#E7ECF3";
  ctx.font = "600 36px 'Manrope', sans-serif";
  ctx.fillText(outcome, 72, footerY + 126);

  ctx.fillStyle = "#95A0B7";
  ctx.font = "500 24px 'Manrope', sans-serif";
  ctx.fillText(
    snapshot.recommendation?.summary ||
      "AI-assisted snapshot. Verify all findings with a licensed professional before signing.",
    72,
    footerY + 176,
    900
  );

  const link = document.createElement("a");
  link.href = poster.toDataURL("image/png");
  link.download = `${buildFileBase(snapshot)}-poster.png`;
  link.click();
}
