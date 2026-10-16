import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useLanguage, getCurrency } from '../constants/translations';
import {
  getActiveRegisterForDate,
  startNewDay,
  getRegisterItems,
  updateRegisterItem,
  updateRegisterFinancials,
  closeRegister,
  reopenRegister,
  discardRegister,
  addProductToRegister,
  removeProductFromRegister,
  getAllRegisters,
  DailyRegister,
  RegisterItem,
  getProducts,
  Product,
} from '../services/db';
import { syncRegisterToGoogle, isGoogleConnected } from '../services/googleSheets';

type ViewMode = 'calendar' | 'detail';

interface CalendarDay {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  register?: DailyRegister;
}

const MONTH_NAMES = {
  ar: ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  fr: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

const DAY_NAMES = {
  ar: ['أح', 'إث', 'ثل', 'أر', 'خم', 'جم', 'سب'],
  fr: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t, language, isRTL } = useLanguage();
  const CURRENCY = getCurrency(language);

  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [registers, setRegisters] = useState<DailyRegister[]>([]);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState('');
  const [register, setRegister] = useState<DailyRegister | null>(null);
  const [items, setItems] = useState<RegisterItem[]>([]);
  const [actualCashStr, setActualCashStr] = useState('0');
  const [showProductModal, setShowProductModal] = useState(false);
  const [allProducts, setAllProducts] = useState<Product[]>([]);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const registersByDate = useMemo(() => {
    const map = new Map<string, DailyRegister>();
    registers.forEach(r => map.set(r.date, r));
    return map;
  }, [registers]);

  useFocusEffect(
    useCallback(() => {
      loadRegisters();
    }, [])
  );

  const loadRegisters = () => {
    try {
      setRegisters(getAllRegisters());
    } catch (error) {
      console.error('Error loading registers:', error);
    }
  };

  const calendarDays = useMemo(() => {
    const days: CalendarDay[] = [];
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const day = prevMonthLastDay - i;
      const month = currentMonth === 0 ? 11 : currentMonth - 1;
      const year = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({ date: dateStr, day, isCurrentMonth: false, isToday: false, register: registersByDate.get(dateStr) });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({
        date: dateStr,
        day,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        register: registersByDate.get(dateStr),
      });
    }

    const remaining = 42 - days.length;
    for (let day = 1; day <= remaining; day++) {
      const month = currentMonth === 11 ? 0 : currentMonth + 1;
      const year = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({ date: dateStr, day, isCurrentMonth: false, isToday: false, register: registersByDate.get(dateStr) });
    }

    return days;
  }, [currentYear, currentMonth, registersByDate, todayStr]);

  const monthNames = MONTH_NAMES[language] || MONTH_NAMES.en;
  const dayNames = DAY_NAMES[language] || DAY_NAMES.en;

  const navigateMonth = (direction: -1 | 1) => {
    if (direction === -1) {
      if (currentMonth === 0) {
        setCurrentMonth(11);
        setCurrentYear(currentYear - 1);
      } else {
        setCurrentMonth(currentMonth - 1);
      }
    } else {
      if (currentMonth === 11) {
        setCurrentMonth(0);
        setCurrentYear(currentYear + 1);
      } else {
        setCurrentMonth(currentMonth + 1);
      }
    }
  };

  const navigateYear = (direction: -1 | 1) => {
    setCurrentYear(currentYear + direction);
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
  };

  const openDetail = (dateStr: string) => {
    setSelectedDate(dateStr);
    loadDateData(dateStr);
    setViewMode('detail');
  };

  const loadDateData = (dateStr: string) => {
    try {
      const activeReg = getActiveRegisterForDate(dateStr);
      if (activeReg) {
        setRegister(activeReg);
        const regItems = getRegisterItems(activeReg.id);
        setItems(regItems);
        setActualCashStr(activeReg.actual_cash.toString());
      } else {
        setRegister(null);
        setItems([]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const backToCalendar = () => {
    setViewMode('calendar');
    loadRegisters();
  };

  const handleStartDay = () => {
    try {
      const newReg = startNewDay(selectedDate);
      setRegister(newReg);
      setItems(getRegisterItems(newReg.id));
      setActualCashStr('0');
    } catch (error) {
      console.error('Error starting day:', error);
      Alert.alert(t('db_error'), t('could_not_start_register'));
    }
  };

  const handleDeleteRegister = () => {
    if (!register) return;
    Alert.alert(
      t('delete_reconciliation'),
      t('delete_reconciliation_confirm', { date: register.date }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            try {
              discardRegister(register.id);
              backToCalendar();
            } catch (error) {
              console.error('Error deleting register:', error);
              Alert.alert(t('db_error'), t('could_not_discard'));
            }
          },
        },
      ]
    );
  };

  const openManageProducts = () => {
    setAllProducts(getProducts());
    setShowProductModal(true);
  };

  const handleToggleProduct = (product: Product) => {
    if (!register) return;
    const existing = items.find(i => i.product_id === product.id);
    if (existing) {
      Alert.alert(t('delete_product'), t('delete_confirm', { name: product.name }), [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'), style: 'destructive',
          onPress: () => {
            removeProductFromRegister(existing.id);
            setItems(getRegisterItems(register.id));
          },
        },
      ]);
    } else {
      addProductToRegister(register.id, product.id);
      setItems(getRegisterItems(register.id));
    }
  };

  const handleItemCountChange = (itemId: number, type: 'opening' | 'closing', text: string) => {
    const sanitizedVal = text.replace(/[^0-9]/g, '');
    const numValue = sanitizedVal === '' ? 0 : parseInt(sanitizedVal, 10);

    const updatedItems = items.map((item) => {
      if (item.id === itemId) {
        const val = type === 'opening' ? numValue : item.opening_count;
        const cVal = type === 'closing' ? numValue : item.closing_count;
        
        const updated = {
          ...item,
          opening_count: val,
          closing_count: cVal,
        };
        try {
          updateRegisterItem(itemId, updated.opening_count, updated.closing_count);
        } catch (err) {
          console.error('Error updating:', err);
        }
        return updated;
      }
      return item;
    });

    setItems(updatedItems);
  };

  const handleFinancialsChange = (text: string) => {
    const sanitizedVal = text.replace(/[^0-9.]/g, '');
    const numValue = sanitizedVal === '' ? 0 : parseFloat(sanitizedVal);
    
    setActualCashStr(sanitizedVal);
    if (register) {
      const cash = isNaN(numValue) ? 0 : numValue;
      updateRegisterFinancials(register.id, 0, cash);
    }
  };

  const calculateFinancials = () => {
    let expectedRevenue = 0;
    let expectedCost = 0;

    items.forEach((item) => {
      const sold = item.closing_count > item.opening_count ? 0 : item.opening_count - item.closing_count;
      const sellingPrice = item.selling_price || 0;
      const costPrice = item.cost_price || 0;
      expectedRevenue += sold * sellingPrice;
      expectedCost += sold * costPrice;
    });

    const expectedCashInRegister = expectedRevenue;
    const netProfit = expectedRevenue - expectedCost;
    const actualCash = parseFloat(actualCashStr) || 0;
    const discrepancy = actualCash - expectedCashInRegister;

    return { expectedRevenue, expectedCost, expectedCashInRegister, netProfit, discrepancy };
  };

  const financials = calculateFinancials();

  const handleExportPDF = async () => {
    if (!register) return;

    const invalidItems = items.filter((item) => item.closing_count > item.opening_count);
    if (invalidItems.length > 0) {
      Alert.alert(t('integrity_error'), t('integrity_desc', { names: invalidItems.map((i) => i.product_name).join(', ') }));
      return;
    }

    const f = calculateFinancials();
    const locale = language === 'ar' ? 'ar-TN' : language === 'fr' ? 'fr-FR' : 'en-US';
    const formattedDate = new Date(register.date).toLocaleDateString(locale, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    let productRowsHtml = '';
    items.forEach((item) => {
      const sold = item.closing_count > item.opening_count ? 0 : item.opening_count - item.closing_count;
      const rev = sold * (item.selling_price || 0);
      const cost = sold * (item.cost_price || 0);
      const profit = rev - cost;
      productRowsHtml += `<tr><td>${item.product_name}</td><td style="text-align: center;">${item.opening_count}</td><td style="text-align: center;">${item.closing_count}</td><td style="text-align: center;">${sold}</td><td style="text-align: right;">${item.selling_price?.toFixed(3)} ${CURRENCY}</td><td style="text-align: right; font-weight: bold;">${rev.toFixed(3)} ${CURRENCY}</td><td style="text-align: right; color: #10b981;">${profit.toFixed(3)} ${CURRENCY}</td></tr>`;
    });

    const dir = language === 'ar' ? 'rtl' : 'ltr';
    const htmlContent = `<!DOCTYPE html><html dir="${dir}" lang="${language}"><head><meta charset="utf-8"><title>${t('daily_reconciliation')} - ${register.date}</title><style>body{font-family:'Helvetica Neue',Arial,sans-serif;color:#333;padding:20px;line-height:1.4;text-align:${isRTL ? 'right' : 'left'}}.header{border-bottom:2px solid #0284c7;padding-bottom:12px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-end;flex-direction:row-reverse}.app-title{font-size:26px;font-weight:bold;color:#0284c7;margin:0}.doc-title{font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin:4px 0 0 0}.date{font-size:16px;font-weight:bold;text-align:left;margin:0}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}.card{background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px}.card-title{font-size:10px;text-transform:uppercase;color:#64748b;margin-bottom:6px;font-weight:bold}.card-value{font-size:18px;font-weight:bold}table{width:100%;border-collapse:collapse;margin-top:16px;margin-bottom:30px}th{background-color:#f1f5f9;border-bottom:2px solid #cbd5e1;padding:10px;font-size:11px;text-transform:uppercase;color:#475569;font-weight:bold;text-align:right}td{padding:10px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:right}.totals-table{width:40%;margin-right:auto;margin-left:0;margin-top:0}.totals-table td{font-size:14px;padding:8px}.totals-title{font-size:18px;font-weight:bold;color:#0f172a;margin-top:30px;border-bottom:1px solid #e2e8f0;padding-bottom:6px}.footer{text-align:center;font-size:11px;color:#94a3b8;margin-top:50px;border-top:1px solid #e2e8f0;padding-top:10px}</style></head><body><div class="header"><div><h1 class="app-title">Hsabi</h1><p class="doc-title">${t('daily_reconciliation')}</p></div><div style="text-align:left"><p class="date">${formattedDate}</p></div></div><div class="grid"><div class="card"><div class="card-title">${t('expected_revenue')}</div><div class="card-value">${f.expectedRevenue.toFixed(3)} ${CURRENCY}</div></div><div class="card"><div class="card-title">${t('net_profit')}</div><div class="card-value" style="color:#10b981">${f.netProfit.toFixed(3)} ${CURRENCY}</div></div><div class="card"><div class="card-title">${t('drawer_discrepancy')}</div><div class="card-value">${f.discrepancy.toFixed(3)} ${CURRENCY}</div></div></div><table><thead><tr><th>${t('product_name')}</th><th>${t('opening_stock')}</th><th>${t('closing_stock')}</th><th>${t('sold')}</th><th>${t('retail_selling')}</th><th>${t('rev')}</th><th>${t('profit_margin')}</th></tr></thead><tbody>${productRowsHtml}</tbody></table><div class="totals-title">${t('day_total')}</div><table class="totals-table"><tr><td>${t('expected_revenue')}</td><td style="text-align:left;font-weight:bold">${f.expectedRevenue.toFixed(3)} ${CURRENCY}</td></tr><tr><td>${t('net_profit')}</td><td style="text-align:left;font-weight:bold;color:#10b981">${f.netProfit.toFixed(3)} ${CURRENCY}</td></tr><tr><td>${t('actual_cash_drawer')}</td><td style="text-align:left;font-weight:bold">${(f.discrepancy + f.expectedRevenue).toFixed(3)} ${CURRENCY}</td></tr><tr><td>${t('drawer_discrepancy')}</td><td style="text-align:left;font-weight:bold">${f.discrepancy.toFixed(3)} ${CURRENCY}</td></tr></table><div class="footer">Hsabi - ${new Date().toLocaleDateString(locale)}</div></body></html>`;

    try {
      const printResult = await Print.printToFileAsync({ html: htmlContent });
      if (!FileSystem.documentDirectory) throw new Error('Document storage is not available.');
      const shareUri = `${FileSystem.documentDirectory}daily-reconciliation-${Date.now()}.pdf`;
      await FileSystem.copyAsync({ from: printResult.uri, to: shareUri });
      await Sharing.shareAsync(shareUri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error: any) {
      console.error('Error generating invoice:', error?.message || error);
      Alert.alert(t('db_error'), error?.message || '');
    }
  };

  const handleSaveAndClose = () => {
    if (!register) return;
    const invalidItems = items.filter((item) => item.closing_count > item.opening_count);
    if (invalidItems.length > 0) {
      Alert.alert(t('integrity_error'), t('integrity_desc', { names: invalidItems.map((i) => i.product_name).join(', ') }));
      return;
    }

    Alert.alert(
      t('save_close_confirm_title'),
      t('save_close_confirm_desc'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('save_close_day'),
          style: 'default',
          onPress: () => {
            const actualCash = parseFloat(actualCashStr) || 0;
            updateRegisterFinancials(register.id, 0, actualCash);
            closeRegister(register.id);
            
            if (isGoogleConnected()) {
              syncRegisterToGoogle({
                date: register.date,
                expenses: 0,
                actual_cash: actualCash,
                expected_revenue: financials.expectedRevenue,
                gross_profit: financials.expectedRevenue - financials.expectedCost,
                net_profit: financials.netProfit,
                discrepancy: financials.discrepancy,
              });
            }
            
            backToCalendar();
          },
        },
      ]
    );
  };

  const handleDiscardDay = () => {
    if (!register) return;
    Alert.alert(t('discard_day'), t('discard_confirm_desc'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('discard_day'), style: 'destructive',
        onPress: () => {
          discardRegister(register.id);
          backToCalendar();
        },
      },
    ]);
  };

  const toggleReopen = () => {
    if (!register) return;
    if (register.is_closed === 1) {
      reopenRegister(register.id);
      setRegister({ ...register, is_closed: 0 });
    } else {
      closeRegister(register.id);
      setRegister({ ...register, is_closed: 1 });
    }
    loadRegisters();
  };

  const formatDate = (dateStr: string, options?: Intl.DateTimeFormatOptions) => {
    const locale = language === 'ar' ? 'ar-TN' : language === 'fr' ? 'fr-FR' : 'en-US';
    return new Date(dateStr).toLocaleDateString(locale, options || { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  };

  const productIdsInRegister = new Set(items.map(i => i.product_id));
  const soldCount = items.reduce((sum, i) => sum + (i.closing_count > i.opening_count ? 0 : i.opening_count - i.closing_count), 0);

  // -------- RENDER CALENDAR VIEW --------

  const renderCalendar = () => (
    <ScrollView style={[styles.container, isDark ? styles.bgDark : styles.bgLight]}>
      {/* Month/Year Navigation */}
      <View style={[styles.calendarHeader, isDark ? styles.cardDark : styles.cardLight]}>
        <View style={styles.navRow}>
          <TouchableOpacity style={styles.navButton} onPress={() => navigateMonth(-1)}>
            <Ionicons name="chevron-back" size={22} color={isDark ? '#38bdf8' : '#2563eb'} />
          </TouchableOpacity>
          
          <View style={styles.monthYearContainer}>
            <Text style={[styles.monthText, isDark ? styles.textDark : styles.textLight]}>
              {monthNames[currentMonth]}
            </Text>
            <View style={styles.yearNav}>
              <TouchableOpacity style={styles.yearNavBtn} onPress={() => navigateYear(-1)}>
                <Ionicons name="remove" size={16} color={isDark ? '#94a3b8' : '#64748b'} />
              </TouchableOpacity>
              <Text style={[styles.yearText, isDark ? styles.textDark : styles.textLight]}>{currentYear}</Text>
              <TouchableOpacity style={styles.yearNavBtn} onPress={() => navigateYear(1)}>
                <Ionicons name="add" size={16} color={isDark ? '#94a3b8' : '#64748b'} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.navButton} onPress={() => navigateMonth(1)}>
            <Ionicons name="chevron-forward" size={22} color={isDark ? '#38bdf8' : '#2563eb'} />
          </TouchableOpacity>
        </View>

        {/* Today Button */}
        <TouchableOpacity style={styles.todayBtn} onPress={goToToday}>
          <Ionicons name="calendar" size={16} color="#fff" />
          <Text style={styles.todayBtnText}>{t('today_date')}</Text>
        </TouchableOpacity>
      </View>

      {/* Day Names Header */}
      <View style={styles.dayNamesRow}>
        {dayNames.map((dayName, index) => (
          <View key={index} style={styles.dayNameCell}>
            <Text style={[styles.dayNameText, isDark ? styles.textDarkSub : styles.textLightSub]}>
              {dayName}
            </Text>
          </View>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={[styles.calendarGrid, isDark ? styles.cardDark : styles.cardLight]}>
        {calendarDays.map((dayItem, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.dayCell,
              !dayItem.isCurrentMonth && styles.dayCellOtherMonth,
              dayItem.isToday && styles.dayCellToday,
            ]}
            onPress={() => openDetail(dayItem.date)}
          >
            <Text
              style={[
                styles.dayText,
                !dayItem.isCurrentMonth && styles.dayTextOtherMonth,
                dayItem.isToday && styles.dayTextToday,
              ]}
            >
              {dayItem.day}
            </Text>
            {dayItem.register && (
              <View style={[
                styles.registerDot,
                { backgroundColor: dayItem.register.is_closed === 1 ? '#ef4444' : '#16a34a' }
              ]} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#16a34a' }]} />
          <Text style={[styles.legendText, isDark ? styles.textDarkSub : styles.textLightSub]}>{t('open')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
          <Text style={[styles.legendText, isDark ? styles.textDarkSub : styles.textLightSub]}>{t('closed')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#2563eb', width: 16, height: 16, borderRadius: 4 }]} />
          <Text style={[styles.legendText, isDark ? styles.textDarkSub : styles.textLightSub]}>{t('today_date')}</Text>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  // -------- RENDER DETAIL VIEW --------

  const renderDetail = () => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView style={[styles.container, isDark ? styles.bgDark : styles.bgLight]}>
        {/* Back Button + Header */}
        <View style={[styles.detailHeader, isDark ? styles.headerDark : styles.headerLight]}>
          <TouchableOpacity style={styles.backButton} onPress={backToCalendar}>
            <Ionicons name="arrow-back" size={20} color={isDark ? '#38bdf8' : '#2563eb'} />
            <Text style={[styles.backButtonText, { color: isDark ? '#38bdf8' : '#2563eb' }]}>
              {t('back_to_agenda')}
            </Text>
          </TouchableOpacity>
          {register && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={toggleReopen}
                style={[styles.smallButton, { backgroundColor: register.is_closed === 1 ? '#f59e0b' : '#64748b' }]}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
                  {register.is_closed === 1 ? t('open') : t('closed')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDeleteRegister} style={[styles.smallButton, { backgroundColor: '#ef4444' }]}>
                <Ionicons name="trash-outline" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Date Display */}
        <View style={[styles.dateHeaderCard, isDark ? styles.cardDark : styles.cardLight]}>
          <Ionicons name="calendar" size={28} color={isDark ? '#38bdf8' : '#2563eb'} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.dateHeaderText, isDark ? styles.textDark : styles.textLight]}>
              {formatDate(selectedDate, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </Text>
            {register && (
              <Text style={[styles.dateHeaderStatus, { color: register.is_closed === 1 ? '#ef4444' : '#16a34a' }]}>
                {register.is_closed === 1 ? t('closed') : t('open')}
              </Text>
            )}
          </View>
        </View>

        {!register ? (
          <View style={styles.noRegisterContainer}>
            <Ionicons name="document-outline" size={64} color={isDark ? '#38bdf8' : '#2563eb'} style={{ marginBottom: 16 }} />
            <Text style={[styles.noRegisterText, isDark ? styles.textDarkSub : styles.textLightSub]}>
              {t('no_session_desc')}
            </Text>
            <TouchableOpacity style={styles.startButton} onPress={handleStartDay}>
              <Text style={styles.startButtonText}>{t('start_new_day')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Product Management Row */}
            <View style={styles.productMgmtRow}>
              <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
                {items.length} {t('items_count')} | {soldCount} {t('sold')}
              </Text>
              <TouchableOpacity style={styles.manageProductsBtn} onPress={openManageProducts}>
                <Ionicons name="grid-outline" size={16} color="#fff" style={{ marginLeft: 6 }} />
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>{t('products')}</Text>
              </TouchableOpacity>
            </View>

            {/* Product Cards */}
            {items.length === 0 ? (
              <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight, { alignItems: 'center', padding: 24 }]}>
                <Ionicons name="alert-circle-outline" size={32} color="#f59e0b" style={{ marginBottom: 8 }} />
                <Text style={[styles.emptyText, isDark ? styles.textDark : styles.textLight]}>{t('no_products')}</Text>
                <Text style={[styles.emptySub, isDark ? styles.textDarkSub : styles.textLightSub, { textAlign: 'center', marginTop: 4 }]}>
                  {t('add_products_hint')}
                </Text>
              </View>
            ) : (
              items.map((item) => {
                const isError = item.closing_count > item.opening_count;
                const sold = isError ? 0 : item.opening_count - item.closing_count;
                const expectedRev = sold * (item.selling_price || 0);
                const costTotal = sold * (item.cost_price || 0);

                return (
                  <View key={item.id} style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}>
                    <View style={styles.productRow}>
                      <Text style={[styles.productName, isDark ? styles.textDark : styles.textLight]}>{item.product_name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.productPrice}>{t('cost')}: {item.cost_price?.toFixed(3)} {CURRENCY}</Text>
                        <TouchableOpacity onPress={() => handleToggleProduct({ id: item.product_id, name: item.product_name || '', cost_price: 0, selling_price: 0, stack_price: 0, stack_quantity: 1, is_deleted: 0 })}>
                          <Ionicons name="close-circle" size={20} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.inputsRow}>
                      <View style={styles.inputColumn}>
                        <Text style={styles.inputLabel}>{t('opening_stock')}</Text>
                        <TextInput
                          style={[styles.countInput, isDark ? styles.inputDark : styles.inputLight]}
                          keyboardType="number-pad"
                          value={item.opening_count.toString()}
                          onChangeText={(val) => handleItemCountChange(item.id, 'opening', val)}
                        />
                      </View>
                      <View style={styles.inputColumn}>
                        <Text style={styles.inputLabel}>{t('closing_stock')}</Text>
                        <TextInput
                          style={[styles.countInput, isDark ? styles.inputDark : styles.inputLight, isError && styles.errorInput]}
                          keyboardType="number-pad"
                          value={item.closing_count.toString()}
                          onChangeText={(val) => handleItemCountChange(item.id, 'closing', val)}
                        />
                      </View>
                      <View style={styles.mathColumn}>
                        {isError ? (
                          <View style={{ alignItems: 'flex-start' }}>
                            <Text style={{ color: '#ef4444', fontSize: 10, fontWeight: 'bold', textAlign: 'left' }}>{t('stock_error')}</Text>
                            <Text style={{ color: '#ef4444', fontSize: 11, textAlign: 'left' }}>{t('closing_gt_opening')}</Text>
                          </View>
                        ) : (
                          <>
                            <Text style={styles.mathLabel}>{t('sold')}: {sold}</Text>
                            <Text style={[styles.mathValue, { color: '#16a34a', textAlign: 'left' }]}>
                              {t('rev')}: {expectedRev.toFixed(3)} {CURRENCY}
                            </Text>
                            <Text style={[styles.mathValue, { color: '#64748b', fontSize: 11, textAlign: 'left' }]}>
                              {t('cost')}: {costTotal.toFixed(3)} {CURRENCY}
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })
            )}

            {/* Financial Summary */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>{t('financials_cash')}</Text>
            </View>

            <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight, styles.summaryCard]}>
              <View style={styles.financialInputs}>
                <View style={styles.financialInputCol}>
                  <Text style={styles.summaryLabel}>{t('actual_cash_drawer')}</Text>
                  <TextInput
                    style={[styles.financialInput, isDark ? styles.inputDark : styles.inputLight]}
                    keyboardType="decimal-pad"
                    value={actualCashStr}
                    onChangeText={handleFinancialsChange}
                  />
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.calcRow}>
                <Text style={styles.calcLabel}>{t('expected_revenue')}</Text>
                <Text style={[styles.calcValue, isDark ? styles.textDark : styles.textLight]}>{financials.expectedRevenue.toFixed(3)} {CURRENCY}</Text>
              </View>
              <View style={styles.calcRow}>
                <Text style={styles.calcLabel}>{t('expected_cash_register')}</Text>
                <Text style={[styles.calcValue, isDark ? styles.textDark : styles.textLight, { fontWeight: 'bold' }]}>{financials.expectedCashInRegister.toFixed(3)} {CURRENCY}</Text>
              </View>
              <View style={styles.calcRow}>
                <Text style={styles.calcLabel}>{t('net_profit')}</Text>
                <Text style={[styles.calcValue, { color: financials.netProfit >= 0 ? '#16a34a' : '#ef4444', fontWeight: 'bold' }]}>{financials.netProfit.toFixed(3)} {CURRENCY}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.discrepancyRow}>
                <Text style={styles.discrepancyLabel}>{t('drawer_discrepancy')}</Text>
                <View style={styles.discrepancyBadgeContainer}>
                  <Text style={[styles.discrepancyValue, { color: financials.discrepancy === 0 ? '#16a34a' : financials.discrepancy > 0 ? '#2563eb' : '#ef4444' }]}>
                    {financials.discrepancy > 0 ? '+' : ''}{financials.discrepancy.toFixed(3)} {CURRENCY}
                  </Text>
                  <Text style={styles.discrepancySub}>
                    {financials.discrepancy === 0 ? t('perfect_match') : financials.discrepancy > 0 ? t('cash_surplus') : t('cash_shortage')}
                  </Text>
                </View>
              </View>

              {/* Terminal Actions */}
              {items.length > 0 && (
                <View style={styles.terminalActions}>
                  <TouchableOpacity style={styles.invoiceButton} onPress={handleExportPDF}>
                    <Ionicons name="document-text-outline" size={20} color="#fff" style={{ marginLeft: 8 }} />
                    <Text style={styles.buttonText}>{t('history')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveAndCloseButton} onPress={handleSaveAndClose}>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#fff" style={{ marginLeft: 8 }} />
                    <Text style={styles.buttonText}>{t('save_close_day')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={{ height: 60 }} />
          </>
        )}
      </ScrollView>

      {/* Product Management Modal */}
      <Modal visible={showProductModal} animationType="slide" transparent onRequestClose={() => setShowProductModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isDark ? styles.cardDark : styles.cardLight]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, isDark ? styles.textDark : styles.textLight]}>{t('products')}</Text>
              <TouchableOpacity onPress={() => setShowProductModal(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={allProducts}
              keyExtractor={p => p.id.toString()}
              renderItem={({ item }) => {
                const inRegister = productIdsInRegister.has(item.id);
                return (
                  <TouchableOpacity
                    onPress={() => handleToggleProduct(item)}
                    style={[styles.productToggleRow, isDark && { borderBottomColor: '#334155' }]}
                  >
                    <Ionicons
                      name={inRegister ? 'checkmark-circle' : 'add-circle-outline'}
                      size={22}
                      color={inRegister ? '#16a34a' : '#64748b'}
                    />
                    <Text style={[styles.productToggleName, isDark ? styles.textDark : styles.textLight]}>
                      {item.name}
                    </Text>
                    <Text style={styles.productTogglePrice}>{item.selling_price.toFixed(3)} {CURRENCY}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );

  return viewMode === 'calendar' ? renderCalendar() : renderDetail();
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bgLight: { backgroundColor: '#f0f4f8' },
  bgDark: { backgroundColor: '#0b1120' },

  textLight: { color: '#0f172a', textAlign: 'right' },
  textDark: { color: '#f1f5f9', textAlign: 'right' },
  textLightSub: { color: '#475569', textAlign: 'right' },
  textDarkSub: { color: '#94a3b8', textAlign: 'right' },

  // Calendar Styles
  calendarHeader: { margin: 16, marginBottom: 8, padding: 16, borderRadius: 16 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  navButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(37, 99, 235, 0.1)' },
  monthYearContainer: { alignItems: 'center', flex: 1 },
  monthText: { fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  yearNav: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  yearNavBtn: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(100, 116, 139, 0.1)' },
  yearText: { fontSize: 18, fontWeight: '600', minWidth: 50, textAlign: 'center' },
  todayBtn: { backgroundColor: '#2563eb', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, gap: 6 },
  todayBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  dayNamesRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 4 },
  dayNameCell: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  dayNameText: { fontSize: 12, fontWeight: '700' },

  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 16, borderRadius: 12, padding: 4 },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  dayCellOtherMonth: { opacity: 0.3 },
  dayCellToday: { backgroundColor: '#2563eb' },
  dayText: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  dayTextOtherMonth: { color: '#94a3b8' },
  dayTextToday: { color: '#fff' },
  registerDot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },

  legend: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 16, paddingHorizontal: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12 },

  // Detail Styles
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1 },
  headerLight: { backgroundColor: '#ffffff', borderBottomColor: '#e2e8f0' },
  headerDark: { backgroundColor: '#1e293b', borderBottomColor: '#334155' },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backButtonText: { fontSize: 15, fontWeight: '600' },
  smallButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  dateHeaderCard: { flexDirection: 'row', alignItems: 'center', margin: 16, marginBottom: 8, padding: 16, borderRadius: 14, gap: 12 },
  dateHeaderText: { fontSize: 17, fontWeight: 'bold', textAlign: 'right' },
  dateHeaderStatus: { fontSize: 13, fontWeight: '600', textAlign: 'right', marginTop: 2 },

  noRegisterContainer: { alignItems: 'center', padding: 24, paddingTop: 40 },
  noRegisterText: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24, paddingHorizontal: 16 },
  startButton: { backgroundColor: '#2563eb', paddingVertical: 16, paddingHorizontal: 40, borderRadius: 30, shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6 },
  startButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  sectionHeader: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', textAlign: 'right' },

  productMgmtRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  manageProductsBtn: { backgroundColor: '#2563eb', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },

  card: { borderRadius: 14, padding: 16, marginHorizontal: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2 },
  cardLight: { backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderWidth: 1 },
  cardDark: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1 },

  productRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#cbd5e1' },
  productName: { fontSize: 16, fontWeight: 'bold', textAlign: 'right', flex: 1 },
  productPrice: { fontSize: 12, color: '#64748b', textAlign: 'left' },

  inputsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  inputColumn: { flex: 1, marginHorizontal: 4 },

  inputLabel: { fontSize: 10, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', fontWeight: '700', textAlign: 'right' },
  countInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 16, textAlign: 'right', fontWeight: '600' },
  inputLight: { backgroundColor: '#f8fafc', borderColor: '#cbd5e1', color: '#0f172a' },
  inputDark: { backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' },
  errorInput: { borderColor: '#ef4444', backgroundColor: '#fef2f2', borderWidth: 1.5 },

  mathColumn: { flex: 1.3, alignItems: 'flex-start', justifyContent: 'center', paddingLeft: 8 },
  mathLabel: { fontSize: 11, color: '#64748b', marginBottom: 1, textAlign: 'left' },
  mathValue: { fontSize: 14, fontWeight: '600' },

  summaryCard: { marginBottom: 32 },
  financialInputs: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, gap: 8 },
  financialInputCol: { flex: 1 },
  summaryLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 6, textAlign: 'right' },
  financialInput: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16, fontWeight: '600', textAlign: 'right' },

  divider: { height: 1, backgroundColor: '#cbd5e1', opacity: 0.3, marginVertical: 14 },

  calcRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },
  calcLabel: { fontSize: 14, color: '#64748b', textAlign: 'right', flex: 1 },
  calcValue: { fontSize: 16, fontWeight: '700', textAlign: 'left' },

  discrepancyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 12 },
  discrepancyLabel: { fontSize: 17, fontWeight: 'bold', color: '#475569', textAlign: 'right' },
  discrepancyBadgeContainer: { alignItems: 'flex-end' },
  discrepancyValue: { fontSize: 20, fontWeight: 'bold' },
  discrepancySub: { fontSize: 12, color: '#64748b', marginTop: 2 },

  terminalActions: { marginTop: 24, gap: 14 },
  invoiceButton: { backgroundColor: '#2563eb', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderRadius: 10 },
  saveAndCloseButton: { backgroundColor: '#16a34a', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderRadius: 10 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },

  emptyText: { fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  emptySub: { fontSize: 13, textAlign: 'center', color: '#64748b', marginTop: 4 },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'right' },

  productToggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0', gap: 10 },
  productToggleName: { fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'right' },
  productTogglePrice: { fontSize: 14, color: '#64748b', textAlign: 'left' },
});
