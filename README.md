# Games Medya Partner Hub

Ajans (Games Medya) ile markalar (ör. Unilever) arasında influencer kampanyalarını debrief'ten sonuca kadar yöneten platform.
Partnership → dokümanlar ve Claude özeti → master agreement'lar ve markalar → projeler ve deliverable'lar →
5 aşama: Masterfile onayı, Content × Influencer eşleşmesi, içerik onayı, yayın (link + otomatik screenshot), performans verisi.
Ayrıca yalnız sahibin gördüğü finans bölümü, ekip/müşteri üyelikleri, aktivite kaydı, dosya bütünlüğü ve yedekleme.

## Adres ve hesaplar

- Canlı: https://partner-hub.meliksahtestenv.workers.dev (hesabın workers.dev alt alanı `meliksahtestenv`; pages.dev Türkiye'de engelli olduğu için kullanılmıyor)
- İlk açılışta iki hesap oluşur: ajans sahibi ve Unilever müşteri hesabı (`hosted/wrangler.toml` → `SEED`; şifreler yalnız hash olarak durur).
  İlk girişten sonra şifreni sol alttaki anahtar simgesinden değiştir.
- Yeni kişiler: Team & access (ajans) ya da partnership → Members (müşteri) → davet. Davet e-postasındaki kodla hesap açılır.

## Nasıl yayınlanır

`main` dalına her push: testler (iki rol uçtan uca) → Cloudflare'e deploy. Pull request'lerde yalnız testler çalışır.
GitHub secret'ları: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (zorunlu); `ANTHROPIC_API_KEY` (özet, Excel/görsel okuma),
`APIFY_TOKEN` (takipçi/ER, post metrikleri), `RESEND_API_KEY` (davet e-postası) — eklendiklerinde özellik kendiliğinden açılır.

## Mimari

| Parça | Yer |
|---|---|
| Arayüz (React + htm, tek dosya) | `src/*.js`, `src/styles.css` → `build.py` |
| Claude içinde çalışan sürüm (Artifact) | `partner-hub.html` (build çıktısı) |
| Sunucu: Worker + tek SQLite Durable Object | `hosted/src/worker.js` |
| Tarayıcı tarafı sunucu bağlantısı (`window.claude.use` uyumlu) | `hosted/client/runtime.js` |
| Giriş sayfası | `hosted/client/login.html` |
| Testler | `test/e2e.py` (Artifact), `test/hosted_e2e.py` (sunucu, iki hesap) |
| Ajanlar ve Ops Center | `agents/` |

Sunucu her okuma/yazmayı role göre kontrol eder: müşteri yalnız kendi partnership'ini görür, finans yalnız sahibe açıktır,
müşteri yalnız onay/yorum alanlarını yazabilir. Dosyalar SHA-256 ile doğrulanır; tüm işlemler gün gün aktivite kaydına yazılır.

## Yerel geliştirme

```bash
npm ci --prefix hosted && npm ci --prefix test && pip install playwright pillow reportlab openpyxl
python3 build.py
cd hosted && npx wrangler dev --config wrangler.test.toml --port 8787   # test hesapları: owner@test.local / owner-pass-123, buyer@unilever.test / buyer-pass-123
python3 test/hosted_e2e.py http://localhost:8787
```
