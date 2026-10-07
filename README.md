# Ürün Defteri

Kuruyemiş alım/satış takip uygulaması (Asya Çerez · Gökhan Altın). Statik site, GitHub Pages'te `defter.asyacerez.com`; veri Supabase'te.

- `src/` → kaynak; `python3 build.py` ile `index.html`, `app.js`, `runtime.js` üretilir.
- `config.js` → Supabase proje adresi ve anon anahtarı (herkese açık olabilir; güvenlik veritabanı kurallarındadır).
- `.github/workflows/uyanik-tut.yml` → ücretsiz Supabase projesinin uykuya geçmemesi için günlük istek.
