import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { getSetting } from './db';

export interface ShopProfile {
  name: string;
  address: string;
  phone: string;
  logoUri: string | null;
}

export function getShopProfile(): ShopProfile {
  return {
    name: getSetting('restaurant_name') || '',
    address: getSetting('restaurant_address') || '',
    phone: getSetting('restaurant_phone') || '',
    logoUri: getSetting('restaurant_logo_uri') || null,
  };
}

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] || char));

interface PdfTemplateOptions {
  direction: 'rtl' | 'ltr';
  language: string;
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  logoUri: string | null;
  docTitle: string;
  docSubtitle: string;
  date: string;
  bodyContent: string;
  footerText: string;
  templateVariant?: 'daily-reconciliation';
}

function buildShopHeader(options: PdfTemplateOptions): string {
  const { direction, shopName, shopAddress, shopPhone, logoUri, docTitle, docSubtitle, date } = options;
  const oppositeAlign = direction === 'rtl' ? 'left' : 'right';
  const logoHtml = logoUri
    ? `<img src="${escapeHtml(logoUri)}" alt="Restaurant logo" />`
    : '';

  return `
    <div class="shop-header">
      <div class="shop-info">
        ${logoHtml ? `<div class="logo-container">${logoHtml}</div>` : ''}
        <div class="shop-details">
          ${shopName ? `<h1 class="shop-name">${escapeHtml(shopName)}</h1>` : '<h1 class="shop-name">CashierTn</h1>'}
          ${shopAddress ? `<p class="shop-meta">${escapeHtml(shopAddress)}</p>` : ''}
          ${shopPhone ? `<p class="shop-meta">${escapeHtml(shopPhone)}</p>` : ''}
        </div>
      </div>
      <div class="doc-info" style="text-align: ${oppositeAlign};">
        <p class="doc-title">${escapeHtml(docTitle)}</p>
        ${docSubtitle ? `<p class="doc-subtitle">${escapeHtml(docSubtitle)}</p>` : ''}
        <p class="doc-date">${escapeHtml(date)}</p>
      </div>
    </div>
    <div class="header-divider"></div>
  `;
}

function buildFooter(options: PdfTemplateOptions): string {
  const { footerText, shopName } = options;
  return `
    <div class="footer">
      <div class="footer-line"></div>
      <p>${escapeHtml(footerText)}</p>
      ${shopName ? `<p class="footer-brand">${escapeHtml(shopName)}</p>` : '<p class="footer-brand">CashierTn</p>'}
    </div>
  `;
}

const BASE_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #1e293b;
    padding: 32px;
    line-height: 1.5;
    font-size: 13px;
  }

  /* Shop Header */
  .shop-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;
  }
  .shop-info {
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }
  .logo-container {
    flex-shrink: 0;
  }
  .logo-container img {
    display: block;
    width: auto;
    height: 64px;
    max-width: 128px;
    object-fit: contain;
  }
  .shop-name {
    font-size: 26px;
    font-weight: 800;
    color: #0c4a6e;
    margin: 0 0 4px 0;
    letter-spacing: -0.5px;
  }
  .shop-meta {
    font-size: 12px;
    color: #64748b;
    margin: 2px 0;
  }
  .doc-info {
    text-align: right;
  }
  .doc-title {
    font-size: 18px;
    font-weight: 700;
    color: #0369a1;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 0 0 4px 0;
  }
  .doc-subtitle {
    font-size: 13px;
    color: #64748b;
    margin: 2px 0;
  }
  .doc-date {
    font-size: 14px;
    font-weight: 600;
    color: #334155;
    margin: 6px 0 0 0;
  }
  .header-divider {
    height: 2px;
    background-color: #0c4a6e;
    margin-bottom: 20px;
  }

  /* Summary Cards */
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 28px;
  }
  .summary-card {
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 16px;
  }
  .summary-card.highlight {
    background-color: #eff6ff;
    border-color: #bfdbfe;
  }
  .summary-card.positive {
    background-color: #f0fdf4;
    border-color: #bbf7d0;
  }
  .summary-card.negative {
    background-color: #fef2f2;
    border-color: #fecaca;
  }
  .summary-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #64748b;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .summary-value {
    font-size: 20px;
    font-weight: 800;
    color: #0f172a;
  }
  .summary-value.blue { color: #0284c7; }
  .summary-value.green { color: #16a34a; }
  .summary-value.red { color: #dc2626; }

  /* Section Titles */
  .section-title {
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
    margin: 24px 0 12px 0;
    padding-bottom: 8px;
    border-bottom: 2px solid #e2e8f0;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
  }
  thead th {
    background-color: #f1f5f9;
    border-bottom: 2px solid #cbd5e1;
    padding: 12px 10px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #475569;
    font-weight: 700;
    text-align: left;
  }
  tbody td {
    padding: 11px 10px;
    border-bottom: 1px solid #f1f5f9;
    font-size: 13px;
    color: #334155;
  }
  tbody tr:nth-child(even) {
    background-color: #fafafa;
  }
  tbody tr:hover {
    background-color: #f0f9ff;
  }
  .text-center { text-align: center; }
  .text-end { text-align: end; }
  .text-start { text-align: start; }
  .font-bold { font-weight: 700; }
  .text-green { color: #16a34a; }
  .text-red { color: #dc2626; }
  .text-blue { color: #0284c7; }

  /* Totals Table */
  .totals-container {
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
  }
  .totals-table {
    width: 55%;
    border-collapse: collapse;
  }
  .totals-table td {
    padding: 10px 12px;
    font-size: 14px;
    border-bottom: 1px solid #e2e8f0;
  }
  .totals-table .total-label {
    font-weight: 600;
    color: #475569;
  }
  .totals-table .total-value {
    font-weight: 700;
    text-align: end;
    color: #0f172a;
  }
  .totals-table .total-row {
    background-color: #f8fafc;
    border-top: 2px solid #cbd5e1;
  }
  .totals-table .total-row .total-value {
    font-size: 16px;
    font-weight: 800;
  }

  /* Footer */
  .footer {
    margin-top: 40px;
    text-align: center;
  }
  .footer-line {
    height: 1px;
    background-color: #e2e8f0;
    margin-bottom: 12px;
  }
  .footer p {
    font-size: 11px;
    color: #94a3b8;
    margin: 2px 0;
  }
  .footer-brand {
    font-weight: 600;
    color: #64748b;
  }

  .daily-reconciliation .summary-grid {
    gap: 10px;
    margin-bottom: 22px;
  }
  .daily-reconciliation .summary-card {
    min-width: 0;
    border-radius: 6px;
    border-top: 3px solid #cbd5e1;
    padding: 12px;
  }
  .daily-reconciliation .summary-card.highlight { border-top-color: #0284c7; }
  .daily-reconciliation .summary-card.positive { border-top-color: #16a34a; }
  .daily-reconciliation .summary-card.negative { border-top-color: #dc2626; }
  .daily-reconciliation .summary-label {
    font-size: 9px;
    letter-spacing: 0;
  }
  .daily-reconciliation .summary-value {
    font-size: 16px;
    overflow-wrap: anywhere;
  }
  .daily-reconciliation .section-title {
    margin-top: 20px;
    padding-bottom: 7px;
    border-bottom-width: 1px;
  }
  .daily-reconciliation table {
    border: 1px solid #e2e8f0;
  }
  .daily-reconciliation thead th {
    background-color: #f1f5f9;
    border-bottom-width: 1px;
  }
  .daily-reconciliation tbody td {
    padding-top: 9px;
    padding-bottom: 9px;
  }
  .daily-reconciliation .totals-container {
    margin-top: 0;
  }
  .daily-reconciliation .totals-table {
    width: 100%;
    max-width: 440px;
    border: 1px solid #e2e8f0;
  }
  .daily-reconciliation .totals-table .total-row {
    background-color: #f1f5f9;
  }
  @media print {
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
  }
`;

async function loadLogoDataUri(logoUri: string | null): Promise<string> {
  let sourceUri = logoUri;
  if (!sourceUri) {
    const [asset] = await Asset.loadAsync(require('../../assets/images/logo.jpg'));
    sourceUri = asset.localUri;
  }
  if (!sourceUri) {
    throw new Error('The restaurant logo could not be loaded.');
  }
  if (sourceUri.startsWith('data:image/')) {
    return sourceUri;
  }

  const base64 = await FileSystem.readAsStringAsync(sourceUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!base64) {
    throw new Error('The restaurant logo file is empty.');
  }

  const extension = sourceUri.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase();
  const mimeType = extension === 'png'
    ? 'image/png'
    : extension === 'webp'
      ? 'image/webp'
      : 'image/jpeg';
  return `data:${mimeType};base64,${base64}`;
}

export async function generateAndSharePdf(options: PdfTemplateOptions & { fileName: string }): Promise<void> {
  const { direction, language, fileName, ...templateOptions } = options;
  const logoUri = await loadLogoDataUri(templateOptions.logoUri);
  const header = buildShopHeader({ ...templateOptions, logoUri, direction, language });
  const footer = buildFooter({ ...templateOptions, direction, language });
  const bodyClass = templateOptions.templateVariant || '';

  const html = `
    <!DOCTYPE html>
    <html dir="${direction}" lang="${language}">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(templateOptions.docTitle)}</title>
      <style>${BASE_STYLES}</style>
    </head>
    <body class="${bodyClass}">
      ${header}
      ${options.bodyContent}
      ${footer}
    </body>
    </html>
  `;

  const { base64 } = await Print.printToFileAsync({ html, base64: true });
  if (!FileSystem.documentDirectory) {
    throw new Error('Document storage is not available.');
  }
  if (!base64) {
    throw new Error('PDF generation did not return file data.');
  }

  const safeFileName = fileName
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .trim()
    .replace(/\s+/g, '-');
  const shareUri = `${FileSystem.documentDirectory}${safeFileName || 'report'}-${Date.now()}.pdf`;
  await FileSystem.writeAsStringAsync(shareUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await Sharing.shareAsync(shareUri, { UTI: '.pdf', mimeType: 'application/pdf' });
}

export function buildSummaryCards(cards: Array<{ label: string; value: string; color?: string; highlight?: boolean }>): string {
  const cardsHtml = cards.map((card) => {
    let cssClass = 'summary-card';
    if (card.highlight) cssClass += ' highlight';
    if (card.color === 'green') cssClass += ' positive';
    if (card.color === 'red') cssClass += ' negative';

    const valueClass = card.color ? `summary-value ${card.color}` : 'summary-value';
    return `
      <div class="${cssClass}">
        <div class="summary-label">${escapeHtml(card.label)}</div>
        <div class="${valueClass}">${escapeHtml(card.value)}</div>
      </div>
    `;
  }).join('');

  return `<div class="summary-grid">${cardsHtml}</div>`;
}

export function buildDataTable(headers: string[], rows: string[][], options?: { align?: Array<'start' | 'center' | 'end'> }): string {
  const align = options?.align || headers.map(() => 'start' as const);

  const headersHtml = headers.map((header, i) => {
    const alignClass = align[i] === 'center' ? 'text-center' : align[i] === 'end' ? 'text-end' : 'text-start';
    return `<th class="${alignClass}">${escapeHtml(header)}</th>`;
  }).join('');

  const rowsHtml = rows.map((row) => {
    const cellsHtml = row.map((cell, i) => {
      const alignClass = align[i] === 'center' ? 'text-center' : align[i] === 'end' ? 'text-end' : 'text-start';
      return `<td class="${alignClass}">${cell}</td>`;
    }).join('');
    return `<tr>${cellsHtml}</tr>`;
  }).join('');

  return `
    <table>
      <thead><tr>${headersHtml}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

export function buildTotalsTable(rows: Array<{ label: string; value: string; isTotal?: boolean; color?: string }>): string {
  const rowsHtml = rows.map((row) => {
    const rowClass = row.isTotal ? 'total-row' : '';
    const valueStyle = row.color ? ` style="color: ${row.color}"` : '';
    return `
      <tr class="${rowClass}">
        <td class="total-label">${escapeHtml(row.label)}</td>
        <td class="total-value"${valueStyle}>${escapeHtml(row.value)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="totals-container">
      <table class="totals-table">${rowsHtml}</table>
    </div>
  `;
}

export function buildSectionTitle(title: string): string {
  return `<div class="section-title">${escapeHtml(title)}</div>`;
}
