import React from 'react';
import { RefreshCcw } from 'lucide-react';
import { APP_VERSION } from '../utils/constants';

const UpdateNotification = ({ show, remoteVersion, onRefresh }) => {
  if (!show) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[100] animate-bounce">
      <div className="bg-blue-600 text-white p-4 rounded-xl shadow-2xl flex items-center gap-4 cursor-pointer" onClick={onRefresh}>
        <div className="bg-white/20 p-2 rounded-full"><RefreshCcw size={24}/></div>
        <div>
          <h3 className="font-bold">發現新版本！</h3>
          <p className="text-xs opacity-80">本地: {APP_VERSION} / 雲端: {remoteVersion}</p>
        </div>
      </div>
    </div>
  );
};
export default UpdateNotification;