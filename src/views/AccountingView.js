// src/views/AccountingView.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, History, Grid, Calculator, X, User } from 'lucide-react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, runTransaction } from "firebase/firestore";
import { db } from '../config/firebase';
import { sendLog, sendNotify, calculateFinance } from '../utils/helpers';
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
    onCompositionStart={()=>isComposing.current=true} onCompositionEnd={(e)=>{isComposing.current=false; onChange(parseNumber(e.target.value));}}
  />;
};

const AccountingView = ({ isDarkMode, currentUser, members = [] }) => {
  const [items, setItems] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBalanceGridOpen, setIsBalanceGridOpen] = useState(false);
  const [isCostCalcOpen, setIsCostCalcOpen] = useState(false);
  
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmSettleId, setConfirmSettleId] = useState(null);

  const memberNames = useMemo(() => members.map(m => m.name || m), [members]);

  const initialForm = { itemName: '', price: '', cost: 0, exchangeType: 'WORLD', participants: [] };
  const [formData, setFormData] = useState({ ...initialForm, seller: currentUser || (memberNames[0] || '') });

  const [historyFilter, setHistoryFilter] = useState({ member: '', startDate: '', endDate: '' });

  useEffect(() => { if (currentUser) setFormData(prev => ({ ...prev, seller: currentUser })); }, [currentUser]);

  useEffect(() => {
    if (memberNames.length > 0) {
        setFormData(prev => ({ ...prev, participants: memberNames }));
    }
  }, [memberNames, isModalOpen]);

  useEffect(() => {
    if (!db) return;
    const qItems = query(collection(db, "active_items"));
    const unsubItems = onSnapshot(qItems, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return dateB - dateA; 
      });
      setItems(list);
    });
    
    const qHistory = query(collection(db, "history_items"), orderBy("settledAt", "desc"));
    const unsubHistory = onSnapshot(qHistory, (snap) => setHistoryItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubItems(); unsubHistory(); };
  }, []);

  const filteredHistory = useMemo(() => {
    return historyItems.filter(item => {
        if (historyFilter.member) {
            const participants = item.participants.map(p => p.name || p);
            if (!participants.includes(historyFilter.member) && item.seller !== historyFilter.member) return false;
        }
        if (item.settledAt) {
            const itemDate = item.settledAt.split('T')[0];
            if (historyFilter.startDate && itemDate < historyFilter.startDate) return false;
            if (historyFilter.endDate && itemDate > historyFilter.endDate) return false;
        }
        return true;
    });
  }, [historyItems, historyFilter]);

  const totalEarnings = useMemo(() => {
    if (!historyFilter.member) return 0;
    return filteredHistory.reduce((sum, item) => {
        const { perPersonSplit } = calculateFinance(item.price, item.exchangeType, item.participants?.length || 0, item.cost, item.listingHistory);
        const participants = item.participants.map(p => p.name || p);
        if (participants.includes(historyFilter.member)) {
            return sum + perPersonSplit;
        }
        return sum;
    }, 0);
  }, [filteredHistory, historyFilter.member]);


  const handleAddItem = async () => {
    if (currentUser === '訪客') return alert("訪客權限僅供瀏覽");
    if (!formData.itemName || !formData.price) return alert("請填寫物品名稱與價格");
    
    const finalParticipants = formData.participants.length > 0 ? formData.participants : memberNames;
    const uniqueParticipants = [...new Set([...finalParticipants, formData.seller])];
    const initialPrice = parseNumber(formData.price);
    const initialCost = parseNumber(formData.cost);

    const newItem = {
      ...formData, price: initialPrice, cost: initialCost, listingHistory: [initialPrice], 
      participants: uniqueParticipants.map(p => ({ name: p })), 
      isSold: false, createdAt: new Date().toISOString(), createdBy: currentUser
    };
    try { 
        await addDoc(collection(db, "active_items"), newItem); 
        sendLog(currentUser, "新增", newItem.itemName);
        sendNotify(`🆕 **[新增項目]** ${currentUser} 上架了 **${newItem.itemName}**\n💰 價格: ${initialPrice.toLocaleString()}`);
        setFormData({ ...initialForm, seller: currentUser, participants: memberNames }); 
        setIsModalOpen(false); 
    } catch (e) { alert("新增失敗"); }
  };

  const updateItemValue = async (id, field, value) => { if(currentUser !== '訪客') await updateDoc(doc(db, "active_items", id), { [field]: value }); };
  
  // === 強化版刪除處理 ===
  const handleDelete = async (id, isHistory, itemName) => { 
      if (currentUser === '訪客') return alert("訪客權限僅供瀏覽");
      
      // 1. 本地先移除 (讓使用者覺得立刻刪除了)
      if (isHistory) {
          setHistoryItems(prev => prev.filter(item => item.id !== id));
      } else {
          setItems(prev => prev.filter(item => item.id !== id));
      }

      // 2. 防呆查詢名稱
      let finalItemName = itemName;
      if (!finalItemName) {
          const sourceList = isHistory ? historyItems : items;
          const foundItem = sourceList.find(i => i.id === id);
          if (foundItem) finalItemName = foundItem.itemName;
      }

      // 3. 執行資料庫刪除
      try {
          // 確保 collection 名稱正確
          const colName = isHistory ? "history_items" : "active_items";
          await deleteDoc(doc(db, colName, id));
          
          sendNotify(`🗑️ **[刪除項目]** ${currentUser} 刪除了 **${finalItemName || '未知項目'}**`);
      } catch (e) {
          console.error("Delete failed:", e);
          alert("刪除失敗，請重新整理網頁後再試");
          // 如果失敗，理論上應該把資料加回來，但這裡為了簡化先只提示
      }
  };
  
  const handleSettleAll = async (item, perPersonSplit) => {
    if (currentUser === '訪客') return;
    try {
      await runTransaction(db, async (transaction) => {
        const gridRef = doc(db, "settlement_data", "main_grid");
        const gridDoc = await transaction.get(gridRef);
        let matrix = gridDoc.exists() ? gridDoc.data().matrix : {};
        const seller = item.seller;
        item.participants.forEach(p => { const pName = p.name || p; if (pName !== seller) { const key = `${seller}_${pName}`; matrix[key] = (parseFloat(matrix[key]) || 0) + perPersonSplit; } });
        transaction.set(gridRef, { matrix }, { merge: true });
      });
      await addDoc(collection(db, "history_items"), { ...item, settledAt: new Date().toISOString() });
      await deleteDoc(doc(db, "active_items", item.id));
      sendNotify(`💰 **[已售出]** ${item.seller} 賣出了 **${item.itemName}**\n💵 分紅: ${perPersonSplit.toLocaleString()}/人`);
    } catch(e) { alert("結算失敗"); }
  };

  const toggleParticipantInForm = (name) => {
      if (formData.participants.includes(name)) setFormData({ ...formData, participants: formData.participants.filter(p => p !== name) });
      else setFormData({ ...formData, participants: [...formData.participants, name] });
  };

  const theme = { card: isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200', text: isDarkMode ? 'text-gray-100' : 'text-gray-800', subText: isDarkMode ? 'text-gray-400' : 'text-gray-500', input: isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-800' };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <h2 className={`text-xl font-bold border-l-4 pl-3 ${showHistory ? 'border-gray-500' : 'border-blue-500'} ${theme.text}`}>{showHistory ? `歷史紀錄 (${filteredHistory.length})` : `進行中項目 (${items.length})`}</h2>
        <div className="flex gap-2">
          <button onClick={() => setIsCostCalcOpen(true)} className="flex items-center gap-2 px-3 py-2 rounded text-white shadow bg-orange-500"><Calculator size={18}/> 成本試算</button>
          <button onClick={() => setIsBalanceGridOpen(true)} className="flex items-center gap-2 px-3 py-2 rounded text-white shadow bg-purple-600"><Grid size={18}/> 餘額表</button>
          <button onClick={() => setShowHistory(!showHistory)} className={`flex items-center gap-2 px-3 py-2 rounded shadow ${showHistory ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}><History size={18}/> {showHistory ? '返回' : '歷史'}</button>
          {!showHistory && <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 px-3 py-2 rounded text-white shadow bg-blue-600"><Plus size={18}/> 新增</button>}
        </div>
      </div>

      {showHistory && (
        <div className={`mb-6 p-4 rounded-xl border ${theme.card} flex flex-col gap-4 shadow-sm`}>
            <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[150px]">
                    <label className={`text-xs block mb-1 ${theme.subText}`}>指定成員</label>
                    <div className="relative">
                        <select 
                            className={`w-full p-2 pl-8 rounded border appearance-none ${theme.input}`} 
                            value={historyFilter.member} 
                            onChange={e => setHistoryFilter({...historyFilter, member: e.target.value})}
                        >
                            <option value="">-- 全部 --</option>
                            {memberNames.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <User size={16} className="absolute left-2.5 top-2.5 opacity-50"/>
                    </div>
                </div>
                <div className="flex-1 min-w-[150px]">
                    <label className={`text-xs block mb-1 ${theme.subText}`}>開始日期</label>
                    <input 
                        type="date" 
                        className={`w-full p-2 rounded border ${theme.input}`}
                        value={historyFilter.startDate}
                        onChange={e => setHistoryFilter({...historyFilter, startDate: e.target.value})}
                    />
                </div>
                <div className="flex-1 min-w-[150px]">
                    <label className={`text-xs block mb-1 ${theme.subText}`}>結束日期</label>
                    <input 
                        type="date" 
                        className={`w-full p-2 rounded border ${theme.input}`}
                        value={historyFilter.endDate}
                        onChange={e => setHistoryFilter({...historyFilter, endDate: e.target.value})}
                    />
                </div>
                <button 
                    onClick={() => setHistoryFilter({ member: '', startDate: '', endDate: '' })} 
                    className="p-2.5 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded"
                    title="重置篩選"
                >
                    <X size={20}/>
                </button>
            </div>
            
            {historyFilter.member && (
                <div className={`p-3 rounded-lg flex items-center justify-between ${isDarkMode ? 'bg-blue-900/30 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-blue-500">{historyFilter.member}</span>
                        <span className={`text-sm ${theme.subText}`}>在指定區間內的總分紅：</span>
                    </div>
                    <span className="text-2xl font-bold font-mono text-green-500">
                        +${totalEarnings.toLocaleString()}
                    </span>
                </div>
            )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-20 flex flex-col gap-4 content-start">
        {(showHistory ? filteredHistory : items).length === 0 && (
            <div className={`text-center py-20 ${theme.subText} opacity-50`}>沒有符合條件的資料</div>
        )}
        {(showHistory ? filteredHistory : items).map(item => (
            <ItemCard 
                key={item.id} 
                item={item} 
                isHistory={showHistory} 
                updateItemValue={updateItemValue} 
                handleSettleAll={handleSettleAll} 
                handleDelete={handleDelete} 
                currentUser={currentUser} 
                members={memberNames} 
                confirmDeleteId={confirmDeleteId}
                setConfirmDeleteId={setConfirmDeleteId}
                confirmSettleId={confirmSettleId}
                setConfirmSettleId={setConfirmSettleId}
            />
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className={`w-full max-w-lg rounded-xl p-6 shadow-2xl ${theme.card}`}>
            <h3 className={`text-xl font-bold mb-4 ${theme.text}`}>建立新記帳項目</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div><label className={`block text-xs mb-1 ${theme.subText}`}>販賣人</label><select className={`w-full p-2 rounded border ${theme.input}`} value={formData.seller} onChange={e => setFormData({...formData, seller: e.target.value})}>{memberNames.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
              <div><label className={`block text-xs mb-1 ${theme.subText}`}>價格</label><MoneyInput className={`w-full p-2 rounded border ${theme.input}`} value={formData.price} onChange={v => setFormData({...formData, price: v})} placeholder="0"/></div>
              <div className="col-span-2"><label className={`block text-xs mb-1 ${theme.subText}`}>物品名稱</label><input type="text" className={`w-full p-2 rounded border ${theme.input}`} value={formData.itemName} onChange={e => setFormData({...formData, itemName: e.target.value})}/></div>
              <div><label className={`block text-xs mb-1 ${theme.subText}`}>成本 (選填)</label><MoneyInput className={`w-full p-2 rounded border ${theme.input}`} value={formData.cost} onChange={v => setFormData({...formData, cost: v})} placeholder="0"/></div>
              <div><label className={`block text-xs mb-1 ${theme.subText}`}>稅率</label><select className={`w-full p-2 rounded border ${theme.input}`} value={formData.exchangeType} onChange={e => setFormData({...formData, exchangeType: e.target.value})}>{Object.entries(EXCHANGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            </div>
            <div className="mb-6"><div className="flex justify-between items-center mb-2"><label className={`text-xs ${theme.subText}`}>分紅參與者</label><button onClick={() => setFormData({...formData, participants: []})} className="text-xs text-blue-500 hover:underline">清空</button></div><div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">{memberNames.map(m => (<button key={m} onClick={() => toggleParticipantInForm(m)} className={`px-3 py-1 rounded-full text-xs border ${formData.participants.includes(m) ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-500 text-gray-500'}`}>{m}</button>))}</div></div>
            <div className="flex gap-3"><button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-gray-600 rounded-lg text-white font-bold">取消</button><button onClick={handleAddItem} className="flex-1 py-3 bg-blue-600 rounded-lg text-white font-bold">建立項目</button></div>
          </div>
        </div>
      )}

      <BalanceGrid isOpen={isBalanceGridOpen} onClose={() => setIsBalanceGridOpen(false)} theme={theme} isDarkMode={isDarkMode} currentUser={currentUser} members={members} activeItems={items} />
      <CostCalculatorModal isOpen={isCostCalcOpen} onClose={() => setIsCostCalcOpen(false)} theme={theme} isDarkMode={isDarkMode} />
    </div>
  );
};
export default AccountingView;