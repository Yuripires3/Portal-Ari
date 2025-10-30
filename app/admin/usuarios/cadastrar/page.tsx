"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function AdminUserCreatePage() {
  const [form, setForm] = useState({ cpf: "", nome: "", email: "", area: "", usuario_login: "", senha: "", confirmarSenha: "", classificacao: "USUARIO" })
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (form.senha !== form.confirmarSenha) {
        toast({ title: "Erro", description: "As senhas não coincidem", variant: "destructive" })
        setLoading(false)
        return
      }
      const res = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, area: form.area || null }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao criar usuário")
      toast({ title: "Usuário criado", description: `Usuário ${data.user.usuario_login} criado com sucesso` })
      setForm({ cpf: "", nome: "", email: "", area: "", usuario_login: "", senha: "", confirmarSenha: "", classificacao: "USUARIO" })
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Falha ao criar usuário", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Cadastrar Usuário</CardTitle>
          <CardDescription>Somente administradores podem criar usuários</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cpf">CPF</Label>
                <Input id="cpf" value={form.cpf} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" required />
              </div>
              <div>
                <Label htmlFor="usuario_login">Usuário</Label>
                <Input id="usuario_login" value={form.usuario_login} onChange={(e) => set("usuario_login", e.target.value)} placeholder="seu.usuario" required />
              </div>
            </div>

            <div>
              <Label htmlFor="nome">Nome completo</Label>
              <Input id="nome" value={form.nome} onChange={(e) => set("nome", e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="area">Área</Label>
                <Select value={form.area} onValueChange={(v) => set("area", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a área" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Operacoes">Operacoes</SelectItem>
                    <SelectItem value="Financeiro">Financeiro</SelectItem>
                    <SelectItem value="Faturamento">Faturamento</SelectItem>
                    <SelectItem value="TI">TI</SelectItem>
                    <SelectItem value="Movimentacao">Movimentacao</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="classificacao">Classificação</Label>
                <Select value={form.classificacao} onValueChange={(v) => set("classificacao", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">ADMIN</SelectItem>
                    <SelectItem value="USUARIO">USUARIO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="senha">Senha</Label>
                <Input id="senha" type="password" value={form.senha} onChange={(e) => set("senha", e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="confirmarSenha">Confirmar senha</Label>
                <Input id="confirmarSenha" type="password" value={form.confirmarSenha} onChange={(e) => set("confirmarSenha", e.target.value)} required />
              </div>
            </div>

            <Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}


