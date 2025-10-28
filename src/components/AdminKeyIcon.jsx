import React from 'react';

const AdminKeyIcon = ({ isMD, onDragStart, onDragEnd }) => {
  if (!isMD) return null;

  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'admin-key');
    if (onDragStart) onDragStart(e);
  };

  const handleDragEnd = (e) => {
    if (onDragEnd) onDragEnd(e);
  };

  return (
    <div
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className="fixed bottom-6 right-6 z-50 cursor-move"
      title="Drag this key to unlock admin access"
    >
      <div className="bg-gradient-to-br from-yellow-400 to-orange-500 p-4 rounded-full shadow-2xl hover:shadow-3xl transition-all hover:scale-110 animate-pulse">
        <svg
          className="w-8 h-8 text-white"
          fill="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 2C9.243 2 7 4.243 7 7c0 1.83.99 3.421 2.458 4.281l-.863 4.316A1.5 1.5 0 0 0 10 17.5h4a1.5 1.5 0 0 0 1.405-1.903l-.863-4.316C16.01 10.421 17 8.83 17 7c0-2.757-2.243-5-5-5zm0 2c1.654 0 3 1.346 3 3s-1.346 3-3 3-3-1.346-3-3 1.346-3 3-3zm-1 8h2v2h-2v-2zm0 3h2v2h-2v-2z"/>
        </svg>
      </div>
      <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold animate-bounce">
        🔑
      </div>
    </div>
  );
};

export default AdminKeyIcon;
