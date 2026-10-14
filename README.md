# Son Vardiya

Tarayıcıda çalışan, özgün çizimlere sahip tek ve çok oyunculu bir uzay gemisi sosyal çıkarım oyunu. Mürettebat görevleri tamamlarken sabotajcıyı bulmaya çalışır; sabotajcı ise sistemleri bozup ekibi etkisiz hale getirmeye çalışır.

## GitHub Pages'te yayınlama

1. Değişiklikleri `main` dalına gönder.
2. Depoda **Settings → Pages** bölümünü açıp **Build and deployment → Source → GitHub Actions** seç.
3. Pages kaynağını seçtikten sonra **Actions → Deploy GitHub Pages → Run workflow** ile ilk dağıtımı başlat. Sonraki `main` push'ları otomatik dağıtılır.
4. GitHub Pages adresi hazır olduğunda bağlantıyı iPad'de Safari ile aç.

Sayfa GitHub Pages'te derlemesiz yayımlanır. Çevrimiçi mod PeerJS CDN'ine ve eşleştirme servisine internet erişimi ister; oyun durumu oda sahibinin cihazında çalışır. iPad'de yatay ekran önerilir.

## Çevrimiçi oyun

- Oyuncu adını yazıp **ODA KUR** seç; oluşan dört karakterli kodu veya davet bağlantısını arkadaşlarınla paylaş.
- Diğer oyuncular aynı Pages bağlantısını açıp kodla katılır. Oda sahibi rolünü seçer ve maçı başlatır; oda en fazla 6 kişiliktir.
- Oyun oda sahibinin cihazında çalışır; oda sahibi sayfayı açık tutmalıdır. WebRTC tabletler arasında doğrudan bağlantı kurar, oyun sunucusu gerekmez.
- Bazı modem ve mobil ağlar doğrudan bağlantıyı engelleyebilir. Böyle durumlarda TURN relay yapılandırması gerekir.

## Kontroller

- Hareket: ekrandaki yön tuşları veya `W`, `A`, `S`, `D` / ok tuşları
- Konsol kullanma: konsolun yanına gidip **ETKİLEŞ** düğmesine bas veya `E` tuşunu kullan
- Sabotajcı eylemi: yakındaki ekip üyesini etkisizleştirmek için **ETKİSİZLEŞTİR** veya `Q`; sabotaj için **SABOTAJ** veya `R`
- Mürettebat: cesedi bildirmek için **RAPOR**; bir acil toplantı için **ACİL TOPLANTI** veya `R`
- Toplantı: şüpheliyi seçip oy ver

Her turda rolünü seçebilir veya rastgele atanabilirsin. Mürettebat görevleri tamamlayıp sabotajcıyı oylamayla çıkararak; sabotajcı ise ekibi azaltıp oksijen arızasını zamanında onaramayarak kazanır.
