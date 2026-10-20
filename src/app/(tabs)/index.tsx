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
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useLanguage, getCurrency } from '../../constants/translations';
import { NumericFontVariant, Typography } from '../../constants/theme';
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
} from '../../services/db';
import { syncRegisterToGoogle, isGoogleConnected } from '../../services/googleSheets';
import {
  generateAndSharePdf,
  getShopProfile,
  buildSummaryCards,
  buildDataTable,
  buildSectionTitle,
  buildTotalsTable,
  escapeHtml,
} from '../../services/pdfTemplate';

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
  const [actualCashStr, setActualCashStr] = useState('');
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
        setActualCashStr(activeReg.actual_cash > 0 ? activeReg.actual_cash.toString() : '');
      } else {
        setRegister(null);
        setItems([]);
        setActualCashStr('');
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
      setActualCashStr('');
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
    const shop = getShopProfile();
    const locale = language === 'ar' ? 'ar-TN' : language === 'fr' ? 'fr-FR' : 'en-US';
    const formattedDate = new Date(register.date).toLocaleDateString(locale, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    const productRows = items.map((item) => {
      const sold = item.closing_count > item.opening_count ? 0 : item.opening_count - item.closing_count;
      const rev = sold * (item.selling_price || 0);
      const cost = sold * (item.cost_price || 0);
      const profit = rev - cost;
      return [
        escapeHtml(item.product_name || ''),
        String(item.opening_count),
        String(item.closing_count),
        String(sold),
        `${item.selling_price?.toFixed(3)} ${CURRENCY}`,
        `<span class="font-bold">${rev.toFixed(3)} ${CURRENCY}</span>`,
        `<span class="text-green">${profit.toFixed(3)} ${CURRENCY}</span>`,
      ];
    });

    const productTable = buildDataTable(
      [t('product_name'), t('opening_stock'), t('closing_stock'), t('sold'), t('retail_selling'), t('rev'), t('profit_margin')],
      productRows,
      { align: ['start', 'center', 'center', 'center', 'end', 'end', 'end'] }
    );

    const summaryCards = buildSummaryCards([
      { label: t('expected_revenue'), value: `${f.expectedRevenue.toFixed(3)} ${CURRENCY}`, color: 'blue', highlight: true },
      { label: t('actual_cash_drawer'), value: `${(parseFloat(actualCashStr) || 0).toFixed(3)} ${CURRENCY}` },
      { label: t('drawer_discrepancy'), value: `${f.discrepancy > 0 ? '+' : ''}${f.discrepancy.toFixed(3)} ${CURRENCY}`, color: f.discrepancy === 0 ? 'green' : f.discrepancy > 0 ? 'blue' : 'red' },
    ]);

    const totalsTable = buildTotalsTable([
      { label: t('expected_revenue'), value: `${f.expectedRevenue.toFixed(3)} ${CURRENCY}` },
      { label: t('cost'), value: `${f.expectedCost.toFixed(3)} ${CURRENCY}` },
      { label: t('net_profit'), value: `${f.netProfit.toFixed(3)} ${CURRENCY}`, color: f.netProfit >= 0 ? '#16a34a' : '#dc2626' },
      { label: t('actual_cash_drawer'), value: `${(parseFloat(actualCashStr) || 0).toFixed(3)} ${CURRENCY}` },
      { label: t('drawer_discrepancy'), value: `${f.discrepancy.toFixed(3)} ${CURRENCY}`, isTotal: true, color: f.discrepancy >= 0 ? '#16a34a' : '#dc2626' },
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
        fileName: shop.name ? `${shop.name}-daily-reconciliation` : 'daily-reconciliation',
      });
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
    <ScrollView style={[styles.container, isDark ? styles.bgDark : styles.bgLight, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      {/* Month/Year Navigation */}
      <View style={[styles.calendarHeader, isDark ? styles.cardDark : styles.cardLight]}>
        <View style={styles.navRow}>
          <TouchableOpacity style={styles.navButton} onPress={() => navigateMonth(-1)}>
            <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={22} color={isDark ? '#38bdf8' : '#2563eb'} />
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
            <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={22} color={isDark ? '#38bdf8' : '#2563eb'} />
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, direction: isRTL ? 'rtl' : 'ltr' }}>
      <ScrollView style={[styles.container, isDark ? styles.bgDark : styles.bgLight, { direction: isRTL ? 'rtl' : 'ltr' }]}>
        {/* Back Button + Header */}
        <View style={[styles.detailHeader, isDark ? styles.headerDark : styles.headerLight]}>
          <TouchableOpacity style={styles.backButton} onPress={backToCalendar}>
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={20} color={isDark ? '#38bdf8' : '#2563eb'} />
            <Text style={[styles.backButtonText, { color: isDark ? '#38bdf8' : '#2563eb' }]}>
              {t('back_to_agenda')}
            </Text>
          </TouchableOpacity>
          {register && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={toggleReopen}
                style={[styles.smallButton, { backgroundColor: register.is_closed === 1 ? '#f59e0b' : '#16a34a' }]}
              >
                <Ionicons 
                  name={register.is_closed === 1 ? 'lock-closed' : 'lock-open'} 
                  size={14} 
                  color="#fff" 
                />
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold', marginStart: 4 }}>
                  {register.is_closed === 1 ? t('closed') : t('open')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDeleteRegister} style={[styles.smallButton, { backgroundColor: '#ef4444' }]}>
                <Ionicons name="trash-outline" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Date Display Card */}
        <View style={[styles.dateHeaderCard, isDark ? styles.cardDark : styles.cardLight]}>
          <View style={[styles.dateIcon, { backgroundColor: isDark ? '#0c4a6e' : '#e0f2fe' }]}>
            <Ionicons name="calendar" size={24} color={isDark ? '#38bdf8' : '#0284c7'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.dateHeaderText, isDark ? styles.textDark : styles.textLight]}>
              {formatDate(selectedDate, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </Text>
            {register && (
              <View style={[styles.statusBadge, { backgroundColor: register.is_closed === 1 ? '#fef2f2' : '#f0fdf4' }]}>
                <View style={[styles.statusDot, { backgroundColor: register.is_closed === 1 ? '#ef4444' : '#16a34a' }]} />
                <Text style={[styles.statusText, { color: register.is_closed === 1 ? '#dc2626' : '#16a34a' }]}>
                  {register.is_closed === 1 ? t('closed') : t('open')}
                </Text>
              </View>
            )}
          </View>
        </View>

        {!register ? (
          <View style={styles.noRegisterContainer}>
            <View style={[styles.emptyIcon, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
              <Ionicons name="document-text-outline" size={48} color={isDark ? '#38bdf8' : '#2563eb'} />
            </View>
            <Text style={[styles.noRegisterTitle, isDark ? styles.textDark : styles.textLight]}>
              {t('no_session')}
            </Text>
            <Text style={[styles.noRegisterText, isDark ? styles.textDarkSub : styles.textLightSub]}>
              {t('no_session_desc')}
            </Text>
            <TouchableOpacity style={styles.startButton} onPress={handleStartDay}>
              <Ionicons name="play" size={18} color="#fff" />
              <Text style={styles.startButtonText}>{t('start_new_day')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Products Section Header */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="cube-outline" size={20} color={isDark ? '#38bdf8' : '#0284c7'} />
                <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
                  {t('products')}
                </Text>
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statBadge}>
                  <Text style={[styles.statNumber, { color: isDark ? '#38bdf8' : '#0284c7' }]}>{items.length}</Text>
                  <Text style={[styles.statLabel, isDark ? styles.textDarkSub : styles.textLightSub]}>{t('items_count')}</Text>
                </View>
                <View style={styles.statBadge}>
                  <Text style={[styles.statNumber, { color: '#16a34a' }]}>{soldCount}</Text>
                  <Text style={[styles.statLabel, isDark ? styles.textDarkSub : styles.textLightSub]}>{t('sold')}</Text>
                </View>
                <TouchableOpacity style={styles.manageProductsBtn} onPress={openManageProducts}>
                  <Ionicons name="add-circle" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Product Cards */}
            {items.length === 0 ? (
              <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight, styles.emptyProductsCard]}>
                <Ionicons name="alert-circle-outline" size={32} color="#f59e0b" style={{ marginBottom: 8 }} />
                <Text style={[styles.emptyText, isDark ? styles.textDark : styles.textLight]}>{t('no_products')}</Text>
                <Text style={[styles.emptySub, isDark ? styles.textDarkSub : styles.textLightSub]}>
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
                    {/* Product Header */}
                    <View style={styles.productHeader}>
                      <View style={styles.productInfo}>
                        <Text style={[styles.productName, isDark ? styles.textDark : styles.textLight]}>
                          {item.product_name}
                        </Text>
                        <Text style={styles.productPrice}>
                          {t('cost')}: {item.cost_price?.toFixed(3)} {CURRENCY}
                        </Text>
                      </View>
                      <TouchableOpacity 
                        onPress={() => handleToggleProduct({ id: item.product_id, name: item.product_name || '', cost_price: 0, selling_price: 0, stack_price: 0, stack_quantity: 1, is_deleted: 0 })}
                        style={styles.removeButton}
                      >
                        <Ionicons name="close-circle" size={22} color="#ef4444" />
                      </TouchableOpacity>
                    </View>

                    {/* Count Inputs */}
                    <View style={[styles.countInputsRow, { direction: 'ltr' }]}>
                      <View style={styles.countInputCol}>
                        <Text style={styles.countLabel}>{t('opening_stock')}</Text>
                        <TextInput
                          style={[styles.countInput, isDark ? styles.inputDark : styles.inputLight]}
                          keyboardType="number-pad"
                          value={item.opening_count.toString()}
                          onChangeText={(val) => handleItemCountChange(item.id, 'opening', val)}
                        />
                      </View>
                      <View style={styles.countArrow}>
                        <Ionicons name="arrow-forward" size={16} color="#94a3b8" />
                      </View>
                      <View style={styles.countInputCol}>
                        <Text style={styles.countLabel}>{t('closing_stock')}</Text>
                        <TextInput
                          style={[styles.countInput, isDark ? styles.inputDark : styles.inputLight, isError && styles.errorInput]}
                          keyboardType="number-pad"
                          value={item.closing_count.toString()}
                          onChangeText={(val) => handleItemCountChange(item.id, 'closing', val)}
                        />
                      </View>
                    </View>

                    {/* Calculation Result */}
                    {isError ? (
                      <View style={[styles.calcResult, styles.errorResult]}>
                        <Ionicons name="alert-circle" size={16} color="#dc2626" />
                        <Text style={[styles.calcResultText, { color: '#dc2626' }]}>
                          {t('closing_gt_opening')}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.calcResult}>
                        <View style={styles.calcItem}>
                          <Text style={styles.calcLabel}>{t('sold')}</Text>
                          <Text style={[styles.calcValue, { color: '#0284c7' }]}>{sold}</Text>
                        </View>
                        <View style={styles.calcDivider} />
                        <View style={styles.calcItem}>
                          <Text style={styles.calcLabel}>{t('rev')}</Text>
                          <Text style={[styles.calcValue, { color: '#16a34a' }]}>{expectedRev.toFixed(3)}</Text>
                        </View>
                        <View style={styles.calcDivider} />
                        <View style={styles.calcItem}>
                          <Text style={styles.calcLabel}>{t('cost')}</Text>
                          <Text style={[styles.calcValue, { color: '#64748b' }]}>{costTotal.toFixed(3)}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}

            {/* Financial Summary */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="cash-outline" size={20} color={isDark ? '#38bdf8' : '#0284c7'} />
                <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
                  {t('financials_cash')}
                </Text>
              </View>
            </View>

            <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}>
              {/* Cash Input */}
              <View style={styles.cashInputContainer}>
                <Text style={[styles.cashInputLabel, isDark ? styles.textDark : styles.textLight]}>
                  {t('actual_cash_drawer')}
                </Text>
                <TextInput
                  style={[styles.cashInput, isDark ? styles.cashInputDark : styles.cashInputLight]}
                  keyboardType="decimal-pad"
                  value={actualCashStr}
                  onChangeText={handleFinancialsChange}
                  placeholder="0.000"
                  placeholderTextColor="#94a3b8"
                />
              </View>

              <View style={styles.financialDivider} />

              {/* Financial Breakdown */}
              <View style={styles.financialBreakdown}>
                <View style={styles.financialRow}>
                  <Text style={styles.financialLabel}>{t('expected_revenue')}</Text>
                  <Text style={[styles.financialValue, isDark ? styles.textDark : styles.textLight]}>
                    {financials.expectedRevenue.toFixed(3)} {CURRENCY}
                  </Text>
                </View>
                <View style={styles.financialRow}>
                  <Text style={styles.financialLabel}>{t('net_profit')}</Text>
                  <Text style={[styles.financialValue, { color: financials.netProfit >= 0 ? '#16a34a' : '#ef4444', fontWeight: 'bold' }]}>
                    {financials.netProfit.toFixed(3)} {CURRENCY}
                  </Text>
                </View>
              </View>

              <View style={styles.financialDivider} />

              {/* Discrepancy */}
              <View style={styles.discrepancyCard}>
                <View style={styles.discrepancyHeader}>
                  <Ionicons 
                    name={financials.discrepancy === 0 ? 'checkmark-circle' : financials.discrepancy > 0 ? 'trending-up' : 'trending-down'} 
                    size={20} 
                    color={financials.discrepancy === 0 ? '#16a34a' : financials.discrepancy > 0 ? '#0284c7' : '#ef4444'} 
                  />
                  <Text style={[styles.discrepancyTitle, isDark ? styles.textDark : styles.textLight]}>
                    {t('drawer_discrepancy')}
                  </Text>
                </View>
                <Text style={[styles.discrepancyAmount, { color: financials.discrepancy === 0 ? '#16a34a' : financials.discrepancy > 0 ? '#0284c7' : '#ef4444' }]}>
                  {financials.discrepancy > 0 ? '+' : ''}{financials.discrepancy.toFixed(3)} {CURRENCY}
                </Text>
                <Text style={[styles.discrepancyStatus, { color: financials.discrepancy === 0 ? '#16a34a' : financials.discrepancy > 0 ? '#0284c7' : '#ef4444' }]}>
                  {financials.discrepancy === 0 ? t('perfect_match') : financials.discrepancy > 0 ? t('cash_surplus') : t('cash_shortage')}
                </Text>
              </View>

              {/* Terminal Actions */}
              {items.length > 0 && (
                <View style={styles.terminalActions}>
                  <TouchableOpacity style={styles.invoiceButton} onPress={handleExportPDF}>
                    <Ionicons name="document-text-outline" size={20} color="#fff" />
                    <Text style={styles.buttonText}>{t('export_pdf')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveAndCloseButton} onPress={handleSaveAndClose}>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
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
        <View style={[styles.modalOverlay, { direction: isRTL ? 'rtl' : 'ltr' }]}>
          <View style={[styles.modalContent, isDark ? styles.cardDark : styles.cardLight, { direction: isRTL ? 'rtl' : 'ltr' }]}>
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
  bgLight: { backgroundColor: '#f8fafc' },
  bgDark: { backgroundColor: '#0f172a' },

  textLight: { color: '#0f172a', textAlign: 'auto' },
  textDark: { color: '#f1f5f9', textAlign: 'auto' },
  textLightSub: { color: '#475569', textAlign: 'auto' },
  textDarkSub: { color: '#94a3b8', textAlign: 'auto' },

  // Calendar Styles
  calendarHeader: { margin: 16, marginBottom: 8, padding: 16, borderRadius: 16 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  navButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(37, 99, 235, 0.1)' },
  monthYearContainer: { alignItems: 'center', flex: 1 },
  monthText: { fontSize: Typography.screenTitle, fontWeight: Typography.bold, marginBottom: 4 },
  yearNav: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  yearNavBtn: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(100, 116, 139, 0.1)' },
  yearText: { fontSize: 18, fontWeight: '600', minWidth: 50, textAlign: 'center' },
  todayBtn: { backgroundColor: '#2563eb', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, gap: 6 },
  todayBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  dayNamesRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 4 },
  dayNameCell: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  dayNameText: { fontSize: Typography.caption, fontWeight: Typography.semibold },

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
  smallButton: { 
    flexDirection: 'row', 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 8, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },

  dateHeaderCard: { flexDirection: 'row', alignItems: 'center', margin: 16, marginBottom: 8, padding: 16, borderRadius: 14, gap: 12 },
  dateIcon: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  dateHeaderText: { fontSize: 17, fontWeight: 'bold', textAlign: 'auto' },
  statusBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    alignSelf: 'flex-end',
    paddingHorizontal: 8, 
    paddingVertical: 4, 
    borderRadius: 6, 
    marginTop: 4,
    gap: 4 
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: 'bold' },

  noRegisterContainer: { alignItems: 'center', padding: 24, paddingTop: 40 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  noRegisterTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  noRegisterText: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24, paddingHorizontal: 16 },
  startButton: { 
    backgroundColor: '#1d4ed8', 
    paddingVertical: 14, 
    paddingHorizontal: 32, 
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8 
  },
  startButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  // Section Headers
  sectionHeaderRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingTop: 20, 
    paddingBottom: 10 
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'auto' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statBadge: { 
    paddingHorizontal: 10, 
    paddingVertical: 6, 
    borderRadius: 8, 
    alignItems: 'center',
    backgroundColor: 'rgba(100, 116, 139, 0.1)',
    minWidth: 48 
  },
  statNumber: { fontSize: 15, fontWeight: 'bold' },
  statLabel: { fontSize: 9 },
  manageProductsBtn: { 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    backgroundColor: '#2563eb', 
    alignItems: 'center', 
    justifyContent: 'center', 
  },

  // Cards
  card: { borderRadius: 12, padding: 16, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  cardLight: { backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderWidth: 1 },
  cardDark: { backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1 },

  // Product Cards
  productHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start', 
    marginBottom: 14, 
    paddingBottom: 12, 
    borderBottomWidth: StyleSheet.hairlineWidth, 
    borderBottomColor: '#e2e8f0' 
  },
  productInfo: { flex: 1 },
  productName: { fontSize: 17, fontWeight: 'bold', textAlign: 'auto', marginBottom: 2 },
  productPrice: { fontSize: Typography.caption, color: '#64748b', textAlign: 'auto', fontVariant: NumericFontVariant },
  removeButton: { padding: 4 },

  countInputsRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginBottom: 12 
  },
  countInputCol: { flex: 1 },
  countArrow: { paddingHorizontal: 12, paddingVertical: 24 },
  countLabel: { 
    fontSize: Typography.label, 
    color: '#64748b', 
    marginBottom: 6, 
    fontWeight: Typography.semibold, 
    textAlign: 'center' 
  },
  countInput: { 
    borderWidth: 1, 
    borderRadius: 8, 
    padding: 12, 
    fontSize: Typography.bodyLarge, 
    textAlign: 'center', 
    fontWeight: Typography.semibold, 
    fontVariant: NumericFontVariant 
  },
  inputLight: { backgroundColor: '#f8fafc', borderColor: '#cbd5e1', color: '#0f172a' },
  inputDark: { backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' },
  errorInput: { borderColor: '#ef4444', backgroundColor: '#fef2f2', borderWidth: 1.5 },

  calcResult: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-around', 
    backgroundColor: '#f8fafc', 
    borderRadius: 8, 
    padding: 12 
  },
  errorResult: { 
    backgroundColor: '#fef2f2', 
    justifyContent: 'center' 
  },
  calcItem: { alignItems: 'center', flex: 1 },
  calcDivider: { width: 1, height: 24, backgroundColor: '#e2e8f0' },
  calcLabel: { fontSize: 11, color: '#64748b', marginBottom: 2 },
  calcValue: { fontSize: 15, fontWeight: 'bold', fontVariant: NumericFontVariant },
  calcResultText: { fontSize: 13, fontWeight: '600', marginStart: 6 },

  emptyProductsCard: { alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  emptySub: { fontSize: 13, textAlign: 'center', color: '#64748b', marginTop: 4 },

  // Financial Section
  cashInputContainer: { marginBottom: 16 },
  cashInputLabel: { fontSize: Typography.body, fontWeight: Typography.semibold, marginBottom: 8, textAlign: 'auto' },
  cashInput: { 
    borderWidth: 2, 
    borderRadius: 12, 
    padding: 14, 
    fontSize: 22, 
    fontWeight: Typography.bold, 
    textAlign: 'center', 
    fontVariant: NumericFontVariant 
  },
  cashInputLight: { backgroundColor: '#f8fafc', borderColor: '#cbd5e1', color: '#0f172a' },
  cashInputDark: { backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' },

  financialDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 16 },

  financialBreakdown: { gap: 12 },
  financialRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  financialLabel: { fontSize: Typography.body, color: '#64748b', textAlign: 'auto', flex: 1 },
  financialValue: { fontSize: Typography.metric, fontWeight: Typography.semibold, textAlign: 'auto', fontVariant: NumericFontVariant },

  discrepancyCard: { 
    backgroundColor: '#f8fafc', 
    borderRadius: 12, 
    padding: 16, 
    alignItems: 'center' 
  },
  discrepancyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  discrepancyTitle: { fontSize: Typography.body, fontWeight: Typography.semibold },
  discrepancyAmount: { fontSize: 28, fontWeight: Typography.extraBold, fontVariant: NumericFontVariant, marginBottom: 4 },
  discrepancyStatus: { fontSize: Typography.label, fontWeight: Typography.semibold },

  terminalActions: { marginTop: 20, gap: 12 },
  invoiceButton: { 
    backgroundColor: '#2563eb', 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 16, 
    borderRadius: 10,
    gap: 8 
  },
  saveAndCloseButton: { 
    backgroundColor: '#16a34a', 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 16, 
    borderRadius: 10,
    gap: 8 
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'auto' },

  productToggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0', gap: 10 },
  productToggleName: { fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'auto' },
  productTogglePrice: { fontSize: 14, color: '#64748b', textAlign: 'auto' },
});
