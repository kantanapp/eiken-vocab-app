import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
} from 'react-native';
import { colors } from '../constants/colors';
import { subscribeToWords } from '../services/firebase';
import { getBookmarks, removeBookmark } from '../utils/storage';

export default function BookmarkScreen({ grade }) {
  const [allWords, setAllWords] = useState([]);
  const [bookmarkIds, setBookmarkIds] = useState([]);
  const gradeLabel = grade === 'grade1' ? '英検1級' : '英検2級';

  useEffect(() => {
    const unsubscribe = subscribeToWords(grade, setAllWords);
    return unsubscribe;
  }, [grade]);

  const loadBookmarks = useCallback(async () => {
    const ids = await getBookmarks(grade);
    setBookmarkIds(ids);
  }, [grade]);

  useEffect(() => { loadBookmarks(); }, [loadBookmarks]);

  const handleRemove = async (wordId) => {
    await removeBookmark(grade, wordId);
    setBookmarkIds(prev => prev.filter(id => id !== wordId));
  };

  const bookmarkedWords = allWords.filter(w => bookmarkIds.includes(w.id));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>ブックマーク</Text>
        <Text style={styles.gradeLabel}>{gradeLabel} · {bookmarkedWords.length}件</Text>
      </View>

      {bookmarkedWords.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔖</Text>
          <Text style={styles.emptyText}>ブックマークした単語がありません</Text>
          <Text style={styles.emptyHint}>カード画面で 🔖 をタップして追加できます</Text>
        </View>
      ) : (
        <FlatList
          data={bookmarkedWords}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.wordCard}>
              <View style={styles.wordInfo}>
                <Text style={styles.english}>{item.english}</Text>
                <Text style={styles.japanese}>{item.japanese}</Text>
              </View>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => handleRemove(item.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.removeBtnText}>🔖</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 20, paddingBottom: 12 },
  heading: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  gradeLabel: { fontSize: 14, color: colors.textSecondary },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 16, color: colors.textSecondary, marginBottom: 8, textAlign: 'center' },
  emptyHint: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },

  list: { paddingHorizontal: 16, paddingBottom: 24 },
  wordCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 12,
    padding: 16, marginBottom: 10,
  },
  wordInfo: { flex: 1 },
  english: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  japanese: { fontSize: 14, color: colors.textSecondary },
  removeBtn: { padding: 4 },
  removeBtnText: { fontSize: 20 },
});
