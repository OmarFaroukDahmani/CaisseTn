import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getProducts, createProduct, updateProduct, deleteProduct, Product } from '../../services/db';
import { useLanguage, getCurrency } from '../../constants/translations';

export default function ProductsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t, language, isRTL } = useLanguage();
  const CURRENCY = getCurrency(language);

  const [products, setProducts] = useState<Product[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [stackPrice, setStackPrice] = useState('');
  const [stackQuantity, setStackQuantity] = useState('');

  // Reload products whenever screen is focused
  useFocusEffect(
    useCallback(() => {
      loadProducts();
    }, [])
  );

  const loadProducts = () => {
    try {
      const prodList = getProducts();
      setProducts(prodList);
    } catch (error) {
      console.error('Error loading products:', error);
      Alert.alert(t('db_error'), t('could_not_load_products'));
    }
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setName('');
    setSellingPrice('');
    setStackPrice('');
    setStackQuantity('');
    setModalVisible(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setSellingPrice(product.selling_price.toString());
    setStackPrice(product.stack_price?.toString() || '');
    setStackQuantity(product.stack_quantity?.toString() || '');
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert(t('validation_error'), t('name_required'));
      return;
    }

    const stack = parseFloat(stackPrice);
    const qty = parseInt(stackQuantity, 10);
    const sell = parseFloat(sellingPrice);
    const costPerUnit = qty > 0 ? stack / qty : 0;

    if (isNaN(stack) || stack < 0) {
      Alert.alert(t('validation_error'), t('stack_price_required'));
      return;
    }

    if (isNaN(qty) || qty <= 0) {
      Alert.alert(t('validation_error'), t('stack_quantity_required'));
      return;
    }

    if (isNaN(sell) || sell < 0) {
      Alert.alert(t('validation_error'), t('sell_required'));
      return;
    }

    try {
      if (editingProduct) {
        updateProduct(editingProduct.id, name.trim(), costPerUnit, sell, stack, qty);
      } else {
        createProduct(name.trim(), costPerUnit, sell, stack, qty);
      }
      setModalVisible(false);
      loadProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      Alert.alert(t('db_error'), t('could_not_save'));
    }
  };

  const handleDelete = (product: Product) => {
    Alert.alert(
      t('delete_product'),
      t('delete_confirm', { name: product.name }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            try {
              deleteProduct(product.id);
              loadProducts();
            } catch (error) {
              console.error('Error deleting product:', error);
              Alert.alert(t('db_error'), t('could_not_delete'));
            }
          },
        },
      ]
    );
  };

  const renderProductItem = ({ item }: { item: Product }) => {
    const stackPrice = item.stack_price || 0;
    const stackQty = item.stack_quantity || 1;
    const profitPerStack = (item.selling_price * stackQty) - stackPrice;

    return (
      <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.productName, isDark ? styles.textDark : styles.textLight]}>{item.name}</Text>
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionButton}>
              <Ionicons name="pencil" size={18} color={isDark ? '#38bdf8' : '#0284c7'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(item)} style={styles.actionButton}>
              <Ionicons name="trash" size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.priceRow}>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>{t('stack_price')}</Text>
            <Text style={[styles.priceValue, isDark ? styles.textDark : styles.textLight]}>
              {stackPrice.toFixed(3)} {CURRENCY}
            </Text>
          </View>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>{t('stack_quantity')}</Text>
            <Text style={[styles.priceValue, isDark ? styles.textDark : styles.textLight]}>
              {stackQty}
            </Text>
          </View>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>{t('retail_selling')}</Text>
            <Text style={[styles.priceValue, isDark ? styles.textDark : styles.textLight]}>
              {item.selling_price.toFixed(3)} {CURRENCY}
            </Text>
          </View>
        </View>
        <View style={styles.priceRow}>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>{t('profit_per_stack')}</Text>
            <Text style={[styles.marginValue, { color: profitPerStack >= 0 ? '#22c55e' : '#ef4444' }]}>
              {profitPerStack.toFixed(3)} {CURRENCY}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, isDark ? styles.bgDark : styles.bgLight]}>
      {products.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cube-outline" size={64} color="#888" style={{ marginBottom: 16 }} />
          <Text style={[styles.emptyText, isDark ? styles.textDarkSub : styles.textLightSub]}>
            {t('no_products_found')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderProductItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={openAddModal}>
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, isDark ? styles.modalContentDark : styles.modalContentLight]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, isDark ? styles.textDark : styles.textLight]}>
                {editingProduct ? t('edit_product') : t('add_new_product')}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#fff' : '#000'} />
              </TouchableOpacity>
            </View>

            <View style={styles.form}>
              <Text style={[styles.inputLabel, isDark ? styles.textDarkSub : styles.textLightSub]}>{t('product_name')}</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="مثلاً: علبة صودا"
                placeholderTextColor="#888"
                style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              />

              <Text style={[styles.inputLabel, isDark ? styles.textDarkSub : styles.textLightSub]}>{t('stack_price')} ({CURRENCY})</Text>
              <TextInput
                value={stackPrice}
                onChangeText={setStackPrice}
                keyboardType="decimal-pad"
                placeholder="0.000"
                placeholderTextColor="#888"
                style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              />

              <Text style={[styles.inputLabel, isDark ? styles.textDarkSub : styles.textLightSub]}>{t('stack_quantity')}</Text>
              <TextInput
                value={stackQuantity}
                onChangeText={setStackQuantity}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#888"
                style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              />

              <Text style={[styles.inputLabel, isDark ? styles.textDarkSub : styles.textLightSub]}>{t('retail_selling')} ({CURRENCY})</Text>
              <TextInput
                value={sellingPrice}
                onChangeText={setSellingPrice}
                keyboardType="decimal-pad"
                placeholder="0.000"
                placeholderTextColor="#888"
                style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              />

              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>{t('save_product')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
    textAlign: 'right',
  },
  textDark: {
    color: '#f8fafc',
    textAlign: 'right',
  },
  textLightSub: {
    color: '#475569',
  },
  textDarkSub: {
    color: '#94a3b8',
  },
  productName: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  priceLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
    textAlign: 'right',
  },
  priceValue: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'right',
  },
  marginValue: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'right',
  },
  input: {
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    textAlign: 'right',
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
  },
  actionButton: {
    marginLeft: 16,
    padding: 4,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  priceItem: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    backgroundColor: '#0284c7',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    minHeight: 400,
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
    alignItems: 'center',
    marginBottom: 20,
  },
  form: {
    gap: 12,
  },
  inputLight: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
    color: '#0f172a',
  },
  inputDark: {
    backgroundColor: '#0f172a',
    borderColor: '#334155',
    color: '#f8fafc',
  },
  saveButton: {
    backgroundColor: '#0284c7',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
