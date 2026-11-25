import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "决策陪审团｜先开庭，再决定",
  description: "刘看山带你传唤知乎真实经验，通过三回合对质，把犹豫变成一份可验证的行动裁决。",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
