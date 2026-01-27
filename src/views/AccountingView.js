// src/views/AccountingView.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, History, Grid, Calculator, X, User, Users} from 'lucide-react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, runTransaction, limit } from "firebase/firestore";
import { db } from '../config/firebase';
import { sendLog, sendNotify} from '../utils/helpers';
import BalanceGrid from '../components/BalanceGrid';
import ItemCard from '../components/ItemCard';
import CostCalculatorModal from '../components/CostCalculatorModal';
import { EXCHANGE_TYPES } from '../utils/constants';

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
  
  // 篩選狀態：'all' (全部) 或 'mine' (我的)
  const [filterMode, setFilterMode] = useState('all'); 

  // Modals & UI States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isBalanceGridOpen, setIsBalanceGridOpen] = useState(false);
  
  // 🟢 修正變數名稱：統一使用 isCostCalcOpen
  const [isCostCalcOpen, setIsCostCalcOpen] = useState(false);
  
  const [confirmSettleId, setConfirmSettleId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Filter States for History
  const [historyFilterMember, setHistoryFilterMember] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Form Data
  const [formData, setFormData] = useState({ itemName: '', price: '', cost: 0, seller: currentUser, participants: [], exchangeType: 'WORLD' });

  // 🟢 補回 filteredMembers 定義
  const filteredMembers = useMemo(() => {
    return members.filter(m => m.hideFromAccounting !== true);
  }, [members]);

  const memberNames = useMemo(() => filteredMembers.map(m => m.name || m), [filteredMembers]);

  // Data Fetching
  useEffect(() => {
    if (!db) return;
    
    // 進行中項目
    const qActive = query(collection(db, "active_items"), orderBy("createdAt", "desc"));
    const unsubActive = onSnapshot(qActive, (snap) => setActiveItems(snap.docs.map(d => ({ ...d.data(), id: d.id }))));

    let unsubHistory = () => {};

    // 只有 Wolf 才去讀取歷史紀錄 (節省流量)
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

  // 計算目前要顯示的項目 (過濾邏輯)
  const displayedActiveItems = useMemo(() => {
    if (filterMode === 'mine') {
      return activeItems.filter(item => item.seller === currentUser);
    }
    return activeItems;
  }, [activeItems, filterMode, currentUser]);

  const handleAddItem = async () => {
    if (currentUser === '訪客') return alert("訪客僅供瀏覽");
    if (!formData.itemName || !formData.price) return alert("請輸入名稱與價格");
    try {
      const newItem = { ...formData, price: parseNumber(formData.price), cost: parseNumber(formData.cost), createdAt: new Date().toISOString(), listingHistory: [parseNumber(formData.price)] };
      await addDoc(collection(db, "active_items"), newItem);
      setIsModalOpen(false);
      setFormData({ itemName: '', price: '', cost: 0, seller: currentUser, participants: [], exchangeType: 'WORLD' });
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

  // 🟢 修正 perPersonSplit 未定義的問題 (參數是 perPersonAmount)
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
      // 🟢 這裡原本寫錯變數，已修正為 perPersonAmount
      sendNotify(`💰 **[已售出]** ${item.seller} 賣出了 **${item.itemName}**\n💵 分紅: ${perPersonAmount.toLocaleString()}/人`);
    } catch (e) { console.error(e); alert(`結算失敗: ${e.message}`); }
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
      // 這裡需要 calculateFinance 但它不在 import 裡，不過如果這段邏輯不需要顯示詳細計算，可以用 finalSplit
      // 為了避免 no-undef，如果 historyItems 裡有 finalSplit 欄位，直接用它
      return sum + (item.finalSplit || 0);
  }, 0);

  const theme = { 
      text: 'var(--app-text)', 
      subText: 'opacity-60', 
      card: 'var(--card-bg)', 
      input: isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800' 
  };

  return (
    <div className="p-4 md:p-6 pb-20 max-w-7xl mx-auto min-h-screen relative" style={{ color: 'var(--app-text)' }}>
      {/* Header Buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl shadow-lg transition-all active:scale-95 font-bold">
            <Plus size={20}/> 記帳
        </button>
        <button onClick={() => setIsBalanceGridOpen(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl shadow-lg transition-all active:scale-95 font-bold">
            <Grid size={20}/> 餘額表
        </button>
        
        {currentUser === 'Wolf' && (
            <button onClick={() => setIsHistoryOpen(true)} className="flex items-center gap-2 bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-xl shadow-lg transition-all active:scale-95 font-bold">
                <History size={20}/> 歷史紀錄
            </button>
        )}

        {/* 🟢 修正 CostCalculatorModal 的開關狀態變數名稱 */}
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

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--app-bg)' }}>
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-black/20 shrink-0">
              <h3 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
                  <History/> 歷史紀錄 (最近50筆)
              </h3>
              <button 
                  onClick={() => setIsHistoryOpen(false)}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  style={{ color: 'var(--app-text)' }}
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
                <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
                <h3 className="text-xl font-bold">新增記帳</h3>
                <button onClick={() => setIsModalOpen(false)}><X/></button>
            </div>
            <div className="space-y-4 mb-6">
                <div><label className={`text-xs ${theme.subText}`}>物品名稱</label><input type="text" className={`w-full p-3 rounded-lg border text-lg ${theme.input}`} placeholder="例如: 伸缩大劍" value={formData.itemName} onChange={e => setFormData({...formData, itemName: e.target.value})}/></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className={`text-xs ${theme.subText}`}>售價 (含稅)</label><MoneyInput className={`w-full p-3 rounded-lg border text-lg ${theme.input}`} placeholder="0" value={formData.price} onChange={val => setFormData({...formData, price: val})}/></div>
                    <div><label className={`text-xs ${theme.subText}`}>額外成本</label><MoneyInput className={`w-full p-3 rounded-lg border text-lg ${theme.input}`} placeholder="0" value={formData.cost} onChange={val => setFormData({...formData, cost: val})}/></div>
                </div>
                <div><label className={`text-xs ${theme.subText}`}>交易所類型</label><select className={`w-full p-3 rounded-lg border ${theme.input}`} value={formData.exchangeType} onChange={e => setFormData({...formData, exchangeType: e.target.value})}>{Object.entries(EXCHANGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            </div>
            <div className="mb-6"><div className="flex justify-between items-center mb-2"><label className={`text-xs ${theme.subText}`}>分紅參與者</label><button onClick={() => setFormData({...formData, participants: []})} className="text-xs text-blue-500 hover:underline">清空</button></div><div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">{memberNames.map(m => (<button key={m} onClick={() => toggleParticipantInForm(m)} className={`px-3 py-1 rounded-full text-xs border ${formData.participants.includes(m) ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-500 text-gray-500'}`}>{m}</button>))}</div></div>
            <div className="flex gap-3"><button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-gray-600 rounded-lg text-white font-bold">取消</button><button onClick={handleAddItem} className="flex-1 py-3 bg-blue-600 rounded-lg text-white font-bold">建立項目</button></div>
          </div>
        </div>
      )}

      {/* 🟢 修正 BalanceGrid 與 CostCalculatorModal 的 props */}
      <BalanceGrid isOpen={isBalanceGridOpen} onClose={() => setIsBalanceGridOpen(false)} theme={theme} isDarkMode={isDarkMode} currentUser={currentUser} members={filteredMembers} activeItems={activeItems} />
      <CostCalculatorModal isOpen={isCostCalcOpen} onClose={() => setIsCostCalcOpen(false)} theme={theme} isDarkMode={isDarkMode} />
    </div>
  );
};
export default AccountingView;