# Kết nối Claude với Python MCP Server cho Toán Quang học

Tài liệu này hướng dẫn bạn chạy một **MCP server bằng Python** (`numpy`, `scipy`) và đăng ký nó với Claude.
Claude sẽ gọi server để tính toán **trước khi** viết code TypeScript/WebGL:

- **Ma trận truyền tia ABCD** của hệ thấu kính ghép (tiêu cự hiệu dụng, khoảng cách tiêu điểm).
- **Nhiễu xạ Fraunhofer** bằng biến đổi Fourier nhanh (FFT) cho khe và nhiều khe.
- **Đĩa Airy** cho khẩu độ tròn (hàm Bessel `J₁`).

Server đã có sẵn tại `tools/optics_mcp/server.py`, đã được kiểm chứng với nghiệm giải tích.

---

## 1. Kiến trúc

```
Claude Code  ──(stdio, JSON-RPC)──▶  tools/optics_mcp/server.py  ──▶  numpy / scipy
     ▲                                        │
     └──────────── kết quả số (JSON) ◀────────┘
```

Claude Code khởi động server dưới dạng tiến trình con và giao tiếp qua **stdin/stdout**.
Vì vậy server **không được `print()`** ra stdout. Mọi thông báo gỡ lỗi phải ghi ra `stderr`.

---

## 2. Cài đặt

Chạy từ thư mục gốc của repo. Nên dùng virtualenv để tránh xung đột với Python hệ thống.

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r tools/optics_mcp/requirements.txt
```

Kiểm tra nhanh:

```bash
python -c "import numpy, scipy, mcp; print('OK')"
```

> **Lưu ý phiên bản:** `mcp` 2.x đã đổi tên `FastMCP` thành `MCPServer`. File `requirements.txt` ghim `mcp<2`
> để khớp với API trong `server.py`.

---

## 3. Đăng ký server với Claude Code

Dùng **đường dẫn tuyệt đối** tới Python trong virtualenv. Thay `/duong/dan/toi/repo` bằng đường dẫn thật trên máy bạn.

```bash
claude mcp add optics-math -- /duong/dan/toi/repo/.venv/bin/python /duong/dan/toi/repo/tools/optics_mcp/server.py
```

Để cấu hình được chia sẻ cho cả nhóm qua git (ghi vào `.mcp.json` ở gốc repo), thêm `--scope project`:

```bash
claude mcp add --scope project optics-math -- /duong/dan/toi/repo/.venv/bin/python /duong/dan/toi/repo/tools/optics_mcp/server.py
```

Kiểm tra:

```bash
claude mcp list
```

Trong phiên Claude Code, gõ `/mcp` để xem trạng thái và danh sách công cụ của `optics-math`.
Lần đầu dùng server ở phạm vi dự án, Claude Code sẽ hỏi xác nhận; hãy chấp nhận nếu bạn tin tưởng mã nguồn.

### Tùy chọn: Claude Desktop

Thêm vào `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "optics-math": {
      "command": "/duong/dan/toi/repo/.venv/bin/python",
      "args": ["/duong/dan/toi/repo/tools/optics_mcp/server.py"]
    }
  }
}
```

Khởi động lại Claude Desktop sau khi sửa file.

---

## 4. Kịch bản mẫu

File đầy đủ nằm tại `tools/optics_mcp/server.py`. Phần cốt lõi là công cụ ABCD: mỗi phần tử quang học là một ma trận
tác động lên vector tia `(y, θ)`, và hệ nhiều phần tử là **tích các ma trận** theo thứ tự truyền sáng.

```python
import numpy as np
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("optics-math")

def _space(d: float) -> np.ndarray:
    """Truyền tự do quãng d."""
    return np.array([[1.0, d], [0.0, 1.0]])

def _thin_lens(f: float) -> np.ndarray:
    """Thấu kính mỏng tiêu cự f (f > 0: hội tụ)."""
    return np.array([[1.0, 0.0], [-1.0 / f, 1.0]])

@mcp.tool()
def ray_transfer_system(elements: list[dict]) -> dict:
    """Ma trận ABCD và tiêu cự hiệu dụng của một hệ quang học.

    elements: theo chiều truyền sáng, ví dụ
      [{"type": "lens", "f": 100}, {"type": "space", "d": 25}, {"type": "lens", "f": 50}]
    """
    M = np.eye(2)
    for el in elements:
        step = _thin_lens(el["f"]) if el["type"] == "lens" else _space(el["d"])
        M = step @ M                      # phần tử sau nhân bên trái
    A, B = M[0]
    C, D = M[1]
    return {
        "matrix": M.tolist(),
        "effective_focal_length": -1.0 / C,
        "back_focal_distance": -A / C,
        "front_focal_distance": -D / C,
    }

if __name__ == "__main__":
    mcp.run(transport="stdio")
```

### Các công thức được kiểm chứng

| Đại lượng | Công thức | Ví dụ (f₁ = 100 mm, d = 25 mm, f₂ = 50 mm) |
|---|---|---|
| Tiêu cự hiệu dụng (EFL) | `1/f = 1/f₁ + 1/f₂ − d/(f₁f₂)` | 40 mm |
| Khoảng cách tiêu điểm sau (BFD) | `EFL · (1 − d/f₁)` | 30 mm |
| Khoảng cách tiêu điểm trước (FFD) | `EFL · (1 − d/f₂)` | 20 mm |
| Khe đơn Fraunhofer | `I = sinc²(a sinθ / λ)` | cực tiểu đầu tiên tại `sinθ = λ/a` |
| Đĩa Airy | `I = [2J₁(x)/x]²`, `x = (2π/λ) a sinθ` | vân tối đầu tiên tại `sinθ ≈ 1.22 λ/(2a)` |

Tôi đã chạy server qua giao thức MCP thật (stdio): liệt kê đủ 3 công cụ và trả về EFL = 40 mm, khớp với công thức.

---

## 5. Cách dùng trong quy trình làm việc

Khi bạn yêu cầu Claude viết một mô phỏng mới, hãy đi theo trình tự sau:

1. **Tính trước bằng MCP.** Ví dụ bạn có thể hỏi:
   > Dùng công cụ `ray_transfer_system` tính tiêu cự hiệu dụng của thấu kính f = 100 mm và f = 50 mm cách nhau 25 mm.
2. **Tính nhiễu xạ.** Ví dụ:
   > Dùng `fraunhofer_1d_slits` với khe kép: hai khe rộng 10 µm tâm tại ±50 µm, λ = 532 nm. Cho tôi vị trí cực đại chính.
3. **Viết TypeScript** trong `src/optics/` hoặc `src/math/`, kèm test so sánh với giá trị vừa tính.
4. **Kiểm tra chéo.** Giá trị từ TypeScript phải khớp với kết quả MCP trong sai số tương đối nhỏ (ví dụ 10⁻⁶ với hàm thuần).

### Quy ước đơn vị và dấu

- Tất cả độ dài trong `ray_transfer_system` phải cùng đơn vị. Kết quả trả về theo đơn vị đó.
- `fraunhofer_1d_slits` và `airy_disk` nhận **bước sóng tính bằng nanômét** và **kích thước tính bằng mét**.
- Dấu: `f > 0` là thấu kính hội tụ, `f < 0` là phân kỳ.

---

## 6. Kiểm tra server độc lập (tùy chọn)

Dùng MCP Inspector để gọi công cụ bằng giao diện web, không cần Claude:

```bash
npx @modelcontextprotocol/inspector .venv/bin/python tools/optics_mcp/server.py
```

Hoặc chạy trực tiếp một kiểm tra nhanh bằng Python (đã chứng minh hoạt động với `mcp` 1.x):

```bash
python -c "import sys; sys.path.insert(0,'tools/optics_mcp'); import server as s; print(s.ray_transfer_system([{'type':'lens','f':100},{'type':'space','d':25},{'type':'lens','f':50}])['effective_focal_length'])"
```

Kết quả mong đợi: `40.0`.

---

## 7. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách sửa |
|---|---|---|
| `/mcp` báo `failed` | Đường dẫn Python không tuyệt đối, hoặc chưa kích hoạt venv | Dùng đường dẫn tuyệt đối tới `.venv/bin/python` |
| `ModuleNotFoundError: mcp` | Cài nhầm Python hệ thống | Chạy lại `pip install -r tools/optics_mcp/requirements.txt` trong venv |
| `FastMCP` không tồn tại | Đang dùng `mcp` 2.x | `pip install "mcp[cli]>=1.2,<2"` |
| Claude báo lỗi JSON hoặc không nhận phản hồi | Có `print()` ghi ra stdout | Chuyển thông báo sang `print(..., file=sys.stderr)` |
| Kết quả `inf` ở tiêu cự | Hệ afocal (`C = 0`) | Đây là kết quả đúng, không phải lỗi |
| `fraunhofer_1d_slits` trả về ít điểm | Đã giới hạn `max_points` | Tăng `max_points` hoặc `n_samples` |

---

## 8. Bảo mật

Server này chạy mã Python trên máy của bạn với quyền của bạn. Chỉ đăng ký server từ repo mà bạn tin tưởng. Không đưa thông tin nhạy cảm (khóa API, mật khẩu) vào tham số công cụ.
