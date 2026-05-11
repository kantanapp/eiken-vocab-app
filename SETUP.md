# 英検単語アプリ セットアップ手順

## 必要なもの
- Node.js 18 以上
- Expo CLI（`npm install -g expo-cli`）
- iOS: Xcode + シミュレーター / 実機
- Android: Android Studio + エミュレーター / 実機
- Firebase アカウント（無料）

---

## 1. パッケージのインストール

```bash
cd 英単語アプリ
npm install
```

---

## 2. Firebase プロジェクトの作成

1. [Firebase コンソール](https://console.firebase.google.com/) を開く
2. 「プロジェクトを追加」→ 任意の名前で作成
3. 左メニュー「Firestore Database」→「データベースの作成」
   - 本番モードで開始（セキュリティルールは後で設定）
   - リージョン: `asia-northeast1`（東京）を選択
4. 左メニュー「プロジェクトの設定（歯車）」→「マイアプリ」→ ウェブアプリ(`</>`) を追加
5. 表示された `firebaseConfig` の値をコピーする

---

## 3. Firebase 設定ファイルの作成

`firebase.config.example.js` を `firebase.config.js` にコピーして、
手順 2 でコピーした値を貼り付ける：

```js
// firebase.config.js
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
};
```

⚠️ `firebase.config.js` は `.gitignore` に含まれているため Git に上がりません。

---

## 4. Firestore セキュリティルール

Firebase コンソール → Firestore → 「ルール」タブで以下を設定：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ユーザーは words コレクションを読み取りのみ可能
    match /words/{wordId} {
      allow read: if true;
      allow write: if false; // 管理者は Admin SDK 経由でのみ書き込み
    }
  }
}
```

---

## 5. Firestore インデックスの作成

以下の複合インデックスが必要です。
初回起動時にコンソールにエラーリンクが表示されるので、そのリンクから作成してください。

| コレクション | フィールド1 | フィールド2 | フィールド3 |
|---|---|---|---|
| words | grade (昇順) | isVisible (昇順) | order (昇順) |

---

## 6. アプリの起動

```bash
# Expo Go アプリで確認（最速）
npx expo start

# iOS シミュレーター
npx expo start --ios

# Android エミュレーター
npx expo start --android
```

---

## 7. 単語データの登録（管理者）

Firebase コンソール → Firestore → 「+ コレクションを開始」→ `words`

各ドキュメントのフィールド：

| フィールド名 | 型 | 例 |
|---|---|---|
| english | string | accomplish |
| japanese | string | （～を）成し遂げる |
| grade | string | grade1 または grade2 |
| order | number | 1, 2, 3... |
| isVisible | boolean | true |
| createdAt | timestamp | （現在時刻） |
| updatedAt | timestamp | （現在時刻） |

CSV一括インポートは管理者ツール（Phase 2）で対応予定。

---

## ファイル構成

```
英単語アプリ/
├── App.js                      # ルート・タブ管理
├── package.json
├── app.json                    # Expo 設定
├── babel.config.js
├── .gitignore
├── firebase.config.example.js  # Firebase設定テンプレート
├── firebase.config.js          # ⚠️ 自分で作成（Git除外）
└── src/
    ├── constants/
    │   └── colors.js           # ダークテーマカラー
    ├── utils/
    │   └── storage.js          # AsyncStorage ヘルパー
    ├── services/
    │   └── firebase.js         # Firestore 購読ロジック
    └── screens/
        └── CardScreen.js       # メインカード画面
```

---

## ジェスチャー操作まとめ

| 操作 | 動作 |
|---|---|
| タップ | 英語 ↔ 日本語訳 切り替え |
| 左スワイプ（→←） | 次の単語 |
| 右スワイプ（←→） | 前の単語 |
| 上スワイプ（↑） | 単語を非表示 |
| 下スワイプ（↓） | リロード |
| 🔊 ボタン押す | 発音再生 |
| 右上アイコン | 発音 ON/OFF |
