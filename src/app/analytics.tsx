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
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { getCurrency, useLanguage } from '../constants/translations';
import { getZReport, ZReport } from '../services/db';
import { NumericFontVariant, Typography } from '../constants/theme';
import {
  generateAndSharePdf,
  getShopProfile,
  buildSummaryCards,
  buildDataTable,
  buildSectionTitle,
  escapeHtml,
} from '../services/pdfTemplate';

const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

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
    const shop = getShopProfile();
    const rows: (string | number)[][] = [
      [shop.name || 'Hsabi', ''],
      [shop.address, ''],
      [shop.phone, ''],
      [],
      [t('z_report'), date],
      [],
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
      const fileName = shop.name ? `${shop.name}-z-report-${date}` : `z-report-${date}`;
      const uri = `${FileSystem.documentDirectory}${fileName}.csv`;
      await FileSystem.writeAsStringAsync(uri, `\uFEFF${csv}`);
      await Sharing.shareAsync(uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
    } catch (error) {
      console.error('Could not export CSV:', error);
      Alert.alert(t('db_error'), String(error));
    }
  };

  const exportPdf = async () => {
    if (!report) return;
    const shop = getShopProfile();
    const direction = language === 'ar' ? 'rtl' : 'ltr';

    const summaryCards = buildSummaryCards([
      { label: t('gross_revenue'), value: `${report.grossRevenue.toFixed(3)} ${currency}`, color: 'blue', highlight: true },
      { label: t('net_revenue'), value: `${report.netRevenue.toFixed(3)} ${currency}`, color: 'green' },
      { label: t('tax_breakdown'), value: `${report.taxTotal.toFixed(3)} ${currency}` },
      { label: t('expected_cash'), value: `${report.expectedCash.toFixed(3)} ${currency}` },
      { label: t('counted_cash'), value: report.actualCash === null ? '—' : `${report.actualCash.toFixed(3)} ${currency}` },
      { label: t('variance'), value: `${report.cashDrawerDiscrepancy.toFixed(3)} ${currency}`, color: report.cashDrawerDiscrepancy >= 0 ? 'green' : 'red' },
    ]);

    const paymentsTable = buildDataTable(
      [t('sales_by_payment'), t('amount')],
      report.salesByPaymentType.map((item) => [
        t(item.payment_method === 'CASH' ? 'cash' : item.payment_method === 'CARD' ? 'card' : item.payment_method === 'MOBILE_PAYMENT' ? 'mobile_payment' : 'delivery_app'),
        `${item.amount.toFixed(3)} ${currency}`,
      ]),
      { align: ['start', 'end'] }
    );

    const productsTable = buildDataTable(
      [t('top_items'), t('sales_volume'), t('gross_revenue'), t('profit_margin_percent')],
      report.topItems.map((item) => [
        escapeHtml(item.product_name),
        String(item.quantity_sold),
        `${item.revenue.toFixed(3)} ${currency}`,
        `${item.margin_percent.toFixed(2)}%`,
      ]),
      { align: ['start', 'center', 'end', 'end'] }
    );

    const taxTable = buildDataTable(
      [t('tax_rate'), t('net_revenue'), t('tax_amount')],
      report.taxBreakdown.map((item) => [
        `${(item.tax_rate * 100).toFixed(2)}%`,
        `${item.taxable_amount.toFixed(3)} ${currency}`,
        `${item.tax_amount.toFixed(3)} ${currency}`,
      ]),
      { align: ['center', 'end', 'end'] }
    );

    const hoursTable = buildDataTable(
      [t('peak_hours'), t('gross_revenue'), t('orders_count')],
      report.peakHours.map((item) => [
        `${String(item.hour).padStart(2, '0')}:00`,
        `${item.sales_total.toFixed(3)} ${currency}`,
        String(item.order_count),
      ]),
      { align: ['center', 'end', 'end'] }
    );

    const bodyContent = `
      ${summaryCards}
      ${buildSectionTitle(t('sales_by_payment'))}
      ${paymentsTable}
      ${buildSectionTitle(t('top_items'))}
      ${productsTable}
      ${buildSectionTitle(t('tax_breakdown'))}
      ${taxTable}
      ${buildSectionTitle(t('peak_hours'))}
      ${hoursTable}
    `;

    try {
      await generateAndSharePdf({
        direction,
        language,
        shopName: shop.name,
        shopAddress: shop.address,
        shopPhone: shop.phone,
        logoUri: shop.logoUri,
        docTitle: t('z_report'),
        docSubtitle: '',
        date,
        bodyContent,
        footerText: `${new Date().toLocaleDateString(language === 'ar' ? 'ar-TN' : language === 'fr' ? 'fr-FR' : 'en-US')} · ${t('z_report')}`,
        fileName: shop.name ? `${shop.name}-z-report` : 'z-report',
      });
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
  title: { color: '#0f172a', fontSize: Typography.screenTitle, fontWeight: Typography.extraBold },
  dateControl: { flexDirection: 'row', gap: 8 },
  dateInput: { flex: 1, borderRadius: 9, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff', color: '#0f172a', paddingHorizontal: 12 },
  inputDark: { backgroundColor: '#1e293b', color: '#f8fafc', borderColor: '#475569' },
  refreshButton: { backgroundColor: '#0284c7', borderRadius: 9, width: 46, alignItems: 'center', justifyContent: 'center' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: { flexGrow: 1, flexBasis: '46%', backgroundColor: '#fff', padding: 14, borderRadius: 12, minHeight: 84, justifyContent: 'space-between' },
  summaryValue: { color: '#0f172a', fontWeight: Typography.extraBold, fontSize: Typography.metric, marginTop: 9, fontVariant: NumericFontVariant },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 12, gap: 8 },
  cardDark: { backgroundColor: '#1e293b' },
  sectionTitle: { color: '#0f172a', fontWeight: Typography.bold, fontSize: Typography.bodyLarge, marginBottom: 2 },
  textDark: { color: '#f8fafc' },
  detail: { color: '#334155', fontSize: Typography.body },
  strong: { fontWeight: Typography.bold, fontVariant: NumericFontVariant },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  itemInfo: { flex: 1 },
  itemName: { color: '#0f172a', fontSize: Typography.body, fontWeight: Typography.bold },
  muted: { color: '#475569', fontSize: Typography.caption },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  hourLabel: { width: 42, color: '#334155', fontSize: Typography.caption, fontVariant: NumericFontVariant },
  barTrack: { flex: 1, height: 12, backgroundColor: '#e2e8f0', borderRadius: 7, overflow: 'hidden' },
  bar: { height: '100%', backgroundColor: '#0284c7', borderRadius: 7 },
  chartValue: { width: 92, textAlign: 'right', color: '#334155', fontSize: Typography.caption, fontVariant: NumericFontVariant },
  exportRow: { flexDirection: 'row', gap: 9 },
  exportButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, padding: 12, borderRadius: 9, backgroundColor: '#0369a1' },
  exportText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
