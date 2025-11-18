"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, BarChart3, LogOut, Award, ChevronRight, Settings, BookOpen, Calculator, History, Receipt, Users, AlertTriangle } from "lucide-react"
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
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useState } from "react"
import { useAuth } from "@/components/auth/auth-provider"

const sinistralidadeSubmenu = [
  { label: "Dashboard", href: "/admin/sinistralidade", icon: LayoutDashboard },
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
  const [isSinistralidadeOpen, setIsSinistralidadeOpen] = useState(() => 
    pathname.startsWith("/admin/sinistralidade")
  )
  const [isBonificacoesOpen, setIsBonificacoesOpen] = useState(() => 
    pathname.startsWith("/admin/bonificacoes") || pathname === "/admin"
  )
  const [isConfigOpen, setIsConfigOpen] = useState(() =>
    pathname.startsWith("/admin/configuracoes")
  )

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">QV</span>
          </div>
          <div>
            <h2 className="font-semibold text-sm">Portal ARI</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Automações, repasses e indicadores.</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {/* Sinistralidade com Submenu (Admin only) */}
          {user?.role === "admin" && (
            <SidebarMenuItem>
              <SidebarMenuButton 
                isActive={pathname.startsWith("/admin/sinistralidade")}
                onClick={() => setIsSinistralidadeOpen(!isSinistralidadeOpen)}
              >
                <AlertTriangle className="h-4 w-4" />
                <span>Sinistralidade</span>
                <ChevronRight className={`h-4 w-4 ml-auto transition-transform ${isSinistralidadeOpen ? 'rotate-90' : ''}`} />
              </SidebarMenuButton>
              {isSinistralidadeOpen && (
                <SidebarMenuSub>
                  {sinistralidadeSubmenu.map((subItem) => {
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
              isActive={pathname.startsWith("/admin/bonificacoes") || pathname === "/admin"}
              onClick={() => setIsBonificacoesOpen(!isBonificacoesOpen)}
            >
              <Award className="h-4 w-4" />
              <span>Bonificações</span>
              <ChevronRight className={`h-4 w-4 ml-auto transition-transform ${isBonificacoesOpen ? 'rotate-90' : ''}`} />
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
            <SidebarMenuButton asChild isActive={pathname === "/admin/relatorios"}>
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
                isActive={pathname.startsWith("/admin/configuracoes")}
                onClick={() => setIsConfigOpen(!isConfigOpen)}
              >
                <Settings className="h-4 w-4" />
                <span>Configurações</span>
                <ChevronRight className={`h-4 w-4 ml-auto transition-transform ${isConfigOpen ? 'rotate-90' : ''}`} />
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

      <SidebarFooter className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 bg-zinc-900 text-zinc-200">
              <AvatarFallback className="bg-zinc-900 text-zinc-200">
                {(() => {
                  const login = (user?.usuario_login || "").toString()
                  const [pre, pos] = login.split(".")
                  const a = (pre?.[0] || "U").toUpperCase()
                  const b = (pos?.[0] || pre?.[1] || "S").toUpperCase()
                  return `${a}${b}`
                })()}
              </AvatarFallback>
            </Avatar>

            <div className="flex flex-col leading-tight">
              <span className="text-sm font-medium">
                {(() => {
                  const full = (user?.nome || "").trim()
                  if (full) {
                    const parts = full.split(/\s+/)
                    const first = parts[0]
                    const last = parts.length > 1 ? parts[parts.length - 1] : ""
                    return last ? `${first} ${last}` : first
                  }
                  return user?.usuario_login || ""
                })()}
              </span>

              <button
                onClick={logout}
                aria-label="Sair"
                className="text-xs flex items-center gap-1 opacity-75 hover:opacity-100 focus:outline-none"
              >
                <LogOut className="h-3 w-3" />
                Sair
              </button>
            </div>
          </div>
      </SidebarFooter>
    </Sidebar>
  )
}
