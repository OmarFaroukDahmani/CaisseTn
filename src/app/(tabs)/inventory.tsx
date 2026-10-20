import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  createInventoryItem,
  getInventoryItems,
  getProducts,
  getRecipeIngredients,
  InventoryItem,
  Product,
  removeRecipeIngredient,
  setRecipeIngredient,
  updateInventoryItem,
} from '../../services/db';

type RecipeLine = ReturnType<typeof getRecipeIngredients>[number];

export default function InventoryScreen() {
  const isDark = useColorScheme() === 'dark';
  const { t, language, isRTL } = useLanguage();
  const currency = getCurrency(language);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [itemName, setItemName] = useState('');
  const [costPerBox, setCostPerBox] = useState('');
  const [unitsPerBox, setUnitsPerBox] = useState('');
  const [currentStock, setCurrentStock] = useState('');
  const [threshold, setThreshold] = useState('');
  const [recipeProductId, setRecipeProductId] = useState<number | null>(null);
  const [recipeItemId, setRecipeItemId] = useState<number | null>(null);
  const [recipeQuantity, setRecipeQuantity] = useState('');
  const [recipeLines, setRecipeLines] = useState<RecipeLine[]>([]);

  const load = useCallback(() => {
    try {
      setInventory(getInventoryItems());
      const availableProducts = getProducts();
      setProducts(availableProducts);
      if (recipeProductId === null && availableProducts.length > 0) {
        setRecipeProductId(availableProducts[0].id);
        setRecipeLines(getRecipeIngredients(availableProducts[0].id));
      }
    } catch (error) {
      console.error('Could not load inventory:', error);
      Alert.alert(t('db_error'), String(error));
    }
  }, [recipeProductId, t]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openAdd = () => {
    setEditing(null);
    setItemName('');
    setCostPerBox('');
    setUnitsPerBox('');
    setCurrentStock('');
    setThreshold('0');
    setItemModalVisible(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setItemName(item.name);
    setCostPerBox(String(item.cost_per_box));
    setUnitsPerBox(String(item.units_per_box));
    setCurrentStock(String(item.current_unit_stock));
    setThreshold(String(item.low_stock_threshold));
    setItemModalVisible(true);
  };

  const saveItem = () => {
    try {
      if (editing) {
        updateInventoryItem(editing.id, itemName, Number(costPerBox), Number(unitsPerBox), Number(currentStock), Number(threshold));
      } else {
        createInventoryItem(itemName, Number(costPerBox), Number(unitsPerBox), Number(currentStock), Number(threshold));
      }
      setItemModalVisible(false);
      setEditing(null);
      load();
    } catch (error) {
      Alert.alert(t('validation_error'), String(error));
    }
  };

  const loadRecipe = (productId: number) => {
    setRecipeProductId(productId);
    setRecipeLines(getRecipeIngredients(productId));
  };

  const saveRecipeLine = () => {
    if (recipeProductId === null || recipeItemId === null) {
      Alert.alert(t('validation_error'), `${t('select_product')} / ${t('select_ingredient')}`);
      return;
    }
    try {
      setRecipeIngredient(recipeProductId, recipeItemId, Number(recipeQuantity));
      setRecipeQuantity('');
      setRecipeLines(getRecipeIngredients(recipeProductId));
      load();
    } catch (error) {
      Alert.alert(t('validation_error'), String(error));
    }
  };

  const statusLabel = (status: InventoryItem['stock_status']) =>
    t(status === 'OUT_OF_STOCK' ? 'out_of_stock' : status === 'LOW_STOCK' ? 'low_stock' : 'stock_ok');
  const statusColor = (status: InventoryItem['stock_status']) =>
    status === 'OUT_OF_STOCK' ? '#dc2626' : status === 'LOW_STOCK' ? '#d97706' : '#16a34a';
  const inputStyle = [styles.input, isDark ? styles.inputDark : styles.inputLight];

  return (
    <View style={[styles.page, isDark && styles.pageDark, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      <FlatList
        data={inventory}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={(
          <>
            <View style={styles.header}>
              <View>
                <Text style={[styles.title, isDark && styles.textDark]}>{t('inventory')}</Text>
                <Text style={styles.subtle}>{t('stock_status')}</Text>
              </View>
              <TouchableOpacity style={styles.primaryButton} onPress={openAdd}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.buttonText}>{t('add_inventory')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        ListEmptyComponent={<Text style={styles.empty}>{t('add_inventory')}</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.card, isDark && styles.cardDark]} onPress={() => openEdit(item)}>
            <View style={styles.rowBetween}>
              <Text style={[styles.itemName, isDark && styles.textDark]}>{item.name}</Text>
              <View style={[styles.badge, { backgroundColor: `${statusColor(item.stock_status)}20` }]}>
                <Text style={{ color: statusColor(item.stock_status), fontWeight: '700', fontSize: 12 }}>
                  {statusLabel(item.stock_status)}
                </Text>
              </View>
            </View>
            <Text style={styles.subtle}>{t('current_stock')}: {item.current_unit_stock} · {t('low_stock_threshold')}: {item.low_stock_threshold}</Text>
            <Text style={styles.subtle}>
              {t('cost_per_box')}: {item.cost_per_box.toFixed(3)} {currency} · {t('units_per_box')}: {item.units_per_box}
            </Text>
            <Text style={styles.unitCost}>{t('unit_cost')}: {item.unit_cost.toFixed(4)} {currency}</Text>
          </TouchableOpacity>
        )}
        ListFooterComponent={(
          <View style={[styles.card, isDark && styles.cardDark, styles.recipeCard]}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>{t('recipe')}</Text>
            <Text style={styles.label}>{t('select_product')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {products.map((product) => (
                <TouchableOpacity
                  key={product.id}
                  style={[styles.chip, recipeProductId === product.id && styles.chipActive]}
                  onPress={() => loadRecipe(product.id)}
                >
                  <Text style={[styles.chipText, recipeProductId === product.id && styles.chipTextActive]}>{product.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {recipeProductId !== null && recipeLines.map((line) => (
              <View key={line.id} style={styles.recipeLine}>
                <Text style={[styles.recipeText, isDark && styles.textDark]}>{line.name}: {line.quantity_used}</Text>
                <TouchableOpacity onPress={() => {
                  removeRecipeIngredient(recipeProductId, line.id);
                  setRecipeLines(getRecipeIngredients(recipeProductId));
                }}>
                  <Ionicons name="trash-outline" size={19} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ))}
            <Text style={styles.label}>{t('select_ingredient')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {inventory.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.chip, recipeItemId === item.id && styles.chipActive]}
                  onPress={() => setRecipeItemId(item.id)}
                >
                  <Text style={[styles.chipText, recipeItemId === item.id && styles.chipTextActive]}>{item.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.recipeAddRow}>
              <TextInput value={recipeQuantity} onChangeText={setRecipeQuantity} keyboardType="decimal-pad" placeholder={t('quantity_used')} style={[inputStyle, styles.recipeQuantity]} />
              <TouchableOpacity style={styles.primaryButton} onPress={saveRecipeLine}>
                <Text style={styles.buttonText}>{t('add_recipe')}</Text>
              </TouchableOpacity>
            </View>
            {inventory.length === 0 && <Text style={styles.subtle}>{t('add_inventory')}</Text>}
          </View>
        )}
      />

      <Modal visible={itemModalVisible} transparent animationType="slide" onRequestClose={() => setItemModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
          <View style={[styles.modal, isDark && styles.cardDark, { direction: isRTL ? 'rtl' : 'ltr' }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.sectionTitle, isDark && styles.textDark]}>{editing ? editing.name : t('add_inventory')}</Text>
              <TouchableOpacity onPress={() => setItemModalVisible(false)}><Ionicons name="close" size={23} color={isDark ? '#fff' : '#0f172a'} /></TouchableOpacity>
            </View>
            <TextInput value={itemName} onChangeText={setItemName} placeholder={t('product_name')} style={inputStyle} />
            <TextInput value={costPerBox} onChangeText={setCostPerBox} keyboardType="decimal-pad" placeholder={`${t('cost_per_box')} (${currency})`} style={inputStyle} />
            <TextInput value={unitsPerBox} onChangeText={setUnitsPerBox} keyboardType="decimal-pad" placeholder={t('units_per_box')} style={inputStyle} />
            <TextInput value={currentStock} onChangeText={setCurrentStock} keyboardType="decimal-pad" placeholder={t('current_stock')} style={inputStyle} />
            <TextInput value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" placeholder={t('low_stock_threshold')} style={inputStyle} />
            <Text style={styles.subtle}>{t('unit_cost')}: {
              Number(unitsPerBox) > 0 ? (Number(costPerBox) / Number(unitsPerBox)).toFixed(4) : '0.0000'
            } {currency}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={saveItem}><Text style={styles.buttonText}>{t('save')}</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8fafc' },
  pageDark: { backgroundColor: '#0f172a' },
  list: { padding: 16, paddingBottom: 32, gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 10 },
  title: { fontSize: Typography.screenTitle, fontWeight: Typography.extraBold, color: '#0f172a' },
  sectionTitle: { fontSize: Typography.sectionTitle, fontWeight: Typography.bold, color: '#0f172a' },
  textDark: { color: '#f8fafc' },
  subtle: { color: '#475569', fontSize: Typography.label, marginTop: 5 },
  label: { color: '#334155', fontWeight: Typography.semibold, marginTop: 5, fontSize: Typography.label },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', gap: 3 },
  cardDark: { backgroundColor: '#1e293b', borderColor: '#334155' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  itemName: { color: '#0f172a', fontWeight: Typography.bold, fontSize: Typography.bodyLarge, flex: 1 },
  badge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12 },
  unitCost: { color: '#0369a1', fontWeight: Typography.bold, fontSize: Typography.bodyLarge, marginTop: 4, fontVariant: NumericFontVariant },
  primaryButton: { backgroundColor: '#0284c7', paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 9, flexDirection: 'row', gap: 4 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  empty: { color: '#64748b', textAlign: 'center', paddingVertical: 24 },
  recipeCard: { marginTop: 12, gap: 10 },
  chips: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  chipActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  chipText: { color: '#334155', fontSize: Typography.label },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  recipeLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  recipeText: { color: '#334155', fontSize: Typography.body },
  recipeAddRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  recipeQuantity: { flex: 1 },
  input: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, fontSize: Typography.bodyLarge },
  inputLight: { backgroundColor: '#fff', borderColor: '#cbd5e1', color: '#0f172a' },
  inputDark: { backgroundColor: '#0f172a', borderColor: '#475569', color: '#f8fafc' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, gap: 11 },
});
