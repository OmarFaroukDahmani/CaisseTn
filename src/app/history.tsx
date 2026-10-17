import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  useColorScheme,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import {
  getRegisterHistory,
  getRegisterDetails,
  DailyRegister,
  RegisterItem,
} from '../services/db';
import { useLanguage, getCurrency } from '../constants/translations';
import { NumericFontVariant, Typography } from '../constants/theme';
import {
  generateAndSharePdf,
  getShopProfile,
  buildSummaryCards,
  buildDataTable,
  buildSectionTitle,
  buildTotalsTable,
  escapeHtml,
} from '../services/pdfTemplate';

export default function HistoryScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t, language, isRTL } = useLanguage();
  const CURRENCY = getCurrency(language);

  const [history, setHistory] = useState<DailyRegister[]>([]);
  const [selectedReg, setSelectedReg] = useState<DailyRegister | null>(null);
  const [selectedItems, setSelectedItems] = useState<RegisterItem[]>([]);
  const [detailVisible, setDetailVisible] = useState(false);

  // Reload history when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const loadHistory = () => {
    try {
      const records = getRegisterHistory();
      setHistory(records);
    } catch (error) {
      console.error('Error loading history:', error);
      Alert.alert(t('db_error'), t('could_not_load_products'));
    }
  };

  const handleOpenDetails = (register: DailyRegister) => {
    try {
      const details = getRegisterDetails(register.id);
      if (details) {
        setSelectedReg(details.register);
        setSelectedItems(details.items);
        setDetailVisible(true);
      }
    } catch (error) {
      console.error('Error loading register details:', error);
      Alert.alert(t('db_error'), t('could_not_load_register'));
    }
  };

  // Calculations for detail view
  const getTotals = () => {
    let expectedRevenue = 0;
    let expectedCost = 0;

    selectedItems.forEach((item) => {
      const sold = Math.max(0, item.opening_count - item.closing_count);
      expectedRevenue += sold * (item.selling_price || 0);
      expectedCost += sold * (item.cost_price || 0);
    });

    const grossProfit = Math.max(0, expectedRevenue - expectedCost);
    const expenses = selectedReg?.expenses || 0;
    const netProfit = grossProfit - expenses;
    const actualCash = selectedReg?.actual_cash || 0;
    const discrepancy = actualCash - (expectedRevenue - expenses);

    return {
      expectedRevenue,
      expectedCost,
      grossProfit,
      netProfit,
      discrepancy,
    };
  };

  const totals = getTotals();

  // Generate & Share HTML PDF
  const handleGeneratePDF = async () => {
    if (!selectedReg) return;

    const shop = getShopProfile();
    const locale = language === 'ar' ? 'ar-TN' : language === 'fr' ? 'fr-FR' : 'en-US';
    const formattedDate = new Date(selectedReg.date).toLocaleDateString(locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const productRows = selectedItems.map((item) => {
      const sold = Math.max(0, item.opening_count - item.closing_count);
      const rev = sold * (item.selling_price || 0);
      const cost = sold * (item.cost_price || 0);
      const profit = Math.max(0, rev - cost);
      return [
        escapeHtml(item.product_name || ''),
        String(item.opening_count),
        String(item.closing_count),
        String(sold),
        `${item.selling_price?.toFixed(3)} ${CURRENCY}`,
        `<span class="font-bold text-blue">${rev.toFixed(3)} ${CURRENCY}</span>`,
        `<span class="text-green">${profit.toFixed(3)} ${CURRENCY}</span>`,
      ];
    });

    const productTable = buildDataTable(
      [t('product_name'), t('opening_stock'), t('closing_stock'), t('sold'), t('retail_selling'), t('rev'), t('profit_margin')],
      productRows,
      { align: ['start', 'center', 'center', 'center', 'end', 'end', 'end'] }
    );

    const summaryCards = buildSummaryCards([
      { label: t('expected_revenue'), value: `${totals.expectedRevenue.toFixed(3)} ${CURRENCY}`, color: 'blue', highlight: true },
      { label: t('actual_cash_drawer'), value: `${selectedReg.actual_cash.toFixed(3)} ${CURRENCY}` },
      { label: t('drawer_discrepancy'), value: `${totals.discrepancy > 0 ? '+' : ''}${totals.discrepancy.toFixed(3)} ${CURRENCY}`, color: totals.discrepancy === 0 ? 'green' : totals.discrepancy > 0 ? 'blue' : 'red' },
    ]);

    const totalsTable = buildTotalsTable([
      { label: t('expected_revenue'), value: `${totals.expectedRevenue.toFixed(3)} ${CURRENCY}` },
      { label: t('net_profit'), value: `${totals.netProfit.toFixed(3)} ${CURRENCY}`, color: totals.netProfit >= 0 ? '#16a34a' : '#dc2626' },
      { label: t('actual_cash_drawer'), value: `${selectedReg.actual_cash.toFixed(3)} ${CURRENCY}` },
      { label: t('drawer_discrepancy'), value: `${totals.discrepancy.toFixed(3)} ${CURRENCY}`, isTotal: true, color: totals.discrepancy >= 0 ? '#16a34a' : '#dc2626' },
    ]);

    const bodyContent = `
      ${summaryCards}
      ${buildSectionTitle(t('products'))}
      ${productTable}
      ${buildSectionTitle(t('day_total'))}
      ${totalsTable}
    `;

    try {
      await generateAndSharePdf({
        direction: isRTL ? 'rtl' : 'ltr',
        language,
        templateVariant: 'daily-reconciliation',
        shopName: shop.name,
        shopAddress: shop.address,
        shopPhone: shop.phone,
        logoUri: shop.logoUri,
        docTitle: t('daily_reconciliation'),
        docSubtitle: '',
        date: formattedDate,
        bodyContent,
        footerText: `${new Date().toLocaleString(locale)} · ${t('daily_reconciliation')}`,
        fileName: shop.name ? `${shop.name}-register` : 'register',
      });
    } catch (error) {
      console.error('Error generating or sharing PDF:', error);
      Alert.alert(t('db_error'), t('could_not_save'));
    }
  };

  const renderHistoryItem = ({ item }: { item: DailyRegister }) => {
    const isClosed = item.is_closed === 1;
    const dateObj = new Date(item.date);
    const locale = language === 'ar' ? 'ar-TN' : language === 'fr' ? 'fr-FR' : 'en-US';
    const dayName = dateObj.toLocaleDateString(locale, { weekday: 'short' });
    const formattedDate = dateObj.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });

    return (
      <TouchableOpacity
        style={[styles.historyCard, isDark ? styles.cardDark : styles.cardLight]}
        onPress={() => handleOpenDetails(item)}
      >
        <View style={styles.historyLeft}>
          <View style={[styles.dayBadge, isDark ? styles.dayBadgeDark : styles.dayBadgeLight]}>
            <Text style={[styles.dayName, isDark ? styles.textDark : styles.textLight]}>{dayName}</Text>
          </View>
          <View style={styles.dateCol}>
            <Text style={[styles.dateText, isDark ? styles.textDark : styles.textLight]} numberOfLines={1}>{formattedDate}</Text>
            <View style={styles.statusRow}>
              <Ionicons
                name={isClosed ? 'lock-closed' : 'lock-open'}
                size={12}
                color={isClosed ? '#ef4444' : '#22c55e'}
              />
              <Text style={[styles.statusText, { color: isClosed ? '#ef4444' : '#22c55e' }]}>
                {isClosed ? t('closed') : t('open')}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.historyRight}>
          <View style={styles.amountCol}>
            <Text style={styles.amountLabel}>{t('actual_cash_drawer')}</Text>
            <Text style={[styles.amountValue, isDark ? styles.textDark : styles.textLight]} numberOfLines={1}>
              {item.actual_cash.toFixed(3)} {CURRENCY}
            </Text>
          </View>
          <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color="#888" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, isDark ? styles.bgDark : styles.bgLight]}>
      {history.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="time-outline" size={64} color="#888" style={{ marginBottom: 16 }} />
          <Text style={[styles.emptyText, isDark ? styles.textDarkSub : styles.textLightSub]}>
            {t('no_reconciliations')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderHistoryItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Register Details Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={detailVisible}
        onRequestClose={() => setDetailVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isDark ? styles.modalContentDark : styles.modalContentLight]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, isDark ? styles.textDark : styles.textLight]}>
                  {t('daily_reconciliation')}
                </Text>
                <Text style={[styles.modalSubtitle, isDark ? styles.textDarkSub : styles.textLightSub]}>
                  {selectedReg && new Date(selectedReg.date).toLocaleDateString(
                    language === 'ar' ? 'ar-TN' : language === 'fr' ? 'fr-FR' : 'en-US',
                    {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    }
                  )}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDetailVisible(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
              </TouchableOpacity>
            </View>

            {selectedReg && (
              <ScrollView style={styles.modalBody}>
                {/* Financial Summary */}
                <View style={[styles.summaryCard, isDark ? styles.subCardDark : styles.subCardLight]}>
                  <Text style={styles.cardHeaderTitle}>{t('financials_cash')}</Text>
                  
                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>{t('expected_revenue')}</Text>
                    <Text style={[styles.metricValue, isDark ? styles.textDark : styles.textLight]} numberOfLines={1}>
                      {totals.expectedRevenue.toFixed(3)} {CURRENCY}
                    </Text>
                  </View>

                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>{t('actual_cash_drawer')}</Text>
                    <Text style={[styles.metricValue, isDark ? styles.textDark : styles.textLight]} numberOfLines={1}>
                      {selectedReg.actual_cash.toFixed(3)} {CURRENCY}
                    </Text>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.metricRow}>
                    <Text style={styles.boldLabel}>{t('drawer_discrepancy')}</Text>
                    <Text
                      style={[
                        styles.boldValue,
                        {
                          color:
                            totals.discrepancy === 0
                              ? '#22c55e'
                              : totals.discrepancy > 0
                              ? '#3b82f6'
                              : '#ef4444',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {totals.discrepancy > 0 ? '+' : ''}
                      {totals.discrepancy.toFixed(3)} {CURRENCY}
                    </Text>
                  </View>

                  <View style={styles.metricRow}>
                    <Text style={styles.boldLabel}>{t('net_profit')}</Text>
                    <Text 
                      style={[styles.boldValue, { color: totals.netProfit >= 0 ? '#22c55e' : '#ef4444' }]}
                      numberOfLines={1}
                    >
                      {totals.netProfit.toFixed(3)} {CURRENCY}
                    </Text>
                  </View>
                </View>

                {/* Product Detail List */}
                <Text style={[styles.productHeaderTitle, isDark ? styles.textDark : styles.textLight]}>
                  {t('products')}
                </Text>
                
                {selectedItems.map((item) => {
                  const sold = Math.max(0, item.opening_count - item.closing_count);
                  const rev = sold * (item.selling_price || 0);

                  return (
                    <View key={item.id} style={[styles.itemCard, isDark ? styles.subCardDark : styles.subCardLight]}>
                      <View style={styles.itemCardHeader}>
                        <Text numberOfLines={1} style={[styles.itemName, isDark ? styles.textDark : styles.textLight]}>
                          {item.product_name}
                        </Text>
                        <Text style={[styles.itemRevenue, { flexShrink: 0, marginLeft: 8 }]} numberOfLines={1}>
                          {rev.toFixed(3)} {CURRENCY}
                        </Text>
                      </View>
                      
                      <View style={styles.itemCardStats}>
                        <Text style={styles.statText}>{t('opening_stock')}: {item.opening_count}</Text>
                        <Text style={styles.statText}>{t('closing_stock')}: {item.closing_count}</Text>
                        <Text style={[styles.statText, { fontWeight: 'bold' }]}>{t('sold')}: {sold}</Text>
                      </View>
                    </View>
                  );
                })}

                <View style={{ height: 24 }} />

                {/* Action Buttons */}
                <TouchableOpacity style={styles.pdfButton} onPress={handleGeneratePDF}>
                  <Ionicons name="document-text-outline" size={16} color="#fff" />
                  <Text style={styles.pdfButtonText}>{t('export_pdf')}</Text>
                </TouchableOpacity>

                <View style={{ height: 40 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bgLight: {
    backgroundColor: '#f8fafc',
  },
  bgDark: {
    backgroundColor: '#0f172a',
  },
  textLight: {
    color: '#0f172a',
  },
  textDark: {
    color: '#f8fafc',
  },
  textLightSub: {
    color: '#475569',
  },
  textDarkSub: {
    color: '#94a3b8',
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  historyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  cardLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderWidth: 1,
  },
  cardDark: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dayBadge: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  dayBadgeLight: {
    backgroundColor: '#f1f5f9',
  },
  dayBadgeDark: {
    backgroundColor: '#0f172a',
  },
  dayName: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  dateCol: {
    justifyContent: 'center',
    flex: 1,
  },
  dateText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  statusText: {
    fontSize: 11,
  },
  historyRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amountCol: {
    alignItems: 'flex-end',
    marginRight: 8,
  },
  amountLabel: {
    fontSize: 10,
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  amountValue: {
    fontSize: 14,
    fontWeight: 'bold',
    fontVariant: NumericFontVariant,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    height: '85%',
  },
  modalContentLight: {
    backgroundColor: '#ffffff',
  },
  modalContentDark: {
    backgroundColor: '#1e293b',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#475569',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  modalBody: {
    flex: 1,
  },
  summaryCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  subCardLight: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderWidth: 1,
  },
  subCardDark: {
    backgroundColor: '#0f172a',
    borderColor: '#334155',
    borderWidth: 1,
  },
  cardHeaderTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: '#64748b',
    marginBottom: 12,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  metricLabel: {
    fontSize: 13,
    color: '#475569',
    flex: 1,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: NumericFontVariant,
    flexShrink: 1,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#475569',
    opacity: 0.2,
    marginVertical: 10,
  },
  boldLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#475569',
    flex: 1,
  },
  boldValue: {
    fontSize: 16,
    fontWeight: 'bold',
    fontVariant: NumericFontVariant,
    flexShrink: 1,
    textAlign: 'right',
  },
  productHeaderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  itemCard: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  itemCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  itemName: {
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  itemRevenue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#22c55e',
  },
  itemCardStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statText: {
    fontSize: 12,
    color: '#64748b',
  },
  pdfButton: {
    backgroundColor: '#0284c7',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
    borderRadius: 8,
    marginTop: 10,
  },
  pdfButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
