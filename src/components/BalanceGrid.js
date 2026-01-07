// src/components/BalanceGrid.js
import React, { useState, useEffect, useMemo } from 'react';
import { Grid, Wand2, X, TrendingUp } from 'lucide-react';
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { db } from '../config/firebase';
import { sendNotify, sendLog, calculateFinance } from '../utils/helpers';

const BalanceGrid = ({ isOpen, onClose, theme, isDarkMode, currentUser, activeItems = [], members = [] }) => {
  const [gridData, setGridData] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedForSelling, setSelectedForSelling] = useState([]);

  const memberNames = useMemo(() => members.map(m => m.name || m), [members]);

  useEffect(() => { 
    if (memberNames.length > 0) setSelectedForSelling(memberNames); 
  }, [memberNames]);

  useEffect(() => {
    if (!isOpen || !db) return;
    const unsub = onSnapshot(doc(db, "settlement_data", "main_grid"), (doc) => {
      if (doc.exists()) setGridData(doc.data().matrix || {});
      else setGridData({});
      setLoading(false);
    });
    return () => unsub();
  }, [isOpen]);

  const toggleMemberSelection = (member) => {
    if (selectedForSelling.includes(member)) setSelectedForSelling(prev => prev.filter(m => m !== member));
    else setSelectedForSelling(prev => [...prev, member]);
  };

  const sellerSuggestions = useMemo(() => {
    if (!gridData || memberNames.length === 0) return [];
    const futureAdjustments = {}; 
    memberNames.forEach(m => futureAdjustments[m] = { payable: 0, receivable: 0 });

    activeItems.forEach(item => {
        const seller = item.seller;
        const { perPersonSplit } = calculateFinance(item.price, item.exchangeType, item.participants?.length || 0, item.cost, item.listingHistory);
        if (perPersonSplit > 0 && seller && item.participants) {
            item.participants.forEach(p => {
                const pName = typeof p === 'string' ? p : p.name;
                if (pName !== seller) {
                    if (futureAdjustments[seller]) futureAdjustments[seller].payable += perPersonSplit;
                    if (futureAdjustments[pName]) futureAdjustments[pName].receivable += perPersonSplit;
                }
            });
        }
    });

    const suggestions = selectedForSelling.map(member => {
      let currentPayable = 0; let currentReceivable = 0; 
      memberNames.forEach(other => {
        if (member !== other) {
          currentPayable += (gridData[`${member}_${other}`] || 0);
          currentReceivable += (gridData[`${other}_${member}`] || 0);
        }
      });
      const totalPayable = currentPayable + (futureAdjustments[member]?.payable || 0);
      const totalReceivable = currentReceivable + (futureAdjustments[member]?.receivable || 0);
      const score = totalReceivable - totalPayable;
      return { name: member, score, payable: totalPayable, receivable: totalReceivable };
    });
    return suggestions.sort((a, b) => b.score - a.score);
  }, [gridData, activeItems, selectedForSelling, memberNames]);

  const handleCellChange = async (payer, receiver, value) => {
    if (currentUser === '訪客') return; 
    const key = `${payer}_${receiver}`;
    const newValue = parseFloat(value) || 0;
    const canEdit = payer === currentUser || receiver === currentUser || currentUser === 'Wolf';
    if (!canEdit) return;

    try {
        const docRef = doc(db, "settlement_data", "main_grid");
        const docSnap = await getDoc(docRef);
        let matrix = docSnap.exists() ? (docSnap.data().matrix || {}) : {};
        const oldValue = parseFloat(matrix[key]) || 0;
        if (oldValue !== newValue) {
            const msg = `📝 [帳務修改] ${payer} 對 ${receiver} 的欠款 $${oldValue.toLocaleString()} ➔ $${newValue.toLocaleString()}`;
            sendNotify(msg);
            sendLog(currentUser, "修改餘額表", `${payer} -> ${receiver} : ${oldValue} -> ${newValue}`);
        }
        setGridData(prev => ({ ...prev, [key]: newValue }));
        await setDoc(docRef, { matrix: { ...matrix, [key]: newValue } }, { merge: true });
    } catch (e) { alert("更新失敗"); }
  };

  // === 輔助：將矩陣轉為文字列表 ===
  const formatMatrixToText = (matrix) => {
      const lines = [];
      Object.entries(matrix).forEach(([key, amount]) => {
          if (amount <= 0) return;
          const [payer, receiver] = key.split('_');
          // 使用全形空格或其他方式排版，但在 Discord code block 中主要靠英數對齊
          // 這裡簡單用 padEnd
          lines.push(`${payer} ➔ ${receiver} : $${Math.round(amount).toLocaleString()}`);
      });
      return lines.length > 0 ? lines.join('\n') : "無債務";
  };

  // === 自動劃帳邏輯 (含詳細 Discord 通知) ===
  const handleAutoBalance = async () => {
    if (currentUser === '訪客') return alert("訪客權限僅供瀏覽");
    if (!window.confirm("確定要執行「自動劃帳」嗎？")) return;
    
    // 1. 記錄原始狀態
    const beforeText = formatMatrixToText(gridData);

    // 2. 計算每人的淨餘額
    const netBalances = {};
    memberNames.forEach(m => netBalances[m] = 0);
    memberNames.forEach(payer => {
      memberNames.forEach(receiver => {
        if (payer === receiver) return;
        const amount = parseFloat(gridData[`${payer}_${receiver}`]) || 0;
        netBalances[payer] -= amount; 
        netBalances[receiver] += amount; 
      });
    });

    // 3. 分類債務人與債權人
    let debtors = []; let creditors = []; 
    memberNames.forEach(m => {
      const balance = netBalances[m];
      if (balance < -1) debtors.push({ name: m, balance: Math.abs(balance) }); 
      else if (balance > 1) creditors.push({ name: m, balance: balance });
    });
    debtors.sort((a, b) => b.balance - a.balance); 
    creditors.sort((a, b) => b.balance - a.balance);

    // 4. 配對沖銷
    const newMatrix = {}; 
    let dIndex = 0; let cIndex = 0;
    while (dIndex < debtors.length && cIndex < creditors.length) {
      let debtor = debtors[dIndex]; 
      let creditor = creditors[cIndex];
      let settleAmount = Math.min(debtor.balance, creditor.balance);
      
      const key = `${debtor.name}_${creditor.name}`;
      newMatrix[key] = (newMatrix[key] || 0) + settleAmount;
      
      debtor.balance -= settleAmount; 
      creditor.balance -= settleAmount;
      
      if (debtor.balance < 1) dIndex++; 
      if (creditor.balance < 1) cIndex++;
    }

    // 5. 寫入資料庫
    await setDoc(doc(db, "settlement_data", "main_grid"), { matrix: newMatrix });
    
    // 6. 記錄優化後狀態
    const afterText = formatMatrixToText(newMatrix);

    // 7. 發送詳細 Discord 通知
    const logMessage = `
⚖️ **[自動劃帳報告]** 由 ${currentUser} 執行

📋 **劃帳前 (原始債務):**
\`\`\`
${beforeText}
\`\`\`

✨ **劃帳後 (簡化債務):**
\`\`\`
${afterText}
\`\`\`
`;
    sendNotify(logMessage);
    sendLog(currentUser, "自動劃帳", "執行了債務簡化");
    
    alert("劃帳完成！");
  };

  if (!isOpen) return null;

  const tableStyles = { 
      headerCell: isDarkMode ? 'bg-gray-700 text-gray-200 border-gray-600' : 'bg-gray-100 text-gray-700 border-gray-300', 
      headerCellSticky: isDarkMode ? 'bg-gray-800 text-gray-200 border-gray-600' : 'bg-gray-50 text-gray-700 border-gray-300',
      totalHeader: isDarkMode ? 'bg-blue-900/50 text-blue-200 border-gray-600' : 'bg-blue-50 text-blue-800 border-gray-300',
      rowHeader: isDarkMode ? 'bg-gray-800 text-gray-200 border-gray-600' : 'bg-gray-50 text-gray-800 border-gray-300',
      cell: isDarkMode ? 'border-gray-600' : 'border-gray-300', 
      input: isDarkMode ? 'text-gray-100' : 'text-gray-800', 
      selfCell: isDarkMode ? 'bg-black/50' : 'bg-black/80', 
      rowTotal: isDarkMode ? 'bg-blue-900/30 text-blue-400 border-gray-600' : 'bg-blue-50/30 text-blue-600 border-gray-300',
      incomeLabel: isDarkMode ? 'bg-green-900/30 text-green-200 border-gray-600' : 'bg-green-50/50 text-green-800 border-gray-300',
      incomeCell: isDarkMode ? 'text-green-400 border-gray-600' : 'text-green-600 border-gray-300',
      emptyCorner: isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-200 border-gray-300'
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-hidden">
      <div className={`w-full max-w-6xl rounded-xl p-6 max-h-[90vh] h-auto flex flex-col ${theme.card}`}>
        <div className={`flex justify-between items-center mb-4 border-b pb-2 flex-none ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-4">
            <h3 className={`text-xl font-bold flex items-center gap-2 ${theme.text}`}><Grid size={24}/> 成員餘額表</h3>
            <button onClick={handleAutoBalance} className="flex items-center gap-2 px-3 py-1 text-sm bg-purple-600 text-white rounded shadow hover:bg-purple-700"><Wand2 size={16}/> 自動劃帳</button>
          </div>
          <button onClick={onClose} className={`p-1 rounded ${isDarkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}><X size={24}/></button>
        </div>
        
        <div className="flex-1 flex flex-col overflow-hidden gap-4">
           {loading ? <div className={`p-10 text-center ${theme.subText}`}>載入中...</div> : (
             <>
                <div className="flex-1 overflow-auto border rounded relative">
                    <table className="w-full border-collapse min-w-[1000px]">
                    <thead>
                        <tr>
                            <th className={`p-2 border min-w-[120px] sticky top-0 left-0 z-20 font-bold ${tableStyles.headerCell}`}>付 \ 收</th>
                            {memberNames.map(m => (
                                <th key={m} className={`p-2 border min-w-[80px] sticky top-0 z-10 font-bold ${tableStyles.headerCellSticky}`}>{m}</th>
                            ))}
                            <th className={`p-2 border min-w-[100px] sticky top-0 z-10 font-bold ${tableStyles.totalHeader}`}>總計支出</th>
                        </tr>
                    </thead>
                    <tbody>
                        {memberNames.map(payer => {
                            let rowTotal = 0; 
                            return (
                                <tr key={payer} className={theme.card}>
                                    <th className={`p-2 border sticky left-0 z-10 font-bold ${tableStyles.rowHeader}`}>{payer}</th>
                                    {memberNames.map(receiver => {
                                        const isSelf = payer === receiver; 
                                        const key = `${payer}_${receiver}`; 
                                        const val = gridData[key] || 0;
                                        if (!isSelf) rowTotal += val; 
                                        const canEdit = payer === currentUser || receiver === currentUser || currentUser === 'Wolf';
                                        return (
                                            <td key={receiver} className={`p-1 border text-center ${tableStyles.cell} ${isSelf ? tableStyles.selfCell : ''}`}>
                                                {!isSelf && (
                                                    <input 
                                                        type="number" 
                                                        className={`w-full h-full p-1 text-center bg-transparent outline-none font-mono ${tableStyles.input} ${val > 0 ? 'text-red-500 font-bold' : 'opacity-60'} ${!canEdit || currentUser === '訪客' ? 'cursor-not-allowed opacity-30' : ''}`} 
                                                        value={val === 0 ? '' : val} 
                                                        placeholder="-" 
                                                        readOnly={!canEdit || currentUser === '訪客'} 
                                                        onBlur={(e) => handleCellChange(payer, receiver, e.target.value)} 
                                                        onChange={(e) => setGridData({...gridData, [key]: e.target.value})}
                                                    />
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className={`p-2 border text-center font-bold ${tableStyles.rowTotal}`}>
                                        {rowTotal.toLocaleString()}
                                    </td>
                                </tr>
                            );
                        })}
                        <tr className={tableStyles.incomeLabel}>
                            <td className={`p-2 border text-center sticky left-0 z-10 font-bold ${tableStyles.headerCell}`}>預定收入</td>
                            {memberNames.map(receiver => {
                                let colTotal = 0;
                                memberNames.forEach(payer => {
                                    if (payer !== receiver) {
                                        colTotal += parseFloat(gridData[`${payer}_${receiver}`] || 0);
                                    }
                                });
                                return <td key={receiver} className={`p-2 border text-center font-bold ${tableStyles.incomeCell}`}>{colTotal.toLocaleString()}</td>;
                            })}
                            <td className={`p-2 border ${tableStyles.emptyCorner}`}></td>
                        </tr>
                    </tbody>
                    </table>
                </div>

                <div className={`p-3 rounded-xl border flex flex-col gap-2 flex-none ${isDarkMode ? 'bg-orange-900/10 border-orange-500/30' : 'bg-orange-50 border-orange-200'}`}>
                    <div className="flex justify-between items-center">
                        <h4 className={`font-bold text-sm flex items-center gap-2 ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`}><TrendingUp size={16}/> 建議掛賣順序</h4>
                        <div className="flex overflow-x-auto gap-1 max-w-[50%] no-scrollbar">
                            {memberNames.map(member => (
                                <button key={member} onClick={() => toggleMemberSelection(member)} className={`px-1.5 py-0.5 rounded text-[10px] border whitespace-nowrap ${selectedForSelling.includes(member) ? 'bg-orange-500 text-white' : 'opacity-40'}`}>{member}</button>
                            ))}
                        </div>
                    </div>
                    <div className="flex overflow-x-auto gap-3 pb-1">
                        {sellerSuggestions.map((item, index) => { 
                            const shouldSell = item.score > 0; 
                            return (
                                <div key={item.name} className={`flex-none flex items-center gap-2 p-2 rounded-lg border shadow-sm min-w-[140px] relative ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'} ${index === 0 ? 'ring-1 ring-orange-500' : ''}`}>
                                    <div className={`absolute top-0 left-0 px-1.5 text-[9px] font-bold text-white rounded-br ${index === 0 ? 'bg-red-500' : 'bg-gray-500'}`}>#{index + 1}</div>
                                    <div className="flex flex-col ml-1 mt-1">
                                        <span className={`font-bold text-sm leading-none ${theme.text}`}>{item.name}</span>
                                        <span className={`text-[9px] ${shouldSell ? 'text-orange-500' : 'opacity-50'}`}>{shouldSell ? '建議賣' : '暫緩'}</span>
                                    </div>
                                    <span className={`font-mono font-bold text-sm ml-auto ${shouldSell ? 'text-orange-500' : 'text-gray-500'}`}>{shouldSell ? '+' : ''}{Math.round(item.score/10000)}萬</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
             </>
           )}
        </div>
      </div>
    </div>
  );
};
export default BalanceGrid;