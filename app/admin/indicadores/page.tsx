"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/auth-provider"
import { isAdmin } from "@/lib/permissions"

export default function IndicadoresPage() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!user) return
    if (!isAdmin(user)) {
      router.replace("/admin")
      return
    }
    router.replace("/admin/indicadores/consolidado")
  }, [user, router])

  return null
}
