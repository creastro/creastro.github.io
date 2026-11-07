/** Một chú thích: tiêu đề, giải thích, công thức (nếu có) và ghi chú. Toàn bộ nội dung bằng tiếng Anh. */
export interface HelpEntry {
  title: string
  body: string
  formulas?: readonly string[]
  note?: string
}
