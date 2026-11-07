/** Tra cứu phần tử theo id; báo lỗi rõ ràng nếu trang thiếu phần tử mà mã cần. */
export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing element #${id}`)
  return el as T
}

export const input = (id: string) => $<HTMLInputElement>(id)
export const select = (id: string) => $<HTMLSelectElement>(id)
