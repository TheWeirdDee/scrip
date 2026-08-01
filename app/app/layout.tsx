import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Scrip App | Private distribution workspace',
  description: 'Build and settle sealed conditional revenue waterfalls with iExec Nox on Ethereum Sepolia.',
  alternates: { canonical: '/app' },
};

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
