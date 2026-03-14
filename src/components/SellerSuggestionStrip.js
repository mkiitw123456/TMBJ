// src/components/SellerSuggestionStrip.js
import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { doc, collection, onSnapshot, query } from "firebase/firestore";
import { db } from '../config/firebase';
import { calculateFinance } from '../utils/helpers';
// 🔴 移除了原本從 constants.js 引入寫死名單的程式碼

// 🟢 確保接收來自外部 (Firebase) 的 members 真實名單
const SellerSuggestionStrip = ({ isDarkMode, vertical = false, members = [] }) => {
  const [gridData, setGridData] = useState({});
  const [activeItems, setActiveItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. 監聽餘額表
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, "settlement_data", "main_grid"), (doc) => {
      setGridData(doc.exists() ? doc.data().matrix || {} : {});
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. 監聽進行中項目
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "active_items"));
    const unsub = onSnapshot(q, (snap) => {
        setActiveItems(snap.docs.map(d => d.data()));
    });
    return () => unsub();
  }, []);

  // 3. 計算邏輯
  const sellerSuggestions = useMemo(() => {
    // 🟢 使用動態傳入的真實名單
    const activeMemberNames = members.map(m => typeof m === 'string' ? m : m.name);
    const detectedMembers = new Set(activeMemberNames);
    
    Object.keys(gridData).forEach(k => {
        const [p, r] = k.split('_');
        if(p) detectedMembers.add(p);
        if(r) detectedMembers.add(r);
    });
    const memberList = Array.from(detectedMembers);

    const futureAdjustments = {};
    memberList.forEach(m => futureAdjustments[m] = { payable: 0, receivable: 0 });

    activeItems.forEach(item => {
        const seller = item.seller;
        const { perPersonSplit } = calculateFinance(item.price, item.exchangeType, item.participants?.length || 0, item.cost, item.listingHistory);
        if (perPersonSplit > 0 && seller && item.participants) {
            item.participants.forEach(p => {
                const pName = typeof p === 'string' ? p : p.name;
                if (pName !== seller) {
                    if (!futureAdjustments[seller]) futureAdjustments[seller] = { payable: 0, receivable: 0 };
                    if (!futureAdjustments[pName]) futureAdjustments[pName] = { payable: 0, receivable: 0 };
                    futureAdjustments[seller].payable += perPersonSplit;
                    futureAdjustments[pName].receivable += perPersonSplit;
                }
            });
        }
    });

    const suggestions = memberList.map(member => {
      let currentPayable = 0; 
      let currentReceivable = 0; 
      memberList.forEach(other => {
        if (member !== other) {
          currentPayable += (gridData[`${member}_${other}`] || 0);
          currentReceivable += (gridData[`${other}_${member}`] || 0);
        }
      });
      const totalPayable = currentPayable + (futureAdjustments[member]?.payable || 0);
      const totalReceivable = currentReceivable + (futureAdjustments[member]?.receivable || 0);
      const score = totalReceivable - totalPayable;
      return { name: member, score };
    });

    // 🟢 終極防幽靈機制：如果這個人「不在目前的會員名單內」且「分數為 0」，直接從畫面上剔除
    return suggestions
      .filter(item => activeMemberNames.includes(item.name) || item.score !== 0)
      .sort((a, b) => b.score - a.score);
      
  }, [gridData, activeItems, members]); // 確保 members 更新時，這裡也會重新計算

  if (loading) return null;

  const containerClass = vertical 
    ? "h-full flex flex-col" 
    : `mt-4 p-3 rounded-xl border flex flex-col gap-2 ${isDarkMode ? 'bg-orange-900/10 border-orange-500/30' : 'bg-orange-50 border-orange-200'}`;

  const listClass = vertical
    ? "flex flex-col gap-2 overflow-y-auto p-2 custom-scrollbar flex-1" 
    : "flex overflow-x-auto gap-3 pb-1 no-scrollbar";

  const headerClass = vertical
    ? "mb-2 pb-2 border-b border-white/10 text-center py-2"
    : "flex justify-between items-center";

  return (
    <div className={containerClass}>
        <div className={headerClass}>
            <h4 className={`font-bold flex items-center justify-center gap-2 ${vertical ? 'text-base' : 'text-xs'} ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                <TrendingUp size={vertical ? 18 : 14}/> 建議掛賣順序
            </h4>
        </div>
        <div className={listClass}>
            {sellerSuggestions.map((item, index) => { 
                const shouldSell = item.score > 0; 
                return (
                    <div key={item.name} className={`
                        rounded-lg border shadow-sm relative transition-colors
                        ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'} 
                        ${index === 0 ? 'ring-1 ring-orange-500' : ''}
                        ${vertical ? 'w-full flex items-center p-3 gap-3' : 'flex-none flex items-center gap-2 p-2 min-w-[120px]'}
                    `}>
                        <div className={`
                            flex items-center justify-center font-bold text-white rounded
                            ${vertical ? 'w-6 h-6 text-xs' : 'absolute top-0 left-0 px-1.5 text-[9px] rounded-br'}
                            ${index === 0 ? 'bg-red-500' : 'bg-gray-500'}
                        `}>
                            #{index + 1}
                        </div>
                        
                        <div className={`flex flex-col ${vertical ? 'flex-1' : 'ml-1 mt-1'}`}>
                            <span className={`font-bold leading-none ${vertical ? 'text-base mb-1' : 'text-sm'} ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                                {item.name}
                            </span>
                            <span className={`text-[9px] ${shouldSell ? 'text-orange-500' : 'opacity-50'}`}>
                                {shouldSell ? '建議掛賣' : '暫緩掛賣'}
                            </span>
                        </div>
                        
                        <span className={`font-mono font-bold ml-auto ${vertical ? 'text-lg' : 'text-xs'} ${shouldSell ? 'text-orange-500' : 'text-gray-500'}`}>
                            {shouldSell ? '+' : ''}{Math.round(item.score/10000)}萬
                        </span>
                    </div>
                );
            })}
        </div>
    </div>
  );
};

export default SellerSuggestionStrip;