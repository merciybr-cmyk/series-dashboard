import { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext({ show: () => {} })

export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null)
  const timer = useRef(null)

  const show = useCallback(msg => {
    setMessage(msg)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
