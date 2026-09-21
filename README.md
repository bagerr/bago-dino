# 🦖 NEON DINO-AGE: RESCUE PROTOCOL

> **16-bit Cyber-Prehistoric Action Platformer**  
> Jump, jetpack, and blast your way through hostile planetary biomes to rescue trapped baby dinos and recover ancient relics!

---

## 🎮 Oynanış ve Temel Özellikler

- **Çoklu Biyom Yapısı:** 
  - 🌋 **Volcano Core:** Lav ırmakları, yükselen kül fırtınaları ve ağır mekanik drone tehlikeleri.
  - 🌿 **Toxic Canopy:** Zehirli sarmaşıklar, tırmanma mekaniği, havadan asit damlatan böcekler ve canlı taretler.
  - ❄️ **Frozen Peaks:** Düşük sürtünmeli kaygan buz zemin fiziği, düşen sivri buz sarkıtları ve dondurucu devler.
  - ⚡ **Cyber Crater:** Kilitli final bölgesi ve siber kale boss meydan okuması.
- **Dikey Hareket Kabiliyeti:** Sınırlı yakıt yönetimli jetpack motoru ve sarmaşıklara tutunarak tırmanma dinamikleri.
- **Yavru Kurtarma Zinciri:** Bölümlerde kafes ve buz bloklarına hapsolmuş sevimli yavru dinozorları kurtarın; peşinizde sıra sıra koşan sadık bir eskort konvoyu oluşturun!
- **Keşif & Gizli Anahtarlar (Secret Vault):** Her biyomun gizli köşelerine saklanmış altın anahtarları bularak hazine sandıklarını ve gizli sonu açığa çıkarın.
- **Özgün Boss Savaşları:** Her bölgenin sonunda benzersiz saldırı paternlerine ve aşamalara sahip mekanik devler (Kanopi Kraliçesi, Buzul Titanı vb.).

---

## 🛠️ Teknik Altyapı & Performans

- **Vanilla HTML5 Canvas & Modern JavaScript:** Harici ağır oyun motorları olmadan sıfırdan geliştirilen hafif ve hızlı arcade çekirdeği.
- **Object Pooling Mimari:** Yoğun savaş anlarında çöp toplayıcı (Garbage Collector) yükünü sıfıra indirmek ve sabit 60 FPS sağlamak için mermi ve parçacık sistemlerinde nesne havuzu yaklaşımı.
- **Otomatik Bounding Box & Şeffaflık:** Piksel varlıklar için dinamik renk maskeleme ve şeffaflık hesaplama altyapısı.
- **Durum Yönetimi:** Bölüm ilerlemeleri, toplanan gizli anahtarlar ve skorlar için yerel tarayıcı kalıcılığı (`localStorage`).
- **Mobil & Dokunmatik Ergonomi:**
  - Safari/iOS için basılı tutma, büyüteç ve yakınlaştırma (zoom) engellemeleri.
  - Zorunlu yatay (landscape) ekran yönlendirme denetimi.

---

## 🕹️ Kontroller

| Eylem | Klavye (PC) | Dokunmatik (Mobil) |
| :--- | :--- | :--- |
| **Hareket** | `A` / `D` veya `Sol / Sağ Ok` | Sanal D-Pad / Sol Joystick |
| **Jetpack / Zıplama** | `W` / `Space` | Sağ Zıplama / İtici Butonu |
| **Ateş / Lazer** | `J` / `F` / Sol Tık | Sağ Ateş Butonu |
| **Tırmanma** | Sarmaşık üzerinde `W` / `S` | D-Pad Yukarı / Aşağı |

---

## 🚀 Hızlı Başlangıç

Projeyi yerel ortamınızda çalıştırmak için:

1. Depoyu klonlayın:
   ```bash
   git clone [https://github.com/kullanici-adi/neon-dino-age.git](https://github.com/kullanici-adi/neon-dino-age.git)
