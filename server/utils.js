import { Client } from '@hiveio/dhive';
import pg from 'pg';

// Hive client
export const hiveClient = new Client(['https://api.deathwing.me']);

// Database pool (exported for compatibility)
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/hive_wrapped',
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Asset parsing utilities
export function parseAsset(assetString) {
  if (!assetString || typeof assetString !== 'string') return { amount: 0, precision: 0, symbol: '' };
  
  const parts = assetString.trim().split(' ');
  if (parts.length !== 2) return { amount: 0, precision: 0, symbol: '' };
  
  const amountStr = parts[0];
  const symbol = parts[1];
  
  // Count decimal places to determine precision
  const decimalIndex = amountStr.indexOf('.');
  const precision = decimalIndex >= 0 ? amountStr.length - decimalIndex - 1 : 0;
  
  // Convert to number (remove decimal for storage)
  const amount = parseFloat(amountStr) * Math.pow(10, precision);
  
  return { amount, precision, symbol };
}

export function addAsset(totals, assetString) {
  if (!assetString || typeof assetString !== 'string') return;
  
  const parts = assetString.trim().split(' ');
  if (parts.length !== 2) return;
  
  const amount = Number(parts[0]);
  const symbol = parts[1].toUpperCase(); // Always use uppercase
  
  if (!Number.isFinite(amount)) return;
  
  if (!totals[symbol]) totals[symbol] = 0;
  totals[symbol] += amount;
}

// Database operations
export async function withDb(callback) {
  try {
    return await callback(pool);
  } finally {
    // Pool is managed globally, don't end it here
  }
}

// Username normalization
export function normalizeUsername(raw) {
  return String(raw || '').trim().replace(/^@/, '');
}
