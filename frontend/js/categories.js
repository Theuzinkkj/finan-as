'use strict';

// =============================================
//  CUSTOM CATEGORIES
// =============================================
function loadCustomCategories() {
  const saved = Storage.getJSON(Storage.catsKey(), {});
  Object.assign(CATEGORIES, saved);
}

function saveCustomCategory(key, cat) {
  CATEGORIES[key] = cat;
  const saved = Storage.getJSON(Storage.catsKey(), {});
  saved[key] = cat;
  Storage.setJSON(Storage.catsKey(), saved);
}

function deleteCustomCategory(key) {
  delete CATEGORIES[key];
  const saved = Storage.getJSON(Storage.catsKey(), {});
  delete saved[key];
  Storage.setJSON(Storage.catsKey(), saved);
}
