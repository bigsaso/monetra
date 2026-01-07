import "./globals.css";

export const metadata = {
  title: "Monetra",
  description: "Monetra frontend"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
