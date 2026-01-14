// src/components/SellerSuggestionStrip.js
import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { doc, collection, onSnapshot, query } from "firebase/firestore";
import { db } from '../config/firebase';
import { calculateFinance } from '../utils/helpers';
import { MEMBERS } from '../utils/constants';

const SellerSuggestionStrip = ({ isDarkMode }) => {
  const [gridData, setGridData] = useState({});
  const [activeItems, setActiveItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. 獨立監聽：餘額表矩陣
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, "settlement_data", "main_grid"), (doc) => {
      setGridData(doc.exists() ? doc.data().matrix || {} : {});
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. 獨立監聽：進行中項目 (用於預測未來帳務)
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "active_items"));
    const unsub = onSnapshot(q, (snap) => {
        setActiveItems(snap.docs.map(d => d.data()));
    });
    return () => unsub();
  }, []);

  // 3. 計算邏輯 (與 BalanceGrid 相同)
  const sellerSuggestions = useMemo(() => {
    // 嘗試從資料庫抓成員，若無則使用預設常數，避免錯誤
    let allMembers = MEMBERS; 
    // 這裡簡化處理：如果 gridData 有 key，就收集所有出現過的名字
    const detectedMembers = new Set(MEMBERS);
    Object.keys(gridData).forEach(k => {
        const [p, r] = k.split('_');
        if(p) detectedMembers.add(p);
        if(r) detectedMembers.add(r);
    });
    const memberList = Array.from(detectedMembers);

    const futureAdjustments = {};
    memberList.forEach(m => futureAdjustments[m] = { payable: 0, receivable: 0 });

    // 預測未來帳務
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

    return suggestions.sort((a, b) => b.score - a.score);
  }, [gridData, activeItems]);

  if (loading) return null;

  return (
    <div className={`mt-4 p-3 rounded-xl border flex flex-col gap-2 ${isDarkMode ? 'bg-orange-900/10 border-orange-500/30' : 'bg-orange-50 border-orange-200'}`}>
        <div className="flex justify-between items-center">
            <h4 className={`font-bold text-xs flex items-center gap-2 ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                <TrendingUp size={14}/> 建議掛賣順序 (即時連動)
            </h4>
        </div>
        <div className="flex overflow-x-auto gap-3 pb-1 no-scrollbar">
            {sellerSuggestions.map((item, index) => { 
                const shouldSell = item.score > 0; 
                return (
                    <div key={item.name} className={`flex-none flex items-center gap-2 p-2 rounded-lg border shadow-sm min-w-[120px] relative ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'} ${index === 0 ? 'ring-1 ring-orange-500' : ''}`}>
                        <div className={`absolute top-0 left-0 px-1.5 text-[9px] font-bold text-white rounded-br ${index === 0 ? 'bg-red-500' : 'bg-gray-500'}`}>#{index + 1}</div>
                        <div className="flex flex-col ml-1 mt-1">
                            <span className={`font-bold text-sm leading-none ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{item.name}</span>
                            <span className={`text-[9px] ${shouldSell ? 'text-orange-500' : 'opacity-50'}`}>{shouldSell ? '建議賣' : '暫緩'}</span>
                        </div>
                        <span className={`font-mono font-bold text-xs ml-auto ${shouldSell ? 'text-orange-500' : 'text-gray-500'}`}>
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