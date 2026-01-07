// src/components/EventItem.js
import React from 'react';
import { MapPin, Skull, Clock, RefreshCw, RotateCcw, Star } from 'lucide-react'; 
import { formatTimeWithSeconds } from '../utils/helpers';

const EventItem = ({ 
  event, theme, now, 
  confirmDeleteId, setConfirmDeleteId, 
  handleDeleteEvent, handleOpenEditEvent, 
  handleQuickRefresh, handleUndo, hasUndo, 
  currentUser 
}) => {
  
  const isOverdue = now && (now - new Date(event.respawnTime) > 60000);

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
      className={`p-3 mb-2 rounded shadow-sm flex justify-between items-center transition-colors relative group border-l-4 ${isOverdue ? 'border-red-600' : ''}`} 
      style={{ 
        borderLeftColor: isOverdue ? undefined : event.color,
        background: 'var(--card-bg)', 
        color: 'var(--card-text)',
        cursor: 'pointer' 
      }}
      onClick={() => handleOpenEditEvent(event)} 
    >
      <div>
        <div className="font-bold text-sm flex items-center gap-2">
          {event.name}
          {/* 雖然移除了地圖功能，但如果舊資料有座標，這個圖示還是會顯示，保留原味 */}
          {event.mapPos && <MapPin size={12} className="text-blue-500" />}
        </div>
        
        {renderStars(event.stars)}

        <div className="text-xs opacity-70 flex items-center gap-1 mt-1">
          <Skull size={10}/> 亡: {formatTimeWithSeconds(new Date(event.deathTime))}
        </div>
        <div className={`text-lg font-mono font-bold flex items-center gap-1 ${isOverdue ? 'text-red-500 animate-pulse' : 'text-blue-500'}`}>
          <Clock size={14}/> {formatTimeWithSeconds(new Date(event.respawnTime))}
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