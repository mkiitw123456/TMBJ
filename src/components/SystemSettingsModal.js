import React, { useState, useEffect } from 'react';
import { Settings, X, GitBranch } from 'lucide-react';
import { doc, setDoc } from "firebase/firestore";
import { db } from '../config/firebase';
import { APP_VERSION } from '../utils/constants';

const SystemSettingsModal = ({ isOpen, onClose, theme, currentSettings }) => {
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  useEffect(() => { if (currentSettings?.appVersion) setAppVersion(currentSettings.appVersion); }, [currentSettings]);
  if (!isOpen) return null;

  const handleSave = async () => {
    if (!db) return;
    try {
      await setDoc(doc(db, "system_data", "global_settings"), { appVersion }, { merge: true });
      alert("設定已儲存！");
      onClose();
    } catch (e) { alert("儲存失敗"); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-xl shadow-2xl p-6 ${theme.card}`}>
        <div className="flex justify-between items-center mb-6">
          <h3 className={`text-xl font-bold flex items-center gap-2 ${theme.text}`}><Settings size={24} /> 系統設定</h3>
          <button onClick={onClose}><X size={20}/></button>
        </div>
        <div className="p-4 rounded-lg border mb-6 bg-gray-100 dark:bg-gray-800 dark:border-gray-600">
             <h4 className={`font-bold mb-3 flex items-center gap-2 ${theme.text}`}><GitBranch size={16}/> 版本控管</h4>
             <input type="text" className={`w-full p-2 rounded border ${theme.input}`} value={appVersion} onChange={(e) => setAppVersion(e.target.value)} />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded font-bold">儲存設定</button>
        </div>
      </div>
    </div>
  );
};
export default SystemSettingsModal;