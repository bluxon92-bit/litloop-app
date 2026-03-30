import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import { BooksProvider } from './context/BooksContext'
import { SocialProvider } from './context/SocialContext'
import { ChatProvider } from './context/ChatContext'
import { registerCoverServiceWorker } from './lib/coverCache'
import { initFcmEarly } from './lib/fcmManager'
import App from './App.jsx'
import './index.css'

// Register service worker for offline-capable cover image caching
registerCoverServiceWorker()

// Initialise FCM listener early to catch cold-start notification taps
// (must run before React mounts so no tap events are missed)
initFcmEarly()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <BooksProvider>
        <SocialProvider>
          <ChatProvider>
            <App />
          </ChatProvider>
        </SocialProvider>
      </BooksProvider>
    </AuthProvider>
  </StrictMode>
)