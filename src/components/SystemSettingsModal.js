// src/components/SystemSettingsModal.js
import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Users, Loader2, ArrowRight, Save, GitBranch } from 'lucide-react';
import { collection, getDocs, doc, writeBatch, getDoc, updateDoc } from "firebase/firestore";
import { db } from '../config/firebase';

const SystemSettingsModal = ({ isOpen, onClose, theme, currentSettings }) => {
  // 更名工具狀態
  const [oldName, setOldName] = useState('');
  const [newName, setNewName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // 版本號狀態
  const [versionInput, setVersionInput] = useState('');
  const [isUpdatingVersion, setIsUpdatingVersion] = useState(false);

  // 當元件載入或雲端版本變更時，自動帶入目前的版本號
  useEffect(() => {
    if (currentSettings?.appVersion) {
        setVersionInput(currentSettings.appVersion);
    }
  }, [currentSettings]);

  if (!isOpen) return null;

  // 🟢 更新雲端版本號
  const handleUpdateVersion = async () => {
      if (!versionInput.trim()) return alert("版本號不能為空");
      setIsUpdatingVersion(true);
      try {
          await updateDoc(doc(db, "system_data", "global_settings"), {
              appVersion: versionInput.trim()
          });
          alert("✅ 版本號更新成功！系統將自動通知其他使用者重新整理。");
      } catch (error) {
          console.error(error);
          alert("版本更新失敗: " + error.message);
      } finally {
          setIsUpdatingVersion(false);
      }
  };

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

        // 1. 更新 members
        const membersSnap = await getDocs(collection(db, "members"));
        membersSnap.forEach(docSnap => {
            if (docSnap.data().name === fromName) {
                batch.update(docSnap.ref, { name: toName });
            }
        });

        // 2. 更新 active_items
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

        // 3. 更新 settlement_data/main_grid
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
      <div className={`w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar ${theme.card || 'bg-gray-800 border-gray-700'}`}>
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex justify-between items-center bg-black/20 sticky top-0 z-10 backdrop-blur-md">
          <h3 className={`font-bold text-xl flex items-center gap-2 ${theme.text || 'text-white'}`}>
             系統進階設定
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
            
            {/* 🟢 1. 版本控制區塊 (已修復：可修改與儲存) */}
            <div className="border border-blue-500/30 rounded-xl overflow-hidden bg-blue-900/10">
                <div className="bg-blue-900/40 p-3 flex items-center gap-2 border-b border-blue-500/30">
                    <GitBranch size={18} className="text-blue-400" />
                    <h4 className="font-bold text-blue-400 text-sm">雲端版本控制</h4>
                </div>
                <div className="p-4 flex gap-3">
                    <input 
                        type="text" 
                        className={`flex-1 p-2.5 rounded-lg text-sm font-mono ${theme.input || 'bg-gray-700 text-white border-gray-600'}`}
                        value={versionInput}
                        onChange={e => setVersionInput(e.target.value)}
                        placeholder="例如: 0302v1"
                    />
                    <button 
                        onClick={handleUpdateVersion}
                        disabled={isUpdatingVersion}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 rounded-lg font-bold transition-colors disabled:opacity-50"
                    >
                        {isUpdatingVersion ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        發布更新
                    </button>
                </div>
            </div>

            {/* 🟢 2. 全域更名工具區塊 */}
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
                            <label className="block text-xs text-gray-500 mb-1">舊名稱</label>
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
                            <label className="block text-xs text-blue-400 mb-1">新名稱</label>
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