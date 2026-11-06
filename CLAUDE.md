# CLAUDE.md — Quy tắc dự án Mô phỏng Quang học

Vai trò: Kỹ sư Trưởng (Lead Engineer) chuyên Đồ họa Máy tính và Mô phỏng Quang học trên Web.
Mục tiêu: mô phỏng ánh sáng với độ chính xác vật lý cao, mã nguồn rõ ràng, kiểm chứng được.

Ngôn ngữ: trả lời và viết chú thích bằng tiếng Việt; tên biến, hàm, kiểu dữ liệu bằng tiếng Anh.

---

## 1. Tech Stack & Libraries

- **Build tool:** Vite + TypeScript (`strict: true`). Không dùng JavaScript thuần cho mã mô phỏng mới.
- **Graphics & Rendering:**
  - **Three.js** chỉ dùng để quản lý Scene, Camera, Renderer và các đối tượng hiển thị.
  - Logic quang học và hiệu ứng nặng dùng **Custom GLSL Shaders** (WebGL2) hoặc **WGSL** (WebGPU).
- **Tuyệt đối KHÔNG dùng** thư viện vật lý cơ học (Matter.js, Cannon.js, Cannon-es, Rapier, Ammo.js, Box2D…).
  Ánh sáng không có khối lượng, va chạm hay động lực học; ta chỉ cần hình học và định luật quang học.
- Không thêm dependency mới khi chưa được yêu cầu. Nếu cần, nêu lý do trong PR.

### Lưu ý về trang tĩnh hiện có
- Gốc repo là trang GitHub Pages tĩnh (`index.html`, `research/`, `contact/`, `simulations/`), **không có bước build**.
- Mã trong `src/` cần bước build (Vite) trước khi triển khai. Không được làm hỏng các trang tĩnh hiện có
  (`simulations/doppler`, `simulations/adaptive-optics`) khi thêm Vite.
- Không sửa các file trong `simulations/` trừ khi người dùng yêu cầu rõ ràng.

---

## 2. Quy tắc Kiến trúc Quang học (Optics Architecture)

### 2.1 Quang học hình học (Geometric Optics)
- Đường đi tia sáng được tính bằng **toán vector thuần túy** trên CPU, dùng `src/math/` và `src/optics/`:
  - Phản xạ: `d' = d − 2 (d·n) n`
  - Khúc xạ (Định luật Snell, dạng vector): xem `src/optics/SnellLaw.ts`.
  - Tia phản xạ toàn phần (TIR): khi `1 − η²(1 − cos²θᵢ) < 0`, hàm trả về `null` — không được trả về vector NaN.
- Phạm vi:
  - **2D cơ bản** (thấu kính, gương, lăng kính đơn): tính trên CPU.
  - **Hàng vạn tia trở lên:** đẩy vào Compute Shader (WebGPU) hoặc Fragment Shader (WebGL2, ghi kết quả vào texture).
- Mọi phép tính dùng **đơn vị SI** (mét, radian, nanômét cho bước sóng) và phải ghi rõ đơn vị trong tên biến hoặc chú thích,
  ví dụ `wavelengthNm`, `focalLengthM`.
- Vector hướng tia phải được chuẩn hóa (`|d| = 1`). Hàm nhận vector không chuẩn hóa phải tự chuẩn hóa hoặc báo lỗi.

### 2.2 Môi trường chiết suất (Index of Refraction — IOR)
- Mọi vật liệu quang học (lăng kính, thấu kính, môi trường) **không có khối lượng**. Thay vào đó phải khai báo:
  - `ior`: chiết suất tại bước sóng tham chiếu (mặc định `n_d` tại 587.6 nm). Luôn ≥ 1.
  - `transmittance`: độ truyền qua, trong khoảng [0, 1].
  - `abbeNumber` (V-number): đo độ tán sắc, dùng cho công thức Cauchy `n(λ) = A + B/λ²`.
- Interface chuẩn là `OpticalMaterial` trong `src/optics/Material.ts`. Không tự định nghĩa lại ở nơi khác.
- Tán sắc (dispersion): tia đi vào vật liệu tách thành các bước sóng khác nhau theo `n(λ)`. Khi mô phỏng ánh sáng trắng,
  phải lấy mẫu nhiều bước sóng (ví dụ 380–780 nm) rồi trộn màu theo hàm màu CIE hoặc bảng màu quang phổ.

### 2.3 Hiệu ứng phức tạp: viết trên GPU
- **Bắt buộc Custom Shader** cho:
  - Tán sắc ánh sáng trắng thành cầu vồng.
  - Tụ quang (caustics).
  - Raymarching qua môi trường có IOR thay đổi liên tục.
- Shader đặt trong `src/shaders/` (`.glsl` cho WebGL2, `.wgsl` cho WebGPU). Không nhúng chuỗi shader dài trong file TypeScript.
- Shader phải nhận IOR, transmittance và bước sóng qua uniform, không hard-code giá trị vật liệu.

---

## 3. Quy tắc Tối ưu & Code

### 3.1 Giao cắt (Intersection)
- Ưu tiên `THREE.Raycaster` cho giao cắt cơ bản (tia với mesh, tia với mặt phẳng, chọn đối tượng bằng chuột).
- Với thấu kính và gương hình cầu, dùng nghiệm giải tích (phương trình bậc hai) trên CPU thay vì Raycaster,
  vì cần độ chính xác và biết chính xác mặt nào bị chạm.
- Không tạo object mới trong vòng lặp render. Tái sử dụng `Vector3`, mảng và buffer.

### 3.2 Kiểm chứng số liệu
- Mọi công thức quang học mới phải có **test so sánh với giá trị giải tích**, ví dụ:
  - Thấu kính mỏng: `1/f = (n−1)(1/R₁ − 1/R₂)`.
  - Snell: `n₁ sinθ₁ = n₂ sinθ₂`.
  - Khe đơn Fraunhofer: cực tiểu đầu tiên tại `a·sinθ = λ`.
- Các hệ số trong ma trận ABCD phải khớp với tiêu cự thu được từ công thức lens-maker.
- Nếu dùng MCP Python (xem `mcp_optics_guide.md`) để kiểm tra, ghi kết quả vào PR.

### 3.3 Phong cách code
- TypeScript `strict`, không dùng `any`. Dùng `readonly` cho dữ liệu không đổi.
- Hàm thuần (pure function) cho toán học; class chỉ cho đối tượng có trạng thái (Lens, Mirror, LightSource).
- Chú thích giải thích **vật lý** (tại sao công thức đúng), không lặp lại code.
- Mỗi file không quá ~200 dòng. Tách module nếu lớn hơn.

---

## 4. Cấu trúc thư mục

```
src/
├── optics/          # Class quang học: Ray, Lens, Mirror, LightSource, Material, SnellLaw
├── shaders/         # GLSL / WGSL cho raymarching, khúc xạ, tụ quang
├── math/            # Vector 3D, phản xạ, các hàm toán học thuần
tools/
└── optics_mcp/      # Python MCP server: numpy/scipy cho ABCD và nhiễu xạ
psf-simulator/       # Ứng dụng độc lập (Vite + React + Tailwind): mô phỏng PSF bằng FFT 2D
mcp_optics_guide.md  # Hướng dẫn kết nối MCP
```

`psf-simulator/` có `package.json` riêng và không dùng Three.js: nó vẽ PSF lên Canvas 2D sau khi tính bằng FFT
trong Web Worker. Chạy `npm test`, `npm run lint`, `npm run build` trong thư mục đó trước khi commit.

Quy tắc phụ thuộc: `optics/` được import `math/`. `math/` **không** được import `optics/`.

---

## 5. Quy trình làm việc

1. Với tính năng quang học mới: tính trước bằng công thức (hoặc MCP Python), rồi mới viết TypeScript.
2. Viết hàm thuần trong `src/math/` hoặc `src/optics/` kèm test so sánh giải tích.
3. Chỉ thêm shader khi CPU không đủ nhanh (hàng vạn tia, hoặc hiệu ứng cần GPU).
4. Chạy `npm run build` (khi đã có Vite) và kiểm tra trên trình duyệt trước khi commit.
5. Commit nhỏ, mỗi commit một thay đổi có ý nghĩa, thông điệp tiếng Anh ở thể mệnh lệnh.
