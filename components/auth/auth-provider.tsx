"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"

interface User {
  id: string
  cpf: string
  usuario_login: string
  role: "admin" | "user"
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Check if user is logged in
    const storedUser = localStorage.getItem("user")
    const storedToken = localStorage.getItem("token")

    if (storedUser && storedToken) {
      try {
        const parsedUser = JSON.parse(storedUser)
        setUser(parsedUser)
      } catch (error) {
        console.error("[v0] Failed to parse user data:", error)
        localStorage.removeItem("user")
        localStorage.removeItem("token")
      }
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    // Redirect logic based on authentication state
    if (isLoading) return

    const isAdminRoute = pathname?.startsWith("/admin")
    const isPartnerRoute = pathname?.startsWith("/partner")
    const isLoginRoute = pathname === "/login"
    const isRegisterRoute = pathname === "/register"
    const isPublicRoute = pathname === "/"

    if (!user && (isAdminRoute || isPartnerRoute)) {
      // Not logged in, trying to access protected route
      console.log("[Auth] Not authenticated, redirecting to login")
      router.push("/login")
    } else if (user && (isLoginRoute || isRegisterRoute)) {
      // Already logged in, redirect to admin dashboard
      console.log("[Auth] Already authenticated, redirecting to admin")
      router.push("/admin")
    }
    // Removed the role-based redirects to prevent loops
  }, [user, isLoading, pathname, router])

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    } catch (err) {
      // ignore network errors on logout
    } finally {
      localStorage.removeItem("user")
      localStorage.removeItem("token")
      setUser(null)
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
