import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSetting, setSetting } from '../services/db';

export type Language = 'ar' | 'fr' | 'en';

const translations = {
  ar: {
    // Tabs & Navigation
    active_day: 'اليوم النشط',
    daily_reconciliation: 'التسوية اليومية',
    products: 'المنتجات',
    product_inventory: 'مخزون المنتجات',
    history: 'السجل',
    closed_registers: 'السجلات المغلقة',
    settings: 'الإعدادات',
    settings_cloud: 'الإعدادات والنسخ السحابي',

    // Dashboard / Active Day
    start_new_day: 'بدء يوم جديد',
    today_date: 'تاريخ اليوم',
    no_session_desc: 'لا توجد جلسة نشطة مفتوحة لليوم. جاهز لبدء العد وتسجيل المبيعات؟',
    active_session: 'جلسة نشطة',
    closed_locked: 'مغلق ومقفل',
    daily_counts: 'العد اليومي',
    update_stock_desc: 'قم بتحديث المخزون الافتتاحي والختامي أدناه.',
    no_products: 'لا توجد منتجات نشطة في الكتالوج!',
    add_products_hint: 'يرجى إضافة منتجات في علامة تبويب "المنتجات" لبدء التتبع اليومي.',
    opening_stock: 'المخزون الافتتاحي',
    closing_stock: 'المخزون الختامي',
    sold: 'مباع',
    rev: 'دخل',
    cost: 'تكلفة',
    stock_error: 'خطأ في المخزون',
    closing_gt_opening: 'الختامي > الافتتاحي',
    financials_cash: 'المالية ودرج النقود',
    total_expenses: 'إجمالي المصاريف',
    actual_cash_drawer: 'النقد الفعلي في الدرج',
    expected_revenue: 'إجمالي الدخل المتوقع',
    expenses_today: 'المصاريف (اليوم)',
    expected_cash_register: 'النقد المتوقع في المسجل',
    net_profit: 'صافي الربح (المبيعات - التكاليف - المصاريف)',
    drawer_discrepancy: 'فرق الدرج',
    perfect_match: 'تطابق تام',
    cash_surplus: 'فائض نقدي',
    cash_shortage: 'عجز نقدي',
    discard_day: 'إلغاء اليوم',
    save_close_day: 'حفظ وإغلاق اليوم',

    // Agenda
    agenda: 'الأجندة',
    agenda_subtitle: 'اختر يوماً لعرض أو تعديل التسوية',
    new_reconciliation: 'تسوية جديدة',
    edit_reconciliation: 'تعديل التسوية',
    delete_reconciliation: 'حذف التسوية',
    delete_reconciliation_confirm: 'هل أنت متأكد أنك تريد حذف تسوية "{date}"؟',
    no_reconciliations: 'لا توجد تسوية بعد. ابدأ بإضافة تسوية جديدة!',
    open: 'مفتوح',
    closed: 'مغلق',
    back_to_agenda: 'العودة للأجندة',
    day_total: 'إجمالي اليوم',
    items_count: 'عدد المنتجات',
    create_for_date: 'إنشاء تسوية لهذا التاريخ',
    select_date_first: 'يرجى اختيار تاريخ أولاً',

    // Products Screen
    no_products_found: 'لم يتم العثور على منتجات. ابدأ بإضافة منتج!',
    cost_buying: 'التكلفة (شراء)',
    retail_selling: 'البيع (تجزئة)',
    profit_margin: 'هامش الربح',
    edit_product: 'تعديل المنتج',
    add_new_product: 'إضافة منتج جديد',
    product_name: 'اسم المنتج',
    save_product: 'حفظ المنتج',
    delete_product: 'حذف المنتج',
    delete_confirm: 'هل أنت متأكد أنك تريد حذف "{name}"؟ لن يؤثر هذا على السجلات اليومية السابقة.',
    cancel: 'إلغاء',
    delete: 'حذف',
    stack_price: 'سعر الكرتونة (شراء)',
    stack_quantity: 'العدد في الكرتونة',
    profit_per_stack: 'ربح الكرتونة',

    // Settings
    language: 'اللغة',
    language_ar: 'العربية',
    language_fr: 'Français',
    language_en: 'English',

    // Alerts & Errors
    validation_error: 'خطأ في التحقق',
    name_required: 'اسم المنتج مطلوب.',
    cost_required: 'يجب أن تكون تكلفة الشراء رقماً صالحاً غير سالب.',
    sell_required: 'يجب أن يكون سعر البيع رقماً صالحاً غير سالب.',
    stack_price_required: 'يجب أن يكون سعر الكرتونة رقماً صالحاً غير سالب.',
    stack_quantity_required: 'يجب أن يكون عدد في الكرتونة رقماً صحيحاً موجباً.',
    db_error: 'خطأ في قاعدة البيانات',
    could_not_save: 'تعذر حفظ المنتج.',
    could_not_delete: 'تعذر حذف المنتج.',
    integrity_error: 'خطأ في التكامل',
    integrity_desc: 'لا يمكن أن يكون المخزون الختامي أكبر من المخزون الافتتاحي.\n\nيرجى إصلاح المخزون الختامي لـ: {names}',
    save_close_confirm_title: 'حفظ وإغلاق اليوم',
    save_close_confirm_desc: 'هل أنت متأكد أنك تريد حفظ وإغلاق وقفل سجل اليوم؟ سيؤدي هذا الإجراء إلى حفظ البيانات النهائية وتشغيل مزامنة Google Sheets.',
    discard_confirm_title: 'إلغاء اليوم',
    discard_confirm_desc: 'هل أنت متأكد أنك تريد إلغاء جميع مدخلات الجلسة الحالية؟ سيؤدي هذا إلى مسح بيانات اليوم وإعادة ضبط الشاشة دون حفظ.',
    success: 'نجاح',
    sync_success: 'تم إغلاق السجل ومزامنته بنجاح مع Google Sheets!',
    sync_failed: 'تم إغلاق السجل محلياً، لكن فشلت مزامنة Google Sheets. ستتم المزامنة عند توفر الاتصال.',
    locked_success: 'تم إغلاق وقفل السجل بنجاح.',
    could_not_load_register: 'تعذر تحميل سجل اليوم.',
    could_not_start_register: 'تعذر بدء السجل لليوم.',
    could_not_close_day: 'حدث خطأ أثناء إغلاق اليوم.',
    could_not_discard: 'تعذر إلغاء السجل.',
    could_not_load_products: 'تعذر تحميل المنتجات.',
  },
  fr: {
    // Tabs & Navigation
    active_day: 'Jour actif',
    daily_reconciliation: 'Réconciliation quotidienne',
    products: 'Produits',
    product_inventory: 'Inventaire des produits',
    history: 'Historique',
    closed_registers: 'Registres clôturés',
    settings: 'Paramètres',
    settings_cloud: 'Paramètres et sauvegarde cloud',

    // Dashboard / Active Day
    start_new_day: 'Commencer une nouvelle journée',
    today_date: "Date d'aujourd'hui",
    no_session_desc: "Aucune session active ouverte pour aujourd'hui. Prêt à commencer le comptage et enregistrer les ventes ?",
    active_session: 'Session active',
    closed_locked: 'Clôturé et verrouillé',
    daily_counts: 'Comptage quotidien',
    update_stock_desc: 'Mettez à jour le stock initial et final ci-dessous.',
    no_products: "Aucun produit actif dans le catalogue !",
    add_products_hint: 'Veuillez ajouter des produits dans l\'onglet "Produits" pour commencer le suivi quotidien.',
    opening_stock: 'Stock initial',
    closing_stock: 'Stock final',
    sold: 'Vendu',
    rev: 'Revenu',
    cost: 'Coût',
    stock_error: 'Erreur de stock',
    closing_gt_opening: 'Final > Initial',
    financials_cash: 'Finances et caisse',
    total_expenses: 'Total des dépenses',
    actual_cash_drawer: 'Espèces réelles en caisse',
    expected_revenue: 'Revenu total attendu',
    expenses_today: "Dépenses (aujourd'hui)",
    expected_cash_register: 'Espèces attendues en caisse',
    net_profit: 'Bénéfice net (Ventes - Coûts - Dépenses)',
    drawer_discrepancy: 'Écart de caisse',
    perfect_match: 'Correspondance parfaite',
    cash_surplus: 'Surplus de caisse',
    cash_shortage: 'Déficit de caisse',
    discard_day: 'Annuler la journée',
    save_close_day: 'Enregistrer et clôturer',

    // Agenda
    agenda: 'Agenda',
    agenda_subtitle: 'Sélectionnez une date pour afficher ou modifier la réconciliation',
    new_reconciliation: 'Nouvelle réconciliation',
    edit_reconciliation: 'Modifier la réconciliation',
    delete_reconciliation: 'Supprimer la réconciliation',
    delete_reconciliation_confirm: 'Êtes-vous sûr de vouloir supprimer la réconciliation du "{date}" ?',
    no_reconciliations: 'Aucune réconciliation. Commencez par en ajouter une !',
    open: 'Ouvert',
    closed: 'Clôturé',
    back_to_agenda: "Retour à l'agenda",
    day_total: 'Total du jour',
    items_count: 'Nombre de produits',
    create_for_date: 'Créer une réconciliation pour cette date',
    select_date_first: 'Veuillez d\'abord sélectionner une date',

    // Products Screen
    no_products_found: "Aucun produit trouvé. Commencez par ajouter un produit !",
    cost_buying: 'Coût (achat)',
    retail_selling: 'Vente (détail)',
    profit_margin: 'Marge bénéficiaire',
    edit_product: 'Modifier le produit',
    add_new_product: 'Ajouter un nouveau produit',
    product_name: 'Nom du produit',
    save_product: 'Enregistrer le produit',
    delete_product: 'Supprimer le produit',
    delete_confirm: 'Êtes-vous sûr de vouloir supprimer "{name}" ? Cela n\'affectera pas les registres quotidiens précédents.',
    cancel: 'Annuler',
    delete: 'Supprimer',
    stack_price: 'Prix du carton (achat)',
    stack_quantity: 'Quantité par carton',
    profit_per_stack: 'Bénéfice par carton',

    // Settings
    language: 'Langue',
    language_ar: 'العربية',
    language_fr: 'Français',
    language_en: 'English',

    // Alerts & Errors
    validation_error: 'Erreur de validation',
    name_required: 'Le nom du produit est requis.',
    cost_required: 'Le coût d\'achat doit être un nombre valide non négatif.',
    sell_required: 'Le prix de vente doit être un nombre valide non négatif.',
    stack_price_required: 'Le prix du carton doit être un nombre valide non négatif.',
    stack_quantity_required: 'La quantité par carton doit être un entier positif.',
    db_error: 'Erreur de base de données',
    could_not_save: 'Impossible d\'enregistrer le produit.',
    could_not_delete: 'Impossible de supprimer le produit.',
    integrity_error: 'Erreur d\'intégrité',
    integrity_desc: 'Le stock final ne peut pas être supérieur au stock initial.\n\nVeuillez corriger le stock final pour : {names}',
    save_close_confirm_title: 'Enregistrer et clôturer la journée',
    save_close_confirm_desc: 'Êtes-vous sûr de vouloir enregistrer, clôturer et verrouiller le registre du jour ? Cette action sauvegardera les données finales et déclenchera la synchronisation Google Sheets.',
    discard_confirm_title: 'Annuler la journée',
    discard_confirm_desc: 'Êtes-vous sûr de vouloir annuler toutes les entrées de la session actuelle ? Cela effacera les données du jour et réinitialisera l\'écran sans enregistrer.',
    success: 'Succès',
    sync_success: 'Registre clôturé et synchronisé avec Google Sheets !',
    sync_failed: 'Registre clôturé localement, mais la synchronisation Google Sheets a échoué. Elle se fera dès que la connexion sera disponible.',
    locked_success: 'Registre clôturé et verrouillé avec succès.',
    could_not_load_register: 'Impossible de charger le registre du jour.',
    could_not_start_register: 'Impossible de démarrer le registre pour aujourd\'hui.',
    could_not_close_day: 'Une erreur s\'est produite lors de la clôture de la journée.',
    could_not_discard: 'Impossible d\'annuler le registre.',
    could_not_load_products: 'Impossible de charger les produits.',
  },
  en: {
    // Tabs & Navigation
    active_day: 'Active Day',
    daily_reconciliation: 'Daily Reconciliation',
    products: 'Products',
    product_inventory: 'Product Inventory',
    history: 'History',
    closed_registers: 'Closed Registers',
    settings: 'Settings',
    settings_cloud: 'Settings & Cloud Backup',

    // Dashboard / Active Day
    start_new_day: 'Start New Day',
    today_date: "Today's Date",
    no_session_desc: "No active session open for today. Ready to start counting and recording sales?",
    active_session: 'Active Session',
    closed_locked: 'Closed & Locked',
    daily_counts: 'Daily Counts',
    update_stock_desc: 'Update opening and closing stock below.',
    no_products: 'No active products in catalog!',
    add_products_hint: 'Please add products in the "Products" tab to start daily tracking.',
    opening_stock: 'Opening Stock',
    closing_stock: 'Closing Stock',
    sold: 'Sold',
    rev: 'Revenue',
    cost: 'Cost',
    stock_error: 'Stock Error',
    closing_gt_opening: 'Closing > Opening',
    financials_cash: 'Finances & Cash Drawer',
    total_expenses: 'Total Expenses',
    actual_cash_drawer: 'Actual Cash in Drawer',
    expected_revenue: 'Expected Total Revenue',
    expenses_today: 'Expenses (Today)',
    expected_cash_register: 'Expected Cash in Register',
    net_profit: 'Net Profit (Sales - Costs - Expenses)',
    drawer_discrepancy: 'Drawer Discrepancy',
    perfect_match: 'Perfect Match',
    cash_surplus: 'Cash Surplus',
    cash_shortage: 'Cash Shortage',
    discard_day: 'Discard Day',
    save_close_day: 'Save & Close Day',

    // Agenda
    agenda: 'Agenda',
    agenda_subtitle: 'Select a date to view or edit reconciliation',
    new_reconciliation: 'New Reconciliation',
    edit_reconciliation: 'Edit Reconciliation',
    delete_reconciliation: 'Delete Reconciliation',
    delete_reconciliation_confirm: 'Are you sure you want to delete the reconciliation for "{date}"?',
    no_reconciliations: 'No reconciliations yet. Start by adding one!',
    open: 'Open',
    closed: 'Closed',
    back_to_agenda: 'Back to Agenda',
    day_total: 'Day Total',
    items_count: 'Products Count',
    create_for_date: 'Create Reconciliation for this Date',
    select_date_first: 'Please select a date first',

    // Products Screen
    no_products_found: 'No products found. Start by adding a product!',
    cost_buying: 'Cost (Buying)',
    retail_selling: 'Selling (Retail)',
    profit_margin: 'Profit Margin',
    edit_product: 'Edit Product',
    add_new_product: 'Add New Product',
    product_name: 'Product Name',
    save_product: 'Save Product',
    delete_product: 'Delete Product',
    delete_confirm: 'Are you sure you want to delete "{name}"? This will not affect previous daily records.',
    cancel: 'Cancel',
    delete: 'Delete',
    stack_price: 'Stack Price (Buying)',
    stack_quantity: 'Quantity per Stack',
    profit_per_stack: 'Profit per Stack',

    // Settings
    language: 'Language',
    language_ar: 'العربية',
    language_fr: 'Français',
    language_en: 'English',

    // Alerts & Errors
    validation_error: 'Validation Error',
    name_required: 'Product name is required.',
    cost_required: 'Cost price must be a valid non-negative number.',
    sell_required: 'Selling price must be a valid non-negative number.',
    stack_price_required: 'Stack price must be a valid non-negative number.',
    stack_quantity_required: 'Stack quantity must be a positive integer.',
    db_error: 'Database Error',
    could_not_save: 'Could not save product.',
    could_not_delete: 'Could not delete product.',
    integrity_error: 'Integrity Error',
    integrity_desc: 'Closing stock cannot be greater than opening stock.\n\nPlease fix closing stock for: {names}',
    save_close_confirm_title: 'Save & Close Day',
    save_close_confirm_desc: 'Are you sure you want to save, close and lock the day register? This will save final data and trigger Google Sheets sync.',
    discard_confirm_title: 'Discard Day',
    discard_confirm_desc: 'Are you sure you want to discard all current session entries? This will clear the day data and reset the screen without saving.',
    success: 'Success',
    sync_success: 'Register closed and synced successfully to Google Sheets!',
    sync_failed: 'Register closed locally, but Google Sheets sync failed. It will sync when connection is available.',
    locked_success: 'Register closed and locked successfully.',
    could_not_load_register: 'Could not load today\'s register.',
    could_not_start_register: 'Could not start register for today.',
    could_not_close_day: 'An error occurred while closing the day.',
    could_not_discard: 'Could not discard register.',
    could_not_load_products: 'Could not load products.',
  },
};

export type TranslationKey = keyof typeof translations.ar;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string>) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ar');

  useEffect(() => {
    const saved = getSetting('app_language') as Language;
    if (saved && translations[saved]) {
      setLanguageState(saved);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    setSetting('app_language', lang);
  };

  const t = (key: TranslationKey, params?: Record<string, string>): string => {
    let text = translations[language][key] || translations.ar[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, v);
      });
    }
    return text;
  };

  const isRTL = language === 'ar';

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

export const CURRENCY_MAP: Record<Language, string> = {
  ar: 'د.ت',
  fr: 'TND',
  en: 'TND',
};

export function getCurrency(lang: Language): string {
  return CURRENCY_MAP[lang];
}
