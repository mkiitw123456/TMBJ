// src/components/ToastNotification.js
import React from 'react';
import { CheckCircle } from 'lucide-react';

const ToastNotification = ({ message, isVisible }) => {
  return (
    <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[70] transition-all duration-300 pointer-events-none
      ${isVisible ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0'}`}>
      <div className="bg-green-600 text-white px-6 py-2 rounded-full shadow-lg font-bold flex items-center gap-2">
        <CheckCircle size={18} />
        {message}
      </div>
    </div>
  );
};

export default ToastNotification;