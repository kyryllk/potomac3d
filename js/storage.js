// Persistence for the layout (furniture + doors).
// v1: browser localStorage + JSON file export/import.
// Later (multiplayer): swap save/load for a Supabase-backed store — the scene is
// just two arrays of plain objects, so the shape below is what syncs.

const KEY = 'potomac3d.layout.v1';

const normalize = (data) => ({
  items: Array.isArray(data?.items) ? data.items : [],
  doors: Array.isArray(data?.doors) ? data.doors : [],
});

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 2, ...normalize(state) }));
  } catch (e) {
    console.warn('Could not save layout:', e);
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : { items: [], doors: [] };
  } catch (e) {
    console.warn('Could not load layout:', e);
    return { items: [], doors: [] };
  }
}

export function exportFile(state) {
  const blob = new Blob([JSON.stringify({ version: 2, ...normalize(state) }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'potomac-layout.json'; a.click();
  URL.revokeObjectURL(url);
}

export function importFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { try { resolve(normalize(JSON.parse(reader.result))); } catch (e) { reject(e); } };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
