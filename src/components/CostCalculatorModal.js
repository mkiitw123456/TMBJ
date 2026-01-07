// src/components/CostCalculatorModal.js
import React, { useState, useEffect } from 'react';
import { Calculator, X, Plus, Trash2, Package, Coins, ArrowRight, Percent } from 'lucide-react';
import { BASE_LISTING_FEE_PERCENT, EXCHANGE_TYPES } from '../utils/constants';

const CostCalculatorModal = ({ isOpen, onClose, theme }) => {
  // === 左側：材料清單 ===
  const [materials, setMaterials] = useState([
    { id: 1, name: '', qty: 1, price: 0 }
  ]);

  // === 右側：定價設定 ===
  const [exchangeType, setExchangeType] = useState('WORLD');
  const [profitPercent, setProfitPercent] = useState(''); // 改為儲存百分比

  // 初始化
  useEffect(() => {
    if (isOpen) {
        setMaterials([{ id: Date.now(), name: '', qty: 1, price: 0 }]);
        setProfitPercent('');
        setExchangeType('WORLD');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // === 動作處理 ===
  const addMaterial = () => {
    setMaterials([...materials, { id: Date.now(), name: '', qty: 1, price: 0 }]);
  };

  const removeMaterial = (id) => {
    if (materials.length > 1) {
        setMaterials(materials.filter(m => m.id !== id));
    } else {
        setMaterials([{ id: Date.now(), name: '', qty: 1, price: 0 }]);
    }
  };

  const updateMaterial = (id, field, value) => {
    setMaterials(materials.map(m => {
        if (m.id === id) return { ...m, [field]: value };
        return m;
    }));
  };

  // === 計算邏輯 ===
  
  // 1. 總成本 (Total Cost)
  const totalCost = materials.reduce((sum, m) => {
      const q = parseFloat(m.qty) || 0;
      const p = parseFloat(m.price) || 0;
      return sum + (q * p);
  }, 0);

  // 2. 建議售價計算 (基於利潤率)
  // 公式：(售價 - 稅 - 刊登費) - 成本 = 成本 * 利潤率
  // (售價 - 稅 - 刊登費) = 成本 * (1 + 利潤率)
  // P * (1 - taxRate - feeRate) = Cost * (1 + profitRate)
  const calculateSuggestion = () => {
      const rate = parseFloat(profitPercent) || 0;
      const taxRate = EXCHANGE_TYPES[exchangeType]?.tax || 0;
      const feeRate = BASE_LISTING_FEE_PERCENT; // 0.02

      if (totalCost > 0) {
          const divisor = 1 - taxRate - feeRate;
          if (divisor <= 0) return null;

          // 目標利潤金額
          const targetProfitAmount = totalCost * (rate / 100);
          
          // 加上成本後，我們實際需要從交易所拿回來的錢 (淨收入)
          const requiredNetIncome = totalCost + targetProfitAmount;
          
          // 反推掛單價
          const suggestedPrice = requiredNetIncome / divisor;
          
          return {
              price: Math.ceil(suggestedPrice), // 建議掛單價
              tax: Math.round(suggestedPrice * taxRate),
              fee: Math.round(suggestedPrice * feeRate),
              profitAmount: targetProfitAmount, // 實際賺的金額
              netIncome: requiredNetIncome // 實際拿回的錢 (含本金)
          };
      }
      return null;
  };

  const result = calculateSuggestion();

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
      <div className={`w-full max-w-4xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] ${theme.card}`}>
        
        {/* Header */}
        <div className={`flex justify-between items-center p-4 border-b ${theme.card === 'bg-gray-800 border-gray-700' ? 'border-gray-700' : 'border-gray-200'}`}>
          <h3 className={`font-bold flex items-center gap-2 text-xl ${theme.text}`}>
            <Calculator size={24} className="text-orange-500"/> 生產利潤計算機
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-500/20"><X size={24}/></button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            
            {/* === 左側：材料清單 === */}
            <div className={`flex-1 flex flex-col border-b md:border-b-0 md:border-r ${theme.card === 'bg-gray-800 border-gray-700' ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="p-4 bg-black/10 flex justify-between items-center">
                    <span className="font-bold text-sm opacity-70 flex items-center gap-2"><Package size={16}/> 生產材料清單</span>
                    <button onClick={addMaterial} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded flex items-center gap-1 shadow">
                        <Plus size={12}/> 新增材料
                    </button>
                </div>
                
                {/* 表格標頭 */}
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs opacity-50 font-bold border-b border-dashed border-gray-500/30">
                    <div className="col-span-5">名稱</div>
                    <div className="col-span-2 text-center">數量</div>
                    <div className="col-span-2 text-right">單價</div>
                    <div className="col-span-2 text-right">小計</div>
                    <div className="col-span-1"></div>
                </div>

                {/* 材料列表 */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {materials.map((m, idx) => (
                        <div key={m.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded hover:bg-black/5 transition-colors text-sm">
                            <div className="col-span-5">
                                <input 
                                    type="text" 
                                    placeholder={`材料 #${idx+1}`}
                                    className={`w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none ${theme.text}`}
                                    value={m.name}
                                    onChange={e => updateMaterial(m.id, 'name', e.target.value)}
                                />
                            </div>
                            <div className="col-span-2">
                                <input 
                                    type="number" 
                                    className={`w-full bg-black/10 rounded px-1 text-center outline-none ${theme.text}`}
                                    value={m.qty}
                                    onChange={e => updateMaterial(m.id, 'qty', e.target.value)}
                                />
                            </div>
                            <div className="col-span-2">
                                <input 
                                    type="number" 
                                    className={`w-full bg-black/10 rounded px-1 text-right outline-none ${theme.text}`}
                                    value={m.price}
                                    onChange={e => updateMaterial(m.id, 'price', e.target.value)}
                                    placeholder="0"
                                />
                            </div>
                            <div className="col-span-2 text-right font-mono opacity-70">
                                {((parseFloat(m.qty)||0) * (parseFloat(m.price)||0)).toLocaleString()}
                            </div>
                            <div className="col-span-1 text-center">
                                <button onClick={() => removeMaterial(m.id)} className="text-gray-400 hover:text-red-500 p-1">
                                    <Trash2 size={14}/>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* 左下角：成本總計 */}
                <div className={`p-4 border-t flex justify-between items-center ${theme.card === 'bg-gray-800 border-gray-700' ? 'bg-black/20 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                    <span className="text-sm font-bold opacity-70">總材料成本</span>
                    <span className="text-xl font-mono font-bold text-red-400">
                        ${totalCost.toLocaleString()}
                    </span>
                </div>
            </div>

            {/* === 右側：定價與利潤 === */}
            <div className="w-full md:w-80 flex flex-col bg-opacity-50">
                <div className="p-4 bg-black/10">
                    <span className="font-bold text-sm opacity-70 flex items-center gap-2"><Coins size={16}/> 定價策略</span>
                </div>

                <div className="p-6 space-y-6 flex-1">
                    
                    {/* 1. 交易所選擇 */}
                    <div>
                        <label className="block text-xs font-bold mb-2 opacity-70">交易所類型</label>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.entries(EXCHANGE_TYPES).map(([k, v]) => (
                                <button
                                    key={k}
                                    onClick={() => setExchangeType(k)}
                                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${exchangeType === k ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'border-gray-500/30 opacity-60 hover:opacity-100'}`}
                                >
                                    {v.label} <br/>
                                    <span className="text-[10px] font-normal opacity-80">稅率 {(v.tax * 100).toFixed(0)}%</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 2. 預期利潤 % 輸入 */}
                    <div>
                        <label className="block text-xs font-bold mb-2 text-green-500">預期利潤率 (%)</label>
                        <div className="relative">
                            <input 
                                type="number" 
                                className={`w-full p-3 pl-4 rounded-xl border-2 font-mono text-xl font-bold outline-none focus:border-green-500 transition-colors ${theme.input} bg-transparent border-gray-500/30`}
                                value={profitPercent} 
                                onChange={e => setProfitPercent(e.target.value)}
                                placeholder="例如: 10"
                            />
                            <span className="absolute right-4 top-4 text-xs opacity-50 font-bold">%</span>
                        </div>
                        {/* 顯示計算出的利潤金額 */}
                        <div className="text-xs mt-2 text-right">
                            <span className="opacity-50">預計淨賺利潤: </span>
                            <span className="font-bold text-green-500 font-mono">
                                +${result ? result.profitAmount.toLocaleString() : '0'}
                            </span>
                        </div>
                    </div>

                    {/* 裝飾線 */}
                    <div className="border-t border-dashed border-gray-500/30 my-4 relative">
                        <div className="absolute left-1/2 -top-3 -translate-x-1/2 bg-gray-800 px-2 text-gray-500">
                            <ArrowRight size={16} className="rotate-90"/>
                        </div>
                    </div>

                    {/* 3. 計算結果詳情 */}
                    {result && (
                        <div className="space-y-2 text-xs opacity-70">
                            <div className="flex justify-between">
                                <span>交易所稅金</span>
                                <span className="text-red-400">-${result.tax.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>刊登手續費</span>
                                <span className="text-red-400">-${result.fee.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between font-bold pt-2 border-t border-gray-500/20">
                                <span>總成本 (材料+稅+費)</span>
                                <span className="text-red-500">-${(totalCost + result.tax + result.fee).toLocaleString()}</span>
                            </div>
                        </div>
                    )}

                </div>

                {/* 右下角：建議售價 */}
                <div className={`p-4 border-t ${theme.card === 'bg-gray-800 border-gray-700' ? 'bg-blue-900/20 border-gray-700' : 'bg-blue-50 border-gray-200'}`}>
                    <div className="flex justify-between items-end mb-1">
                        <span className="text-xs font-bold text-blue-400">建議刊登價格</span>
                        {result && <span className="text-[10px] opacity-50">含稅與手續費</span>}
                    </div>
                    <div className={`text-3xl font-mono font-bold text-right ${result ? 'text-blue-400' : 'opacity-30'}`}>
                        ${result ? result.price.toLocaleString() : '0'}
                    </div>
                    
                    <div className="mt-2 pt-2 border-t border-blue-500/20 flex justify-between items-center text-xs">
                        <span className="opacity-60">目標回收 (本金+利潤)</span>
                        <span className="font-bold text-white font-mono">
                            ${result ? result.netIncome.toLocaleString() : '0'}
                        </span>
                    </div>
                </div>

            </div>
        </div>
      </div>
    </div>
  );
};

export default CostCalculatorModal;