import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';

// ※ isVisible フィルタはクライアント側で処理し、
//    複合インデックスの作成を不要にしています

// ─────────────────────────────────────────────────────────
// ⚠️  SETUP: firebase.config.js を作成して設定を入力してください
//    SETUP.md の手順を参照
// ─────────────────────────────────────────────────────────
import { firebaseConfig } from '../../firebase.config';

// Firebase の重複初期化を防ぐ
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);

// ─── 単語データの購読 ────────────────────────────────────

/**
 * 指定グレードの単語をリアルタイムで購読する
 * @param {string} grade - 'grade1' または 'grade2'
 * @param {function} onSuccess - 単語配列を受け取るコールバック
 * @param {function} onError - エラーを受け取るコールバック
 * @returns {function} 購読解除関数
 *
 * Firestore コレクション構造:
 * words/{id} {
 *   english: string,       // 英単語
 *   japanese: string,      // 日本語訳
 *   grade: 'grade1'|'grade2',
 *   order: number,         // 表示順
 *   isVisible: boolean,    // 管理者による非公開フラグ
 *   createdAt: timestamp,
 *   updatedAt: timestamp,
 * }
 */
export const subscribeToWords = (grade, onSuccess, onError) => {
  // grade のみで絞り込み（複合インデックス不要）
  // isVisible フィルタと order ソートはクライアント側で処理
  const q = query(
    collection(db, 'words'),
    where('grade', '==', grade)
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const words = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((w) => w.isVisible !== false)   // isVisible フィルタ
        .sort((a, b) => (b.order ?? 0) - (a.order ?? 0)); // 新しい順（order 降順）
      onSuccess(words);
    },
    (error) => {
      console.error('Firestore subscription error:', error);
      if (onError) onError(error);
    }
  );

  return unsubscribe;
};
