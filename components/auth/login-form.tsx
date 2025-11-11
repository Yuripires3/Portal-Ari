"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"

export function LoginForm() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          login: username.trim(), // email ou usuario_login
          senha: password,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Credenciais inválidas")
      }

      const data = await response.json()

      localStorage.setItem("token", data.access_token)
      localStorage.setItem("user", JSON.stringify(data.user))

      toast({
        title: "Login realizado",
        description: `Bem-vindo, ${data.user.nome}!`,
      })

      window.location.href = data.redirect || "/admin"
    } catch (error) {
      console.error("Login error:", error)
      toast({
        title: "Erro no login",
        description: error instanceof Error ? error.message : "Credenciais inválidas",
        variant: "destructive",
      })
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="username" className="text-sm font-medium">
          Email ou Usuário
        </Label>
        <Input
          id="username"
          type="text"
          placeholder="email@exemplo.com ou seu.usuario"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="transition-all duration-200 focus:ring-2 focus:ring-[#184286] focus:border-[#184286]"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-medium">
          Senha
        </Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="transition-all duration-200 focus:ring-2 focus:ring-[#184286] focus:border-[#184286]"
        />
      </div>

      <Button 
        type="submit" 
        className="w-full rounded-lg font-semibold text-white shadow-md hover:shadow-lg transition-all duration-300"
        style={{ 
          backgroundColor: '#184286',
        }}
        disabled={isLoading}
        onMouseEnter={(e) => {
          if (!isLoading) e.currentTarget.style.backgroundColor = '#002f67'
        }}
        onMouseLeave={(e) => {
          if (!isLoading) e.currentTarget.style.backgroundColor = '#184286'
        }}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Entrando...
          </>
        ) : (
          "Entrar"
        )}
      </Button>

      <div className="text-center text-sm text-gray-500 mt-6">
        Não tem acesso? Contate o administrador:{' '}
        <a 
          className="underline font-medium hover:no-underline transition-all duration-200" 
          style={{ color: '#f58220' }}
          href="mailto:yuri.oliveira@qvsaude.com.br"
        >
          (21) 2212-2018 / yuri.oliveira@qvsaude.com.br
        </a>
      </div>
      <div className="text-center text-xs text-gray-400 mt-4">
        Versão 1.0
      </div>
    </form>
  )
}
