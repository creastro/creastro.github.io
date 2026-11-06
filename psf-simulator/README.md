# Mô phỏng PSF kính thiên văn

Ứng dụng web mô phỏng **Point Spread Function (PSF)** của kính thiên văn theo thời gian thực.
PSF là bình phương độ lớn của biến đổi Fourier 2D của hàm khẩu độ (gần đúng Fraunhofer):

```
PSF(θ) = | FFT( A(x, y) ) |²
```

## Chạy

```bash
cd psf-simulator
npm install
npm run dev        # máy chủ phát triển
npm test           # Vitest
npm run lint       # oxlint
npm run build      # kiểm tra kiểu và build production
```

## Điều khiển

| Nhóm | Tham số | Ghi chú |
|---|---|---|
| Gương chính | Đường kính D, bước sóng λ | Quyết định λ/D, tức độ phân giải |
| Che khuất | Vật cản trung tâm ε, số thanh chống, độ dày, góc xoay | Cánh sao vuông góc với thanh chống |
| Bước sóng | λ trung tâm và dải sóng (0–300 nm) | Dải rộng cộng 7 bước sóng; các vòng Airy nhoè đi |
| Quang sai | Zernike: mất nét, loạn thị (2), coma (2), cầu sai | Hệ số là sai số mặt sóng RMS, đơn vị bước sóng |
| Hiển thị | Trường nhìn (giây cung), dải động (số bậc log), thang màu | Thang log cho thấy vòng Airy mờ. Thang: xám, nóng, inferno, viridis, băng, màu theo bước sóng |

## Cách tính

- Lưới FFT 512 × 512; pupil đường kính 128 px, nên mỗi λ/D có 4 mẫu và trường tính toán là ±64 λ/D.
- Mép pupil và thanh chống được siêu lấy mẫu 16 × 16 ở các pixel sát biên, nên thanh chống mảnh hơn một pixel
  vẫn đóng góp đúng diện tích (sai số dưới 2.5%).
- Chuẩn hoá theo `(ΣA)²`: đỉnh của khẩu độ lý tưởng bằng 1. Ảnh hiển thị theo `log10(I)` trong dải
  `[-R, 0]` với R là dải động.
- Ảnh được nội suy bicubic (Catmull–Rom) từ PSF sang trường nhìn tính bằng giây cung, nên đổi D hoặc λ
  làm kích thước lõi sáng thay đổi thật sự.
- Quang sai: trường pupil là `A · exp(i·2π·W)` với `W = Σ cₖ Zₖ` (đa thức Noll chuẩn hoá, RMS = 1 trên đĩa
  đơn vị). Tỉ số Strehl là đỉnh PSF chia cho đỉnh của cùng khẩu độ không quang sai, và được đối chiếu với
  gần đúng Maréchal `exp(−(2π·RMS)²)`.
- Dải sóng: mỗi mẫu bước sóng có λ/D riêng, nên cùng một góc θ ứng với các bán kính vòng khác nhau; ảnh là tổng có
  trọng số. Quang sai Zernike được cho tại λ trung tâm và tỉ lệ 1/λ ở các bước sóng khác (sai số đường quang hình
  học không đổi theo λ). Không có quang sai thì cả dải dùng chung một PSF.
- Profile xuyên tâm: trung bình PSF theo góc phương vị, vẽ cùng mẫu Airy lý tưởng `[2J₁(x)/x]²` của cùng D và dải
  sóng. Nội suy bicubic nâng nhẹ các cực tiểu sâu, nên đồ thị không dùng để đo độ sâu vòng tối.
- Thang "màu theo bước sóng" chỉ minh hoạ sắc độ, không mô hình phổ nguồn hay đáp ứng của mắt.
- FFT chạy trong Web Worker; khi kéo thanh trượt chỉ giữ yêu cầu mới nhất.

## Kiểm chứng

Các test so sánh với nghiệm giải tích: DFT ngây thơ, định lý Parseval, mẫu Airy `[2J₁(x)/x]²`,
mẫu của khẩu độ vành khuyên, 83.8% năng lượng trong vòng tối đầu tiên (1.22 λ/D), và cánh sao nhiễu xạ.
Với bước sóng: J₁ so với giá trị tham chiếu, profile khớp Airy, dải sóng lấp vòng tối.
Với quang sai: tính trực chuẩn của Zernike, Strehl khớp Maréchal ở 0.05 waves RMS cho từng mode, bảo toàn
năng lượng, mất nét ± cho ảnh giống hệt nhau, coma làm PSF bất đối xứng, đổi dấu loạn thị tương đương hoán vị trục.

## Cấu trúc

```
src/lib/fft.ts        FFT Cooley–Tukey 1D/2D
src/lib/aperture.ts   Hàm khẩu độ: gương, vật cản, thanh chống
src/lib/psf.ts        PSF, chuẩn hoá, nội suy, năng lượng vòng
src/lib/bessel.ts     J₁ và mẫu Airy giải tích
src/lib/spectrum.ts   Màu theo bước sóng, lấy mẫu dải sóng
src/lib/profile.ts    Profile xuyên tâm
src/lib/zernike.ts    Đa thức Zernike và mặt sóng
src/lib/pupilView.ts  Ảnh xem trước pupil (khẩu độ và pha)
src/lib/colormap.ts   Thang màu
src/lib/render.ts     Các kênh bước sóng → ảnh RGBA theo thang log
src/lib/frame.ts      Tham số vật lý → ảnh và số liệu
src/workers/          Worker tính khung
src/components/       Slider, PsfCanvas
```
