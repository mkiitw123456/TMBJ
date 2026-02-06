// src/views/AccountingView.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, History, Grid, Calculator, X, User, Users, UploadCloud, Loader2 } from 'lucide-react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, runTransaction, limit, getDocs } from "firebase/firestore";
import { db } from '../config/firebase';
import { sendLog, sendNotify, sendSoldNotification } from '../utils/helpers';
import BalanceGrid from '../components/BalanceGrid';
import ItemCard from '../components/ItemCard';
import CostCalculatorModal from '../components/CostCalculatorModal';
import { EXCHANGE_TYPES } from '../utils/constants';

// 🟢 設定 Google Apps Script 網址
const GOOGLE_SHEET_API_URL = "https://script.google.com/macros/s/AKfycbz35pDfw6aUtg_zvVhix30nYv_0tKAa9No8_cuR1CIKRZnpUpAzomCHSCdDSORn2n8hdA/exec";

const formatNumber = (num) => num?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') || '';
const parseNumber = (val) => parseFloat(val?.toString().replace(/,/g, '')) || 0;

const MoneyInput = ({ value, onChange, className, placeholder }) => {
  const [display, setDisplay] = useState('');
  const isComposing = useRef(false);
  useEffect(() => { if (!isComposing.current) setDisplay(formatNumber(value)); }, [value]);
  return <input type="text" className={className} placeholder={placeholder} value={display} 
    onChange={(e)=>{ setDisplay(e.target.value); if(!isComposing.current) onChange(parseNumber(e.target.value)); }}
    onCompositionStart={()=>isComposing.current=true} onCompositionEnd={(e)=>{isComposing.current=false; onChange(parseNumber(e.target.value)); setDisplay(formatNumber(e.target.value));}}
  />;
};

const AccountingView = ({ isDarkMode, currentUser, members = [] }) => {
  const [activeItems, setActiveItems] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  
  const [filterMode, setFilterMode] = useState('all'); 

  // Modals & UI States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isBalanceGridOpen, setIsBalanceGridOpen] = useState(false);
  const [isCostCalcOpen, setIsCostCalcOpen] = useState(false);
  
  // 遷移狀態
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState('');

  const [confirmSettleId, setConfirmSettleId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const [historyFilterMember, setHistoryFilterMember] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const [formData, setFormData] = useState({ itemName: '', price: '', cost: 0, seller: currentUser, participants: [], exchangeType: 'WORLD' });

  const filteredMembers = useMemo(() => {
    return members.filter(m => m.hideFromAccounting !== true);
  }, [members]);

  const memberNames = useMemo(() => filteredMembers.map(m => m.name || m), [filteredMembers]);

  // Data Fetching
  useEffect(() => {
    if (!db) return;
    
    const qActive = query(collection(db, "active_items"), orderBy("createdAt", "desc"));
    const unsubActive = onSnapshot(qActive, (snap) => setActiveItems(snap.docs.map(d => ({ ...d.data(), id: d.id }))));

    let unsubHistory = () => {};

    if (currentUser === 'Wolf') {
        const qHistory = query(
            collection(db, "history_items"), 
            orderBy("settledAt", "desc"),
            limit(50) 
        );
        unsubHistory = onSnapshot(qHistory, (snap) => setHistoryItems(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    } else {
        setHistoryItems([]);
    }

    return () => { unsubActive(); unsubHistory(); };
  }, [currentUser]);

  useEffect(() => { if (isModalOpen) setFormData(prev => ({ ...prev, seller: currentUser })); }, [isModalOpen, currentUser]);

  const displayedActiveItems = useMemo(() => {
    if (filterMode === 'mine') {
      return activeItems.filter(item => item.seller === currentUser);
    }
    return activeItems;
  }, [activeItems, filterMode, currentUser]);

  // 🟢 輔助函式：傳送資料到 Google Sheet
  const saveToGoogleSheet = async (item, profitOverride = null) => {
    const profit = profitOverride !== null ? profitOverride : (item.finalSplit || 0);
    
    // 處理參與者格式 (轉成字串)
    let participantsStr = "";
    if (Array.isArray(item.participants)) {
        participantsStr = item.participants.map(p => typeof p === 'string' ? p : p.name).join(', ');
    }

    const payload = {
        createdAt: item.createdAt || new Date().toISOString(),
        seller: item.seller || 'Unknown',
        itemName: item.itemName || 'Unknown',
        price: item.price || 0,
        profit: profit,
        participants: participantsStr
    };

    try {
        await fetch(GOOGLE_SHEET_API_URL, {
            method: 'POST',
            mode: 'no-cors', // 關鍵：避免 CORS 錯誤，雖然無法讀取回應但能發送
            headers: {
                'Content-Type': 'text/plain' // GAS 比較好解析 text/plain
            },
            body: JSON.stringify(payload)
        });
        console.log("Sent to Google Sheet:", payload.itemName);
    } catch (e) {
        console.error("Sheet Sync Error:", e);
    }
  };

  const handleAddItem = async () => {
    if (currentUser === '訪客') return alert("訪客僅供瀏覽");
    if (!formData.itemName || !formData.price) return alert("請輸入名稱與價格");
    try {
      const newItem = { ...formData, price: parseNumber(formData.price), cost: parseNumber(formData.cost), createdAt: new Date().toISOString(), listingHistory: [parseNumber(formData.price)] };
      await addDoc(collection(db, "active_items"), newItem);
      setIsModalOpen(false);
      setFormData({ itemName: '', price: '', cost: 0, seller: currentUser, participants: memberNames, exchangeType: 'WORLD' });
      sendLog(currentUser, "新增記帳", `${formData.itemName} ($${formData.price})`);
      sendNotify(`📦 **${currentUser}** 新增掛賣：${formData.itemName} (售價: ${formData.price})`);
    } catch (e) { alert("新增失敗"); }
  };

  const updateItemValue = async (id, field, value) => {
    if (currentUser === '訪客') return;
    try { await updateDoc(doc(db, "active_items", id), { [field]: value }); } catch (e) { console.error(e); }
  };

  const handleDelete = async (id, isHistory, itemName) => {
    if (currentUser === '訪客') return alert("訪客權限不足");
    try {
      await deleteDoc(doc(db, isHistory ? "history_items" : "active_items", id));
      setConfirmDeleteId(null);
      sendLog(currentUser, "刪除項目", `${isHistory ? '[歷史]' : '[進行中]'} ${itemName}`);
    } catch (e) { alert("刪除失敗"); }
  };

  const handleSettleAll = async (item, perPersonAmount) => {
    if (currentUser === '訪客') return alert("訪客權限不足");
    const safeParticipants = Array.isArray(item.participants) ? item.participants : [];

    try {
      await runTransaction(db, async (transaction) => {
        const gridRef = doc(db, "settlement_data", "main_grid");
        const gridDoc = await transaction.get(gridRef);
        let matrix = gridDoc.exists() ? gridDoc.data().matrix : {};

        safeParticipants.forEach(p => {
            const pName = typeof p === 'string' ? p : p.name;
            if (pName && item.seller && pName !== item.seller) {
                const key = `${item.seller}_${pName}`;
                const reverseKey = `${pName}_${item.seller}`;
                let debt = matrix[reverseKey] || 0;
                if (debt >= perPersonAmount) {
                    matrix[reverseKey] = debt - perPersonAmount;
                } else {
                    matrix[reverseKey] = 0;
                    matrix[key] = (parseFloat(matrix[key]) || 0) + (perPersonAmount - debt);
                }
            }
        });

        transaction.set(gridRef, { matrix }, { merge: true });
        
        const historyData = { ...item, settledAt: new Date().toISOString(), finalSplit: perPersonAmount, settledBy: currentUser, listingHistory: item.listingHistory || [] };
        delete historyData.id;
        const newHistoryRef = doc(collection(db, "history_items"));
        transaction.set(newHistoryRef, historyData);
        transaction.delete(doc(db, "active_items", item.id));
      });
      setConfirmSettleId(null);
      sendLog(currentUser, "結算項目", `${item.itemName} (每人分 ${perPersonAmount})`);
      
      // 3. 結算成功後，發送詳細歷史通知到 Discord
      sendNotify(`💰 **[已售出]** ${item.seller} 賣出了 **${item.itemName}**\n💵 分紅: ${perPersonAmount.toLocaleString()}/人`);
      sendSoldNotification(item, currentUser); 

      // 🟢 4. 自動同步到 Google Sheet
      saveToGoogleSheet(item, perPersonAmount);

    } catch (e) { console.error(e); alert(`結算失敗: ${e.message}`); }
  };

  // 🟢 5. 歷史遷移工具 (改為同步 Google Sheet)
  const handleMigration = async () => {
      if (currentUser !== 'Wolf') return;
      if (!window.confirm("確定要將所有歷史紀錄同步到 Google Sheet 嗎？\n這會讀取所有資料並逐筆寫入 (請勿關閉視窗)。")) return;
      
      setIsMigrating(true);
      try {
          // 抓取所有歷史資料 (由舊到新排序，方便試算表依照時間排列)
          const q = query(collection(db, "history_items"), orderBy("settledAt", "asc"));
          const snapshot = await getDocs(q);
          const total = snapshot.docs.length;
          
          let count = 0;
          for (const d of snapshot.docs) {
              const item = d.data();
              // 發送資料到 Google Sheet
              await saveToGoogleSheet(item, item.finalSplit);
              
              count++;
              setMigrationProgress(`${count} / ${total}`);
              
              // 稍微延遲避免 GAS 限制 (雖然 no-cors 不會回傳，但太快還是可能漏)
              await new Promise(r => setTimeout(r, 50));
          }
          alert("Google Sheet 同步完成！");
      } catch (e) {
          console.error(e);
          alert("同步發生錯誤，請看 Console");
      } finally {
          setIsMigrating(false);
          setMigrationProgress('');
      }
  };

  const toggleParticipantInForm = (name) => {
    setFormData(prev => {
        const has = prev.participants.includes(name);
        return { ...prev, participants: has ? prev.participants.filter(p => p !== name) : [...prev.participants, name] };
    });
  };

  const filteredHistory = historyItems.filter(item => {
    const matchMember = historyFilterMember === 'all' || item.seller === historyFilterMember || item.participants.includes(historyFilterMember);
    if (!matchMember) return false;
    if (dateRange.start && new Date(item.settledAt) < new Date(dateRange.start)) return false;
    if (dateRange.end) {
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59);
        if (new Date(item.settledAt) > endDate) return false;
    }
    return true;
  });

  const historyTotalSplit = filteredHistory.reduce((sum, item) => {
      return sum + (item.finalSplit || 0);
  }, 0);

  const theme = { 
      card: isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200', 
      text: isDarkMode ? 'text-gray-100' : 'text-gray-800', 
      subText: isDarkMode ? 'text-gray-400' : 'text-gray-500', 
      input: isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-800' 
  };

  const mainBgClass = isDarkMode ? 'text-gray-100' : 'text-gray-900';

  return (
    <div className={`p-4 md:p-6 pb-20 max-w-7xl mx-auto min-h-screen relative ${mainBgClass}`}>
      {/* Header Buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl shadow-lg transition-all active:scale-95 font-bold">
            <Plus size={20}/> 記帳
        </button>
        <button onClick={() => setIsBalanceGridOpen(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl shadow-lg transition-all active:scale-95 font-bold">
            <Grid size={20}/> 餘額表
        </button>
        
        {currentUser === 'Wolf' && (
            <div className="flex gap-2">
                <button onClick={() => setIsHistoryOpen(true)} className="flex items-center gap-2 bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-xl shadow-lg transition-all active:scale-95 font-bold">
                    <History size={20}/> 歷史紀錄
                </button>
                {/* 🟢 遷移按鈕：文字改為同步 Google Sheet */}
                <button 
                    onClick={handleMigration} 
                    disabled={isMigrating}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg font-bold transition-all ${isMigrating ? 'bg-yellow-600 cursor-not-allowed' : 'bg-green-700 hover:bg-green-600'} text-white`}
                >
                    {isMigrating ? <Loader2 className="animate-spin" size={20}/> : <UploadCloud size={20}/>}
                    {isMigrating ? `同步中... ${migrationProgress}` : '同步 Google Sheet'}
                </button>
            </div>
        )}

        <button onClick={() => setIsCostCalcOpen(true)} className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-xl shadow-lg transition-all active:scale-95 font-bold ml-auto">
            <Calculator size={20}/> 計算機
        </button>
      </div>

      {/* Active Items Section */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 pl-2 border-l-4 border-blue-500 gap-4">
            <h2 className="text-2xl font-bold">進行中項目</h2>
            
            <div className="flex bg-black/20 p-1 rounded-lg border border-white/10 self-end sm:self-auto">
                <button 
                    onClick={() => setFilterMode('all')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterMode === 'all' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    <Users size={14}/> 全部
                </button>
                <button 
                    onClick={() => setFilterMode('mine')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterMode === 'mine' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    <User size={14}/> 我的
                </button>
            </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {displayedActiveItems.map(item => (
            <ItemCard 
                key={item.id} 
                item={item} 
                theme={theme} 
                updateItemValue={updateItemValue} 
                handleSettleAll={handleSettleAll} 
                handleDelete={handleDelete}
                confirmSettleId={confirmSettleId}
                setConfirmSettleId={setConfirmSettleId}
                confirmDeleteId={confirmDeleteId}
                setConfirmDeleteId={setConfirmDeleteId}
                currentUser={currentUser}
            />
          ))}
          {displayedActiveItems.length === 0 && (
              <div className="col-span-full text-center py-10 opacity-30 border-2 border-dashed border-gray-500 rounded-xl">
                  {filterMode === 'mine' ? '您目前沒有掛賣項目' : '目前沒有進行中的項目'}
              </div>
          )}
        </div>
      </div>

      {/* History Modal */}
      {isHistoryOpen && currentUser === 'Wolf' && (
        <div className={`fixed inset-0 z-50 flex flex-col ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-black/20 shrink-0">
              <h3 className={`text-xl font-bold flex items-center gap-2 ${theme.text}`}>
                  <History/> 歷史紀錄 (最近50筆)
              </h3>
              <button 
                  onClick={() => setIsHistoryOpen(false)}
                  className={`p-2 rounded-full hover:bg-white/10 transition-colors ${theme.text}`}
              >
                  <X size={24}/>
              </button>
            </div>
            
            <div className="p-4 border-b border-gray-700 flex flex-wrap gap-4 items-end bg-black/10 shrink-0">
                <div className="flex flex-col gap-1">
                    <label className="text-xs opacity-70">篩選成員</label>
                    <select className={`p-2 rounded border ${theme.input}`} value={historyFilterMember} onChange={e=>setHistoryFilterMember(e.target.value)}>
                        <option value="all">全部成員</option>
                        {memberNames.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs opacity-70">日期範圍</label>
                    <div className="flex gap-2">
                        <input type="date" className={`p-2 rounded border ${theme.input}`} value={dateRange.start} onChange={e=>setDateRange({...dateRange, start: e.target.value})}/>
                        <span className="self-center">~</span>
                        <input type="date" className={`p-2 rounded border ${theme.input}`} value={dateRange.end} onChange={e=>setDateRange({...dateRange, end: e.target.value})}/>
                    </div>
                </div>
                {historyFilterMember !== 'all' && (
                    <div className="ml-auto bg-green-900/30 border border-green-500/30 px-4 py-2 rounded text-green-400 font-bold">
                        {historyFilterMember} 此區間分紅總計: ${historyTotalSplit.toLocaleString()}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                <div className="max-w-7xl mx-auto grid grid-cols-1 gap-6">
                    {filteredHistory.map(item => (
                        <ItemCard key={item.id} item={item} isHistory={true} theme={theme} handleDelete={handleDelete} confirmDeleteId={confirmDeleteId} setConfirmDeleteId={setConfirmDeleteId} currentUser={currentUser}/>
                    ))}
                </div>
                {filteredHistory.length === 0 && <div className="text-center py-20 opacity-30 text-xl">無紀錄</div>}
            </div>
        </div>
      )}

      {/* Add Item Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className={`w-full max-w-lg rounded-2xl p-6 shadow-2xl ${theme.card}`}>
            <div className="flex justify-between items-center mb-6">
                <h3 className={`text-xl font-bold ${theme.text}`}>新增記帳</h3>
                <button onClick={() => setIsModalOpen(false)} className={theme.text}><X/></button>
            </div>
            <div className="space-y-4 mb-6">
                <div><label className={`block text-xs mb-1 ${theme.subText}`}>物品名稱</label><input type="text" className={`w-full p-3 rounded-lg border text-lg ${theme.input}`} placeholder="例如: 伸缩大劍" value={formData.itemName} onChange={e => setFormData({...formData, itemName: e.target.value})}/></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className={`block text-xs mb-1 ${theme.subText}`}>售價 (含稅)</label><MoneyInput className={`w-full p-3 rounded-lg border text-lg ${theme.input}`} placeholder="0" value={formData.price} onChange={val => setFormData({...formData, price: val})}/></div>
                    <div><label className={`block text-xs mb-1 ${theme.subText}`}>額外成本</label><MoneyInput className={`w-full p-3 rounded-lg border text-lg ${theme.input}`} placeholder="0" value={formData.cost} onChange={val => setFormData({...formData, cost: val})}/></div>
                </div>
                <div><label className={`block text-xs mb-1 ${theme.subText}`}>交易所類型</label><select className={`w-full p-3 rounded-lg border ${theme.input}`} value={formData.exchangeType} onChange={e => setFormData({...formData, exchangeType: e.target.value})}>{Object.entries(EXCHANGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            </div>
            <div className="mb-6"><div className="flex justify-between items-center mb-2"><label className={`text-xs ${theme.subText}`}>分紅參與者</label><button onClick={() => setFormData({...formData, participants: []})} className="text-xs text-blue-500 hover:underline">清空</button></div><div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">{memberNames.map(m => (<button key={m} onClick={() => toggleParticipantInForm(m)} className={`px-3 py-1 rounded-full text-xs border ${formData.participants.includes(m) ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-500 text-gray-500'}`}>{m}</button>))}</div></div>
            <div className="flex gap-3"><button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-gray-600 rounded-lg text-white font-bold">取消</button><button onClick={handleAddItem} className="flex-1 py-3 bg-blue-600 rounded-lg text-white font-bold">建立項目</button></div>
          </div>
        </div>
      )}

      <BalanceGrid isOpen={isBalanceGridOpen} onClose={() => setIsBalanceGridOpen(false)} theme={theme} isDarkMode={isDarkMode} currentUser={currentUser} members={filteredMembers} activeItems={activeItems} />
      <CostCalculatorModal isOpen={isCostCalcOpen} onClose={() => setIsCostCalcOpen(false)} theme={theme} isDarkMode={isDarkMode} />
    </div>
  );
};
export default AccountingView;