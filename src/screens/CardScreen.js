import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';

// ─── プラットフォーム対応の発音関数 ─────────────────────
// Web: Web Speech API / Native: expo-speech
const speakWord = (text) => {
  if (Platform.OS === 'web') {
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // 前の発音をキャンセル
        const utterance = new window.SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.85;
        // アメリカ英語の音声を優先して選択
        const voices = window.speechSynthesis.getVoices();
        const enUS = voices.find(
          v => v.lang === 'en-US' && v.name.toLowerCase().includes('samantha')
        ) || voices.find(v => v.lang === 'en-US') || null;
        if (enUS) utterance.voice = enUS;
        window.speechSynthesis.speak(utterance);
      }
    } catch (_) {}
  } else {
    Speech.speak(text, { language: 'en-US', rate: 0.85 });
  }
};

// ─── プラットフォーム対応のハプティクス関数 ──────────────
// Web: 非対応のため無視 / Native: expo-haptics
const triggerHapticNative = (type = 'light') => {
  if (Platform.OS === 'web') return;
  try {
    if (type === 'warning') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else if (type === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch (_) {}
};
import { colors } from '../constants/colors';
import { addBookmark, removeBookmark, isBookmarked } from '../utils/storage';
import { subscribeToWords } from '../services/firebase';
import {
  getHiddenWords,
  addHiddenWord,
  removeHiddenWord,
  cleanupHiddenWords,
  clearHiddenWords,
  getShuffleOrder,
  saveShuffleOrder,
  clearShuffleOrder,
  getLastPosition,
  saveLastPosition,
  getSettings,
  saveSettings,
  getTodayCount,
  incrementTodayCount,
} from '../utils/storage';

// ─── プラットフォーム対応の確認ダイアログ ───────────────
const confirmAsync = (message) => {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert('', message, [
      { text: 'キャンセル', style: 'cancel', onPress: () => resolve(false) },
      { text: 'OK', onPress: () => resolve(true) },
    ]);
  });
};

// ─── 定数 ────────────────────────────────────────────────
const SWIPE_H = 50;       // 水平スワイプ閾値
const SWIPE_V = 80;       // 垂直スワイプ閾値
const TAP_MAX = 10;       // タップと判定する最大移動量
const UNDO_MS = 3000;     // アンドゥ表示時間（ミリ秒）
const FADE_MS = 120;      // フェードアニメーション時間
const RELOAD_MS = 600;    // リロード表示時間

// PC判定：Webかつ画面幅768px以上をPC扱い
const TABLET_BREAKPOINT = 768;

export default function CardScreen({ grade }) {
  const { width: screenWidth } = useWindowDimensions();
  const isPC = Platform.OS === 'web' && screenWidth >= TABLET_BREAKPOINT;

  // ─── State ──────────────────────────────────────────────
  const [allWords, setAllWords] = useState([]);
  const [hiddenIds, setHiddenIds] = useState([]);
  const [shuffleOrder, setShuffleOrder] = useState(null); // ID配列、null=自然順
  const [currentIndex, setCurrentIndex] = useState(0);
  // 0=前面(単語) / 1=日本語訳 / 2=英文例 / 3=例文訳
  // 例文未登録の単語は max=1, 例文訳未登録は max=2
  const [cardState, setCardState] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [todayCount, setTodayCount] = useState(0);
  const [undoData, setUndoData] = useState(null); // { id, english, japanese }
  const [isLoading, setIsLoading] = useState(true);
  const [isReloading, setIsReloading] = useState(false);
  const [firebaseError, setFirebaseError] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  // ─── Refs ────────────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const undoTimer = useRef(null);
  const gestureRef = useRef({});        // PanResponder 用コールバックストア
  const soundEnabledRef = useRef(true); // 常に最新の soundEnabled を参照
  const currentWordRef = useRef(null);  // 常に最新の currentWord を参照
  const cardRef = useRef(null);         // Web用マウスイベント対象

  // ─── シャッフル順を反映した単語リスト ───────────────────
  const orderedWords = useMemo(() => {
    if (!shuffleOrder || shuffleOrder.length === 0) return allWords;
    const indexMap = new Map(shuffleOrder.map((id, i) => [id, i]));
    return [...allWords].sort((a, b) => {
      const ai = indexMap.has(a.id) ? indexMap.get(a.id) : Infinity;
      const bi = indexMap.has(b.id) ? indexMap.get(b.id) : Infinity;
      return ai - bi;
    });
  }, [allWords, shuffleOrder]);

  // ─── 表示単語リスト（非表示を除外） ─────────────────────
  const visibleWords = useMemo(
    () => orderedWords.filter((w) => !hiddenIds.includes(w.id)),
    [orderedWords, hiddenIds]
  );

  // currentIndex が visibleWords の範囲外になり得るためレンダー時にクランプして
  // currentWord が undefined のままレンダーが進むのを防ぐ（範囲外時は真っ白の原因）
  const safeIndex = Math.min(Math.max(currentIndex, 0), Math.max(visibleWords.length - 1, 0));
  const currentWord = visibleWords[safeIndex] ?? null;

  // Ref を常に最新の値に同期
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { currentWordRef.current = currentWord; }, [currentWord]);

  // ─── ブックマーク状態の読み込み ──────────────────────────
  useEffect(() => {
    if (!currentWord) return;
    isBookmarked(grade, currentWord.id).then(setBookmarked);
  }, [grade, currentWord]);

  const toggleBookmark = async () => {
    if (!currentWord) return;
    if (bookmarked) {
      await removeBookmark(grade, currentWord.id);
      setBookmarked(false);
    } else {
      await addBookmark(grade, currentWord.id);
      setBookmarked(true);
    }
  };

  // ─── 初期データ読み込み ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setIsLoading(true);
      setCardState(0);
      setCurrentIndex(0);

      const [hidden, shuffle, pos, settings, count] = await Promise.all([
        getHiddenWords(grade),
        getShuffleOrder(grade),
        getLastPosition(grade),
        getSettings(),
        getTodayCount(),
      ]);
      if (cancelled) return;
      setHiddenIds(hidden);
      setShuffleOrder(shuffle);
      setCurrentIndex(pos);
      setSoundEnabled(settings.soundEnabled);
      setTodayCount(count);
      setIsLoading(false);
    };
    init();
    return () => { cancelled = true; };
  }, [grade]);

  // ─── Firestore リアルタイム購読 ───────────────────────────
  useEffect(() => {
    const unsubscribe = subscribeToWords(
      grade,
      async (words) => {
        setAllWords(words);
        setFirebaseError(false);
        // 削除された単語を非表示リストからクリーンアップ
        const validIds = words.map((w) => w.id);
        const cleaned = await cleanupHiddenWords(grade, validIds);
        setHiddenIds(cleaned);
      },
      () => setFirebaseError(true)
    );
    return () => unsubscribe();
  }, [grade]);

  // ─── インデックス範囲補正（単語数変動時） ────────────────
  useEffect(() => {
    if (visibleWords.length > 0 && currentIndex >= visibleWords.length) {
      const clamped = visibleWords.length - 1;
      setCurrentIndex(clamped);
      saveLastPosition(grade, clamped);
    }
  }, [visibleWords.length]);

  // ─── ハプティクス ─────────────────────────────────────────
  const haptic = useCallback((type = 'light') => {
    triggerHapticNative(type);
  }, []);

  // ─── フェードアニメーション付き遷移 ──────────────────────
  const withFade = useCallback(
    (action) => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start(() => {
        action();
        setCardState(0);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: FADE_MS,
          useNativeDriver: true,
        }).start();
      });
    },
    [fadeAnim]
  );

  // ─── カードタップ: 単語面（state 0）⇄ 裏面のトグル ───────
  // 表示中の状態が 0 なら 1 へ、それ以外なら 0 へ戻る（単語を再表示）
  // 「もっと詳しく」進める時は advanceState（ボタン）を使う
  const flipCard = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start(() => {
      setCardState((prev) => {
        const word = currentWordRef.current;
        if (!word) return 0;
        const next = prev === 0 ? 1 : 0;
        // state 0 へ戻る時は単語を再発音
        if (next === 0 && soundEnabledRef.current) {
          speakWord(word.english);
        }
        return next;
      });
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }).start();
    });
  }, [fadeAnim]);

  // ─── ボタン専用: 次の状態へ深掘り ─────────────────────────
  // 1(訳) → 2(例文・音読) → 3(例文訳)。最後まで行ったら何もしない
  const advanceState = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start(() => {
      setCardState((prev) => {
        const word = currentWordRef.current;
        if (!word) return prev;
        const maxState = word.exampleJa ? 3 : word.example ? 2 : 1;
        const next = prev >= maxState ? prev : prev + 1;
        // state 2 へ進んだ時=例文を音読
        if (next === 2 && word.example && soundEnabledRef.current) {
          speakWord(word.example);
        }
        return next;
      });
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }).start();
    });
  }, [fadeAnim]);

  // ─── 次の単語 ────────────────────────────────────────────
  const goNext = useCallback(() => {
    if (visibleWords.length === 0) return;
    haptic();
    withFade(() => {
      const next =
        currentIndex >= visibleWords.length - 1 ? 0 : currentIndex + 1;
      setCurrentIndex(next);
      saveLastPosition(grade, next);
      incrementTodayCount().then(setTodayCount);
      // 新しい単語の英語表示時に自動発音
      if (soundEnabledRef.current && visibleWords[next]) {
        speakWord(visibleWords[next].english);
      }
    });
  }, [visibleWords, currentIndex, grade, haptic, withFade]);

  // ─── 前の単語 ────────────────────────────────────────────
  const goPrev = useCallback(() => {
    if (currentIndex === 0) return;
    haptic();
    withFade(() => {
      const prev = currentIndex - 1;
      setCurrentIndex(prev);
      saveLastPosition(grade, prev);
      // 新しい単語の英語表示時に自動発音
      if (soundEnabledRef.current && visibleWords[prev]) {
        speakWord(visibleWords[prev].english);
      }
    });
  }, [visibleWords, currentIndex, grade, haptic, withFade]);

  // ─── 単語を非表示にする ───────────────────────────────────
  const hideWord = useCallback(async () => {
    if (!currentWord) return;
    haptic('warning');
    const word = { ...currentWord };

    await addHiddenWord(grade, word.id);
    setHiddenIds((prev) => [...prev, word.id]);

    // アンドゥ表示
    setUndoData({ id: word.id, english: word.english, japanese: word.japanese });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoData(null), UNDO_MS);
  }, [currentWord, grade, haptic]);

  // ─── 非表示を取り消す（アンドゥ） ────────────────────────
  const undoHide = useCallback(async () => {
    if (!undoData) return;
    haptic('success');
    await removeHiddenWord(grade, undoData.id);
    setHiddenIds((prev) => prev.filter((id) => id !== undoData.id));
    setUndoData(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, [undoData, grade, haptic]);

  // ─── リロード ────────────────────────────────────────────
  const reload = useCallback(() => {
    haptic();
    setIsReloading(true);
    setCardState(0);
    setTimeout(() => setIsReloading(false), RELOAD_MS);
  }, [haptic]);

  // ─── 発音再生ボタン ───────────────────────────────────────
  const playSound = useCallback(() => {
    if (currentWord) {
      speakWord(currentWord.english);
    }
  }, [currentWord]);

  // ─── 発音 ON/OFF トグル ───────────────────────────────────
  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      saveSettings({ soundEnabled: next });
      return next;
    });
  }, []);

  // ─── 単語シャッフル ───────────────────────────────────────
  const handleShuffle = useCallback(async () => {
    setMenuVisible(false);
    if (allWords.length === 0) return;
    const ids = allWords.map((w) => w.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setShuffleOrder(ids);
    await saveShuffleOrder(grade, ids);
    setCurrentIndex(0);
    await saveLastPosition(grade, 0);
    setCardState(0);
    haptic('success');
  }, [allWords, grade, haptic]);

  // ─── シャッフルを戻す（自然順に戻す） ──────────────────
  const handleUnshuffle = useCallback(async () => {
    setMenuVisible(false);
    setShuffleOrder(null);
    await clearShuffleOrder(grade);
    setCurrentIndex(0);
    await saveLastPosition(grade, 0);
    setCardState(0);
    haptic('success');
  }, [grade, haptic]);

  // ─── 覚えた単語をすべて復活 ──────────────────────────────
  const handleRestoreHidden = useCallback(async () => {
    setMenuVisible(false);
    const ok = await confirmAsync('覚えた単語をすべて復活しますか？');
    if (!ok) return;
    await clearHiddenWords(grade);
    setHiddenIds([]);
    haptic('success');
  }, [grade, haptic]);

  // ─── PanResponder（ジェスチャー検知） ────────────────────
  // gestureRef に最新のコールバックを保持して
  // PanResponder のクロージャ問題を回避する
  useEffect(() => {
    gestureRef.current = { flipCard, goNext, goPrev, hideWord, reload };
  }, [flipCard, goNext, goPrev, hideWord, reload]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 5 || Math.abs(dy) > 5,
      // ジェスチャーを他の要素に渡さない
      onPanResponderTerminationRequest: () => false,
      // ジェスチャー開始時にブラウザのデフォルト動作（テキスト選択など）を防ぐ
      onPanResponderGrant: (e) => {
        if (e.preventDefault) e.preventDefault();
      },
      onPanResponderRelease: (_, { dx, dy }) => {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const g = gestureRef.current;

        // タップ判定: state 0 → 訳表示へ / state 1+ → 単語へ戻る（flipCard 内で分岐）
        if (absDx < TAP_MAX && absDy < TAP_MAX) {
          g.flipCard?.();
          return;
        }

        // 横スワイプ（水平優勢）
        if (absDx > absDy) {
          if (dx < -SWIPE_H) g.goNext?.();
          else if (dx > SWIPE_H) g.goPrev?.();
        } else {
          // 縦スワイプ（垂直優勢）
          if (dy < -SWIPE_V) g.hideWord?.();
          else if (dy > SWIPE_V) g.reload?.();
        }
      },
    })
  ).current;

  // ─── PC キーボード操作 ────────────────────────────────────
  // → 次の単語 / ← 前の単語 / Space・Enter でフリップ
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKeyDown = (e) => {
      const g = gestureRef.current;
      switch (e.key) {
        case 'ArrowRight': g.goNext?.(); break;
        case 'ArrowLeft':  g.goPrev?.(); break;
        case ' ':
        case 'Enter':      g.flipCard?.(); e.preventDefault(); break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ─── Web用ジェスチャー（Pointer Events via DOM） ──────────
  // react-native-web は onMouseDown/onMouseUp を DOM に転送しないため、
  // callback ref で要素マウント時に直接 DOM pointer イベントを購読する。
  // useEffect([]) だと初回描画時カードが未マウント(loading中)で失敗する。
  const webGestureStart = useRef({ x: 0, y: 0, active: false });
  const pointerCleanupRef = useRef(null);

  const attachCardRef = useCallback((el) => {
    cardRef.current = el;
    if (Platform.OS !== 'web') return;

    // 古いリスナーを剥がす
    if (pointerCleanupRef.current) {
      pointerCleanupRef.current();
      pointerCleanupRef.current = null;
    }
    if (!el || typeof el.addEventListener !== 'function') return;

    // タップ対象がボタン等の操作要素なら親のジェスチャーをスキップ
    // （pointerdown.preventDefault がクリック合成を阻害してボタンが反応しなくなる問題を防ぐ）
    const isInteractive = (target) => {
      if (!target || !target.closest) return false;
      return !!target.closest('[role="button"], button, a, input, select, textarea');
    };

    const onDown = (e) => {
      if (isInteractive(e.target)) {
        webGestureStart.current.active = false;
        return;
      }
      webGestureStart.current = { x: e.clientX, y: e.clientY, active: true };
      // テキスト選択を防ぐ
      if (e.preventDefault) e.preventDefault();
    };
    const onUp = (e) => {
      if (!webGestureStart.current.active) return;
      webGestureStart.current.active = false;
      if (isInteractive(e.target)) return; // ボタン上の release は無視
      const dx = e.clientX - webGestureStart.current.x;
      const dy = e.clientY - webGestureStart.current.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const g = gestureRef.current;

      if (absDx < TAP_MAX && absDy < TAP_MAX) {
        // state 0 → 意味へ / state 1+ → 単語へ戻る（flipCard が判定）
        g.flipCard?.();
        return;
      }
      if (absDx > absDy) {
        if (dx < -SWIPE_H) g.goNext?.();
        else if (dx > SWIPE_H) g.goPrev?.();
      } else {
        if (dy < -SWIPE_V) g.hideWord?.();
        else if (dy > SWIPE_V) g.reload?.();
      }
    };
    const onCancel = () => {
      webGestureStart.current.active = false;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);

    // ブラウザのデフォルト動作（スクロール・テキスト選択）を抑止
    if (el.style) {
      el.style.touchAction = 'none';
      el.style.userSelect = 'none';
      el.style.webkitUserSelect = 'none';
    }

    pointerCleanupRef.current = () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
    };
  }, []);

  // ─── クリーンアップ ───────────────────────────────────────
  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  // ─── ローディング画面 ────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // ─── エラー画面 ──────────────────────────────────────────
  if (firebaseError) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>接続エラー</Text>
        <Text style={styles.errorSubText}>
          インターネット接続を確認してください
        </Text>
      </View>
    );
  }

  // ─── 単語なし画面 ────────────────────────────────────────
  if (visibleWords.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>単語がありません</Text>
        <Text style={styles.emptySubText}>
          管理者が単語を追加するまでお待ちください
        </Text>
      </View>
    );
  }

  // ─── メインレンダリング ───────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ── PC用 矢印ナビゲーション（スマホでは非表示） ── */}
      {isPC && (
        <View style={styles.arrowOverlay} pointerEvents="box-none">
          <TouchableOpacity
            onPress={goPrev}
            style={[styles.arrowBtn, currentIndex === 0 && styles.arrowBtnDisabled]}
            disabled={currentIndex === 0}
          >
            <Text style={[styles.arrowText, currentIndex === 0 && styles.arrowTextDisabled]}>
              ‹
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={goNext}
            style={styles.arrowBtn}
          >
            <Text style={styles.arrowText}>›</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── カードエリア（ジェスチャー対象） ── */}
      <Animated.View
        ref={attachCardRef}
        style={[styles.cardArea, { opacity: fadeAnim }]}
        // ネイティブ（iOS/Android）: PanResponder
        // Web: attachCardRef で要素マウント時に pointer イベントを購読
        {...(Platform.OS !== 'web' ? panResponder.panHandlers : {})}
      >
        {isReloading ? (
          <ActivityIndicator size="large" color={colors.accent} />
        ) : cardState === 0 ? (
          /* ── State 0: 単語のみ ── */
          <Text
            style={[
              styles.wordText,
              getDynamicFontStyle(currentWord.english),
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.4}
          >
            {currentWord.english}
          </Text>
        ) : (
          /* ── State 1〜3: 文脈は上に小さく、フォーカスは下に大きく ── */
          <>
            {/* 文脈エリア（上） */}
            <View style={styles.contextArea}>
              <Text style={styles.contextEn} numberOfLines={1} adjustsFontSizeToFit>
                {currentWord.english}
              </Text>
              {cardState >= 2 && (
                <Text style={styles.contextJa} numberOfLines={2}>
                  {currentWord.japanese}
                </Text>
              )}
              {cardState >= 3 && currentWord.example ? (
                <Text style={styles.contextExEn} numberOfLines={2}>
                  {currentWord.example}
                </Text>
              ) : null}
            </View>

            {/* 区切り線 */}
            <View style={styles.divider} />

            {/* フォーカスエリア（下） */}
            <View style={styles.focusArea}>
              {cardState === 1 && (
                <Text
                  style={styles.focusJa}
                  numberOfLines={3}
                  adjustsFontSizeToFit
                >
                  {currentWord.japanese}
                </Text>
              )}
              {cardState === 2 && (
                <Text
                  style={styles.focusExEn}
                  numberOfLines={4}
                  adjustsFontSizeToFit
                >
                  {currentWord.example}
                </Text>
              )}
              {cardState === 3 && (
                <Text
                  style={styles.focusExJa}
                  numberOfLines={4}
                  adjustsFontSizeToFit
                >
                  {currentWord.exampleJa}
                </Text>
              )}
            </View>

            {/* アクションボタン: 次の状態へ進む（明示的） */}
            {cardState === 1 && currentWord.example ? (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={advanceState}
                accessibilityRole="button"
                hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
                accessibilityLabel="例文を表示"
              >
                <Text style={styles.actionBtnText}>▶  Example sentence</Text>
              </TouchableOpacity>
            ) : null}
            {cardState === 2 && currentWord.exampleJa ? (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={advanceState}
                accessibilityRole="button"
                hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
                accessibilityLabel="例文の和訳を表示"
              >
                <Text style={styles.actionBtnText}>▶  Translation</Text>
              </TouchableOpacity>
            ) : null}

            {/* スワイプヒント（次の単語へ） */}
            <Text style={styles.swipeHint}>
              {isPC ? '← →  矢印キーで前後の単語' : '← →  スワイプで次の単語'}
            </Text>
          </>
        )}
      </Animated.View>

      {/* ── 進捗インジケーター ── */}
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          {currentIndex + 1} / {visibleWords.length}
        </Text>
      </View>

      {/* ── 下部バー（今日の単語数 ＋ 発音トグル ＋ 歯車） ── */}
      <View style={styles.bottomBar}>
        <Text style={styles.todayText}>今日: {todayCount} 枚</Text>
        <View style={styles.bottomRight}>
          <TouchableOpacity
            onPress={toggleSound}
            style={[styles.soundToggle, soundEnabled ? styles.soundToggleOn : styles.soundToggleOff]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[styles.soundToggleText, soundEnabled ? styles.soundToggleTextOn : styles.soundToggleTextOff]}>
              発音 {soundEnabled ? 'ON' : 'OFF'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={toggleBookmark}
            style={styles.gearBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="ブックマーク"
          >
            <Text style={styles.gearText}>{bookmarked ? '🔖' : '🏷️'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMenuVisible(true)}
            style={styles.gearBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="設定メニュー"
          >
            <Text style={styles.gearText}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 設定メニュー ── */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <Pressable style={styles.menuCard} onPress={(e) => e.stopPropagation && e.stopPropagation()}>
            <TouchableOpacity style={styles.menuItem} onPress={handleShuffle}>
              <Text style={styles.menuItemText}>単語をシャッフル</Text>
            </TouchableOpacity>
            {shuffleOrder && shuffleOrder.length > 0 && (
              <>
                <View style={styles.menuDivider} />
                <TouchableOpacity style={styles.menuItem} onPress={handleUnshuffle}>
                  <Text style={styles.menuItemText}>シャッフルを戻す</Text>
                </TouchableOpacity>
              </>
            )}
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={handleRestoreHidden}>
              <Text style={styles.menuItemText}>覚えた単語を復活</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
              <Text style={[styles.menuItemText, styles.menuCancelText]}>キャンセル</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── アンドゥトースト ── */}
      {undoData && (
        <View style={styles.undoToast}>
          <Text style={styles.undoText} numberOfLines={1}>
            「{undoData.english}」を非表示にしました
          </Text>
          <TouchableOpacity onPress={undoHide} style={styles.undoButton}>
            <Text style={styles.undoButtonText}>元に戻す</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── 単語の長さに応じたフォントサイズを返す ──────────────
// adjustsFontSizeToFit（ネイティブ）の補助として、
// Web でも適切なサイズになるよう文字数で初期サイズを決定する
const getDynamicFontStyle = (word = '') => {
  const len = word.length;
  if (len <= 7)  return { fontSize: 56 };
  if (len <= 10) return { fontSize: 48 };
  if (len <= 14) return { fontSize: 40 };
  if (len <= 18) return { fontSize: 32 };
  if (len <= 22) return { fontSize: 26 };
  return { fontSize: 22 };
};

// ─── スタイル ────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── ローディング・エラー・空 ──
  centerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    color: colors.danger,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorSubText: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubText: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
  },


  // ── カードエリア ──
  cardArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
    // PC ブラウザ: テキスト選択禁止・カーソルをポインターに
    userSelect: 'none',
    cursor: 'pointer',
    WebkitUserSelect: 'none',
  },
  wordText: {
    color: colors.textPrimary,
    fontSize: 52,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 1,
    lineHeight: 64,
  },

  // ─── 文脈エリア（上・小さい・薄い） ─────────────────────
  contextArea: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  contextEn: {
    color: colors.textSecondary,
    fontSize: 26,
    fontWeight: '600',
    textAlign: 'center',
  },
  contextJa: {
    color: colors.textSecondary,
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 24,
    opacity: 0.85,
  },
  contextExEn: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 20,
    opacity: 0.7,
  },

  // ─── 区切り線（明るくして視認性UP） ──────────────────────
  divider: {
    width: '70%',
    height: 1,
    backgroundColor: '#3A3A3A',
    marginVertical: 28,
  },

  // ─── フォーカスエリア（下・大きい・白） ─────────────────
  focusArea: {
    width: '100%',
    minHeight: 100,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusJa: {
    color: colors.textPrimary,
    fontSize: 38,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 50,
  },
  focusExEn: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 34,
    fontStyle: 'italic',
    letterSpacing: 0.3,
  },
  focusExJa: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 32,
  },

  // ─── アクションボタン（次の状態へ・控えめデザイン） ─────
  actionBtn: {
    marginTop: 28,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3A3A3A',
    backgroundColor: 'transparent',
    alignItems: 'center',
    cursor: 'pointer',
  },
  actionBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.6,
  },

  // ─── スワイプヒント ──────────────────────────────────────
  swipeHint: {
    marginTop: 16,
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 1,
  },
  // ── PC用 矢印ナビゲーション ──
  arrowOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 80,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    zIndex: 10,
  },
  arrowBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowBtnDisabled: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.04)',
  },
  arrowText: {
    fontSize: 34,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 40,
    marginTop: -2,
  },
  arrowTextDisabled: {
    color: 'rgba(255,255,255,0.15)',
  },

  // ── 進捗 ──
  progressContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  progressText: {
    color: colors.textMuted,
    fontSize: 15,
    letterSpacing: 1,
  },

  // ── 下部バー（今日の単語数 ＋ 発音トグル） ──
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    paddingTop: 4,
  },
  todayText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  soundToggle: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
  },
  soundToggleOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentDim,
  },
  soundToggleOff: {
    borderColor: '#444',
    backgroundColor: '#1e1e1e',
  },
  soundToggleText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  soundToggleTextOn: {
    color: colors.accent,
  },
  soundToggleTextOff: {
    color: '#666',
  },

  bottomRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gearBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#444',
    backgroundColor: '#1e1e1e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gearText: {
    fontSize: 20,
    color: '#888',
    lineHeight: 22,
  },

  // ── 設定メニュー ──
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  menuCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#1e1e1e',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden',
  },
  menuItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  menuItemText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  menuCancelText: {
    color: colors.textMuted,
    fontWeight: '500',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#2a2a2a',
  },

  // ── アンドゥトースト ──
  undoToast: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    left: 20,
    right: 20,
    backgroundColor: colors.undoBackground,
    borderColor: colors.undoBorder,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  undoText: {
    color: colors.undoText,
    fontSize: 14,
    flex: 1,
    marginRight: 12,
  },
  undoButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.accentDim,
    borderRadius: 8,
  },
  undoButtonText: {
    color: colors.undoButton,
    fontSize: 14,
    fontWeight: '600',
  },
});
