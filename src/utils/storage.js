import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── キー定義 ───────────────────────────────────────────
const key = (prefix, grade) => `${prefix}_${grade}`;

const KEYS = {
  hidden: (grade) => key('hiddenWordIds', grade),
  position: (grade) => key('lastPosition', grade),
  shuffle: (grade) => key('shuffleOrder', grade),
  bookmarks: (grade) => key('bookmarkedWordIds', grade),
  settings: 'settings',
  todayCount: 'todayCount',
  todayDate: 'todayDate',
};

// ─── 非表示単語 ──────────────────────────────────────────

/**
 * 非表示単語IDリストを取得する
 */
export const getHiddenWords = async (grade) => {
  try {
    const data = await AsyncStorage.getItem(KEYS.hidden(grade));
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

/**
 * 単語を非表示リストに追加する
 */
export const addHiddenWord = async (grade, wordId) => {
  try {
    const hidden = await getHiddenWords(grade);
    if (!hidden.includes(wordId)) {
      hidden.push(wordId);
      await AsyncStorage.setItem(KEYS.hidden(grade), JSON.stringify(hidden));
    }
  } catch (e) {
    console.error('addHiddenWord error:', e);
  }
};

/**
 * 単語を非表示リストから除外する（アンドゥ用）
 */
export const removeHiddenWord = async (grade, wordId) => {
  try {
    const hidden = await getHiddenWords(grade);
    const updated = hidden.filter((id) => id !== wordId);
    await AsyncStorage.setItem(KEYS.hidden(grade), JSON.stringify(updated));
  } catch (e) {
    console.error('removeHiddenWord error:', e);
  }
};

/**
 * 削除された単語IDを非表示リストから自動除去する
 */
export const cleanupHiddenWords = async (grade, validIds) => {
  try {
    const hidden = await getHiddenWords(grade);
    const cleaned = hidden.filter((id) => validIds.includes(id));
    await AsyncStorage.setItem(KEYS.hidden(grade), JSON.stringify(cleaned));
    return cleaned;
  } catch {
    return [];
  }
};

/**
 * 非表示単語をすべてクリアする（覚えた単語の復活）
 */
export const clearHiddenWords = async (grade) => {
  try {
    await AsyncStorage.removeItem(KEYS.hidden(grade));
  } catch (e) {
    console.error('clearHiddenWords error:', e);
  }
};

// ─── ブックマーク ────────────────────────────────────────

export const getBookmarks = async (grade) => {
  try {
    const data = await AsyncStorage.getItem(KEYS.bookmarks(grade));
    return data ? JSON.parse(data) : [];
  } catch { return []; }
};

export const addBookmark = async (grade, wordId) => {
  try {
    const list = await getBookmarks(grade);
    if (!list.includes(wordId)) {
      await AsyncStorage.setItem(KEYS.bookmarks(grade), JSON.stringify([...list, wordId]));
    }
  } catch (e) { console.error('addBookmark error:', e); }
};

export const removeBookmark = async (grade, wordId) => {
  try {
    const list = await getBookmarks(grade);
    await AsyncStorage.setItem(KEYS.bookmarks(grade), JSON.stringify(list.filter(id => id !== wordId)));
  } catch (e) { console.error('removeBookmark error:', e); }
};

export const isBookmarked = async (grade, wordId) => {
  const list = await getBookmarks(grade);
  return list.includes(wordId);
};

// ─── シャッフル順 ────────────────────────────────────────

/**
 * 保存されたシャッフル順（ID配列）を取得する。未設定なら null
 */
export const getShuffleOrder = async (grade) => {
  try {
    const data = await AsyncStorage.getItem(KEYS.shuffle(grade));
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

/**
 * シャッフル順（ID配列）を保存する
 */
export const saveShuffleOrder = async (grade, ids) => {
  try {
    await AsyncStorage.setItem(KEYS.shuffle(grade), JSON.stringify(ids));
  } catch (e) {
    console.error('saveShuffleOrder error:', e);
  }
};

/**
 * シャッフル順をクリアする（自然順に戻す）
 */
export const clearShuffleOrder = async (grade) => {
  try {
    await AsyncStorage.removeItem(KEYS.shuffle(grade));
  } catch (e) {
    console.error('clearShuffleOrder error:', e);
  }
};

// ─── 最後に見た位置 ──────────────────────────────────────

/**
 * 最後に見た単語インデックスを取得する
 */
export const getLastPosition = async (grade) => {
  try {
    const data = await AsyncStorage.getItem(KEYS.position(grade));
    return data ? parseInt(data, 10) : 0;
  } catch {
    return 0;
  }
};

/**
 * 現在の単語インデックスを保存する
 */
export const saveLastPosition = async (grade, index) => {
  try {
    await AsyncStorage.setItem(KEYS.position(grade), String(index));
  } catch (e) {
    console.error('saveLastPosition error:', e);
  }
};

// ─── 設定 ────────────────────────────────────────────────

/**
 * 設定を取得する（デフォルト: 発音ON）
 */
export const getSettings = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.settings);
    return data ? JSON.parse(data) : { soundEnabled: true };
  } catch {
    return { soundEnabled: true };
  }
};

/**
 * 設定を保存する
 */
export const saveSettings = async (settings) => {
  try {
    await AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings));
  } catch (e) {
    console.error('saveSettings error:', e);
  }
};

// ─── 今日の単語数 ─────────────────────────────────────────

/**
 * 今日の閲覧数を取得する（日付が変わったらリセット）
 */
export const getTodayCount = async () => {
  try {
    const today = new Date().toDateString();
    const savedDate = await AsyncStorage.getItem(KEYS.todayDate);
    if (savedDate !== today) {
      await AsyncStorage.setItem(KEYS.todayDate, today);
      await AsyncStorage.setItem(KEYS.todayCount, '0');
      return 0;
    }
    const count = await AsyncStorage.getItem(KEYS.todayCount);
    return count ? parseInt(count, 10) : 0;
  } catch {
    return 0;
  }
};

/**
 * 今日の閲覧数を1増やして返す
 */
export const incrementTodayCount = async () => {
  try {
    const current = await getTodayCount();
    const next = current + 1;
    await AsyncStorage.setItem(KEYS.todayCount, String(next));
    return next;
  } catch {
    return 0;
  }
};
