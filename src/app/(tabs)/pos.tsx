import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
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
import { getCurrency, useLanguage } from '../../constants/translations';
import { NumericFontVariant, Typography } from '../../constants/theme';
import {
  addCashAdjustment,
  closeShift,
  createOrder,
  getOpenShift,
  getProducts,
  getShiftExpectedCash,
  PaymentMethod,
  Product,
  Shift,
  startShift,
} from '../../services/db';

type CartLine = {
  product: Product;
  quantity: number;
  modifiers: { name: string; additionalCost: string }[];
};

type PaymentLine = { paymentMethod: PaymentMethod; amount: string };

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'CARD', 'MOBILE_PAYMENT', 'DELIVERY_APP'];

export default function PosScreen() {
  const isDark = useColorScheme() === 'dark';
  const { t, language, isRTL } = useLanguage();
  const currency = getCurrency(language);
  const [shift, setShift] = useState<Shift | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payments, setPayments] = useState<PaymentLine[]>([{ paymentMethod: 'CASH', amount: '0' }]);
  const [taxRate, setTaxRate] = useState('0');
  const [openingFloat, setOpeningFloat] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [adjustmentVisible, setAdjustmentVisible] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<'PAYOUT' | 'DROP'>('PAYOUT');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [closingVisible, setClosingVisible] = useState(false);
  const [closingResult, setClosingResult] = useState<{ expected: number; actual: number; variance: number } | null>(null);

  const load = useCallback(() => {
    try {
      setShift(getOpenShift());
      setProducts(getProducts());
    } catch (error) {
      console.error('Could not load POS data:', error);
      Alert.alert(t('db_error'), String(error));
    }
  }, [t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const subtotal = useMemo(() => cart.reduce((sum, line) => {
    const modifier = line.modifiers.reduce(
      (total, item) => total + (item.name.trim() ? Number(item.additionalCost) || 0 : 0),
      0
    );
    return sum + (line.product.selling_price + modifier) * line.quantity;
  }, 0), [cart]);
  const parsedTaxRate = Number(taxRate);
  const taxAmount = subtotal * (Number.isFinite(parsedTaxRate) ? parsedTaxRate : 0) / 100;
  const orderTotal = Math.round((subtotal + taxAmount) * 1000) / 1000;
  const displayedPayments = payments.length === 1
    ? [{ ...payments[0], amount: orderTotal.toFixed(3) }]
    : payments;

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      return existing
        ? current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { product, quantity: 1, modifiers: [] }];
    });
  };

  const adjustQuantity = (productId: number, amount: number) => {
    setCart((current) => current
      .map((line) => line.product.id === productId ? { ...line, quantity: line.quantity + amount } : line)
      .filter((line) => line.quantity > 0));
  };

  const updateCartModifier = (
    productId: number,
    modifierIndex: number,
    field: 'name' | 'additionalCost',
    value: string
  ) => {
    setCart((current) => current.map((line) => line.product.id === productId
      ? {
          ...line,
          modifiers: line.modifiers.map((modifier, index) =>
            index === modifierIndex ? { ...modifier, [field]: value } : modifier
          ),
        }
      : line));
  };

  const handleStartShift = () => {
    const amount = Number(openingFloat);
    if (!openingFloat.trim() || !Number.isFinite(amount) || amount < 0) {
      Alert.alert(t('validation_error'), `${t('starting_float')}: 0+`);
      return;
    }
    try {
      setShift(startShift(amount));
      setOpeningFloat('');
    } catch (error) {
      Alert.alert(t('db_error'), String(error));
    }
  };

  const handleAdjustment = () => {
    if (!shift) return;
    try {
      addCashAdjustment(shift.id, adjustmentType, Number(adjustmentAmount), adjustmentReason);
      setAdjustmentVisible(false);
      setAdjustmentAmount('');
      setAdjustmentReason('');
    } catch (error) {
      Alert.alert(t('validation_error'), String(error));
    }
  };

  const handleCloseShift = () => {
    if (!shift) return;
    if (!countedCash.trim()) {
      Alert.alert(t('validation_error'), t('counted_cash'));
      return;
    }
    try {
      const result = closeShift(shift.id, Number(countedCash));
      setClosingVisible(false);
      setClosingResult({ expected: result.expectedCash, actual: Number(countedCash), variance: result.variance });
      setCountedCash('');
      setCart([]);
      setPayments([{ paymentMethod: 'CASH', amount: '0' }]);
    } catch (error) {
      Alert.alert(t('validation_error'), String(error));
    }
  };

  const updatePayment = (index: number, patch: Partial<PaymentLine>) => {
    setPayments((current) => current.map((payment, i) => i === index ? { ...payment, ...patch } : payment));
  };

  const handleCheckout = () => {
    if (!shift) return;
    const rate = Number(taxRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      Alert.alert(t('validation_error'), `${t('tax_breakdown')}: 0–100%`);
      return;
    }
    try {
      const order = createOrder(
        shift.id,
        cart.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          modifiers: line.modifiers
            .filter((modifier) => modifier.name.trim())
            .map((modifier) => ({ name: modifier.name.trim(), additionalCost: Number(modifier.additionalCost) })),
        })),
        displayedPayments.map((payment) => ({ paymentMethod: payment.paymentMethod, amount: Number(payment.amount) })),
        rate / 100
      );
      Alert.alert(t('complete_sale'), `${t('order_total')}: ${order.total.toFixed(3)} ${currency}`);
      setCart([]);
      setPayments([{ paymentMethod: 'CASH', amount: '0' }]);
      setTaxRate('0');
    } catch (error) {
      Alert.alert(t('validation_error'), String(error));
    }
  };

  const methodLabel = (method: PaymentMethod) => t(
    method === 'CASH' ? 'cash' :
      method === 'CARD' ? 'card' :
        method === 'MOBILE_PAYMENT' ? 'mobile_payment' : 'delivery_app'
  );

  const inputStyle = [styles.input, isDark ? styles.inputDark : styles.inputLight];

  if (!shift) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <View style={[styles.card, isDark && styles.cardDark]}>
          <Ionicons name="lock-open-outline" size={40} color="#0284c7" />
          <Text style={[styles.title, isDark && styles.textDark]}>{t('open_shift')}</Text>
          <Text style={styles.subtle}>{t('open_shift_desc')}</Text>
          <Text style={styles.label}>{t('starting_float')} ({currency})</Text>
          <TextInput
            value={openingFloat}
            onChangeText={setOpeningFloat}
            keyboardType="decimal-pad"
            style={inputStyle}
            placeholder="0.000"
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleStartShift}>
            <Text style={styles.buttonText}>{t('start_shift')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.page, isDark && styles.pageDark]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.shiftBar, isDark && styles.cardDark]}>
          <View>
            <Text style={[styles.title, isDark && styles.textDark]}>{t('pos_register')}</Text>
            <Text style={styles.subtle}>{t('starting_float')}: {shift.starting_float.toFixed(3)} {currency}</Text>
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setAdjustmentVisible(true)}>
              <Ionicons name="swap-vertical" size={17} color="#0369a1" />
              <Text style={styles.secondaryText}>{t('add_cash_adjustment')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={() => setClosingVisible(true)}>
              <Text style={styles.buttonText}>{t('close_shift')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>{t('products')}</Text>
        <View style={styles.productGrid}>
          {products.map((product) => (
            <TouchableOpacity key={product.id} style={[styles.productTile, isDark && styles.cardDark]} onPress={() => addToCart(product)}>
              <Text style={[styles.productName, isDark && styles.textDark]}>{product.name}</Text>
              <Text style={styles.price}>{product.selling_price.toFixed(3)} {currency}</Text>
            </TouchableOpacity>
          ))}
          {products.length === 0 && <Text style={styles.subtle}>{t('no_products_found')}</Text>}
        </View>

        <View style={[styles.card, isDark && styles.cardDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>{t('new_order')}</Text>
          {cart.map((line) => (
            <View key={line.product.id} style={styles.cartLine}>
              <View style={styles.cartMain}>
                <Text style={[styles.productName, isDark && styles.textDark]}>{line.product.name}</Text>
                <Text style={styles.subtle}>{(line.product.selling_price * line.quantity).toFixed(3)} {currency}</Text>
              </View>
              <View style={styles.quantityControl}>
                <TouchableOpacity onPress={() => adjustQuantity(line.product.id, -1)}><Ionicons name="remove-circle-outline" size={24} color="#0284c7" /></TouchableOpacity>
                <Text style={[styles.qty, isDark && styles.textDark]}>{line.quantity}</Text>
                <TouchableOpacity onPress={() => adjustQuantity(line.product.id, 1)}><Ionicons name="add-circle-outline" size={24} color="#0284c7" /></TouchableOpacity>
              </View>
              {line.modifiers.map((modifier, index) => (
                <View key={`${line.product.id}-modifier-${index}`} style={styles.modifierRow}>
                  <TextInput
                    value={modifier.name}
                    onChangeText={(value) => updateCartModifier(line.product.id, index, 'name', value)}
                    placeholder={t('modifier')}
                    style={[inputStyle, styles.modifierInput]}
                  />
                  <TextInput
                    value={modifier.additionalCost}
                    onChangeText={(value) => updateCartModifier(line.product.id, index, 'additionalCost', value)}
                    placeholder={t('modifier_price')}
                    keyboardType="decimal-pad"
                    style={[inputStyle, styles.modifierPrice]}
                  />
                  <TouchableOpacity onPress={() => setCart((current) => current.map((item) =>
                    item.product.id === line.product.id
                      ? { ...item, modifiers: item.modifiers.filter((_, modifierIndex) => modifierIndex !== index) }
                      : item
                  ))}>
                    <Ionicons name="close-circle" size={21} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={styles.addModifierButton}
                onPress={() => setCart((current) => current.map((item) =>
                  item.product.id === line.product.id
                    ? { ...item, modifiers: [...item.modifiers, { name: '', additionalCost: '0' }] }
                    : item
                ))}
              >
                <Ionicons name="add" size={16} color="#0369a1" />
                <Text style={styles.secondaryText}>{t('modifier')}</Text>
              </TouchableOpacity>
            </View>
          ))}
          {cart.length === 0 && <Text style={styles.subtle}>{t('new_order')}</Text>}

          <View style={styles.taxRow}>
            <Text style={[styles.label, isDark && styles.textDark]}>{t('tax_breakdown')} (%)</Text>
            <TextInput value={taxRate} onChangeText={setTaxRate} keyboardType="decimal-pad" style={[inputStyle, styles.taxInput]} />
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalText, isDark && styles.textDark]}>{t('order_total')}</Text>
            <Text style={styles.totalAmount}>{orderTotal.toFixed(3)} {currency}</Text>
          </View>

          <Text style={[styles.label, isDark && styles.textDark]}>{t('split_payment')}</Text>
          {displayedPayments.map((payment, index) => (
            <View key={index} style={styles.paymentRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.paymentMethods}>
                {PAYMENT_METHODS.map((method) => (
                  <TouchableOpacity
                    key={method}
                    style={[styles.methodChip, payment.paymentMethod === method && styles.methodSelected]}
                    onPress={() => updatePayment(index, { paymentMethod: method })}
                  >
                    <Text style={[styles.methodText, payment.paymentMethod === method && styles.methodTextSelected]}>{methodLabel(method)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput
                value={payment.amount}
                onChangeText={(amount) => updatePayment(index, { amount })}
                keyboardType="decimal-pad"
                editable={payments.length > 1}
                style={[inputStyle, styles.paymentAmount]}
                placeholder="0.000"
              />
              {payments.length > 1 && (
                <TouchableOpacity onPress={() => setPayments((current) => current.filter((_, i) => i !== index))}>
                  <Ionicons name="close-circle" size={22} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          ))}
          <TouchableOpacity
            style={styles.addPaymentButton}
            onPress={() => setPayments((current) => [
              ...current.map((payment, index) => current.length === 1 && index === 0
                ? { ...payment, amount: orderTotal.toFixed(3) }
                : payment),
              { paymentMethod: 'CARD', amount: '0' },
            ])}
          >
            <Ionicons name="add" size={18} color="#0369a1" />
            <Text style={styles.secondaryText}>{t('add_payment')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={handleCheckout} disabled={cart.length === 0}>
            <Text style={styles.buttonText}>{t('complete_sale')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={adjustmentVisible} transparent animationType="slide" onRequestClose={() => setAdjustmentVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.modal, isDark && styles.cardDark]}>
            <Text style={[styles.title, isDark && styles.textDark]}>{t('add_cash_adjustment')}</Text>
            <View style={styles.actionRow}>
              {(['PAYOUT', 'DROP'] as const).map((type) => (
                <TouchableOpacity key={type} style={[styles.methodChip, adjustmentType === type && styles.methodSelected]} onPress={() => setAdjustmentType(type)}>
                  <Text style={[styles.methodText, adjustmentType === type && styles.methodTextSelected]}>{t(type === 'PAYOUT' ? 'cash_payout' : 'cash_drop')}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput value={adjustmentAmount} onChangeText={setAdjustmentAmount} placeholder={t('amount')} keyboardType="decimal-pad" style={inputStyle} />
            <TextInput value={adjustmentReason} onChangeText={setAdjustmentReason} placeholder={t('reason')} style={inputStyle} />
            <TouchableOpacity style={styles.primaryButton} onPress={handleAdjustment}><Text style={styles.buttonText}>{t('record_adjustment')}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setAdjustmentVisible(false)}><Text style={styles.cancelText}>{t('cancel')}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={closingVisible} transparent animationType="slide" onRequestClose={() => setClosingVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.modal, isDark && styles.cardDark]}>
            <Text style={[styles.title, isDark && styles.textDark]}>{t('close_shift')}</Text>
            <Text style={styles.subtle}>{t('expected_cash')}: {getShiftExpectedCash(shift.id).toFixed(3)} {currency}</Text>
            <TextInput value={countedCash} onChangeText={setCountedCash} placeholder={t('counted_cash')} keyboardType="decimal-pad" style={inputStyle} />
            <TouchableOpacity style={styles.closeButton} onPress={handleCloseShift}><Text style={styles.buttonText}>{t('close_shift')}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setClosingVisible(false)}><Text style={styles.cancelText}>{t('cancel')}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={closingResult !== null} transparent animationType="fade" onRequestClose={() => { setClosingResult(null); setShift(null); }}>
        <View style={styles.overlay}>
          <View style={[styles.modal, isDark && styles.cardDark]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity
                onPress={() => { setClosingResult(null); setShift(null); }}
                accessibilityRole="button"
                accessibilityLabel={t('back')}
                style={{ padding: 6 }}
              >
                <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={22} color={isDark ? '#f8fafc' : '#0f172a'} />
              </TouchableOpacity>
              <Text style={[styles.title, isDark && styles.textDark]}>{t('shift_closed')}</Text>
            </View>
            {closingResult && (
              <>
                <Text style={styles.subtle}>{t('expected_cash')}: {closingResult.expected.toFixed(3)} {currency}</Text>
                <Text style={styles.subtle}>{t('counted_cash')}: {closingResult.actual.toFixed(3)} {currency}</Text>
                <View style={[
                  styles.varianceBadge,
                  { backgroundColor: closingResult.variance === 0 ? '#dcfce7' : closingResult.variance > 0 ? '#fef3c7' : '#fee2e2' },
                ]}>
                  <Text style={{
                    color: closingResult.variance === 0 ? '#15803d' : closingResult.variance > 0 ? '#b45309' : '#b91c1c',
                    fontSize: 16,
                    fontWeight: '800',
                  }}>
                    {closingResult.variance === 0
                      ? t('cash_balanced')
                      : closingResult.variance > 0 ? t('cash_over') : t('cash_short')}
                    {' · '}{closingResult.variance > 0 ? '+' : ''}{closingResult.variance.toFixed(3)} {currency}
                  </Text>
                </View>
              </>
            )}
            <TouchableOpacity style={styles.primaryButton} onPress={() => { setClosingResult(null); setShift(null); }}>
              <Text style={styles.buttonText}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: '#f1f5f9', padding: 16 },
  pageDark: { backgroundColor: '#0f172a' },
  content: { paddingBottom: 32, gap: 14 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 12 },
  cardDark: { backgroundColor: '#1e293b' },
  title: { fontSize: Typography.screenTitle, fontWeight: Typography.bold, color: '#0f172a' },
  sectionTitle: { fontSize: Typography.sectionTitle, fontWeight: Typography.bold, color: '#0f172a', marginVertical: 4 },
  textDark: { color: '#f8fafc' },
  subtle: { color: '#475569', fontSize: Typography.body },
  label: { color: '#334155', fontSize: Typography.label, fontWeight: Typography.semibold },
  input: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, fontSize: Typography.bodyLarge, minWidth: 80 },
  inputLight: { color: '#0f172a', borderColor: '#cbd5e1', backgroundColor: '#fff' },
  inputDark: { color: '#f8fafc', borderColor: '#475569', backgroundColor: '#0f172a' },
  primaryButton: { backgroundColor: '#0284c7', borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontWeight: Typography.bold, fontSize: Typography.bodyLarge },
  shiftBar: { borderRadius: 12, backgroundColor: '#fff', padding: 14, gap: 12 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  secondaryButton: { backgroundColor: '#e0f2fe', borderRadius: 9, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 5 },
  secondaryText: { color: '#0369a1', fontWeight: '600', fontSize: 13 },
  closeButton: { backgroundColor: '#dc2626', borderRadius: 9, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center' },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  productTile: { flexGrow: 1, flexBasis: '44%', borderRadius: 12, backgroundColor: '#fff', borderColor: '#e2e8f0', borderWidth: 1, padding: 14, minHeight: 84, justifyContent: 'space-between' },
  productName: { color: '#0f172a', fontWeight: Typography.semibold, fontSize: Typography.body },
  price: { color: '#0369a1', fontSize: Typography.bodyLarge, fontWeight: Typography.bold, marginTop: 8, fontVariant: NumericFontVariant },
  cartLine: { borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 12, gap: 8 },
  cartMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quantityControl: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'flex-start' },
  qty: { color: '#0f172a', fontWeight: '700' },
  modifierRow: { flexDirection: 'row', gap: 8 },
  modifierInput: { flex: 1 },
  modifierPrice: { width: 120 },
  addModifierButton: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', paddingVertical: 4 },
  taxRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  taxInput: { width: 90 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, borderColor: '#cbd5e1' },
  totalText: { fontWeight: Typography.bold, color: '#0f172a', fontSize: Typography.bodyLarge },
  totalAmount: { fontWeight: Typography.extraBold, color: '#0369a1', fontSize: Typography.total, fontVariant: NumericFontVariant },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paymentMethods: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  methodChip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 18, paddingHorizontal: 10, paddingVertical: 7 },
  methodSelected: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  methodText: { color: '#334155', fontSize: Typography.caption },
  methodTextSelected: { color: '#fff', fontWeight: Typography.bold },
  paymentAmount: { width: 92 },
  addPaymentButton: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', padding: 7 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 22, gap: 14 },
  varianceBadge: { padding: 12, borderRadius: 10, alignItems: 'center' },
  cancelText: { color: '#64748b', textAlign: 'center', padding: 10, fontWeight: '600' },
});
