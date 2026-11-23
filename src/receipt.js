import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { txURL } from './chain.js';
import { dateText, price } from './model.js';

function label(pdf, value, x, y, width, size, bold = false, align = 'left') {
  if (/^[\x20-\x7e]+$/.test(value)) {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setFontSize(Math.min(size, size * width / pdf.getTextWidth(value)));
    pdf.text(value, x, y, { align });
    return;
  }

  // Standard PDF fonts cover Latin text. Draw other scripts using the browser's fonts.
  const canvas = document.createElement('canvas');
  const height = Math.ceil(size * 1.6);
  canvas.width = width * 3;
  canvas.height = height * 3;
  const context = canvas.getContext('2d');
  context.scale(3, 3);
  context.font = `${bold ? 700 : 400} ${size}px system-ui, sans-serif`;
  context.textAlign = 'left';
  context.fillStyle = '#142536';
  context.fillText(value, 0, Math.ceil(size * 1.15), width);
  pdf.addImage(canvas, 'PNG', x, y - Math.ceil(size * 1.15), width, height);
}

export async function saveReceipt(invoice, link) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const qr = await QRCode.toDataURL(link, { errorCorrectionLevel: 'M', scale: 5, margin: 4 });
  const left = 44;
  const right = pdf.internal.pageSize.getWidth() - left;
  const width = right - left;
  const field = (name, value, y) => {
    pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor('#4c5b6c').text(name, left, y);
    pdf.setFont('helvetica', 'normal').setFontSize(10).setTextColor('#142536').text(value, left, y + 16);
  };

  pdf.setProperties({ title: `Folio receipt #${invoice.id}`, creator: 'Folio' });
  pdf.setFillColor('#f0edfb').roundedRect(left, 40, width, 72, 14, 14, 'F');
  pdf.setTextColor('#302452').setFont('helvetica', 'bold').setFontSize(24).text('folio.', left + 18, 71);
  pdf.setFont('helvetica', 'normal').setFontSize(10).text('Aevum Testnet', left + 18, 92);
  pdf.setFont('helvetica', 'bold').text('PAYMENT RECEIPT', right - 18, 69, { align: 'right' });
  label(pdf, `#${invoice.id}`, right - 18, 90, 304, 10, false, 'right');

  pdf.setTextColor('#142536');
  label(pdf, invoice.title || `Invoice #${invoice.id}`, left, 147, Math.floor(width), 23, true);
  if (invoice.merchant) label(pdf, `From ${invoice.merchant}`, left, 171, Math.floor(width), 12);

  pdf.setFillColor('#e5f5ed').roundedRect(left, 193, width, 79, 12, 12, 'F');
  pdf.setTextColor('#245743').setFont('helvetica', 'bold').setFontSize(10).text('AMOUNT PAID', left + 17, 216);
  label(pdf, `${price(invoice.amount)} tUSD8`, left + 17, 248, Math.floor(width) - 34, 24, true);

  field('PAID ON (UTC)', dateText(invoice.paidAt), 303);
  field('RECIPIENT', invoice.issuer, 344);
  field('PAYER', invoice.payer, 385);
  if (invoice.hash) {
    field('TRANSACTION HASH', invoice.hash, 426);
    pdf.link(left, 429, width, 18, { url: txURL(invoice.hash) });
  }

  if (invoice.items?.length) {
    pdf.setTextColor('#4c5b6c').setFont('helvetica', 'bold').setFontSize(9).text('ITEMS', left, 475);
    pdf.text('tUSD8', right, 475, { align: 'right' });
    invoice.items.forEach(([name, amount], index) => {
      const y = 494 + index * 21;
      pdf.setDrawColor('#dde4ec').line(left, y + 7, right, y + 7);
      pdf.setTextColor('#142536');
      label(pdf, name, left, y, 350, 11);
      pdf.setFont('helvetica', 'bold').setFontSize(11).text(price(amount), right, y, { align: 'right' });
    });
  }

  pdf.setDrawColor('#dde4ec').line(left, 608, right, 608);
  pdf.addImage(qr, 'PNG', left, 624, 154, 154);
  pdf.link(left, 624, 154, 154, { url: link });
  const proofX = left + 176;
  pdf.setTextColor('#142536').setFont('helvetica', 'bold').setFontSize(15).text('Verify this receipt', proofX, 678);
  pdf.setFont('helvetica', 'normal').setFontSize(11).text('Scan the QR code to open the on-chain record.', proofX, 699);
  pdf.setTextColor('#5843a4').textWithLink('Open receipt in Folio', proofX, 726, { url: link });
  pdf.save(`folio-receipt-${invoice.id}.pdf`);
}
