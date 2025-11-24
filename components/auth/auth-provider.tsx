"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"

interface User {
  id: string
  cpf: string
  usuario_login: string
  role: "admin" | "user"
  classificacao?: string
  nome: string
  email: string
  area: string | null
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  logout: () => {},
})

const logAuth = (message: string, payload?: Record<string, unknown>) => {
  console.log(`[AUTH] ${message}`, {
    ts: new Date().toISOString(),
    ...payload,
  })
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Check if user is logged in
    logAuth("Verificando storage do usuário")
    const storedUser = localStorage.getItem("user")
    const storedToken = localStorage.getItem("token")

    if (storedUser && storedToken) {
      try {
        const parsedUser = JSON.parse(storedUser)
        setUser(parsedUser)
        logAuth("Usuário carregado do storage", { id: parsedUser?.id })
      } catch (error) {
        console.error("[v0] Failed to parse user data:", error)
        localStorage.removeItem("user")
        localStorage.removeItem("token")
        logAuth("Falha ao parsear usuário do storage")
      }
    } else {
      logAuth("Nenhum usuário/token encontrado no storage")
    }

    setIsLoading(false)
    logAuth("AuthProvider finalizou leitura do storage")
  }, [])

  useEffect(() => {
    // Redirect logic based on authentication state
    if (isLoading) {
      logAuth("Redirect guard ativo", { reason: "isLoading", pathname })
      return
    }

    const isAdminRoute = pathname?.startsWith("/admin")
    const isLoginRoute = pathname === "/login"
    const isRegisterRoute = pathname === "/register"
    const isPublicRoute = pathname === "/"

    if (!user && isAdminRoute) {
      // Not logged in, trying to access protected route
      logAuth("Redirecionando para login", { pathname })
      router.push("/login")
    } else if (user && (isLoginRoute || isRegisterRoute)) {
      // Already logged in, redirect to admin dashboard
      logAuth("Usuário autenticado acessou rota pública, redirecionando para /admin", { pathname })
      router.push("/admin")
    }
    // Removed the role-based redirects to prevent loops
  }, [user, isLoading, pathname, router])

  const logout = async () => {
    logAuth("Logout solicitado")
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    } catch (err) {
      // ignore network errors on logout
    } finally {
      localStorage.removeItem("user")
      localStorage.removeItem("token")
      setUser(null)
       logAuth("Logout concluído, redirecionando para /login")
      router.push("/login")
    }
  }

  return <AuthContext.Provider value={{ user, isLoading, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return context
}
