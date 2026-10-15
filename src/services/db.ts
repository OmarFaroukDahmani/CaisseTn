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

    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize database:', error);
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
    'INSERT INTO products (name, cost_price, selling_price, stack_price, stack_quantity, is_deleted) VALUES (?, ?, ?, ?, ?, 0);',
    [name, costPrice, sellingPrice, stackPrice, stackQuantity]
  );
}

export function updateProduct(id: number, name: string, costPrice: number, sellingPrice: number, stackPrice: number, stackQuantity: number): void {
  const sqlite = getDB();
  sqlite.runSync(
    'UPDATE products SET name = ?, cost_price = ?, selling_price = ?, stack_price = ?, stack_quantity = ? WHERE id = ?;',
    [name, costPrice, sellingPrice, stackPrice, stackQuantity, id]
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
