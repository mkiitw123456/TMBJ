// src/components/UpdateNotification.js
import React from 'react';
import { RefreshCcw, AlertTriangle } from 'lucide-react'; // 補一個 Alert 圖示
import { APP_VERSION } from '../utils/constants';

const UpdateNotification = ({ show, remoteVersion, onRefresh }) => {
  if (!show) return null;

  return (
    // 改為置中且有背景遮罩，強迫使用者注意到 (Optional，看你是否要強制)
    // 或是維持原本右下角，但加強樣式
    <div className="fixed bottom-6 right-6 z-[9999] animate-bounce"> 
      <div 
        onClick={onRefresh}
        className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 rounded-xl shadow-2xl flex items-center gap-4 cursor-pointer border-2 border-white/20 hover:scale-105 transition-transform"
      >
        <div className="bg-white/20 p-3 rounded-full animate-spin-slow">
          <RefreshCcw size={24}/>
        </div>
        <div>
          <h3 className="font-bold text-lg flex items-center gap-2">
            發現新版本！
            <span className="text-[10px] bg-red-500 px-1.5 rounded animate-pulse">Update</span>
          </h3>
          <p className="text-xs opacity-90 font-mono mt-1">
            點擊刷新: v{APP_VERSION} ➔ v{remoteVersion}
          </p>
        </div>
      </div>
    </div>
  );
};

export default UpdateNotification;