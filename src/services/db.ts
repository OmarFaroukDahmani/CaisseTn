import * as SQLite from 'expo-sqlite';

// Open the database synchronously
const DB_NAME = 'hsabi.db';
let db: SQLite.SQLiteDatabase;

export interface Product {
  id: number;
  name: string;
  cost_price: number;
  selling_price: number;
  stack_price: number;
  stack_quantity: number;
  cost_per_box?: number;
  units_per_box?: number;
  unit_cost?: number;
  current_unit_stock?: number;
  low_stock_threshold?: number;
  is_deleted: number; // 0 or 1
}

export interface DailyRegister {
  id: number;
  date: string; // YYYY-MM-DD
  expenses: number;
  actual_cash: number;
  is_closed: number; // 0 or 1
}

export interface RegisterItem {
  id: number;
  register_id: number;
  product_id: number;
  opening_count: number;
  closing_count: number;
  // Join fields
  product_name?: string;
  cost_price?: number;
  selling_price?: number;
}

export interface FullRegisterDetails {
  register: DailyRegister;
  items: RegisterItem[];
}

export type PaymentMethod = 'CASH' | 'CARD' | 'MOBILE_PAYMENT' | 'DELIVERY_APP';
export type CashAdjustmentType = 'PAYOUT' | 'DROP';
export type StockStatus = 'OK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface Shift {
  id: number;
  user_id: string;
  start_time: string;
  end_time: string | null;
  starting_float: number;
  closing_cash_actual: number | null;
  closing_cash_expected: number | null;
  status: 'OPEN' | 'CLOSED';
}

export interface InventoryItem {
  id: number;
  name: string;
  cost_per_box: number;
  units_per_box: number;
  unit_cost: number;
  current_unit_stock: number;
  low_stock_threshold: number;
  stock_status: StockStatus;
}

export interface OrderLineInput {
  productId: number;
  quantity: number;
  modifiers?: { name: string; additionalCost: number }[];
}

export interface OrderPaymentInput {
  paymentMethod: PaymentMethod;
  amount: number;
}

export interface ZReport {
  grossRevenue: number;
  netRevenue: number;
  taxTotal: number;
  taxBreakdown: { tax_rate: number; taxable_amount: number; tax_amount: number }[];
  salesByPaymentType: { payment_method: PaymentMethod; amount: number }[];
  topItems: {
    product_id: number;
    product_name: string;
    quantity_sold: number;
    revenue: number;
    profit: number;
    margin_percent: number;
  }[];
  peakHours: { hour: number; sales_total: number; order_count: number }[];
  cashDrawerDiscrepancy: number;
  expectedCash: number;
  actualCash: number | null;
}

/**
 * Initialize database tables
 */
export function initDatabase(): void {
  try {
    db = SQLite.openDatabaseSync(DB_NAME);
    
    // Enable foreign keys
    db.execSync('PRAGMA foreign_keys = ON;');

    // Create tables
    db.execSync(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        cost_price REAL NOT NULL,
        selling_price REAL NOT NULL,
        stack_price REAL DEFAULT 0,
        stack_quantity INTEGER DEFAULT 1,
        is_deleted INTEGER DEFAULT 0
      );
    `);

    // Migration: add stack columns if missing (for existing databases)
    try {
      db.execSync('ALTER TABLE products ADD COLUMN stack_price REAL DEFAULT 0;');
    } catch {}
    try {
      db.execSync('ALTER TABLE products ADD COLUMN stack_quantity INTEGER DEFAULT 1;');
    } catch {}
    addColumnIfMissing('products', 'cost_per_box', 'REAL NOT NULL DEFAULT 0');
    addColumnIfMissing('products', 'units_per_box', 'INTEGER NOT NULL DEFAULT 1');
    addColumnIfMissing('products', 'unit_cost', 'REAL NOT NULL DEFAULT 0');
    addColumnIfMissing('products', 'current_unit_stock', 'REAL NOT NULL DEFAULT 0');
    addColumnIfMissing('products', 'low_stock_threshold', 'REAL NOT NULL DEFAULT 0');
    db.execSync(`
      UPDATE products
      SET cost_per_box = CASE WHEN cost_per_box = 0 THEN stack_price ELSE cost_per_box END,
          units_per_box = CASE WHEN units_per_box <= 1 THEN MAX(stack_quantity, 1) ELSE units_per_box END,
          unit_cost = CASE WHEN unit_cost = 0 THEN cost_price ELSE unit_cost END;
    `);

    db.execSync(`
      CREATE TABLE IF NOT EXISTS daily_registers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        expenses REAL DEFAULT 0,
        actual_cash REAL DEFAULT 0,
        is_closed INTEGER DEFAULT 0
      );
    `);

    db.execSync(`
      CREATE TABLE IF NOT EXISTS register_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        register_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        opening_count INTEGER NOT NULL DEFAULT 0,
        closing_count INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (register_id) REFERENCES daily_registers(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      );
    `);

    db.execSync(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    db.execSync(`
      CREATE TABLE IF NOT EXISTS shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT 'local',
        start_time TEXT NOT NULL,
        end_time TEXT,
        starting_float REAL NOT NULL CHECK (starting_float >= 0),
        closing_cash_actual REAL CHECK (closing_cash_actual >= 0),
        closing_cash_expected REAL,
        status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift_per_user
        ON shifts(user_id) WHERE status = 'OPEN';

      CREATE TABLE IF NOT EXISTS cash_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shift_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('PAYOUT', 'DROP')),
        amount REAL NOT NULL CHECK (amount > 0),
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS inventory_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        cost_per_box REAL NOT NULL CHECK (cost_per_box >= 0),
        units_per_box REAL NOT NULL CHECK (units_per_box > 0),
        unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
        current_unit_stock REAL NOT NULL DEFAULT 0 CHECK (current_unit_stock >= 0),
        low_stock_threshold REAL NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0)
      );

      CREATE TABLE IF NOT EXISTS recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        inventory_item_id INTEGER NOT NULL,
        quantity_used REAL NOT NULL CHECK (quantity_used > 0),
        UNIQUE (product_id, inventory_item_id),
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shift_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        subtotal REAL NOT NULL CHECK (subtotal >= 0),
        tax_rate REAL NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
        tax_amount REAL NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
        total REAL NOT NULL CHECK (total >= 0),
        status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'VOIDED')),
        FOREIGN KEY (shift_id) REFERENCES shifts(id)
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price REAL NOT NULL CHECK (unit_price >= 0),
        unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
        modifiers_json TEXT NOT NULL DEFAULT '[]',
        line_total REAL NOT NULL CHECK (line_total >= 0),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      );

      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'CARD', 'MOBILE_PAYMENT', 'DELIVERY_APP')),
        amount REAL NOT NULL CHECK (amount > 0),
        created_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      );
    `);

    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }
}

function addColumnIfMissing(table: string, column: string, definition: string): void {
  const columns = getDB().getAllSync<{ name: string }>(`PRAGMA table_info(${table});`);
  if (!columns.some((item) => item.name === column)) {
    getDB().execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

/**
 * Get active database instance
 */
function getDB(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DB_NAME);
  }
  return db;
}

// ==========================================
// PRODUCTS CRUD OPERATIONS
// ==========================================

export function getProducts(): Product[] {
  const sqlite = getDB();
  return sqlite.getAllSync<Product>('SELECT * FROM products WHERE is_deleted = 0 ORDER BY name ASC;');
}

export function createProduct(name: string, costPrice: number, sellingPrice: number, stackPrice: number, stackQuantity: number): void {
  const sqlite = getDB();
  sqlite.runSync(
    'INSERT INTO products (name, cost_price, selling_price, stack_price, stack_quantity, cost_per_box, units_per_box, unit_cost, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0);',
    [name, costPrice, sellingPrice, stackPrice, stackQuantity, stackPrice, stackQuantity, costPrice]
  );
}

export function updateProduct(id: number, name: string, costPrice: number, sellingPrice: number, stackPrice: number, stackQuantity: number): void {
  const sqlite = getDB();
  sqlite.runSync(
    'UPDATE products SET name = ?, cost_price = ?, selling_price = ?, stack_price = ?, stack_quantity = ?, cost_per_box = ?, units_per_box = ?, unit_cost = ? WHERE id = ?;',
    [name, costPrice, sellingPrice, stackPrice, stackQuantity, stackPrice, stackQuantity, costPrice, id]
  );
}

export function deleteProduct(id: number): void {
  const sqlite = getDB();
  // Soft delete so history remains intact
  sqlite.runSync('UPDATE products SET is_deleted = 1 WHERE id = ?;', [id]);
}

// ==========================================
// DAILY REGISTER & ITEMS OPERATIONS
// ==========================================

export function getActiveRegisterForDate(date: string): DailyRegister | null {
  const sqlite = getDB();
  return sqlite.getFirstSync<DailyRegister>(
    'SELECT * FROM daily_registers WHERE date = ?;',
    [date]
  );
}

export function startNewDay(date: string): DailyRegister {
  const sqlite = getDB();
  
  // Start transactional insertion
  sqlite.runSync('INSERT OR IGNORE INTO daily_registers (date, expenses, actual_cash, is_closed) VALUES (?, 0, 0, 0);', [date]);
  
  const register = sqlite.getFirstSync<DailyRegister>('SELECT * FROM daily_registers WHERE date = ?;', [date])!;
  
  // Populate current products that are not deleted into register_items if they are not already populated
  const activeProducts = sqlite.getAllSync<Product>('SELECT * FROM products WHERE is_deleted = 0;');
  
  for (const product of activeProducts) {
    sqlite.runSync(
      'INSERT OR IGNORE INTO register_items (register_id, product_id, opening_count, closing_count) SELECT ?, ?, 0, 0 WHERE NOT EXISTS (SELECT 1 FROM register_items WHERE register_id = ? AND product_id = ?);',
      [register.id, product.id, register.id, product.id]
    );
  }

  return register;
}

export function getRegisterItems(registerId: number): RegisterItem[] {
  const sqlite = getDB();
  return sqlite.getAllSync<RegisterItem>(
    `SELECT ri.*, p.name as product_name, p.cost_price, p.selling_price 
     FROM register_items ri
     JOIN products p ON ri.product_id = p.id
     WHERE ri.register_id = ?;`,
    [registerId]
  );
}

export function updateRegisterItem(itemId: number, openingCount: number, closingCount: number): void {
  const sqlite = getDB();
  sqlite.runSync(
    'UPDATE register_items SET opening_count = ?, closing_count = ? WHERE id = ?;',
    [openingCount, closingCount, itemId]
  );
}

export function updateRegisterFinancials(registerId: number, expenses: number, actualCash: number): void {
  const sqlite = getDB();
  sqlite.runSync(
    'UPDATE daily_registers SET expenses = ?, actual_cash = ? WHERE id = ?;',
    [expenses, actualCash, registerId]
  );
}

export function closeRegister(registerId: number): void {
  const sqlite = getDB();
  sqlite.runSync('UPDATE daily_registers SET is_closed = 1 WHERE id = ?;', [registerId]);
}

export function reopenRegister(registerId: number): void {
  const sqlite = getDB();
  sqlite.runSync('UPDATE daily_registers SET is_closed = 0 WHERE id = ?;', [registerId]);
}

export function discardRegister(registerId: number): void {
  const sqlite = getDB();
  sqlite.runSync('DELETE FROM daily_registers WHERE id = ?;', [registerId]);
}

export function addProductToRegister(registerId: number, productId: number): void {
  const sqlite = getDB();
  sqlite.runSync(
    'INSERT OR IGNORE INTO register_items (register_id, product_id, opening_count, closing_count) VALUES (?, ?, 0, 0);',
    [registerId, productId]
  );
}

export function removeProductFromRegister(itemId: number): void {
  const sqlite = getDB();
  sqlite.runSync('DELETE FROM register_items WHERE id = ?;', [itemId]);
}

export function getAllRegisters(): DailyRegister[] {
  const sqlite = getDB();
  return sqlite.getAllSync<DailyRegister>('SELECT * FROM daily_registers ORDER BY date DESC;');
}

export function getRegisterHistory(): DailyRegister[] {
  const sqlite = getDB();
  return sqlite.getAllSync<DailyRegister>('SELECT * FROM daily_registers ORDER BY date DESC;');
}

export function getRegisterDetails(registerId: number): FullRegisterDetails | null {
  const sqlite = getDB();
  const register = sqlite.getFirstSync<DailyRegister>('SELECT * FROM daily_registers WHERE id = ?;', [registerId]);
  if (!register) return null;
  const items = getRegisterItems(registerId);
  return { register, items };
}

export function updateRegisterDate(registerId: number, newDate: string): void {
  const sqlite = getDB();
  sqlite.runSync('UPDATE daily_registers SET date = ? WHERE id = ?;', [newDate, registerId]);
}

// ==========================================
// SETTINGS OPERATIONS
// ==========================================

export function getSetting(key: string, defaultValue: string | null = null): string | null {
  const sqlite = getDB();
  const row = sqlite.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?;', [key]);
  return row ? row.value : defaultValue;
}

export function setSetting(key: string, value: string): void {
  const sqlite = getDB();
  sqlite.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);', [key, value]);
}

export function deleteSetting(key: string): void {
  const sqlite = getDB();
  sqlite.runSync('DELETE FROM settings WHERE key = ?;', [key]);
}

function requirePositive(value: number, label: string, allowZero = false): void {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`${label} must be a finite ${allowZero ? 'non-negative' : 'positive'} number.`);
  }
}

function localTimestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export function getOpenShift(userId = 'local'): Shift | null {
  return getDB().getFirstSync<Shift>(
    "SELECT * FROM shifts WHERE user_id = ? AND status = 'OPEN';",
    [userId]
  );
}

export function startShift(startingFloat: number, userId = 'local'): Shift {
  requirePositive(startingFloat, 'Starting float', true);
  const sqlite = getDB();
  if (getOpenShift(userId)) {
    throw new Error('This staff member already has an open shift.');
  }
  sqlite.runSync(
    "INSERT INTO shifts (user_id, start_time, starting_float, status) VALUES (?, ?, ?, 'OPEN');",
    [userId, localTimestamp(), startingFloat]
  );
  return getOpenShift(userId)!;
}

export function getShiftExpectedCash(shiftId: number): number {
  const row = getDB().getFirstSync<{ amount: number }>(
    `SELECT s.starting_float
      + COALESCE((SELECT SUM(p.amount) FROM payments p JOIN orders o ON o.id = p.order_id
        WHERE o.shift_id = s.id AND o.status = 'COMPLETED' AND p.payment_method = 'CASH'), 0)
      - COALESCE((SELECT SUM(c.amount) FROM cash_adjustments c
        WHERE c.shift_id = s.id AND c.type IN ('PAYOUT', 'DROP')), 0) AS amount
     FROM shifts s WHERE s.id = ?;`,
    [shiftId]
  );
  if (!row) throw new Error('Shift was not found.');
  return row.amount;
}

export function addCashAdjustment(
  shiftId: number,
  type: CashAdjustmentType,
  amount: number,
  reason: string
): void {
  requirePositive(amount, 'Adjustment amount');
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error('A reason is required for a cash adjustment.');
  if (type !== 'PAYOUT' && type !== 'DROP') throw new Error('Invalid cash adjustment type.');
  const shift = getDB().getFirstSync<{ status: string }>('SELECT status FROM shifts WHERE id = ?;', [shiftId]);
  if (!shift || shift.status !== 'OPEN') throw new Error('Cash adjustments require an open shift.');
  getDB().runSync(
    'INSERT INTO cash_adjustments (shift_id, type, amount, reason, created_at) VALUES (?, ?, ?, ?, ?);',
    [shiftId, type, amount, cleanReason, localTimestamp()]
  );
}

export function closeShift(shiftId: number, actualCash: number): { expectedCash: number; variance: number } {
  requirePositive(actualCash, 'Counted cash', true);
  const sqlite = getDB();
  let expectedCash = 0;
  sqlite.withTransactionSync(() => {
    const shift = sqlite.getFirstSync<Shift>('SELECT * FROM shifts WHERE id = ?;', [shiftId]);
    if (!shift || shift.status !== 'OPEN') throw new Error('Only an open shift can be closed.');
    expectedCash = getShiftExpectedCash(shiftId);
    sqlite.runSync(
      "UPDATE shifts SET end_time = ?, closing_cash_actual = ?, closing_cash_expected = ?, status = 'CLOSED' WHERE id = ?;",
      [localTimestamp(), actualCash, expectedCash, shiftId]
    );
  });
  return { expectedCash, variance: actualCash - expectedCash };
}

export function getInventoryItems(): InventoryItem[] {
  return getDB().getAllSync<InventoryItem>(
    `SELECT *,
       CASE WHEN current_unit_stock <= 0 THEN 'OUT_OF_STOCK'
            WHEN current_unit_stock <= low_stock_threshold THEN 'LOW_STOCK'
            ELSE 'OK' END AS stock_status
     FROM inventory_items ORDER BY name COLLATE NOCASE;`
  );
}

export function createInventoryItem(
  name: string,
  costPerBox: number,
  unitsPerBox: number,
  currentUnitStock: number,
  lowStockThreshold: number
): void {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Inventory item name is required.');
  requirePositive(costPerBox, 'Cost per box', true);
  requirePositive(unitsPerBox, 'Units per box');
  requirePositive(currentUnitStock, 'Current stock', true);
  requirePositive(lowStockThreshold, 'Low-stock threshold', true);
  getDB().runSync(
    `INSERT INTO inventory_items
      (name, cost_per_box, units_per_box, unit_cost, current_unit_stock, low_stock_threshold)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [cleanName, costPerBox, unitsPerBox, costPerBox / unitsPerBox, currentUnitStock, lowStockThreshold]
  );
}

export function updateInventoryItem(
  id: number,
  name: string,
  costPerBox: number,
  unitsPerBox: number,
  currentUnitStock: number,
  lowStockThreshold: number
): void {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Inventory item name is required.');
  requirePositive(costPerBox, 'Cost per box', true);
  requirePositive(unitsPerBox, 'Units per box');
  requirePositive(currentUnitStock, 'Current stock', true);
  requirePositive(lowStockThreshold, 'Low-stock threshold', true);
  getDB().runSync(
    `UPDATE inventory_items SET name = ?, cost_per_box = ?, units_per_box = ?,
      unit_cost = ?, current_unit_stock = ?, low_stock_threshold = ? WHERE id = ?;`,
    [cleanName, costPerBox, unitsPerBox, costPerBox / unitsPerBox, currentUnitStock, lowStockThreshold, id]
  );
}

export function setRecipeIngredient(productId: number, inventoryItemId: number, quantityUsed: number): void {
  requirePositive(quantityUsed, 'Recipe quantity');
  getDB().runSync(
    `INSERT INTO recipes (product_id, inventory_item_id, quantity_used) VALUES (?, ?, ?)
     ON CONFLICT(product_id, inventory_item_id) DO UPDATE SET quantity_used = excluded.quantity_used;`,
    [productId, inventoryItemId, quantityUsed]
  );
}

export function removeRecipeIngredient(productId: number, inventoryItemId: number): void {
  getDB().runSync('DELETE FROM recipes WHERE product_id = ? AND inventory_item_id = ?;', [productId, inventoryItemId]);
}

export function getRecipeIngredients(productId: number): (InventoryItem & { quantity_used: number })[] {
  return getDB().getAllSync<InventoryItem & { quantity_used: number }>(
    `SELECT i.*, r.quantity_used,
       CASE WHEN i.current_unit_stock <= 0 THEN 'OUT_OF_STOCK'
            WHEN i.current_unit_stock <= i.low_stock_threshold THEN 'LOW_STOCK'
            ELSE 'OK' END AS stock_status
     FROM recipes r JOIN inventory_items i ON i.id = r.inventory_item_id
     WHERE r.product_id = ? ORDER BY i.name COLLATE NOCASE;`,
    [productId]
  );
}

export function createOrder(
  shiftId: number,
  lines: OrderLineInput[],
  payments: OrderPaymentInput[],
  taxRate = 0
): { orderId: number; total: number; taxAmount: number } {
  if (lines.length === 0) throw new Error('Add at least one item to the order.');
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) throw new Error('Tax rate must be between 0 and 1.');
  if (payments.length === 0) throw new Error('At least one payment is required.');
  const methods: PaymentMethod[] = ['CASH', 'CARD', 'MOBILE_PAYMENT', 'DELIVERY_APP'];
  for (const payment of payments) {
    if (!methods.includes(payment.paymentMethod)) throw new Error('Invalid payment method.');
    requirePositive(payment.amount, 'Payment amount');
  }

  const sqlite = getDB();
  let result = { orderId: 0, total: 0, taxAmount: 0 };
  sqlite.withTransactionSync(() => {
    const shift = sqlite.getFirstSync<Shift>('SELECT * FROM shifts WHERE id = ?;', [shiftId]);
    if (!shift || shift.status !== 'OPEN') throw new Error('Orders require an open shift.');

    const orderLines = lines.map((line) => {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new Error('Item quantities must be positive whole numbers.');
      }
      const product = sqlite.getFirstSync<Product>(
        'SELECT * FROM products WHERE id = ? AND is_deleted = 0;',
        [line.productId]
      );
      if (!product) throw new Error('A selected product is unavailable.');
      for (const modifier of line.modifiers || []) {
        if (!modifier.name.trim()) throw new Error('Modifier names cannot be empty.');
        requirePositive(modifier.additionalCost, 'Modifier price', true);
      }
      const modifierTotal = (line.modifiers || []).reduce((sum, modifier) => sum + modifier.additionalCost, 0);
      const unitPrice = Math.round((product.selling_price + modifierTotal) * 1000) / 1000;
      return {
        ...line,
        product,
        unitPrice,
        lineTotal: Math.round(unitPrice * line.quantity * 1000) / 1000,
        modifiers: line.modifiers || [],
      };
    });
    const subtotal = Math.round(orderLines.reduce((sum, line) => sum + line.lineTotal, 0) * 1000) / 1000;
    const taxAmount = Math.round(subtotal * taxRate * 1000) / 1000;
    const total = Math.round((subtotal + taxAmount) * 1000) / 1000;
    const paid = Math.round(payments.reduce((sum, payment) => sum + payment.amount, 0) * 1000) / 1000;
    if (Math.round(paid * 1000) !== Math.round(total * 1000)) {
      throw new Error(`Payments (${paid.toFixed(3)}) must equal the order total (${total.toFixed(3)}).`);
    }

    const requiredIngredients = new Map<number, number>();
    for (const line of orderLines) {
      const recipe = sqlite.getAllSync<{ inventory_item_id: number; quantity_used: number }>(
        'SELECT inventory_item_id, quantity_used FROM recipes WHERE product_id = ?;',
        [line.productId]
      );
      for (const ingredient of recipe) {
        requiredIngredients.set(
          ingredient.inventory_item_id,
          (requiredIngredients.get(ingredient.inventory_item_id) || 0) + ingredient.quantity_used * line.quantity
        );
      }
    }
    for (const [ingredientId, required] of requiredIngredients) {
      const ingredient = sqlite.getFirstSync<{ name: string; current_unit_stock: number }>(
        'SELECT name, current_unit_stock FROM inventory_items WHERE id = ?;',
        [ingredientId]
      );
      if (!ingredient || ingredient.current_unit_stock < required) {
        throw new Error(`Not enough stock for ${ingredient?.name || 'a recipe ingredient'}.`);
      }
    }

    sqlite.runSync(
      `INSERT INTO orders (shift_id, created_at, subtotal, tax_rate, tax_amount, total, status)
       VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED');`,
      [shiftId, localTimestamp(), subtotal, taxRate, taxAmount, total]
    );
    const orderId = sqlite.getFirstSync<{ id: number }>('SELECT last_insert_rowid() AS id;')!.id;
    for (const line of orderLines) {
      sqlite.runSync(
        `INSERT INTO order_items
          (order_id, product_id, product_name, quantity, unit_price, unit_cost, modifiers_json, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          orderId,
          line.productId,
          line.product.name,
          line.quantity,
          line.unitPrice,
          line.product.unit_cost ?? line.product.cost_price,
          JSON.stringify(line.modifiers),
          line.lineTotal,
        ]
      );
    }
    for (const [ingredientId, required] of requiredIngredients) {
      sqlite.runSync(
        'UPDATE inventory_items SET current_unit_stock = current_unit_stock - ? WHERE id = ?;',
        [required, ingredientId]
      );
    }
    const createdAt = localTimestamp();
    for (const payment of payments) {
      sqlite.runSync(
        'INSERT INTO payments (order_id, payment_method, amount, created_at) VALUES (?, ?, ?, ?);',
        [orderId, payment.paymentMethod, payment.amount, createdAt]
      );
    }
    result = { orderId, total, taxAmount };
  });
  return result;
}

export function getZReport(date: string): ZReport {
  const parsedDate = new Date(`${date}T00:00:00`);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
    && !Number.isNaN(parsedDate.getTime())
    && `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}` === date;
  if (!validDate) {
    throw new Error('Report date must use YYYY-MM-DD format.');
  }
  const sqlite = getDB();
  const total = sqlite.getFirstSync<{ gross: number; net: number; tax: number }>(
    `SELECT COALESCE(SUM(total), 0) AS gross,
       COALESCE(SUM(subtotal), 0) AS net, COALESCE(SUM(tax_amount), 0) AS tax
     FROM orders WHERE substr(created_at, 1, 10) = ? AND status = 'COMPLETED';`,
    [date]
  )!;
  const taxBreakdown = sqlite.getAllSync<ZReport['taxBreakdown'][number]>(
    `SELECT tax_rate, SUM(subtotal) AS taxable_amount, SUM(tax_amount) AS tax_amount
     FROM orders WHERE substr(created_at, 1, 10) = ? AND status = 'COMPLETED'
     GROUP BY tax_rate ORDER BY tax_rate;`,
    [date]
  );
  const salesByPaymentType = sqlite.getAllSync<ZReport['salesByPaymentType'][number]>(
    `SELECT p.payment_method, SUM(p.amount) AS amount
     FROM payments p JOIN orders o ON o.id = p.order_id
     WHERE substr(o.created_at, 1, 10) = ? AND o.status = 'COMPLETED'
     GROUP BY p.payment_method ORDER BY p.payment_method;`,
    [date]
  );
  const topItems = sqlite.getAllSync<ZReport['topItems'][number]>(
    `SELECT product_id, product_name, SUM(quantity) AS quantity_sold,
       SUM(line_total) AS revenue,
       SUM(line_total - quantity * unit_cost) AS profit,
       CASE WHEN SUM(line_total) = 0 THEN 0
         ELSE 100.0 * SUM(line_total - quantity * unit_cost) / SUM(line_total) END AS margin_percent
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE substr(o.created_at, 1, 10) = ? AND o.status = 'COMPLETED'
     GROUP BY product_id, product_name ORDER BY quantity_sold DESC, profit DESC;`,
    [date]
  );
  const peakHours = sqlite.getAllSync<ZReport['peakHours'][number]>(
    `SELECT CAST(substr(created_at, 12, 2) AS INTEGER) AS hour,
       SUM(total) AS sales_total, COUNT(*) AS order_count
     FROM orders WHERE substr(created_at, 1, 10) = ? AND status = 'COMPLETED'
     GROUP BY substr(created_at, 12, 2) ORDER BY hour;`,
    [date]
  );
  const expected = sqlite.getFirstSync<{ amount: number }>(
    `SELECT COALESCE(SUM(s.starting_float)
       + COALESCE((SELECT SUM(p.amount) FROM payments p JOIN orders o ON o.id = p.order_id
         WHERE o.shift_id = s.id AND o.status = 'COMPLETED' AND p.payment_method = 'CASH'), 0)
       - COALESCE((SELECT SUM(c.amount) FROM cash_adjustments c
         WHERE c.shift_id = s.id AND c.type IN ('PAYOUT', 'DROP')), 0), 0) AS amount
     FROM shifts s WHERE substr(s.start_time, 1, 10) = ?;`,
    [date]
  )!.amount;
  const cashDrawer = sqlite.getFirstSync<{ actual: number | null; discrepancy: number }>(
    `SELECT SUM(closing_cash_actual) AS actual,
       SUM(closing_cash_actual - closing_cash_expected) AS discrepancy
     FROM shifts WHERE substr(start_time, 1, 10) = ? AND status = 'CLOSED';`,
    [date]
  )!;

  return {
    grossRevenue: total.gross,
    netRevenue: total.net,
    taxTotal: total.tax,
    taxBreakdown,
    salesByPaymentType,
    topItems,
    peakHours,
    cashDrawerDiscrepancy: cashDrawer.discrepancy || 0,
    expectedCash: expected,
    actualCash: cashDrawer.actual,
  };
}
