const STORAGE_KEY = 'ultranube_starred_items';

function normalizeStarredItem(item) {
  const id = `${item.id}-${item.type}`;
  return {
    id,
    itemId: item.id,
    type: item.type,
    name: item.name,
    mimeType: item.mimeType || item.type || 'archivo',
    extension: item.name?.split('.')?.pop()?.toLowerCase() || '',
    path: item.path || '',
    addedAt: item.addedAt || new Date().toISOString(),
  };
}

export function getStarredItems() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    return JSON.parse(saved) || [];
  } catch (error) {
    console.warn('Error leyendo favoritos:', error);
    return [];
  }
}

export function saveStarredItems(items) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn('Error guardando favoritos:', error);
  }
}

export function isItemStarred(item) {
  const starred = getStarredItems();
  return starred.some((star) => star.id === `${item.id}-${item.type}`);
}

export function toggleStarItem(item) {
  const starred = getStarredItems();
  const key = `${item.id}-${item.type}`;
  const existingIndex = starred.findIndex((star) => star.id === key);

  if (existingIndex >= 0) {
    const next = [...starred];
    next.splice(existingIndex, 1);
    saveStarredItems(next);
    return next;
  }

  const next = [...starred, normalizeStarredItem({
    ...item,
    addedAt: new Date().toISOString(),
  })];
  saveStarredItems(next);
  return next;
}
