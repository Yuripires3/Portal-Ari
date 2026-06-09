"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, BarChart3, LogOut, Award, ChevronRight, ChevronsLeft, Settings, BookOpen, Calculator, History, Receipt, Users, TrendingUp, FileBarChart, AlertCircle } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { cn } from "@/lib/utils"

function getUserDisplay(user: { usuario_login?: string; nome?: string } | null | undefined) {
  const login = (user?.usuario_login || "").toString()
  const [pre, pos] = login.split(".")
  const initials = `${(pre?.[0] || "U").toUpperCase()}${(pos?.[0] || pre?.[1] || "S").toUpperCase()}`

  const full = (user?.nome || "").trim()
  let displayName = ""
  if (full) {
    const parts = full.split(/\s+/)
    const first = parts[0]
    const last = parts.length > 1 ? parts[parts.length - 1] : ""
    displayName = last ? `${first} ${last}` : first
  } else {
    displayName = login
  }

  return { initials, displayName, login }
}

const indicadoresSubmenu = [
  { label: "Consolidado", href: "/admin/indicadores/consolidado", icon: FileBarChart },
  { label: "Inadimplência", href: "/admin/indicadores/inadimplencia", icon: AlertCircle },
]

const bonificacoesSubmenu = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Regras de Bonificação", href: "/admin/bonificacoes/regras", icon: BookOpen },
  { label: "Regras de Idade", href: "/admin/bonificacoes/regras-idade", icon: BookOpen },
  { label: "Calcular Bonificação", href: "/admin/bonificacoes/calculo", icon: Calculator },
  { label: "Histórico de Bonificações", href: "/admin/bonificacoes/historico", icon: History },
  { label: "Extrato de Descontos", href: "/admin/bonificacoes/extrato-descontos", icon: Receipt },
  { label: "Extrato de Propostas", href: "/admin/bonificacoes/extrato-propostas", icon: Receipt },
]

const configuracoesSubmenu = [
  { label: "Cadastro de usuários", href: "/admin/configuracoes/cadastro-de-usuarios", icon: Users },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth() as any
  const { toggleSidebar, state } = useSidebar()
  const [isIndicadoresOpen, setIsIndicadoresOpen] = useState(() =>
    pathname.startsWith("/admin/indicadores")
  )
  const [isBonificacoesOpen, setIsBonificacoesOpen] = useState(() => 
    pathname.startsWith("/admin/bonificacoes") || pathname === "/admin"
  )
  const [isConfigOpen, setIsConfigOpen] = useState(() =>
    pathname.startsWith("/admin/configuracoes")
  )

  const { initials, displayName } = getUserDisplay(user)
  const isCollapsed = state === "collapsed"

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">QV</span>
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <h2 className="truncate text-sm font-semibold">Portal ARI</h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Automações, repasses e indicadores.
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {/* Indicadores com Submenu (Admin only) */}
          {user?.role === "admin" && (
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Indicadores"
                isActive={pathname.startsWith("/admin/indicadores")}
                onClick={() => setIsIndicadoresOpen(!isIndicadoresOpen)}
              >
                <TrendingUp className="h-4 w-4" />
                <span>Indicadores</span>
                <ChevronRight className={`ml-auto h-4 w-4 transition-transform group-data-[collapsible=icon]:hidden ${isIndicadoresOpen ? "rotate-90" : ""}`} />
              </SidebarMenuButton>
              {isIndicadoresOpen && (
                <SidebarMenuSub>
                  {indicadoresSubmenu.map((subItem) => {
                    const IconComponent = subItem.icon
                    return (
                      <SidebarMenuSubItem key={subItem.href}>
                        <SidebarMenuSubButton asChild isActive={pathname === subItem.href}>
                          <Link href={subItem.href}>
                            <IconComponent className="h-4 w-4" />
                            <span>{subItem.label}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    )
                  })}
                </SidebarMenuSub>
              )}
            </SidebarMenuItem>
          )}

          {/* Bonificações com Submenu */}
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Bonificações"
              isActive={pathname.startsWith("/admin/bonificacoes") || pathname === "/admin"}
              onClick={() => setIsBonificacoesOpen(!isBonificacoesOpen)}
            >
              <Award className="h-4 w-4" />
              <span>Bonificações</span>
              <ChevronRight className={`ml-auto h-4 w-4 transition-transform group-data-[collapsible=icon]:hidden ${isBonificacoesOpen ? "rotate-90" : ""}`} />
            </SidebarMenuButton>
            {isBonificacoesOpen && (
              <SidebarMenuSub>
                {bonificacoesSubmenu
                  .filter((subItem) => {
                    const classificacao = user?.classificacao?.toUpperCase()
                    const role = user?.role?.toUpperCase()
                    if (classificacao === "COMERCIAL" || role === "COMERCIAL") {
                      return (
                        subItem.href === "/admin" ||
                        subItem.href === "/admin/bonificacoes/historico" ||
                        subItem.href === "/admin/bonificacoes/extrato-descontos" ||
                        subItem.href === "/admin/bonificacoes/extrato-propostas"
                      )
                    }
                    return true
                  })
                  .map((subItem) => {
                    const IconComponent = subItem.icon
                    return (
                      <SidebarMenuSubItem key={subItem.href}>
                        <SidebarMenuSubButton asChild isActive={pathname === subItem.href}>
                          <Link href={subItem.href}>
                            <IconComponent className="h-4 w-4" />
                            <span>{subItem.label}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    )
                  })}
              </SidebarMenuSub>
            )}
          </SidebarMenuItem>

          {/* Relatórios */}
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Relatórios" isActive={pathname === "/admin/relatorios"}>
              <Link href="/admin/relatorios">
                <BarChart3 className="h-4 w-4" />
                <span>Relatórios</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Configurações (Admin only) */}
          {user?.role === "admin" && (
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Configurações"
                isActive={pathname.startsWith("/admin/configuracoes")}
                onClick={() => setIsConfigOpen(!isConfigOpen)}
              >
                <Settings className="h-4 w-4" />
                <span>Configurações</span>
                <ChevronRight className={`ml-auto h-4 w-4 transition-transform group-data-[collapsible=icon]:hidden ${isConfigOpen ? "rotate-90" : ""}`} />
              </SidebarMenuButton>
              {isConfigOpen && (
                <SidebarMenuSub>
                  {configuracoesSubmenu.map((subItem) => {
                    const IconComponent = subItem.icon
                    return (
                      <SidebarMenuSubItem key={subItem.href}>
                        <SidebarMenuSubButton asChild isActive={pathname === subItem.href}>
                          <Link href={subItem.href}>
                            <IconComponent className="h-4 w-4" />
                            <span>{subItem.label}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    )
                  })}
                </SidebarMenuSub>
              )}
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="gap-0 border-t border-sidebar-border p-0">
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-3",
            "group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3",
          )}
        >
          <Avatar className="h-9 w-9 shrink-0 ring-2 ring-sidebar-border">
            <AvatarFallback className="bg-primary/15 text-sm font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold leading-tight">{displayName}</p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={logout}
            aria-label="Sair"
            title="Sair"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>

        <div className="border-t border-sidebar-border px-2 pb-2 pt-1 group-data-[collapsible=icon]:px-1">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={isCollapsed ? "Expandir menu" : "Recolher menu"}
            title={isCollapsed ? "Expandir menu" : "Recolher menu"}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors",
              "hover:bg-sidebar-accent hover:text-sidebar-foreground",
              "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
            )}
          >
            <ChevronsLeft
              className={cn(
                "h-4 w-4 shrink-0 transition-transform",
                isCollapsed && "rotate-180",
              )}
            />
            <span className="group-data-[collapsible=icon]:hidden">Recolher menu</span>
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
