import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import type { TicketRecord } from '../types';

export async function generateQrDataUrl(qrToken: string): Promise<string> {
  return QRCode.toDataURL(qrToken, {
    width: 300,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#141413',
      light: '#FFFFFF',
    },
  });
}

export async function downloadTicketPdf(ticket: TicketRecord): Promise<void> {
  const qrDataUrl = await generateQrDataUrl(ticket.qrToken);
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(20, 20, 19);
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setTextColor(246, 244, 239);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('EVENTPASS TICKET', 14, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`TICKET #${ticket.id}  |  ${ticket.status}`, 14, 20);

  doc.setTextColor(20, 20, 19);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  const titleLines = doc.splitTextToSize(ticket.event_name, pageWidth - 28);
  doc.text(titleLines, 14, 38);

  let cursorY = 38 + titleLines.length * 7 + 4;

  doc.setDrawColor(214, 208, 196);
  doc.line(14, cursorY, pageWidth - 14, cursorY);
  cursorY += 8;

  const rows: Array<[string, string]> = [
    ['HOLDER', ticket.owner_name],
    ['STARTS', new Date(ticket.event_start).toLocaleString()],
    ['ENDS', new Date(ticket.event_end).toLocaleString()],
    ['ORDER', `#${ticket.reservation_id}`],
    ['PRICE', `${Number(ticket.price).toFixed(2)} PLN`],
  ];

  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(102, 99, 91);
    doc.text(label, 14, cursorY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 19);
    doc.text(value, 52, cursorY);
    cursorY += 7;
  }

  cursorY += 4;
  doc.line(14, cursorY, pageWidth - 14, cursorY);
  cursorY += 10;

  const qrSize = 58;
  const qrX = (pageWidth - qrSize) / 2;
  doc.addImage(qrDataUrl, 'PNG', qrX, cursorY, qrSize, qrSize);

  cursorY += qrSize + 8;
  doc.setFontSize(8);
  doc.setTextColor(102, 99, 91);
  doc.text('Show this QR code at the entrance.', pageWidth / 2, cursorY, {
    align: 'center',
  });

  doc.save(`ticket-${ticket.id}.pdf`);
}