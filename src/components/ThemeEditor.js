// src/components/ThemeEditor.js
import React, { useState, useEffect } from 'react';
import { Settings, X, RotateCcw, Palette } from 'lucide-react';

const ThemeEditor = ({ isOpen, onClose }) => {
  // 預設樣式變數
  const defaultSettings = {
    '--app-bg': '#1e293b',           // 整體背景
    '--app-text': '#f3f4f6',         // 主要文字
    '--card-bg': '#1f2937',          // 卡片/面板背景 (左側三欄)
    '--sidebar-bg': 'rgba(31, 41, 55, 0.5)', // 側邊欄背景 (右側)
    '--sidebar-border': 'rgba(255, 255, 255, 0.1)',
  };

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('custom_theme_settings');
    return saved ? JSON.parse(saved) : defaultSettings;
  });

  const [isGradientMode, setIsGradientMode] = useState(false);
  const [gradientColors, setGradientColors] = useState({ start: '#1e293b', end: '#0f172a', angle: 135 });

  // 當設定改變時，立即套用到 CSS 變數
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(settings).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    localStorage.setItem('custom_theme_settings', JSON.stringify(settings));
  }, [settings]);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    if (window.confirm('確定要重置所有顏色設定嗎？')) {
      setSettings(defaultSettings);
      localStorage.removeItem('custom_theme_settings');
    }
  };

  // 處理漸層生成
  const applyGradient = (targetKey) => {
    const gradient = `linear-gradient(${gradientColors.angle}deg, ${gradientColors.start}, ${gradientColors.end})`;
    handleChange(targetKey, gradient);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-gray-900 text-white shadow-2xl z-[100] border-l border-gray-700 flex flex-col transform transition-transform duration-300">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800">
        <h3 className="font-bold flex items-center gap-2 text-yellow-400">
          <Settings size={18} className="animate-spin-slow"/> 工程模式 (調色盤)
        </h3>
        <button onClick={onClose} className="hover:bg-gray-700 p-1 rounded"><X size={20}/></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* 1. 全域文字顏色 */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase">全域文字顏色</label>
          <div className="flex items-center gap-2">
            <input type="color" value={settings['--app-text']} onChange={(e) => handleChange('--app-text', e.target.value)} className="h-8 w-12 rounded cursor-pointer bg-transparent"/>
            <input type="text" value={settings['--app-text']} onChange={(e) => handleChange('--app-text', e.target.value)} className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs"/>
          </div>
        </div>

        <hr className="border-gray-700"/>

        {/* 2. 漸層產生器 */}
        <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 space-y-3">
          <div className="flex justify-between items-center">
             <label className="text-xs font-bold text-blue-400 uppercase flex items-center gap-1"><Palette size={12}/> 漸層產生器</label>
             <input type="checkbox" checked={isGradientMode} onChange={(e) => setIsGradientMode(e.target.checked)} className="toggle"/>
          </div>
          
          {isGradientMode && (
            <div className="space-y-2 animate-in fade-in">
               <div className="flex gap-2">
                 <input type="color" value={gradientColors.start} onChange={e=>setGradientColors({...gradientColors, start: e.target.value})} className="h-6 w-full rounded cursor-pointer"/>
                 <input type="color" value={gradientColors.end} onChange={e=>setGradientColors({...gradientColors, end: e.target.value})} className="h-6 w-full rounded cursor-pointer"/>
               </div>
               <div className="flex items-center gap-2">
                 <span className="text-xs text-gray-500">角度:</span>
                 <input type="range" min="0" max="360" value={gradientColors.angle} onChange={e=>setGradientColors({...gradientColors, angle: e.target.value})} className="flex-1"/>
                 <span className="text-xs w-8 text-right">{gradientColors.angle}°</span>
               </div>
               <div className="grid grid-cols-2 gap-2 mt-2">
                 <button onClick={() => applyGradient('--app-bg')} className="text-[10px] bg-blue-600 py-1 rounded hover:bg-blue-500">套用至背景</button>
                 <button onClick={() => applyGradient('--card-bg')} className="text-[10px] bg-green-600 py-1 rounded hover:bg-green-500">套用至卡片</button>
                 <button onClick={() => applyGradient('--sidebar-bg')} className="text-[10px] bg-purple-600 py-1 rounded hover:bg-purple-500">套用至側邊欄</button>
               </div>
            </div>
          )}
        </div>

        {/* 3. 各區塊背景設定 */}
        <div className="space-y-4">
            {[
                { label: '網頁背景 (App Bg)', key: '--app-bg' },
                { label: '卡片/面板背景 (Card Bg)', key: '--card-bg' },
                { label: '右側邊欄背景 (Sidebar)', key: '--sidebar-bg' },
                { label: '邊框顏色 (Borders)', key: '--sidebar-border' },
            ].map(item => (
                <div key={item.key} className="space-y-1">
                    <label className="text-xs font-bold text-gray-400">{item.label}</label>
                    <div className="flex gap-2">
                        {/* 如果是漸層字串，Color Picker 會顯示黑色，所以我們只在非漸層時依賴 Color Picker */}
                        <div className="relative">
                            <input 
                                type="color" 
                                className="h-8 w-8 rounded cursor-pointer bg-transparent absolute inset-0 opacity-0"
                                onChange={(e) => handleChange(item.key, e.target.value)}
                            />
                            <div className="h-8 w-8 rounded border border-gray-500" style={{ background: settings[item.key] }}></div>
                        </div>
                        <textarea 
                            value={settings[item.key]} 
                            onChange={(e) => handleChange(item.key, e.target.value)} 
                            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs h-8 resize-none leading-6 whitespace-nowrap overflow-x-auto"
                        />
                    </div>
                </div>
            ))}
        </div>

      </div>

      <div className="p-4 border-t border-gray-700 bg-gray-800 flex gap-2">
        <button onClick={handleReset} className="flex-1 py-2 bg-red-900/50 hover:bg-red-900 text-red-200 rounded text-sm flex items-center justify-center gap-2">
            <RotateCcw size={16}/> 重置預設
        </button>
      </div>
    </div>
  );
};

export default ThemeEditor;