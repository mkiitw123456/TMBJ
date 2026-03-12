// src/utils/constants.js

export const APP_VERSION = "0312v1";

// Discord Webhook URL (若不需要可留空)
export const DISCORD_NOTIFY_WEBHOOK_URL = "https://discord.com/api/webhooks/1481500125502242866/a4XsYxMFRe36xeSYACcPGr6TI8Yg9pUupKSYco2ES6dW5L-QCBf5S17y6zfezKp_WB3r"; 
export const DISCORD_LOG_WEBHOOK_URL = "https://discord.com/api/webhooks/1481520215845109931/X_gj3E5_ZllN_FCTSgP6sEDh-diPD4OdLUPobgtXCNWf8h53uJaTrIX3uxhz6dO5qJry";
export const DISCORD_BOSS_WEBHOOK_URL = "https://discord.com/api/webhooks/1464190741030113391/yYm3C8f2_0EE1TOhP-vIVjLiciBnFkeFClgp6cueikYAjKPNvlZ-WGcBB_CEoc9lfSzG";
export const DISCORD_HISTORY_WEBHOOK_URL = "https://discord.com/api/webhooks/1481520209696264345/4Rpoud3ATtb_iO6uDyu4fvCjI7fPFLxrimEfHw1M9QhRAY4ObcMSdSbwfmS-qdCkX_BU";
// 交易所設定
export const BASE_LISTING_FEE_PERCENT = 0.02; // 2% 刊登費

export const EXCHANGE_TYPES = {
  GENERAL: { label: '一般交易所', tax: 0.10 },
  WORLD: { label: '世界交易所', tax: 0.20 },
};

// 預設備用成員名單 (當資料庫讀取失敗，或初始化時使用)
// 這就是解決 "export 'MEMBERS' was not found" 的關鍵
export const MEMBERS = [
  "Wolf", 
  "水野", 
  "vina", 
  "Avalon", 
  "水月", 
  "UBS"
];