// src/context/DriveContext.js
import React, { createContext, useState } from 'react';

export const DriveContext = createContext();

export const DriveProvider = ({ children }) => {
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([
    { id: null, name: 'Inicio' },
  ]);
  const [clipboardItem, setClipboardItem] = useState(null); // { type: 'file'|'folder', item }

  const value = {
    currentFolderId,
    setCurrentFolderId,
    breadcrumbs,
    setBreadcrumbs,
    clipboardItem,
    setClipboardItem,
  };

  return (
    <DriveContext.Provider value={value}>
      {children}
    </DriveContext.Provider>
  );
};