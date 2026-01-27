// src/utils/constants.js

export const APP_VERSION = "0127v3";

// Discord Webhook URL (若不需要可留空)
export const DISCORD_NOTIFY_WEBHOOK_URL = "https://discord.com/api/webhooks/1450050856094535745/0dvodClTjDzQEc_t5z_cCXNjPTF2wCyilpcWtJJNyX0xGhp4lYcRYOgzOam1IWT9Zqgo"; 
export const DISCORD_LOG_WEBHOOK_URL = "https://discord.com/api/webhooks/1450325286062260296/_cNDE7s-GKL0QHVGKye5qIRA-xsQH-iOXUyFLWaDsGc0LwXTU94HC4yFdRW-eJm6KmTF";
export const DISCORD_BOSS_WEBHOOK_URL = "https://discord.com/api/webhooks/1464190741030113391/yYm3C8f2_0EE1TOhP-vIVjLiciBnFkeFClgp6cueikYAjKPNvlZ-WGcBB_CEoc9lfSzG";
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
  "Ricky", 
  "五十嵐", 
  "水月", 
  "UBS"
];