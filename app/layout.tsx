import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: '1Panel Architect - Tomcat & Python Docker Site Generator',
  description: 'Production-grade Go engine and interactive workbench for generating secure, isolated Tomcat and Python sites with rootless Docker Compose specs, reverse proxy ingress, and strict Linux capability enforcement.',
  openGraph: {
    title: '1Panel Architect - Tomcat & Python Docker Site Generator',
    description: 'Production-grade Go engine and interactive workbench for generating secure, isolated Tomcat and Python sites with rootless Docker Compose specs, reverse proxy ingress, and strict Linux capability enforcement.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '1Panel Architect - Tomcat & Python Docker Site Generator',
    description: 'Production-grade Go engine and interactive workbench for generating secure, isolated Tomcat and Python sites with rootless Docker Compose specs, reverse proxy ingress, and strict Linux capability enforcement.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
