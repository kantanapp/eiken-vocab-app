import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Platform,
  Linking,
} from 'react-native';
import { colors } from './src/constants/colors';
import CardScreen from './src/screens/CardScreen';

const NAV_APPS = [
  { emoji: '🎓', label: 'TOP',  url: 'https://kantanapp.github.io/eiken-portal/' },
  { emoji: '📚', label: '単語', url: null },
  { emoji: '📝', label: '長文', url: 'https://kantanapp.github.io/eiken-mondai-app/' },
  { emoji: '✍️', label: '要約', url: 'https://kantanapp.github.io/eiken-app/' },
];

function WebAppNav() {
  if (Platform.OS !== 'web') return null;
  return (
    <View style={webNavStyles.bar}>
      {NAV_APPS.map((item, i) => {
        const isCurrent = item.url === null;
        const isFirst = i === 0;
        return (
          <React.Fragment key={item.label}>
            {i === 1 && <Text style={webNavStyles.sep}>|</Text>}
            {isCurrent ? (
              <View style={webNavStyles.current}>
                <Text style={webNavStyles.currentText}>{item.emoji} {item.label}</Text>
              </View>
            ) : (
              <TouchableOpacity style={[webNavStyles.item, isFirst && webNavStyles.itemFirst]} onPress={() => { if (Platform.OS === 'web') { window.location.href = item.url; } else { Linking.openURL(item.url); } }}>
                <Text style={webNavStyles.itemText}>{item.emoji} {item.label}</Text>
              </TouchableOpacity>
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const webNavStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 8,
    gap: 2,
    zIndex: 9999,
  },
  sep: { color: '#e2e8f0', fontSize: 16, marginHorizontal: 2 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8 },
  itemFirst: {},
  itemText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  current: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8, backgroundColor: '#eff6ff' },
  currentText: { fontSize: 13, fontWeight: '700', color: '#3b82f6' },
});

// ─── グレード定義 ─────────────────────────────────────────
const GRADES = [
  { key: 'grade1', label: '英検1級', sub: 'Grade 1' },
  { key: 'grade2', label: '英検2級', sub: 'Grade 2' },
];

export default function App() {
  const [selectedGrade, setSelectedGrade] = useState('grade1');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <WebAppNav />

      {/* ── カード画面 ── */}
      <View style={styles.screenContainer}>
        <CardScreen key={selectedGrade} grade={selectedGrade} />
      </View>

      {/* ── グレードタブ（下部） ── */}
      <View style={styles.tabBar}>
        {GRADES.map((grade) => {
          const isActive = selectedGrade === grade.key;
          return (
            <TouchableOpacity
              key={grade.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setSelectedGrade(grade.key)}
              activeOpacity={0.75}
            >
              {isActive && <View style={styles.tabIndicator} />}
              <Text style={[styles.tabText, isActive ? styles.tabTextActive : styles.tabTextInactive]}>
                {grade.label}
              </Text>
              <Text style={[styles.tabSub, isActive ? styles.tabSubActive : styles.tabSubInactive]}>
                {grade.sub}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

// ─── スタイル ─────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── スクリーン ──
  screenContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── 下部タブバー ──
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    backgroundColor: '#111111',
    paddingBottom: Platform.OS === 'ios' ? 0 : 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    position: 'relative',
  },
  tabActive: {
    backgroundColor: '#1a1a1a',
  },
  tabIndicator: {
    position: 'absolute',
    top: 0,
    left: '15%',
    right: '15%',
    height: 3,
    backgroundColor: colors.accent,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  tabText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  tabTextActive: {
    color: '#ffffff',
  },
  tabTextInactive: {
    color: '#444444',
  },
  tabSub: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  tabSubActive: {
    color: colors.accent,
  },
  tabSubInactive: {
    color: '#333333',
  },
});
