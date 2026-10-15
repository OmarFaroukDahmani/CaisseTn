import React, { useCallback, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { getCurrency, useLanguage } from '../constants/translations';
import { getZReport, ZReport } from '../services/db';

const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char] || char));

export default function AnalyticsScreen() {
  const isDark = useColorScheme() === 'dark';
  const { t, language } = useLanguage();
  const currency = getCurrency(language);
  const [date, setDate] = useState(localDate());
  const [report, setReport] = useState<ZReport | null>(null);

  const refresh = useCallback(() => {
    try {
      setReport(getZReport(date));
    } catch (error) {
      console.error('Could not load Z-report:', error);
      setReport(null);
      Alert.alert(t('validation_error'), String(error));
    }
  }, [date, t]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const money = (amount: number) => `${amount.toFixed(3)} ${currency}`;
  const maxHourSales = Math.max(1, ...(report?.peakHours.map((hour) => hour.sales_total) || []));

  const exportCsv = async () => {
    if (!report) return;
    const rows: (string | number)[][] = [
      [t('z_report'), date],
      [t('gross_revenue'), report.grossRevenue],
      [t('net_revenue'), report.netRevenue],
      [t('tax_breakdown'), report.taxTotal],
      [t('expected_cash'), report.expectedCash],
      [t('counted_cash'), report.actualCash ?? ''],
      [t('variance'), report.cashDrawerDiscrepancy],
      [],
      [t('tax_rate'), t('net_revenue'), t('tax_amount')],
      ...report.taxBreakdown.map((item) => [
        (item.tax_rate * 100).toFixed(2) + '%',
        item.taxable_amount,
        item.tax_amount,
      ]),
      [],
      [t('sales_by_payment'), t('amount')],
      ...report.salesByPaymentType.map((item) => [item.payment_method, item.amount]),
      [],
      [t('top_items'), t('sales_volume'), t('gross_revenue'), t('profit_margin_percent')],
      ...report.topItems.map((item) => [item.product_name, item.quantity_sold, item.revenue, item.margin_percent.toFixed(2)]),
      [],
      [t('peak_hours'), t('gross_revenue'), t('orders_count')],
      ...report.peakHours.map((item) => [String(item.hour).padStart(2, '0') + ':00', item.sales_total, item.order_count]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    try {
      if (!FileSystem.documentDirectory) throw new Error('Document storage is not available.');
      const uri = `${FileSystem.documentDirectory}z-report-${date}.csv`;
      await FileSystem.writeAsStringAsync(uri, `\uFEFF${csv}`);
      await Sharing.shareAsync(uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
    } catch (error) {
      console.error('Could not export CSV:', error);
      Alert.alert(t('db_error'), String(error));
    }
  };

  const exportPdf = async () => {
    if (!report) return;
    const payments = report.salesByPaymentType.map((item) =>
      `<tr><td>${escapeHtml(item.payment_method)}</td><td>${item.amount.toFixed(3)}</td></tr>`).join('');
    const products = report.topItems.map((item) =>
      `<tr><td>${escapeHtml(item.product_name)}</td><td>${item.quantity_sold}</td><td>${item.revenue.toFixed(3)}</td><td>${item.margin_percent.toFixed(2)}%</td></tr>`).join('');
    const hours = report.peakHours.map((item) =>
      `<tr><td>${String(item.hour).padStart(2, '0')}:00</td><td>${item.sales_total.toFixed(3)}</td><td>${item.order_count}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;color:#0f172a;padding:24px}h1{color:#0369a1}
      .grid{display:flex;flex-wrap:wrap;gap:12px}.card{background:#f1f5f9;padding:14px;border-radius:8px;min-width:150px}
      table{width:100%;border-collapse:collapse;margin:18px 0}td,th{border-bottom:1px solid #cbd5e1;padding:8px;text-align:left}
      </style></head><body><h1>${escapeHtml(t('z_report'))} · ${date}</h1>
      <div class="grid"><div class="card">${escapeHtml(t('gross_revenue'))}<h2>${report.grossRevenue.toFixed(3)} ${currency}</h2></div>
      <div class="card">${escapeHtml(t('net_revenue'))}<h2>${report.netRevenue.toFixed(3)} ${currency}</h2></div>
      <div class="card">${escapeHtml(t('tax_breakdown'))}<h2>${report.taxTotal.toFixed(3)} ${currency}</h2></div>
      <div class="card">${escapeHtml(t('expected_cash'))}<h2>${report.expectedCash.toFixed(3)} ${currency}</h2></div>
      <div class="card">${escapeHtml(t('counted_cash'))}<h2>${report.actualCash === null ? '—' : report.actualCash.toFixed(3) + ' ' + currency}</h2></div>
      <div class="card">${escapeHtml(t('variance'))}<h2>${report.cashDrawerDiscrepancy.toFixed(3)} ${currency}</h2></div></div>
      <h2>${escapeHtml(t('sales_by_payment'))}</h2><table>${payments}</table>
      <h2>${escapeHtml(t('top_items'))}</h2><table><tr><th>Item</th><th>Qty</th><th>Revenue</th><th>Margin</th></tr>${products}</table>
      <h2>${escapeHtml(t('tax_breakdown'))}</h2><table>${report.taxBreakdown.map((item) => `<tr><td>${(item.tax_rate * 100).toFixed(2)}%</td><td>${item.taxable_amount.toFixed(3)}</td><td>${item.tax_amount.toFixed(3)}</td></tr>`).join('')}</table>
      <h2>${escapeHtml(t('peak_hours'))}</h2><table>${hours}</table>
      </body></html>`;
    try {
      const file = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(file.uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
      console.error('Could not export PDF:', error);
      Alert.alert(t('db_error'), String(error));
    }
  };

  return (
    <ScrollView style={[styles.page, isDark && styles.pageDark]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.title, isDark && styles.textDark]}>{t('z_report')}</Text>
        <View style={styles.dateControl}>
          <TextInput
            value={date}
            onChangeText={(value) => { setDate(value); setReport(null); }}
            style={[styles.dateInput, isDark && styles.inputDark]}
            placeholder="YYYY-MM-DD"
          />
          <TouchableOpacity style={styles.refreshButton} onPress={refresh}>
            <Ionicons name="refresh" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {report && (
        <>
          <View style={styles.summaryGrid}>
            <SummaryCard title={t('gross_revenue')} value={money(report.grossRevenue)} isDark={isDark} />
            <SummaryCard title={t('net_revenue')} value={money(report.netRevenue)} isDark={isDark} />
            <SummaryCard title={t('tax_breakdown')} value={money(report.taxTotal)} isDark={isDark} />
            <SummaryCard title={t('variance')} value={money(report.cashDrawerDiscrepancy)} isDark={isDark} />
          </View>
          <View style={[styles.card, isDark && styles.cardDark]}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>{t('expected_cash')} / {t('counted_cash')}</Text>
            <Text style={styles.detail}>{t('expected_cash')}: {money(report.expectedCash)}</Text>
            <Text style={styles.detail}>{t('counted_cash')}: {report.actualCash === null ? '—' : money(report.actualCash)}</Text>
          </View>
          <View style={[styles.card, isDark && styles.cardDark]}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>{t('sales_by_payment')}</Text>
            {report.salesByPaymentType.map((item) => (
              <View key={item.payment_method} style={styles.row} >
                <Text style={styles.detail}>{t(item.payment_method === 'CASH' ? 'cash' : item.payment_method === 'CARD' ? 'card' : item.payment_method === 'MOBILE_PAYMENT' ? 'mobile_payment' : 'delivery_app')}</Text>
                <Text style={[styles.detail, styles.strong]}>{money(item.amount)}</Text>
              </View>
            ))}
            {report.salesByPaymentType.length === 0 && <Text style={styles.muted}>—</Text>}
          </View>
          <View style={[styles.card, isDark && styles.cardDark]}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>{t('tax_breakdown')}</Text>
            {report.taxBreakdown.map((item) => (
              <View key={item.tax_rate} style={styles.row}>
                <Text style={styles.detail}>{(item.tax_rate * 100).toFixed(2)}%</Text>
                <Text style={styles.detail}>{money(item.taxable_amount)} + {money(item.tax_amount)}</Text>
              </View>
            ))}
            {report.taxBreakdown.length === 0 && <Text style={styles.muted}>—</Text>}
          </View>
          <View style={[styles.card, isDark && styles.cardDark]}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>{t('top_items')}</Text>
            {report.topItems.map((item, index) => (
              <View key={`${item.product_id}-${index}`} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, isDark && styles.textDark]}>{index + 1}. {item.product_name}</Text>
                  <Text style={styles.muted}>{t('sales_volume')}: {item.quantity_sold} · {t('profit_margin_percent')}: {item.margin_percent.toFixed(1)}%</Text>
                </View>
                <Text style={[styles.detail, styles.strong]}>{money(item.profit)}</Text>
              </View>
            ))}
            {report.topItems.length === 0 && <Text style={styles.muted}>—</Text>}
          </View>
          <View style={[styles.card, isDark && styles.cardDark]}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>{t('peak_hours')}</Text>
            {report.peakHours.map((item) => (
              <View key={item.hour} style={styles.chartRow}>
                <Text style={styles.hourLabel}>{String(item.hour).padStart(2, '0')}:00</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.bar, { width: `${Math.max(2, item.sales_total / maxHourSales * 100)}%` }]} />
                </View>
                <Text style={styles.chartValue}>{item.order_count} · {item.sales_total.toFixed(2)}</Text>
              </View>
            ))}
            {report.peakHours.length === 0 && <Text style={styles.muted}>—</Text>}
          </View>
          <View style={styles.exportRow}>
            <TouchableOpacity style={styles.exportButton} onPress={exportCsv}>
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={styles.exportText}>{t('export_csv')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.exportButton} onPress={exportPdf}>
              <Ionicons name="document-text-outline" size={18} color="#fff" />
              <Text style={styles.exportText}>{t('export_pdf')}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function SummaryCard({ title, value, isDark }: { title: string; value: string; isDark: boolean }) {
  return (
    <View style={[styles.summaryCard, isDark && styles.cardDark]}>
      <Text style={styles.muted}>{title}</Text>
      <Text style={[styles.summaryValue, isDark && styles.textDark]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5f9' },
  pageDark: { backgroundColor: '#0f172a' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  header: { gap: 10 },
  title: { color: '#0f172a', fontSize: 22, fontWeight: '800' },
  dateControl: { flexDirection: 'row', gap: 8 },
  dateInput: { flex: 1, borderRadius: 9, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff', color: '#0f172a', paddingHorizontal: 12 },
  inputDark: { backgroundColor: '#1e293b', color: '#f8fafc', borderColor: '#475569' },
  refreshButton: { backgroundColor: '#0284c7', borderRadius: 9, width: 46, alignItems: 'center', justifyContent: 'center' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: { flexGrow: 1, flexBasis: '46%', backgroundColor: '#fff', padding: 14, borderRadius: 12, minHeight: 84, justifyContent: 'space-between' },
  summaryValue: { color: '#0f172a', fontWeight: '800', fontSize: 16, marginTop: 9 },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 12, gap: 8 },
  cardDark: { backgroundColor: '#1e293b' },
  sectionTitle: { color: '#0f172a', fontWeight: '700', fontSize: 16, marginBottom: 2 },
  textDark: { color: '#f8fafc' },
  detail: { color: '#334155', fontSize: 14 },
  strong: { fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  itemInfo: { flex: 1 },
  itemName: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  muted: { color: '#64748b', fontSize: 12 },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  hourLabel: { width: 42, color: '#475569', fontSize: 12 },
  barTrack: { flex: 1, height: 12, backgroundColor: '#e2e8f0', borderRadius: 7, overflow: 'hidden' },
  bar: { height: '100%', backgroundColor: '#0284c7', borderRadius: 7 },
  chartValue: { width: 92, textAlign: 'right', color: '#475569', fontSize: 11 },
  exportRow: { flexDirection: 'row', gap: 9 },
  exportButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, padding: 12, borderRadius: 9, backgroundColor: '#0369a1' },
  exportText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
