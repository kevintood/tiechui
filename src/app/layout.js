import { Noto_Sans_SC, Noto_Sans_Mono } from "next/font/google";
import "./globals.css";

// 思源黑体 SC：Google 出品，对简体汉字渲染最完善的免费字体
// weight 400(regular) + 500(medium) + 700(bold) 三个常用字重
const notoSansSC = Noto_Sans_SC({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap", // FOUT 策略，避免长时间空白
});

// 等宽字体（用于代码块）
const notoSansMono = Noto_Sans_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata = {
  title: "Markdown 编辑器",
  description: "一款轻量、优雅、支持中文书写的 Markdown 在线编辑器",
};

export default function RootLayout({ children }) {
  return (
    // lang="zh-CN" 让浏览器对中文文本的排版行为正确处理（断行、标点压缩等）
    <html lang="zh-CN">
      <body className={`${notoSansSC.variable} ${notoSansMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
