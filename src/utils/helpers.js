// src/utils/helpers.js
import { collection, addDoc } from "firebase/firestore";
import { db } from '../config/firebase';
import { 
  DISCORD_LOG_WEBHOOK_URL, 
  DISCORD_NOTIFY_WEBHOOK_URL, 
  DISCORD_BOSS_WEBHOOK_URL, 
  DISCORD_HISTORY_WEBHOOK_URL, // 🟢 引入新網址
  BASE_LISTING_FEE_PERCENT, 
  EXCHANGE_TYPES 
} from './constants';

// === 財務計算核心函式 ===
export const calculateFinance = (price, exchangeTypeKey, participantCount, cost = 0, listingHistory = []) => {
  const p = parseFloat(price) || 0;
  const c = parseFloat(cost) || 0;
  const type = EXCHANGE_TYPES[exchangeTypeKey] || EXCHANGE_TYPES.WORLD;

  // 1. 稅金
  const tax = p * type.tax;

  // 2. 刊登費總計
  // 如果 listingHistory 是空的，預設至少有一次當前價格的刊登費
  const history = (Array.isArray(listingHistory) && listingHistory.length > 0) ? listingHistory : [p];
  
  const rawListingFee = history.reduce((sum, val) => sum + (val * BASE_LISTING_FEE_PERCENT), 0);
  const totalListingFee = Math.round(rawListingFee);

  // 3. 原始淨利
  //const rawNetIncome = p - tax - totalListingFee - c;

  // 4. 萬位截斷邏輯
  let accountingNetIncome = 0;
  let sellerRemainder = 0;

  if (rawNetIncome > 0) {
      accountingNetIncome = Math.floor(rawNetIncome / 10000) * 10000;
      sellerRemainder = rawNetIncome - accountingNetIncome;
  } else {
      accountingNetIncome = rawNetIncome;
      sellerRemainder = 0;
  }

  // 5. 每人分紅
  const perPersonSplit = participantCount > 0 ? Math.floor(accountingNetIncome / participantCount) : 0;

  return {
    tax,
    totalListingFee, 
    netIncome: accountingNetIncome, 
    rawNetIncome, 
    sellerRemainder, 
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

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    if (DISCORD_LOG_WEBHOOK_URL) {
      await fetch(DISCORD_LOG_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `📝 **[LOG]** ${user} - ${action}: ${details} (${timeStr})`
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

export const sendBossNotify = async (message) => {
  if (!DISCORD_BOSS_WEBHOOK_URL) return;
  try {
    await fetch(DISCORD_BOSS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });
  } catch (e) {
    console.error("Boss Notify failed", e);
  }
};

// 🟢 新增：發送詳細售出紀錄到歷史頻道 (使用 Embed 樣式)
export const sendSoldNotification = async (item, settledBy) => {
    if (!DISCORD_HISTORY_WEBHOOK_URL) return;

    // 重新計算財務細節
    const { tax, netIncome, perPersonSplit } = calculateFinance(
        item.price, 
        item.exchangeType, 
        item.participants?.length || 0, 
        item.cost, 
        item.listingHistory
    );

    // 格式化刊登費明細
    const historyList = (item.listingHistory && item.listingHistory.length > 0) ? item.listingHistory : [item.price];
    const listingFeeDetails = historyList.map((p, idx) => {
        const fee = Math.round(p * BASE_LISTING_FEE_PERCENT);
        return `第${idx + 1}次: $${p.toLocaleString()} (費: ${fee})`;
    }).join('\n');

    // 參與者名單
    const participantsStr = item.participants 
        ? item.participants.map(p => (typeof p === 'string' ? p : p.name)).join(', ') 
        : '無';

    // 格式化日期
    const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-TW', { hour12: false }) : '未知時間';
    const settleDateStr = new Date().toLocaleString('zh-TW', { hour12: false });

    // 建構 Embed 物件
    const embed = {
        title: `💰 已售出：${item.itemName}`,
        color: 5763719, // 綠色
        fields: [
            { name: "📅 建立時間", value: dateStr, inline: true },
            { name: "👤 販售人", value: item.seller || '未知', inline: true },
            { name: "💎 販賣價格", value: `$${(item.price || 0).toLocaleString()}`, inline: true },
            { name: "💸 刊登費明細", value: listingFeeDetails || '無', inline: false },
            { name: "🏦 稅金", value: `$${tax.toLocaleString()}`, inline: true },
            { name: "💵 淨利/人", value: `**$${perPersonSplit.toLocaleString()}**`, inline: true },
            { name: "👥 分紅參與者", value: participantsStr, inline: false }
        ],
        footer: {
            text: `結算人: ${settledBy} • 結算時間: ${settleDateStr}`
        }
    };

    try {
        await fetch(DISCORD_HISTORY_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
    } catch (e) {
        console.error("Sold Notify failed", e);
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

export const getRandomBrightColor = () => {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 60%)`;
};