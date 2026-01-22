// src/components/ItemCard.js
import React, { useState, useEffect, useRef } from 'react';
import { Trash2, CheckCircle, X } from 'lucide-react';
import { EXCHANGE_TYPES, BASE_LISTING_FEE_PERCENT } from '../utils/constants';
import { calculateFinance } from '../utils/helpers';

// 內建簡單日期格式化 (確保不依賴外部)
const formatDate = (isoString) => {
  if (!isoString) return '---';
  const d = new Date(isoString);
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
};

const formatNumber = (num) => {
  if (num === null || num === undefined || num === '') return '';
  const str = num.toString().replace(/,/g, '');
  if (isNaN(str)) return str;
  const parts = str.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
};

const parseNumber = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  return parseFloat(val.toString().replace(/,/g, '')) || 0;
};

const MoneyInput = ({ value, onChange, onBlur, onFocus, className, ...props }) => {
  const [displayValue, setDisplayValue] = useState('');
  const isComposing = useRef(false);
  useEffect(() => { if (!isComposing.current) setDisplayValue(formatNumber(value)); }, [value]);
  const handleChange = (e) => {
    const raw = e.target.value;
    setDisplayValue(raw);
    if (!isComposing.current) onChange(parseNumber(raw), e);
  };
  return (
    <input
      type="text" className={className} value={displayValue} onChange={handleChange}
      onCompositionStart={()=>isComposing.current=true}
      onCompositionEnd={(e)=>{isComposing.current=false; const val=parseNumber(e.target.value); onChange(val,e); setDisplayValue(formatNumber(val));}}
      onFocus={(e)=>{e.target.select(); if(onFocus)onFocus(e);}} onBlur={onBlur} inputMode="decimal" {...props}
    />
  );
};

const ItemCard = ({ 
  item, isHistory, theme, 
  updateItemValue, handleSettleAll, handleDelete,
  confirmSettleId, setConfirmSettleId, confirmDeleteId, setConfirmDeleteId,
  currentUser
}) => {
  const listingHistory = item.listingHistory || [];
  const [priceOnFocus, setPriceOnFocus] = useState(item.price);
  const safePrice = parseFloat(item.price) || 0;
  const safeCost = parseFloat(item.cost) || 0;
  const { perPersonSplit, totalListingFee } = calculateFinance(safePrice, item.exchangeType, item.participants?.length || 0, safeCost, listingHistory);

  const handlePriceBlur = (e) => {
    const currentPrice = parseNumber(e.target.value);
    const previousPrice = parseFloat(priceOnFocus);
    if (!isNaN(currentPrice) && currentPrice !== previousPrice) {
      const newHistory = [...listingHistory, currentPrice];
      updateItemValue(item.id, 'listingHistory', newHistory);
    }
  };

  const removeListingPrice = (index) => {
      const newHistory = listingHistory.filter((_, i) => i !== index);
      updateItemValue(item.id, 'listingHistory', newHistory);
  };
  
  return (
    <div className={`rounded-xl shadow-md border-l-4 p-6 relative transition-colors ${isHistory ? 'border-gray-500 opacity-90' : 'border-blue-500'}`} style={{ background: 'var(--card-bg)', color: 'var(--card-text)' }}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex flex-col gap-1 w-full pr-10">
          <div className="flex flex-wrap items-center gap-3">
            <span className="bg-blue-100 text-blue-800 font-bold px-2 py-1 rounded text-xs">{item.seller || '未知'}</span>
            <h3 className="text-xl font-bold">{item.itemName || item.name || '無名稱'}</h3>
            <span className="px-2 py-0.5 text-xs rounded-full border bg-green-100 text-green-700 border-green-200">{EXCHANGE_TYPES[item.exchangeType]?.label || '一般'}</span>
          </div>
          {/* 🟢 修改這裡：無論是不是歷史紀錄，都顯示創建時間。如果是歷史紀錄，才額外顯示結算時間。 */}
          <div className="text-xs text-gray-400 flex gap-2">
             <span>建: {formatDate(item.createdAt)}</span>
             {isHistory && <span>結: {formatDate(item.settledAt)}</span>}
          </div>
        </div>
        <div className="absolute top-4 right-4 z-10">
          {confirmDeleteId === item.id ? (
            <div className="flex gap-2 bg-red-50 p-1 rounded border border-red-200">
              <button 
                onClick={() => handleDelete(item.id, isHistory, item.itemName)} 
                className="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
              >刪除</button>
              <button onClick={() => setConfirmDeleteId(null)} className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300">取消</button>
            </div>
          ) : (
            <button onClick={() => { 
                if (item.seller !== currentUser) { alert(`權限不足`); return; }
                setConfirmDeleteId(item.id); setConfirmSettleId(null); 
              }} className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-gray-100"><Trash2 size={18}/></button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 p-4 rounded mb-4 bg-black/5">
        <div className="flex flex-col">
          <span className={`text-xs opacity-70`}>售價 (含稅)</span>
          <div className="text-lg font-bold">
            {!isHistory ? (
               <MoneyInput className="bg-transparent w-full border-b border-gray-400/30 outline-none focus:border-blue-500 transition-colors" 
                 value={item.price} onChange={(val) => updateItemValue(item.id, 'price', val)} onFocus={()=>setPriceOnFocus(item.price)} onBlur={handlePriceBlur} />
            ) : safePrice.toLocaleString()} 
          </div>
          <div className="text-[10px] opacity-60 mt-1">稅: {(safePrice * (EXCHANGE_TYPES[item.exchangeType]?.tax || 0)).toLocaleString()}</div>
        </div>
        <div className="flex flex-col">
          <span className={`text-xs opacity-70 flex items-center gap-1`}>刊登費 (2%)</span>
          <div className="flex flex-col gap-1 mt-1 max-h-20 overflow-y-auto">
             {listingHistory.map((price, idx) => (
                 <div key={idx} className="flex items-center justify-between text-xs bg-black/10 p-1 rounded">
                    <span>${(price || 0).toLocaleString()} <span className="opacity-60">&rarr; {Math.floor((price || 0) * BASE_LISTING_FEE_PERCENT).toLocaleString()}</span></span>
                    {!isHistory && <button onClick={() => removeListingPrice(idx)} className="text-red-400 hover:text-red-600"><X size={10}/></button>}
                 </div>
             ))}
          </div>
          <div className="text-[10px] text-blue-500 mt-1 font-bold">總計: {totalListingFee.toLocaleString()}</div>
        </div>
        <div className="flex flex-col">
          <span className={`text-xs opacity-70`}>額外成本 (手動)</span>
          <div className="flex items-center gap-2">
            {!isHistory ? (
               <MoneyInput className={`w-full text-right rounded border bg-transparent border-gray-400 text-sm p-1`} value={item.cost} onChange={(val) => updateItemValue(item.id, 'cost', val)} />
            ) : <span className="text-red-400 font-mono">-{safeCost.toLocaleString()}</span>}
          </div>
          <div className="text-xs text-green-500 mt-2 font-bold border-t pt-1 border-gray-300">淨利/人: {perPersonSplit.toLocaleString()}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {item.participants?.map((p, idx) => (
          <div key={idx} className={`px-2 py-1 rounded border text-xs flex items-center select-none bg-black/10 opacity-80`}>{p.name || p}</div>
        ))}
      </div>

      {!isHistory && (
        <div className="mt-4 flex justify-end">
          {confirmSettleId === item.id ? (
            <div className="flex gap-2 items-center flex-wrap justify-end">
              <span className="text-sm text-red-500">將 <b>${perPersonSplit.toLocaleString()}</b>/人 加入餘額表?</span>
              <button onClick={() => handleSettleAll(item, perPersonSplit)} className="bg-red-500 text-white px-3 py-1 rounded text-sm">確認</button>
              <button onClick={() => setConfirmSettleId(null)} className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-sm">取消</button>
            </div>
          ) : (
            <button onClick={() => { 
                if (item.seller !== currentUser) { alert(`權限不足`); return; }
                setConfirmSettleId(item.id); setConfirmDeleteId(null); 
              }} className={`flex items-center gap-2 px-4 py-2 rounded font-bold text-sm bg-blue-600 text-white shadow hover:bg-blue-700`}>
              <CheckCircle size={16}/> 已出售
            </button>
          )}
        </div>
      )}
    </div>
  );
};
export default ItemCard;