// src/components/EventItem.js
import React from 'react';
import { MapPin, Skull, Clock, RefreshCw, RotateCcw, Star, Calendar } from 'lucide-react'; 
import { formatTimeWithSeconds } from '../utils/helpers';

const EventItem = ({ 
  event, theme, now, 
  confirmDeleteId, setConfirmDeleteId, 
  handleDeleteEvent, handleOpenEditEvent, 
  handleQuickRefresh, handleUndo, hasUndo, 
  currentUser 
}) => {
  
  const isOverdue = now && (now - new Date(event.respawnTime) > 60000);
  const respawnDate = new Date(event.respawnTime);

  // 格式化日期 MM/DD
  const dateStr = `${respawnDate.getMonth() + 1}/${respawnDate.getDate()}`;

  const renderStars = (count) => {
    if (!count || count <= 0) return null;
    return (
      <div className="flex gap-0.5 mt-1">
        {[...Array(Math.min(count, 10))].map((_, i) => (
          <Star key={i} size={12} className="text-yellow-500 fill-yellow-500" />
        ))}
      </div>
    );
  };

  return (
    <div 
      className={`
        p-3 mb-2 rounded shadow-sm flex justify-between items-center transition-all relative group border-l-4 
        ${isOverdue ? 'animate-pulse ring-2 ring-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : ''} 
      `} 
      style={{ 
        borderLeftColor: event.color, // 🟢 永遠保持 Boss 設定的顏色
        background: 'var(--card-bg)', 
        color: 'var(--card-text)',
        cursor: 'pointer' 
      }}
      onClick={() => handleOpenEditEvent(event)} 
    >
      <div>
        <div className="font-bold text-sm flex items-center gap-2">
          {event.name}
          {event.mapPos && <MapPin size={12} className="text-blue-500" />}
        </div>
        
        {renderStars(event.stars)}

        <div className="text-xs opacity-70 flex items-center gap-1 mt-1">
          <Skull size={10}/> 亡: {formatTimeWithSeconds(new Date(event.deathTime))}
        </div>
        
        <div className={`text-lg font-mono font-bold flex items-center gap-2 ${isOverdue ? 'text-red-500' : 'text-blue-500'}`}>
          <div className="flex items-center gap-1 text-xs opacity-80 font-sans border px-1 rounded border-current">
             <Calendar size={10}/> {dateStr}
          </div>
          <div className="flex items-center gap-1">
             <Clock size={14}/> {formatTimeWithSeconds(respawnDate)}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 absolute right-3 top-3">
         <button 
           onClick={(e) => {
             e.stopPropagation();
             if(currentUser === '訪客') return alert("訪客權限僅供瀏覽");
             handleQuickRefresh(event);
           }}
           className="p-1.5 bg-blue-500 text-white rounded-full shadow hover:bg-blue-600 transition-transform active:scale-95"
           title="以當前時間刷新"
         >
           <RefreshCw size={14}/>
         </button>

         {hasUndo && (
           <button 
             onClick={(e) => {
               e.stopPropagation();
               if(currentUser === '訪客') return alert("訪客權限僅供瀏覽");
               handleUndo(event);
             }}
             className="p-1.5 bg-gray-500 text-white rounded-full shadow hover:bg-gray-600 transition-transform active:scale-95"
             title="回復上一次時間"
           >
             <RotateCcw size={14}/>
           </button>
         )}
      </div>
    </div>
  );
};

export default EventItem;