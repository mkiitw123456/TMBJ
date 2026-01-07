// src/utils/helpers.js
import { collection, addDoc } from "firebase/firestore";
import { db } from '../config/firebase';
import { DISCORD_LOG_WEBHOOK_URL, DISCORD_NOTIFY_WEBHOOK_URL, BASE_LISTING_FEE_PERCENT, EXCHANGE_TYPES } from './constants';

// === 財務計算核心函式 ===
export const calculateFinance = (price, exchangeTypeKey, participantCount, cost = 0, listingHistory = []) => {
  const p = parseFloat(price) || 0;
  const c = parseFloat(cost) || 0;
  const type = EXCHANGE_TYPES[exchangeTypeKey] || EXCHANGE_TYPES.WORLD;

  // 1. 稅金 (保留邏輯)
  const tax = p * type.tax;

  // 2. 刊登費總計 (修正：強制為整數)
  // 如果 listingHistory 是空的，預設至少有一次當前價格的刊登費
  const history = (Array.isArray(listingHistory) && listingHistory.length > 0) ? listingHistory : [p];
  
  const rawListingFee = history.reduce((sum, val) => sum + (val * BASE_LISTING_FEE_PERCENT), 0);
  const totalListingFee = Math.round(rawListingFee); // 修正：四捨五入取整，不顯示小數點

  // 3. 原始淨利 (售價 - 稅 - 刊登費 - 成本)
  const rawNetIncome = p - tax - totalListingFee - c;

  // 4. 萬位截斷邏輯 (Tail Logic)
  // 需求：只計算萬後面的，千以前的都為 0，零頭給販賣人，且不歸到記帳
  let accountingNetIncome = 0;
  let sellerRemainder = 0;

  if (rawNetIncome > 0) {
      // 下取整到萬位 (例如: 125400 -> 120000)
      accountingNetIncome = Math.floor(rawNetIncome / 10000) * 10000;
      // 計算零頭 (例如: 5400)
      sellerRemainder = rawNetIncome - accountingNetIncome;
  } else {
      // 如果是虧損，則不進行截斷，實報實銷
      accountingNetIncome = rawNetIncome;
      sellerRemainder = 0;
  }

  // 5. 每人分紅 (基於截斷後的金額計算)
  const perPersonSplit = participantCount > 0 ? Math.floor(accountingNetIncome / participantCount) : 0;

  return {
    tax,
    totalListingFee, // 這是整數
    netIncome: accountingNetIncome, // 這是要進帳簿的金額 (整萬)
    rawNetIncome, // 這是實際賺的錢 (含零頭)
    sellerRemainder, // 這是給賣家的零頭 (不入帳)
    perPersonSplit
  };
};

// === 日誌與通知工具 ===

export const sendLog = async (user, action, details) => {
  if (!db) return;
  try {
    await addDoc(collection(db, "system_logs"), {
      user,
      action,
      details,
      timestamp: new Date().toISOString()
    });

    if (DISCORD_LOG_WEBHOOK_URL) {
      await fetch(DISCORD_LOG_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `📝 **[LOG]** ${user} - ${action}: ${details}`
        })
      });
    }
  } catch (e) {
    console.error("Log failed", e);
  }
};

export const sendNotify = async (message) => {
  if (!DISCORD_NOTIFY_WEBHOOK_URL) return;
  try {
    await fetch(DISCORD_NOTIFY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });
  } catch (e) {
    console.error("Notify failed", e);
  }
};

// === 時間格式化工具 ===

export const formatTimeWithSeconds = (date) => {
  if (!date) return '00:00:00';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

export const formatTimeOnly = (dateInput) => {
  if (!dateInput) return '--:--';
  const date = new Date(dateInput);
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

export const getCurrentDateStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const getCurrentTimeStr = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
};

export const getRelativeDay = (dateStr) => {
  const target = new Date(dateStr);
  target.setHours(0,0,0,0);
  const now = new Date();
  now.setHours(0,0,0,0);
  
  const diffTime = target.getTime() - now.getTime();
  const diffDays = diffTime / (1000 * 3600 * 24);

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday';
  return 'other';
};

export const getRandomBrightColor = () => {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 60%)`;
};