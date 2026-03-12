// src/views/AccountingView.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Grid, Calculator, X, User, Users, Loader2, AlertTriangle, Search, PackagePlus, List, AlertCircle, ChevronRight } from 'lucide-react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, runTransaction } from "firebase/firestore";
import { db } from '../config/firebase';
import { sendLog, sendNotify, sendSoldNotification } from '../utils/helpers';
import BalanceGrid from '../components/BalanceGrid';
import ItemCard from '../components/ItemCard';
import CostCalculatorModal from '../components/CostCalculatorModal';
import { EXCHANGE_TYPES } from '../utils/constants';

// 🟢 1. 引入建議掛賣順序元件
import SellerSuggestionStrip from '../components/SellerSuggestionStrip';

const GOOGLE_SHEET_API_URL = "https://script.google.com/macros/s/AKfycbz35pDfw6aUtg_zvVhix30nYv_0tKAa9No8_cuR1CIKRZnpUpAzomCHSCdDSORn2n8hdA/exec";
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQtVWCzNdv-0BNV4SMvA8WH6P7IcOi7x11gXqkK53u6aY_eOeFiSMdW9W5UNWkGv_L-IucNVNvl0_5h/pub?output=csv";

const formatNumber = (num) => num?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') || '';
const parseNumber = (val) => parseFloat(val?.toString().replace(/,/g, '')) || 0;

const parseCSVLine = (text) => {
    const result = [];
    let start = 0;
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '"') inQuotes = !inQuotes;
        if (text[i] === ',' && !inQuotes) {
            let field = text.substring(start, i).trim();
            if (field.startsWith('"') && field.endsWith('"')) field = field.slice(1, -1);
            result.push(field);
            start = i + 1;
        }
    }
    let lastField = text.substring(start).trim();
    if (lastField.startsWith('"') && lastField.endsWith('"')) lastField = lastField.slice(1, -1);
    result.push(lastField);
    return result;
};

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
  const [filterMode, setFilterMode] = useState('all'); 

  // Modals & UI States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBalanceGridOpen, setIsBalanceGridOpen] = useState(false);
  const [isCostCalcOpen, setIsCostCalcOpen] = useState(false);
  
  const [itemDict, setItemDict] = useState([]);
  const [isDictModalOpen, setIsDictModalOpen] = useState(false);
  const [isItemSelectOpen, setIsItemSelectOpen] = useState(false);
  const [dictForm, setDictForm] = useState({ name: '', source: '', category: '', newSource: '', newCategory: '' });
  
  const [dictSearch, setDictSearch] = useState('');
  const [dictFilterSource, setDictFilterSource] = useState('all');
  const [dictFilterCategory, setDictFilterCategory] = useState('all');

  const [isQueryOpen, setIsQueryOpen] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState(null);
  const [queryForm, setQueryForm] = useState({
      member: currentUser === '訪客' || currentUser === 'Wolf' ? (members[0]?.name || '') : currentUser,
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState(false);
  const [confirmSettleId, setConfirmSettleId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [formData, setFormData] = useState({ itemName: '', price: '', cost: 0, seller: currentUser, participants: [], exchangeType: 'WORLD' });

  const filteredMembers = useMemo(() => {
    return members.filter(m => m.hideFromAccounting !== true);
  }, [members]);

  const memberNames = useMemo(() => filteredMembers.map(m => m.name || m), [filteredMembers]);

  useEffect(() => {
    if (!db) return;
    const qActive = query(collection(db, "active_items"), orderBy("createdAt", "desc"));
    const unsubActive = onSnapshot(qActive, (snap) => setActiveItems(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    return () => unsubActive();
  }, []);

  useEffect(() => {
    if (!db) return;
    const qDict = query(collection(db, "item_dictionary"), orderBy("name", "asc"));
    const unsubDict = onSnapshot(qDict, (snap) => setItemDict(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    return () => unsubDict();
  }, []);

  const uniqueSources = useMemo(() => [...new Set(itemDict.map(i => i.source).filter(Boolean))], [itemDict]);
  const uniqueCategories = useMemo(() => [...new Set(itemDict.map(i => i.category).filter(Boolean))], [itemDict]);

  const currentCompetitors = useMemo(() => {
    if (!formData.itemName) return [];
    return activeItems.filter(item => item.itemName === formData.itemName && item.seller !== currentUser);
  }, [formData.itemName, activeItems, currentUser]);

  useEffect(() => { if (isModalOpen) setFormData(prev => ({ ...prev, seller: currentUser })); }, [isModalOpen, currentUser]);

  const displayedActiveItems = useMemo(() => {
    if (filterMode === 'mine') return activeItems.filter(item => item.seller === currentUser);
    return activeItems;
  }, [activeItems, filterMode, currentUser]);

  const saveToGoogleSheet = async (item, profitOverride = null) => {
    const profit = profitOverride !== null ? profitOverride : (item.finalSplit || 0);
    let participantsStr = Array.isArray(item.participants) ? item.participants.map(p => typeof p === 'string' ? p : p.name).join(', ') : "";
    const payload = {
        createdAt: item.createdAt || new Date().toISOString(), seller: item.seller || 'Unknown', itemName: item.itemName || 'Unknown',
        price: item.price || 0, profit: profit, participants: participantsStr
    };
    try { await fetch(GOOGLE_SHEET_API_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) });
    } catch (e) { console.error("Sheet Sync Error:", e); }
  };

  const handleQueryRevenue = async () => {
      if (!GOOGLE_SHEET_CSV_URL) return alert("CSV 網址未設定");
      setQueryLoading(true); setQueryResult(null);
      try {
          const response = await fetch(GOOGLE_SHEET_CSV_URL);
          const text = await response.text();
          const rows = text.split('\n').map(line => line.trim()).filter(line => line);
          if (rows.length < 2) throw new Error("無資料");

          const headers = parseCSVLine(rows[0]);
          const idxTime = headers.findIndex(h => h.includes('建立時間') || h.includes('Date'));
          const idxSeller = headers.findIndex(h => h.includes('販售人') || h.includes('Seller'));
          const idxPrice = headers.findIndex(h => h.includes('價格') || h.includes('Price'));
          const idxItemName = headers.findIndex(h => h.includes('物品名稱') || h.includes('Item'));

          if (idxTime === -1 || idxSeller === -1 || idxPrice === -1) throw new Error("CSV 欄位格式不符");

          const startDate = new Date(queryForm.start);
          const endDate = new Date(queryForm.end);
          endDate.setHours(23, 59, 59);

          let totalSales = 0; let count = 0; const details = [];
          for (let i = 1; i < rows.length; i++) {
              const cols = parseCSVLine(rows[i]);
              if (cols.length <= idxPrice) continue;
              const rowTimeStr = cols[idxTime];
              const rowSeller = cols[idxSeller];
              const rowPrice = parseFloat(cols[idxPrice]) || 0;
              const rowItemName = idxItemName !== -1 ? cols[idxItemName] : '未知物品';

              if (!rowTimeStr) continue;
              const rowDate = new Date(rowTimeStr);
              if (rowSeller === queryForm.member && rowDate >= startDate && rowDate <= endDate) {
                  totalSales += rowPrice; count++; details.push({ name: rowItemName, price: rowPrice });
              }
          }
          details.sort((a, b) => b.price - a.price);
          setQueryResult({ totalSales, count, topItems: details.slice(0, 5) });
      } catch (e) { console.error(e); alert("查詢失敗，請檢查 CSV 連結或網路狀態");
      } finally { setQueryLoading(false); }
  };

  const handleAddDictItem = async () => {
    if (currentUser === '訪客') return alert("訪客權限不足");
    const finalSource = dictForm.source === 'NEW' ? dictForm.newSource.trim() : dictForm.source;
    const finalCategory = dictForm.category === 'NEW' ? dictForm.newCategory.trim() : dictForm.category;
    const finalName = dictForm.name.trim();

    if (!finalName || !finalSource || !finalCategory) return alert("名稱、來源、類別皆為必填！");
    
    if (itemDict.some(i => i.name === finalName)) {
        return alert(`物品 [${finalName}] 已經存在於名冊中了！`);
    }

    try {
        await addDoc(collection(db, "item_dictionary"), {
            name: finalName,
            source: finalSource,
            category: finalCategory,
            createdBy: currentUser,
            createdAt: new Date().toISOString()
        });
        alert(`成功新增物品: ${finalName}`);
        setIsDictModalOpen(false);
        setDictForm({ name: '', source: '', category: '', newSource: '', newCategory: '' });
    } catch (e) {
        console.error("新增字典失敗", e);
        alert("新增失敗");
    }
  };

  const handleAddItem = async () => {
    if (currentUser === '訪客') return alert("訪客僅供瀏覽");
    if (!formData.itemName || !formData.price) return alert("請選擇物品名稱與輸入價格");
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
    setIsProcessing(true); setProcessError(false);
    const safeParticipants = Array.isArray(item.participants) ? item.participants : [];
    try {
      await runTransaction(db, async (transaction) => {
        const gridRef = doc(db, "settlement_data", "main_grid");
        const gridDoc = await transaction.get(gridRef);
        let matrix = gridDoc.exists() ? gridDoc.data().matrix : {};
        safeParticipants.forEach(p => {
            const pName = typeof p === 'string' ? p : p.name;
            if (pName && item.seller && pName !== item.seller) {
                const key = `${item.seller}_${pName}`; const reverseKey = `${pName}_${item.seller}`;
                let debt = matrix[reverseKey] || 0;
                if (debt >= perPersonAmount) { matrix[reverseKey] = debt - perPersonAmount; } 
                else { matrix[reverseKey] = 0; matrix[key] = (parseFloat(matrix[key]) || 0) + (perPersonAmount - debt); }
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
      
      // 🟢 2. 移除這行，不再發送 [已售出] 訊息到主要頻道
      // sendNotify(`💰 **[已售出]** ${item.seller} 賣出了 **${item.itemName}**\n💵 分紅: ${perPersonAmount.toLocaleString()}/人`);
      
      sendSoldNotification(item, currentUser);
      await saveToGoogleSheet(item, perPersonAmount);
      setTimeout(() => { setIsProcessing(false); }, 500);
    } catch (e) { console.error(e); setProcessError(true); }
  };

  const toggleParticipantInForm = (name) => {
    setFormData(prev => {
        const has = prev.participants.includes(name);
        return { ...prev, participants: has ? prev.participants.filter(p => p !== name) : [...prev.participants, name] };
    });
  };

  const theme = { 
      card: isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200', 
      text: isDarkMode ? 'text-gray-100' : 'text-gray-800', 
      subText: isDarkMode ? 'text-gray-400' : 'text-gray-500', 
      input: isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-800' 
  };
  const mainBgClass = isDarkMode ? 'text-gray-100' : 'text-gray-900';

  const filteredDictItems = itemDict.filter(item => {
      if (dictSearch && !item.name.toLowerCase().includes(dictSearch.toLowerCase())) return false;
      if (dictFilterSource !== 'all' && item.source !== dictFilterSource) return false;
      if (dictFilterCategory !== 'all' && item.category !== dictFilterCategory) return false;
      return true;
  });

  return (
    // 🟢 3. 調整排版：加入 flex-col 與 lg:flex-row，讓畫面分為左右兩欄
    <div className={`p-4 md:p-6 pb-20 max-w-7xl mx-auto min-h-screen relative flex flex-col lg:flex-row gap-6 ${mainBgClass}`}>
      
      {/* 🟢 左側欄位：建議掛賣順序 (設定為 sticky 可以讓它黏在畫面上) */}
      <div className={`w-full lg:w-1/4 rounded-2xl flex flex-col shadow-lg overflow-hidden h-fit max-h-[85vh] sticky top-6 ${theme.card}`}>
          <SellerSuggestionStrip isDarkMode={isDarkMode} vertical={true} members={filteredMembers} />
      </div>

      {/* 🟢 右側欄位：原本的主要記帳區塊 */}
      <div className="w-full lg:w-3/4 flex flex-col">
          {/* Header Buttons */}
          <div className="flex flex-wrap gap-3 mb-6">
            <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl shadow-lg transition-all active:scale-95 font-bold">
                <Plus size={20}/> 記帳
            </button>
            <button onClick={() => setIsDictModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl shadow-lg transition-all active:scale-95 font-bold">
                <PackagePlus size={20}/> 新增物品
            </button>
            <button onClick={() => setIsBalanceGridOpen(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl shadow-lg transition-all active:scale-95 font-bold">
                <Grid size={20}/> 餘額表
            </button>
            <div className="flex gap-2">
                <button onClick={() => setIsQueryOpen(true)} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-xl shadow-lg transition-all active:scale-95 font-bold">
                    <Search size={20}/> 查詢收益
                </button>
            </div>
            <button onClick={() => setIsCostCalcOpen(true)} className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-xl shadow-lg transition-all active:scale-95 font-bold ml-auto">
                <Calculator size={20}/> 計算機
            </button>
          </div>

          {/* Active Items Section */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 pl-2 border-l-4 border-blue-500 gap-4">
                <h2 className="text-2xl font-bold">進行中項目</h2>
                <div className="flex bg-black/20 p-1 rounded-lg border border-white/10 self-end sm:self-auto">
                    <button onClick={() => setFilterMode('all')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterMode === 'all' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}> <Users size={14}/> 全部 </button>
                    <button onClick={() => setFilterMode('mine')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterMode === 'mine' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}> <User size={14}/> 我的 </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {displayedActiveItems.map(item => (
                <ItemCard key={item.id} item={item} theme={theme} updateItemValue={updateItemValue} handleSettleAll={handleSettleAll} handleDelete={handleDelete} confirmSettleId={confirmSettleId} setConfirmSettleId={setConfirmSettleId} confirmDeleteId={confirmDeleteId} setConfirmDeleteId={setConfirmDeleteId} currentUser={currentUser} />
              ))}
              {displayedActiveItems.length === 0 && (
                  <div className="col-span-full text-center py-10 opacity-30 border-2 border-dashed border-gray-500 rounded-xl">
                      {filterMode === 'mine' ? '您目前沒有掛賣項目' : '目前沒有進行中的項目'}
                  </div>
              )}
            </div>
          </div>
      </div>

      {/* 物品名冊建檔 Modal */}
      {isDictModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl ${theme.card}`}>
            <div className="flex justify-between items-center mb-6">
                <h3 className={`text-xl font-bold ${theme.text} flex items-center gap-2`}><PackagePlus size={24}/> 建立新物品</h3>
                <button onClick={() => setIsDictModalOpen(false)} className={theme.text}><X/></button>
            </div>
            <div className="space-y-4 mb-6">
                <div>
                    <label className={`block text-xs mb-1 ${theme.subText}`}>物品名稱</label>
                    <input type="text" className={`w-full p-3 rounded-lg border text-lg ${theme.input}`} placeholder="例如: 伸缩大劍" value={dictForm.name} onChange={e => setDictForm({...dictForm, name: e.target.value})}/>
                </div>
                <div>
                    <label className={`block text-xs mb-1 ${theme.subText}`}>物品來源</label>
                    <select className={`w-full p-3 rounded-lg border mb-2 ${theme.input}`} value={dictForm.source} onChange={e => setDictForm({...dictForm, source: e.target.value})}>
                        <option value="">請選擇來源...</option>
                        {uniqueSources.map(s => <option key={s} value={s}>{s}</option>)}
                        <option value="NEW">➕ 自訂新來源...</option>
                    </select>
                    {dictForm.source === 'NEW' && (
                        <input type="text" className={`w-full p-3 rounded-lg border ${theme.input}`} placeholder="輸入新來源名稱" value={dictForm.newSource} onChange={e => setDictForm({...dictForm, newSource: e.target.value})}/>
                    )}
                </div>
                <div>
                    <label className={`block text-xs mb-1 ${theme.subText}`}>物品類別</label>
                    <select className={`w-full p-3 rounded-lg border mb-2 ${theme.input}`} value={dictForm.category} onChange={e => setDictForm({...dictForm, category: e.target.value})}>
                        <option value="">請選擇類別...</option>
                        {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                        <option value="NEW">➕ 自訂新類別...</option>
                    </select>
                    {dictForm.category === 'NEW' && (
                        <input type="text" className={`w-full p-3 rounded-lg border ${theme.input}`} placeholder="輸入新類別名稱" value={dictForm.newCategory} onChange={e => setDictForm({...dictForm, newCategory: e.target.value})}/>
                    )}
                </div>
            </div>
            <div className="flex gap-3">
                <button onClick={() => setIsDictModalOpen(false)} className="flex-1 py-3 bg-gray-600 rounded-lg text-white font-bold">取消</button>
                <button onClick={handleAddDictItem} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-bold">確認建立</button>
            </div>
          </div>
        </div>
      )}

      {/* 新增記帳 Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className={`w-full max-w-lg rounded-2xl p-6 shadow-2xl ${theme.card}`}>
            <div className="flex justify-between items-center mb-6">
                <h3 className={`text-xl font-bold ${theme.text}`}>新增記帳</h3>
                <button onClick={() => setIsModalOpen(false)} className={theme.text}><X/></button>
            </div>
            <div className="space-y-4 mb-6">
                <div>
                    <label className={`block text-xs mb-1 ${theme.subText}`}>物品名稱</label>
                    <div 
                        onClick={() => setIsItemSelectOpen(true)}
                        className={`w-full p-3 rounded-lg border text-lg flex justify-between items-center cursor-pointer transition-colors ${formData.itemName ? 'border-blue-500 text-blue-400' : theme.input}`}
                    >
                        <span>{formData.itemName || '請點擊此處選擇物品...'}</span>
                        <ChevronRight size={20} className="opacity-50" />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className={`block text-xs mb-1 ${theme.subText}`}>售價 (含稅)</label><MoneyInput className={`w-full p-3 rounded-lg border text-lg ${theme.input}`} placeholder="0" value={formData.price} onChange={val => setFormData({...formData, price: val})}/></div>
                    <div><label className={`block text-xs mb-1 ${theme.subText}`}>額外成本</label><MoneyInput className={`w-full p-3 rounded-lg border text-lg ${theme.input}`} placeholder="0" value={formData.cost} onChange={val => setFormData({...formData, cost: val})}/></div>
                </div>
                <div><label className={`block text-xs mb-1 ${theme.subText}`}>交易所類型</label><select className={`w-full p-3 rounded-lg border ${theme.input}`} value={formData.exchangeType} onChange={e => setFormData({...formData, exchangeType: e.target.value})}>{Object.entries(EXCHANGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            </div>
            <div className="mb-4">
                <div className="flex justify-between items-center mb-2"><label className={`text-xs ${theme.subText}`}>分紅參與者</label><button onClick={() => setFormData({...formData, participants: []})} className="text-xs text-blue-500 hover:underline">清空</button></div>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {memberNames.map(m => (<button key={m} onClick={() => toggleParticipantInForm(m)} className={`px-3 py-1 rounded-full text-xs border ${formData.participants.includes(m) ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-500 text-gray-500'}`}>{m}</button>))}
                </div>
            </div>

            {formData.itemName && currentCompetitors.length > 0 && (
                <div className="mb-6 p-3 bg-orange-900/30 border border-orange-500/50 rounded-lg animate-in fade-in zoom-in">
                    <p className="text-orange-400 text-xs font-bold flex items-center gap-1 mb-2">
                        <AlertCircle size={14} /> 團隊成員掛賣中 (避免過度壓價)
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {currentCompetitors.map(c => (
                            <div key={c.id} className="text-xs bg-black/40 px-2 py-1.5 rounded flex items-center gap-2 border border-white/5 shadow-sm">
                                <span className="text-gray-300">{c.seller}</span>
                                <span className="text-orange-300 font-mono font-bold">${formatNumber(c.price)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex gap-3">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-gray-600 rounded-lg text-white font-bold">取消</button>
                <button onClick={handleAddItem} className="flex-1 py-3 bg-blue-600 rounded-lg text-white font-bold">建立項目</button>
            </div>
          </div>
        </div>
      )}

      {/* 物品選擇器面板 */}
      {isItemSelectOpen && (
        <div className="fixed inset-0 bg-black/80 flex flex-col p-4 z-[60] backdrop-blur-md animate-in slide-in-from-bottom-4">
            <div className={`w-full max-w-2xl mx-auto rounded-2xl shadow-2xl flex flex-col h-full max-h-[90vh] ${theme.card}`}>
                <div className="p-4 border-b border-gray-700 flex justify-between items-center shrink-0">
                    <h3 className={`text-xl font-bold ${theme.text} flex items-center gap-2`}><List size={24}/> 選擇物品</h3>
                    <button onClick={() => setIsItemSelectOpen(false)} className={`p-2 rounded-full hover:bg-white/10 ${theme.text}`}><X/></button>
                </div>
                
                <div className="p-4 border-b border-gray-700 bg-black/10 shrink-0 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-3 text-gray-500" size={18} />
                        <input type="text" placeholder="輸入關鍵字搜尋物品..." className={`w-full pl-10 p-2.5 rounded-lg border ${theme.input}`} value={dictSearch} onChange={e => setDictSearch(e.target.value)} />
                    </div>
                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className={`block text-xs mb-1 ${theme.subText}`}>來源篩選</label>
                            <select className={`w-full p-2 rounded-lg border text-sm ${theme.input}`} value={dictFilterSource} onChange={e => setDictFilterSource(e.target.value)}>
                                <option value="all">所有來源</option>
                                {uniqueSources.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className={`block text-xs mb-1 ${theme.subText}`}>類別篩選</label>
                            <select className={`w-full p-2 rounded-lg border text-sm ${theme.input}`} value={dictFilterCategory} onChange={e => setDictFilterCategory(e.target.value)}>
                                <option value="all">所有類別</option>
                                {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {filteredDictItems.length === 0 ? (
                        <div className="text-center py-20 opacity-50 flex flex-col items-center">
                            <PackagePlus size={48} className="mb-4 opacity-30" />
                            <p>找不到符合條件的物品</p>
                            <button onClick={() => { setIsItemSelectOpen(false); setIsDictModalOpen(true); }} className="mt-4 text-blue-400 hover:underline">去「新增物品」建立一個吧！</button>
                        </div>
                    ) : (
                        filteredDictItems.map(item => (
                            <div 
                                key={item.id} 
                                onClick={() => { setFormData({...formData, itemName: item.name}); setIsItemSelectOpen(false); }}
                                className={`p-4 rounded-xl border flex justify-between items-center cursor-pointer transition-all hover:scale-[1.01] active:scale-95 ${isDarkMode ? 'bg-gray-800 border-gray-700 hover:border-blue-500' : 'bg-white border-gray-200 hover:border-blue-500'}`}
                            >
                                <div>
                                    <h4 className={`text-lg font-bold mb-1 ${theme.text}`}>{item.name}</h4>
                                    <div className="flex gap-2">
                                        <span className="text-xs bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">{item.source}</span>
                                        <span className="text-xs bg-teal-900/40 text-teal-300 px-2 py-0.5 rounded border border-teal-500/30">{item.category}</span>
                                    </div>
                                </div>
                                <ChevronRight className="opacity-30" />
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
      )}

      {/* 收益查詢 Modal */}
      {isQueryOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl ${theme.card}`}>
            <div className="flex justify-between items-center mb-6">
                <h3 className={`text-xl font-bold ${theme.text} flex items-center gap-2`}><Search size={20}/> 歷史收益查詢</h3>
                <button onClick={() => setIsQueryOpen(false)} className={theme.text}><X/></button>
            </div>

            <div className="space-y-4">
                <div>
                    <label className={`block text-xs mb-1 ${theme.subText}`}>查詢對象</label>
                    <select className={`w-full p-3 rounded-lg border ${theme.input}`} value={queryForm.member} onChange={e => setQueryForm({...queryForm, member: e.target.value})}>
                        {memberNames.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={`block text-xs mb-1 ${theme.subText}`}>開始日期</label>
                        <input type="date" className={`w-full p-3 rounded-lg border ${theme.input}`} value={queryForm.start} onChange={e => setQueryForm({...queryForm, start: e.target.value})}/>
                    </div>
                    <div>
                        <label className={`block text-xs mb-1 ${theme.subText}`}>結束日期</label>
                        <input type="date" className={`w-full p-3 rounded-lg border ${theme.input}`} value={queryForm.end} onChange={e => setQueryForm({...queryForm, end: e.target.value})}/>
                    </div>
                </div>

                <button onClick={handleQueryRevenue} disabled={queryLoading} className="w-full py-3 bg-teal-600 hover:bg-teal-500 rounded-lg text-white font-bold flex items-center justify-center gap-2">
                    {queryLoading ? <Loader2 className="animate-spin" size={20}/> : <Search size={20}/>}
                    {queryLoading ? '資料讀取中...' : '開始查詢'}
                </button>

                {queryResult && (
                    <div className="mt-4 p-4 rounded-xl bg-black/20 border border-white/10 animate-in fade-in zoom-in">
                        <div className="text-center mb-4">
                            <p className="text-sm opacity-60">期間總銷售額 ({queryForm.member})</p>
                            <p className="text-3xl font-bold text-teal-400">${queryResult.totalSales.toLocaleString()}</p>
                            <p className="text-xs opacity-50 mt-1">共 {queryResult.count} 筆交易</p>
                        </div>
                        {queryResult.topItems.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-bold opacity-70 border-b border-white/10 pb-1">🔥 最高價交易 (Top 5)</p>
                                {queryResult.topItems.map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-sm">
                                        <span>{item.name}</span>
                                        <span className="font-mono opacity-80">${item.price.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* 全螢幕防呆遮罩 */}
      {isProcessing && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center flex flex-col items-center animate-in fade-in zoom-in duration-200">
                {!processError ? (
                    <>
                        <Loader2 size={64} className="text-blue-500 animate-spin mb-6" />
                        <h3 className="text-xl font-bold text-white mb-2">正在出售並計算後台數據...</h3>
                        <p className="text-gray-400 text-sm">請勿關閉視窗，正在同步資料庫</p>
                    </>
                ) : (
                    <>
                        <div className="w-16 h-16 bg-red-900/50 rounded-full flex items-center justify-center mb-6">
                            <AlertTriangle size={40} className="text-red-500" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">系統發生異常！</h3>
                        <p className="text-red-300 text-sm mb-6">已出售過程發生錯誤<br/>請在 Discord Tag Wolf</p>
                        <button onClick={() => setIsProcessing(false)} className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg font-bold transition-colors"> 關閉並重試 </button>
                    </>
                )}
            </div>
        </div>
      )}

      <BalanceGrid isOpen={isBalanceGridOpen} onClose={() => setIsBalanceGridOpen(false)} theme={theme} isDarkMode={isDarkMode} currentUser={currentUser} members={filteredMembers} activeItems={activeItems} />
      <CostCalculatorModal isOpen={isCostCalcOpen} onClose={() => setIsCostCalcOpen(false)} theme={theme} isDarkMode={isDarkMode} />
    </div>
  );
};
export default AccountingView;