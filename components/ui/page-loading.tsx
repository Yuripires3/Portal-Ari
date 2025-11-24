"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { Loader2 } from "lucide-react"

const PAGE_LOADED_EVENT = "page-loaded"

const logPageLoading = (message: string, payload?: Record<string, unknown>) => {
  console.log(`[PAGE-LOADING] ${message}`, {
    ts: new Date().toISOString(),
    ...payload,
  })
}

export function PageLoading() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(false)
  const [prevPathname, setPrevPathname] = useState(pathname)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setLoadingWithReason = useCallback(
    (next: boolean, reason: string) => {
      setLoading((current) => {
        if (current === next) {
          return current
        }
        logPageLoading(`setLoading(${next})`, { reason, pathname })
        return next
      })
    },
    [pathname]
  )

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest("a[href]")
      if (!link) return
      const href = link.getAttribute("href")
      if (href && href.startsWith("/") && href !== pathname) {
        setLoadingWithReason(true, `click:${href}`)
      }
    }

    const handlePageLoaded = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string }>).detail
      logPageLoading("page-loaded event recebido", { detail })
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
      hideTimeoutRef.current = setTimeout(() => {
        setLoadingWithReason(false, "page-loaded-event")
      }, 300)
    }

    document.addEventListener("click", handleClick)
    window.addEventListener(PAGE_LOADED_EVENT, handlePageLoaded)

    return () => {
      document.removeEventListener("click", handleClick)
      window.removeEventListener(PAGE_LOADED_EVENT, handlePageLoaded)
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [pathname, setLoadingWithReason])

  useEffect(() => {
    if (pathname !== prevPathname) {
      setLoadingWithReason(true, `pathname:${prevPathname} -> ${pathname}`)
      setPrevPathname(pathname)

      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current)
      }
      safetyTimeoutRef.current = setTimeout(() => {
        setLoadingWithReason(false, "safety-timeout")
      }, 20000)
    } else {
      setLoadingWithReason(false, "pathname-unchanged")
    }

    return () => {
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current)
      }
    }
  }, [pathname, prevPathname, setLoadingWithReason])

  if (!loading) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    </div>
  )
}

export function signalPageLoaded(reason: string = "manual") {
  if (typeof window !== "undefined") {
    logPageLoading("dispatching page-loaded event", { reason })
    window.dispatchEvent(new CustomEvent(PAGE_LOADED_EVENT, { detail: { reason } }))
  }
}

