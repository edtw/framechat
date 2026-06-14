import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AFILIATORS — Gestão de Leads',
  description: 'Plataforma de gestão de leads e afiliados com WhatsApp AI, PIX e cartões virtuais',
};

import { ClientErrorBoundary } from '@/components/layout/ClientErrorBoundary';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen bg-[#0A0A0F] text-white antialiased">
        <ClientErrorBoundary>{children}</ClientErrorBoundary>
      </body>
    </html>
  );
}
