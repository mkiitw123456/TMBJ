// src/components/SystemSettingsModal.js
import React, { useState } from 'react';
import { X, AlertTriangle, Users, Loader2, ArrowRight } from 'lucide-react';
import { collection, getDocs, doc, writeBatch, getDoc } from "firebase/firestore";
import { db } from '../config/firebase';

const SystemSettingsModal = ({ isOpen, onClose, theme, currentSettings }) => {
  const [oldName, setOldName] = useState('');
  const [newName, setNewName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  if (!isOpen) return null;

  // 🟢 全域安全更名核心邏輯
  const handleRenameGlobally = async () => {
    const fromName = oldName.trim();
    const toName = newName.trim();

    if (!fromName || !toName) return alert("請輸入舊名稱與新名稱！");
    if (fromName === toName) return alert("新舊名稱不能一樣！");
    
    const confirmMsg = `【危險操作警告】\n確定要將系統中所有的 [${fromName}] 全面更名為 [${toName}] 嗎？\n這將會自動修改所有：\n1. 成員登入名單\n2. 進行中的掛賣項目\n3. 結算欠款表\n\n此操作無法復原，確定執行？`;
    if (!window.confirm(confirmMsg)) return;

    setIsRenaming(true);

    try {
        const batch = writeBatch(db);

        // 1. 更新 members 集合
        const membersSnap = await getDocs(collection(db, "members"));
        membersSnap.forEach(docSnap => {
            if (docSnap.data().name === fromName) {
                batch.update(docSnap.ref, { name: toName });
            }
        });

        // 2. 更新 active_items (包含賣家與分紅參與者)
        const activeSnap = await getDocs(collection(db, "active_items"));
        activeSnap.forEach(docSnap => {
            const data = docSnap.data();
            let needsUpdate = false;
            let updateData = {};

            if (data.seller === fromName) {
                updateData.seller = toName;
                needsUpdate = true;
            }
            if (data.participants && data.participants.includes(fromName)) {
                updateData.participants = data.participants.map(p => p === fromName ? toName : p);
                needsUpdate = true;
            }

            if (needsUpdate) batch.update(docSnap.ref, updateData);
        });

        // 3. 更新 settlement_data/main_grid (欠款矩陣)
        const gridRef = doc(db, "settlement_data", "main_grid");
        const gridSnap = await getDoc(gridRef);
        if (gridSnap.exists()) {
            const matrix = gridSnap.data().matrix || {};
            const newMatrix = {};
            let matrixChanged = false;

            for (const [key, value] of Object.entries(matrix)) {
                const [payer, receiver] = key.split('_');
                let newPayer = payer === fromName ? toName : payer;
                let newReceiver = receiver === fromName ? toName : receiver;
                
                const newKey = `${newPayer}_${newReceiver}`;
                newMatrix[newKey] = value; 
                
                if (newKey !== key) matrixChanged = true;
            }
            
            if (matrixChanged) {
                batch.update(gridRef, { matrix: newMatrix });
            }
        }

        // 執行批次更新
        await batch.commit();
        alert(`✅ 成功！已將系統中所有的 [${fromName}] 替換為 [${toName}]。畫面將重新載入。`);
        window.location.reload(); 

    } catch (error) {
        console.error("更名失敗:", error);
        alert(`更名發生錯誤: ${error.message}`);
    } finally {
        setIsRenaming(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[999] backdrop-blur-sm">
      <div className={`w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden ${theme.card || 'bg-gray-800 border-gray-700'}`}>
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex justify-between items-center bg-black/20">
          <h3 className={`font-bold text-xl flex items-center gap-2 ${theme.text || 'text-white'}`}>
             系統進階設定
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
            
            {/* Version Info */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-black/20 border border-white/5">
                <span className="text-gray-400 text-sm">目前雲端版本號</span>
                <span className="font-mono font-bold text-blue-400">{currentSettings?.appVersion || '未知'}</span>
            </div>

            {/* Global Rename Tool */}
            <div className="border border-red-500/30 rounded-xl overflow-hidden bg-red-900/10">
                <div className="bg-red-900/40 p-3 flex items-center gap-2 border-b border-red-500/30">
                    <AlertTriangle size={18} className="text-red-400" />
                    <h4 className="font-bold text-red-400 text-sm">全域安全更名工具</h4>
                </div>
                <div className="p-4 space-y-4">
                    <p className="text-xs text-gray-400 leading-relaxed">
                        此工具會掃描整個資料庫，將指定的舊名稱同步替換為新名稱。適用於成員改名，可完美保留所有記帳與欠款紀錄。
                    </p>
                    
                    <div className="flex items-center gap-3">
                        <div className="flex-1">
                            <label className="block text-xs text-gray-500 mb-1">舊名稱 (目前卡住的名字)</label>
                            <div className="relative">
                                <Users size={16} className="absolute left-3 top-3 text-gray-500" />
                                <input 
                                    type="text" 
                                    className={`w-full pl-9 p-2.5 rounded-lg text-sm ${theme.input || 'bg-gray-700 text-white border-gray-600'}`}
                                    placeholder="輸入舊名字"
                                    value={oldName}
                                    onChange={e => setOldName(e.target.value)}
                                />
                            </div>
                        </div>
                        
                        <ArrowRight size={20} className="text-gray-500 mt-5" />
                        
                        <div className="flex-1">
                            <label className="block text-xs text-blue-400 mb-1">新名稱 (想改成什麼)</label>
                            <input 
                                type="text" 
                                className={`w-full p-2.5 rounded-lg text-sm border-blue-500/50 focus:border-blue-400 ${theme.input || 'bg-gray-700 text-white'}`}
                                placeholder="輸入新名字"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                            />
                        </div>
                    </div>

                    <button 
                        onClick={handleRenameGlobally}
                        disabled={isRenaming}
                        className="w-full mt-2 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50"
                    >
                        {isRenaming ? <Loader2 size={18} className="animate-spin" /> : '執行全域更名'}
                    </button>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};

export default SystemSettingsModal;