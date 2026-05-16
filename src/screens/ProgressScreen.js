import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../constants/colors';
import { subscribeToWords } from '../services/firebase';
import { getHiddenWords, getTodayCount } from '../utils/storage';

export default function ProgressScreen({ grade }) {
  const [totalWords, setTotalWords] = useState(0);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [todayCount, setTodayCount] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeToWords(grade, (words) => {
      setTotalWords(words.length);
    });
    return unsubscribe;
  }, [grade]);

  useEffect(() => {
    const load = async () => {
      const hidden = await getHiddenWords(grade);
      setHiddenCount(hidden.length);
      const today = await getTodayCount();
      setTodayCount(today);
    };
    load();
  }, [grade]);

  const progressPct = totalWords > 0 ? Math.round((hiddenCount / totalWords) * 100) : 0;
  const remaining = totalWords - hiddenCount;
  const gradeLabel = grade === 'grade1' ? '英検1級' : '英検2級';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>学習進捗</Text>
      <Text style={styles.gradeLabel}>{gradeLabel}</Text>

      {/* 進捗バー */}
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>覚えた単語</Text>
          <Text style={styles.progressPct}>{progressPct}%</Text>
        </View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
        </View>
        <Text style={styles.progressSub}>{hiddenCount} / {totalWords} 単語</Text>
      </View>

      {/* 統計カード */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{totalWords}</Text>
          <Text style={styles.statLabel}>総単語数</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: colors.accent }]}>{hiddenCount}</Text>
          <Text style={styles.statLabel}>覚えた</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{remaining}</Text>
          <Text style={styles.statLabel}>残り</Text>
        </View>
      </View>

      {/* 今日の閲覧 */}
      <View style={styles.todayCard}>
        <Text style={styles.todayLabel}>今日の閲覧数</Text>
        <Text style={styles.todayNumber}>{todayCount}</Text>
        <Text style={styles.todayUnit}>単語</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  gradeLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
  },

  // 進捗バー
  progressCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  progressPct: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.accent,
  },
  progressBarBg: {
    height: 10,
    backgroundColor: colors.card,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 5,
  },
  progressSub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'right',
  },

  // 統計3カード
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  // 今日の閲覧
  todayCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  todayLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  todayNumber: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 56,
  },
  todayUnit: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
