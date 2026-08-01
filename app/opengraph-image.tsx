import { ImageResponse } from 'next/og';

export const alt = 'Scrip — confidential revenue waterfalls on iExec Nox';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, color: '#f7f7f2', background: 'linear-gradient(135deg, #07110d, #111827)' }}>
      <div style={{ display: 'flex', fontSize: 34, color: '#6ee7b7' }}>§ Scrip · iExec Nox</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>Private deal terms.</div>
        <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>Provable outcomes.</div>
        <div style={{ display: 'flex', marginTop: 28, fontSize: 28, color: '#a1a1aa' }}>Conditional revenue waterfalls computed confidentially on Sepolia.</div>
      </div>
    </div>,
    size,
  );
}
