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
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  getRegisterHistory,
  getRegisterDetails,
  DailyRegister,
  RegisterItem,
} from '../services/db';

export default function HistoryScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

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
      Alert.alert('Database Error', 'Could not load history.');
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
      Alert.alert('Error', 'Could not load details for this day.');
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

    const formattedDate = new Date(selectedReg.date).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Create HTML items rows
    let productRowsHtml = '';
    selectedItems.forEach((item) => {
      const sold = Math.max(0, item.opening_count - item.closing_count);
      const rev = sold * (item.selling_price || 0);
      const cost = sold * (item.cost_price || 0);
      const profit = Math.max(0, rev - cost);

      productRowsHtml += `
        <tr>
          <td>${item.product_name}</td>
          <td style="text-align: center;">${item.opening_count}</td>
          <td style="text-align: center;">${item.closing_count}</td>
          <td style="text-align: center;">${sold}</td>
          <td style="text-align: right;">$${item.selling_price?.toFixed(2)}</td>
          <td style="text-align: right; font-weight: bold; color: #10b981;">$${rev.toFixed(2)}</td>
          <td style="text-align: right; color: #10b981;">$${profit.toFixed(2)}</td>
        </tr>
      `;
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Daily Sales & Reconciliation - ${selectedReg.date}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #333;
            padding: 20px;
            line-height: 1.4;
          }
          .header {
            border-bottom: 2px solid #0284c7;
            padding-bottom: 12px;
            margin-bottom: 24px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .app-title {
            font-size: 26px;
            font-weight: bold;
            color: #0284c7;
            margin: 0;
          }
          .doc-title {
            font-size: 16px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #64748b;
            margin: 4px 0 0 0;
          }
          .date {
            font-size: 16px;
            font-weight: bold;
            text-align: right;
            margin: 0;
          }
          .status {
            font-size: 12px;
            font-weight: bold;
            padding: 4px 8px;
            border-radius: 4px;
            background-color: #fee2e2;
            color: #ef4444;
            display: inline-block;
            margin-top: 4px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-bottom: 24px;
          }
          .card {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 14px;
          }
          .card-title {
            font-size: 11px;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 6px;
            font-weight: bold;
          }
          .card-value {
            font-size: 18px;
            font-weight: bold;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 16px;
            margin-bottom: 30px;
          }
          th {
            background-color: #f1f5f9;
            border-bottom: 2px solid #cbd5e1;
            padding: 10px;
            font-size: 12px;
            text-transform: uppercase;
            color: #475569;
            font-weight: bold;
          }
          td {
            padding: 10px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 13px;
          }
          .totals-table {
            width: 40%;
            margin-left: auto;
            margin-top: 0;
          }
          .totals-table td {
            font-size: 14px;
            padding: 8px;
          }
          .totals-title {
            font-size: 18px;
            font-weight: bold;
            color: #0f172a;
            margin-top: 30px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 6px;
          }
          .footer {
            text-align: center;
            font-size: 11px;
            color: #94a3b8;
            margin-top: 50px;
            border-top: 1px solid #e2e8f0;
            padding-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="app-title">Hsabi Daily Report</h1>
            <p class="doc-title">Sales & Reconciliation Summary</p>
          </div>
          <div style="text-align: right;">
            <p class="date">${formattedDate}</p>
            <span class="status">Closed & Reconciled</span>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-title">Expected Sales</div>
            <div class="card-value" style="color: #0284c7;">$${totals.expectedRevenue.toFixed(2)}</div>
          </div>
          <div class="card">
            <div class="card-title">Actual Cash Drawer</div>
            <div class="card-value">$${selectedReg.actual_cash.toFixed(2)}</div>
          </div>
          <div class="card">
            <div class="card-title">Drawer Discrepancy</div>
            <div class="card-value" style="color: ${totals.discrepancy === 0 ? '#10b981' : totals.discrepancy > 0 ? '#3b82f6' : '#ef4444'};">
              ${totals.discrepancy > 0 ? '+' : ''}$${totals.discrepancy.toFixed(2)}
            </div>
          </div>
        </div>

        <div class="totals-title">Product Ledger</div>
        <table>
          <thead>
            <tr>
              <th style="text-align: left;">Product</th>
              <th>Opening</th>
              <th>Closing</th>
              <th>Sold</th>
              <th style="text-align: right;">Price</th>
              <th style="text-align: right;">Revenue</th>
              <th style="text-align: right;">Profit Margin</th>
            </tr>
          </thead>
          <tbody>
            ${productRowsHtml}
          </tbody>
        </table>

        <div class="totals-title">Financial Summary</div>
        <table class="totals-table">
          <tr>
            <td>Expected Revenue:</td>
            <td style="text-align: right;">$${totals.expectedRevenue.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Expenses:</td>
            <td style="text-align: right; color: #ef4444;">-$${selectedReg.expenses.toFixed(2)}</td>
          </tr>
          <tr style="border-top: 2px solid #cbd5e1; font-weight: bold;">
            <td>Gross Profit:</td>
            <td style="text-align: right; color: #10b981;">$${totals.grossProfit.toFixed(2)}</td>
          </tr>
          <tr style="font-weight: bold; background-color: #f8fafc;">
            <td>Net Profit:</td>
            <td style="text-align: right; color: ${totals.netProfit >= 0 ? '#10b981' : '#ef4444'}; font-size: 16px;">
              $${totals.netProfit.toFixed(2)}
            </td>
          </tr>
        </table>

        <div class="footer">
          Generated on ${new Date().toLocaleString()} by Hsabi App. Local-first shop assistant.
        </div>
      </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri);
    } catch (error) {
      console.error('Error generating or sharing PDF:', error);
      Alert.alert('PDF Generation Failed', 'Could not build or share the PDF report.');
    }
  };

  const renderHistoryItem = ({ item }: { item: DailyRegister }) => {
    const isClosed = item.is_closed === 1;
    const dateObj = new Date(item.date);
    const dayName = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
    const formattedDate = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

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
            <Text style={[styles.dateText, isDark ? styles.textDark : styles.textLight]}>{formattedDate}</Text>
            <View style={styles.statusRow}>
              <Ionicons
                name={isClosed ? 'lock-closed' : 'lock-open'}
                size={12}
                color={isClosed ? '#ef4444' : '#22c55e'}
              />
              <Text style={[styles.statusText, { color: isClosed ? '#ef4444' : '#22c55e' }]}>
                {isClosed ? 'Closed & Locked' : 'Active day'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.historyRight}>
          <Text style={styles.amountLabel}>Cash Found</Text>
          <Text style={[styles.amountValue, isDark ? styles.textDark : styles.textLight]}>
            ${item.actual_cash.toFixed(2)}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#888" style={{ marginLeft: 8 }} />
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
            No historical daily registers found. Close your first register session to see records here.
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
              <View>
                <Text style={[styles.modalTitle, isDark ? styles.textDark : styles.textLight]}>
                  Register Audit
                </Text>
                <Text style={[styles.modalSubtitle, isDark ? styles.textDarkSub : styles.textLightSub]}>
                  {selectedReg && new Date(selectedReg.date).toLocaleDateString(undefined, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
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
                  <Text style={styles.cardHeaderTitle}>Sales Ledger Summary</Text>
                  
                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Expected Gross Revenue</Text>
                    <Text style={[styles.metricValue, isDark ? styles.textDark : styles.textLight]}>
                      ${totals.expectedRevenue.toFixed(2)}
                    </Text>
                  </View>

                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Expenses Paid Out</Text>
                    <Text style={[styles.metricValue, { color: '#ef4444' }]}>
                      -${selectedReg.expenses.toFixed(2)}
                    </Text>
                  </View>

                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Expected Cash Net</Text>
                    <Text style={[styles.metricValue, isDark ? styles.textDark : styles.textLight]}>
                      ${(totals.expectedRevenue - selectedReg.expenses).toFixed(2)}
                    </Text>
                  </View>

                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Actual Cash Found</Text>
                    <Text style={[styles.metricValue, isDark ? styles.textDark : styles.textLight]}>
                      ${selectedReg.actual_cash.toFixed(2)}
                    </Text>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.metricRow}>
                    <Text style={styles.boldLabel}>Drawer Discrepancy</Text>
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
                    >
                      {totals.discrepancy > 0 ? '+' : ''}
                      ${totals.discrepancy.toFixed(2)}
                    </Text>
                  </View>

                  <View style={styles.metricRow}>
                    <Text style={styles.boldLabel}>Net Profit Made</Text>
                    <Text style={[styles.boldValue, { color: totals.netProfit >= 0 ? '#22c55e' : '#ef4444' }]}>
                      ${totals.netProfit.toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Product Detail List */}
                <Text style={[styles.productHeaderTitle, isDark ? styles.textDark : styles.textLight]}>
                  Product Breakdowns
                </Text>
                
                {selectedItems.map((item) => {
                  const sold = Math.max(0, item.opening_count - item.closing_count);
                  const rev = sold * (item.selling_price || 0);

                  return (
                    <View key={item.id} style={[styles.itemCard, isDark ? styles.subCardDark : styles.subCardLight]}>
                      <View style={styles.itemCardHeader}>
                        <Text style={[styles.itemName, isDark ? styles.textDark : styles.textLight]}>
                          {item.product_name}
                        </Text>
                        <Text style={styles.itemRevenue}>${rev.toFixed(2)}</Text>
                      </View>
                      
                      <View style={styles.itemCardStats}>
                        <Text style={styles.statText}>Opened: {item.opening_count}</Text>
                        <Text style={styles.statText}>Closed: {item.closing_count}</Text>
                        <Text style={[styles.statText, { fontWeight: 'bold' }]}>Sold: {sold}</Text>
                      </View>
                    </View>
                  );
                })}

                <View style={{ height: 24 }} />

                {/* Action Buttons */}
                <TouchableOpacity style={styles.pdfButton} onPress={handleGeneratePDF}>
                  <Ionicons name="document-text" size={22} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.pdfButtonText}>Generate & Share PDF Report</Text>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
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
  },
  dayBadge: {
    width: 48,
    height: 48,
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
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  dateCol: {
    justifyContent: 'center',
  },
  dateText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  statusText: {
    fontSize: 12,
  },
  historyRight: {
    flexDirection: 'row',
    alignItems: 'center',
    textAlign: 'right',
  },
  amountLabel: {
    fontSize: 10,
    color: '#64748b',
    textTransform: 'uppercase',
    marginRight: 4,
    alignSelf: 'center',
  },
  amountValue: {
    fontSize: 16,
    fontWeight: 'bold',
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
    fontSize: 22,
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
    fontSize: 14,
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
    fontSize: 14,
    color: '#64748b',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#475569',
    opacity: 0.2,
    marginVertical: 10,
  },
  boldLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#64748b',
  },
  boldValue: {
    fontSize: 17,
    fontWeight: 'bold',
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
    fontSize: 15,
    fontWeight: 'bold',
  },
  itemRevenue: {
    fontSize: 15,
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
