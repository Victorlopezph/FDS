import './globals.css';

export const metadata = {
  title: 'Team lab',
  description: 'Tu equipo organizado por un agente de IA',
  appleWebApp: { capable: true, title: 'Team lab', statusBarStyle: 'default' },
  icons: { icon: '/favicon.png', apple: '/apple-icon.png' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF9F6' },
    { media: '(prefers-color-scheme: dark)', color: '#15151C' },
  ],
};

// Aplica el tema guardado antes de pintar, para que no parpadee.
const themeScript = `try{var t=localStorage.getItem('ronda-theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
