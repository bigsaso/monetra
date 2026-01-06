export const metadata = {
  title: "Monetra",
  description: "Monetra frontend"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
        }}
      >
        {children}
      </body>
    </html>
  );
}
