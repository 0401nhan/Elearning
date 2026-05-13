import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Electricbird E-Learning",
  description: "Hệ thống đào tạo và kiểm tra nội bộ Electric Bird"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
