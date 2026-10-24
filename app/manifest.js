// Permite "Agregar a pantalla de inicio" en el celular.
export default function manifest() {
  return {
    name: 'Team lab',
    short_name: 'Team lab',
    description: 'Tu equipo organizado por un agente de IA',
    start_url: '/',
    display: 'standalone',
    background_color: '#FAF9F6',
    theme_color: '#2F6BFF',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
