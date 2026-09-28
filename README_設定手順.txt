駅ナビ v1.2 全国版
========================

このZIPには以下が入っています。
- index.html : iPhone/PC用フロントエンド
- worker.js : 駅すぱあとAPIキーを安全に隠すCloudflare Worker
- wrangler.toml : Worker設定

重要
----
全国の正規時刻表・乗換・番線・運行情報は外部交通データが必要です。
このアプリは「駅すぱあと API」を使う前提で完成させています。
APIキーは利用者自身で駅すぱあとから発行してください。
APIキーを index.html に直書きする設計にはしていません。

セットアップ
------------
1. 駅すぱあと API のアクセスキーを取得する。
2. Cloudflare Workers に worker.js をデプロイする。
3. Worker の Secret に EKISPERT_KEY という名前でアクセスキーを登録する。
   Wranglerを使う場合:
      wrangler secret put EKISPERT_KEY
4. 必要なら wrangler.toml の ALLOWED_ORIGIN を自分のGitHub Pages URLに変更する。
5. Workerをデプロイする。
      wrangler deploy
6. 発行されたURL（例 https://transit-labs-api.xxxxx.workers.dev）をコピー。
7. index.html をGitHub Pages等に置く。
8. 駅ナビ右上の⚙︎ →「中継API URL」にWorker URLを貼る → 接続テスト → 保存。

実装済み
--------
- 日本全国の駅名候補検索
- 出発/到着/始発/終電の乗換検索
- 最大5経路
- IC運賃目安
- 乗換回数・徒歩時間
- 各区間の出発/到着時刻
- APIに存在する場合の出発番線・到着番線
- 全国の鉄道駅時刻表（路線・方面選択）
- 鉄道運行情報
- 二俣川→中野坂上の「会社へ」ショートカット
- 新宿三丁目を含む通勤経路の優先表示
- お気に入り/前回経路を端末内保存
- iPhone safe-area対応

注意
----
- 番線は交通事業者/列車/駅によってデータが提供されない場合があります。その場合はアプリ側で空欄にします。
- 運行情報は駅すぱあとAPIの契約・提供条件に依存します。
- APIキーは課金や利用上限に関係するため公開しないでください。
